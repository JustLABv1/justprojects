package sync

import (
	"context"
	"fmt"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/JustLABv1/justprojects/services/backend/internal/queue"
	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

const scheduledPollBatchSize = 100

// SchedulePolls discovers attached repositories, creates any missing durable
// cursor rows, and atomically enqueues due polling jobs. It is safe to call
// from more than one worker process: the scheduler lock and the per-project
// repository lock make the event/job creation idempotent across replicas.
func SchedulePolls(ctx context.Context, store *db.Store, jobs queue.Queue, interval time.Duration) (int, error) {
	if store == nil || store.DB == nil {
		return 0, fmt.Errorf("sync scheduler requires a database")
	}
	if interval <= 0 {
		interval = 5 * time.Minute
	}

	// Read the attachment set before opening the short scheduling transaction.
	// The transaction below re-checks the active joins before scheduling, so a
	// detach or connection deactivation cannot leave new work behind.
	pairs := make([]pollPair, 0)
	if err := store.DB.NewSelect().TableExpr("project_repositories AS pr").
		ColumnExpr("p.tenant_id AS tenant_id, pr.project_id AS project_id, pr.repository_id AS repository_id, gr.connection_id AS connection_id, COALESCE(NULLIF(gc.provider, ''), 'github') AS provider").
		Join("JOIN projects AS p ON p.id = pr.project_id").
		Join("JOIN git_repositories AS gr ON gr.id = pr.repository_id").
		Join("JOIN git_connections AS gc ON gc.id = gr.connection_id").
		Where("p.status = 'active' AND gc.active = true").
		Scan(ctx, &pairs); err != nil {
		return 0, fmt.Errorf("load scheduled sync repositories: %w", err)
	}
	if len(pairs) == 0 {
		return 0, nil
	}

	scheduled := 0
	err := store.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('justprojects:scheduled-sync'))`); err != nil {
			return fmt.Errorf("lock scheduled sync scheduler: %w", err)
		}

		now := time.Now().UTC()
		for _, pair := range pairs {
			state := &db.GitSyncState{
				RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now},
				TenantID:     pair.TenantID,
				ProjectID:    pair.ProjectID,
				RepositoryID: pair.RepositoryID,
				NextRunAt:    now,
				Status:       "idle",
			}
			if _, err := tx.NewInsert().Model(state).On("CONFLICT (project_id, repository_id) DO NOTHING").Exec(ctx); err != nil {
				return fmt.Errorf("create sync cursor for repository %s: %w", pair.RepositoryID, err)
			}
		}

		dueStates := make([]duePollState, 0, scheduledPollBatchSize)
		if err := tx.NewSelect().TableExpr("git_sync_states AS gss").
			ColumnExpr("gss.id AS id, gss.tenant_id AS tenant_id, gss.project_id AS project_id, gss.repository_id AS repository_id, gss.issue_cursor_at AS issue_cursor_at, gss.milestone_cursor_at AS milestone_cursor_at, gss.workflow_label_backfilled_at AS workflow_label_backfilled_at, gr.connection_id AS connection_id, COALESCE(NULLIF(gc.provider, ''), 'github') AS provider").
			Join("JOIN project_repositories AS pr ON pr.project_id = gss.project_id AND pr.repository_id = gss.repository_id").
			Join("JOIN projects AS p ON p.id = gss.project_id").
			Join("JOIN git_repositories AS gr ON gr.id = gss.repository_id").
			Join("JOIN git_connections AS gc ON gc.id = gr.connection_id").
			Where("gss.next_run_at <= ? AND p.status = 'active' AND gc.active = true", now).
			OrderExpr("gss.next_run_at ASC").
			Limit(scheduledPollBatchSize).
			Scan(ctx, &dueStates); err != nil {
			return fmt.Errorf("load due scheduled syncs: %w", err)
		}

		for _, due := range dueStates {
			lockKey := "justprojects:sync:" + due.TenantID.String() + ":" + due.ProjectID.String() + ":" + due.RepositoryID.String()
			if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended(?, 0))`, lockKey); err != nil {
				return fmt.Errorf("lock scheduled repository sync: %w", err)
			}

			active, err := activeSyncForPair(ctx, tx, due.TenantID, due.ProjectID, due.RepositoryID)
			if err != nil {
				return err
			}
			if active {
				// An import or outbound mutation already owns this repository
				// lock. Move the checkpoint forward so this scheduler does not
				// repeatedly inspect the same active run every tick.
				if _, err := tx.NewUpdate().Model((*db.GitSyncState)(nil)).
					Set("next_run_at = ?", now.Add(interval)).
					Set("updated_at = ?", now).
					Where("id = ?", due.ID).Exec(ctx); err != nil {
					return fmt.Errorf("defer scheduled sync after active run: %w", err)
				}
				continue
			}

			mode := "incremental"
			if due.WorkflowLabelBackfilledAt == nil {
				mode = "workflow label backfill"
			} else if due.IssueCursorAt == nil || due.MilestoneCursorAt == nil {
				mode = "baseline"
			}
			eventID := uuid.New()
			event := &db.SyncEvent{
				RecordFields: db.RecordFields{ID: eventID, CreatedAt: now, UpdatedAt: now},
				TenantID:     syncUUIDPtr(due.TenantID),
				ConnectionID: syncUUIDPtr(due.ConnectionID),
				Provider:     due.Provider,
				DeliveryID:   "poll-" + uuid.NewString(),
				EventName:    due.Provider + ".poll",
				Action:       "scheduled",
				Payload: map[string]any{
					"source":       "scheduled",
					"mode":         mode,
					"tenantId":     due.TenantID.String(),
					"projectId":    due.ProjectID.String(),
					"repositoryId": due.RepositoryID.String(),
					"pollStateId":  due.ID.String(),
					"scheduledAt":  now.Format(time.RFC3339),
				},
				Status: "queued",
			}
			if _, err := tx.NewInsert().Model(event).Exec(ctx); err != nil {
				return fmt.Errorf("create scheduled sync history: %w", err)
			}
			if err := appendScheduledQueueLog(ctx, tx, eventID, due.TenantID, due.ProjectID, due.RepositoryID, due.Provider, mode, now); err != nil {
				return err
			}
			if err := jobs.EnqueueTx(ctx, tx, "git.poll", map[string]any{
				"tenantId":     due.TenantID.String(),
				"projectId":    due.ProjectID.String(),
				"repositoryId": due.RepositoryID.String(),
				"pollStateId":  due.ID.String(),
				"syncEventId":  eventID.String(),
			}); err != nil {
				return fmt.Errorf("queue scheduled repository sync: %w", err)
			}
			if _, err := tx.NewUpdate().Model((*db.GitSyncState)(nil)).
				Set("status = 'queued'").
				Set("last_started_at = ?", now).
				Set("last_error = NULL").
				Set("next_run_at = ?", now.Add(interval)).
				Set("updated_at = ?", now).
				Where("id = ?", due.ID).Exec(ctx); err != nil {
				return fmt.Errorf("update scheduled sync cursor: %w", err)
			}
			scheduled++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return scheduled, nil
}

func syncUUIDPtr(value uuid.UUID) *uuid.UUID {
	return &value
}

type pollPair struct {
	TenantID     uuid.UUID `bun:"tenant_id"`
	ProjectID    uuid.UUID `bun:"project_id"`
	RepositoryID uuid.UUID `bun:"repository_id"`
	ConnectionID uuid.UUID `bun:"connection_id"`
	Provider     string    `bun:"provider"`
}

type duePollState struct {
	ID                        uuid.UUID  `bun:"id"`
	TenantID                  uuid.UUID  `bun:"tenant_id"`
	ProjectID                 uuid.UUID  `bun:"project_id"`
	RepositoryID              uuid.UUID  `bun:"repository_id"`
	IssueCursorAt             *time.Time `bun:"issue_cursor_at"`
	MilestoneCursorAt         *time.Time `bun:"milestone_cursor_at"`
	WorkflowLabelBackfilledAt *time.Time `bun:"workflow_label_backfilled_at"`
	ConnectionID              uuid.UUID  `bun:"connection_id"`
	Provider                  string     `bun:"provider"`
}

var scheduledSyncEventNames = []string{
	"import",
	"github.poll",
	"gitlab.poll",
	"github.issue",
	"gitlab.issue",
	"github.milestone",
	"gitlab.milestone",
}

func activeSyncForPair(ctx context.Context, database bun.IDB, tenantID, projectID, repositoryID uuid.UUID) (bool, error) {
	count, err := database.NewSelect().Model((*db.SyncEvent)(nil)).
		Where("se.tenant_id = ?", tenantID).
		Where("se.event_name IN (?)", bun.In(scheduledSyncEventNames)).
		Where("se.payload->>'projectId' = ? AND se.payload->>'repositoryId' = ?", projectID.String(), repositoryID.String()).
		Where("(se.status IN ('queued', 'processing') OR EXISTS (SELECT 1 FROM outbox_jobs AS oj WHERE oj.payload->>'syncEventId' = se.id::text AND oj.status IN ('pending', 'processing')))").
		Count(ctx)
	if err != nil {
		return false, fmt.Errorf("check active repository sync: %w", err)
	}
	return count > 0, nil
}

func appendScheduledQueueLog(ctx context.Context, database bun.IDB, eventID, tenantID, projectID, repositoryID uuid.UUID, provider, mode string, createdAt time.Time) error {
	log := &db.SyncEventLog{
		RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: createdAt, UpdatedAt: createdAt},
		TenantID:     tenantID,
		SyncEventID:  eventID,
		Level:        "info",
		Phase:        "queued",
		Message:      "Scheduled repository poll queued",
		Metadata: map[string]any{
			"projectId":    projectID.String(),
			"repositoryId": repositoryID.String(),
			"provider":     provider,
			"mode":         mode,
		},
	}
	if _, err := database.NewInsert().Model(log).Exec(ctx); err != nil {
		return fmt.Errorf("create scheduled sync queue log: %w", err)
	}
	return nil
}
