package sync

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/JustLABv1/justprojects/services/backend/internal/integrations"
	"github.com/google/uuid"
)

// processGitPoll performs one scheduled reconciliation. The cursor is only
// advanced after milestones and issues have both been fetched and all records
// have reconciled successfully. A failed run therefore remains retryable and
// cannot silently skip a provider change.
func (p Processor) processGitPoll(ctx context.Context, job *db.OutboxJob) (returnErr error) {
	tenantID, err := payloadUUID(job.Payload, "tenantId")
	if err != nil {
		return err
	}
	projectID, err := payloadUUID(job.Payload, "projectId")
	if err != nil {
		return err
	}
	repositoryID, err := payloadUUID(job.Payload, "repositoryId")
	if err != nil {
		return err
	}
	stateID, err := payloadUUID(job.Payload, "pollStateId")
	if err != nil {
		return err
	}

	var syncEventID uuid.UUID
	if raw, ok := stringPayload(job.Payload, "syncEventId"); ok {
		syncEventID, err = uuid.Parse(raw)
		if err != nil {
			return fmt.Errorf("invalid syncEventId: %w", err)
		}
	}
	pollStartedAt := time.Time{}

	// The event is marked failed even when loading the durable cursor or
	// project fails. That gives the user a visible explanation instead of a
	// permanently queued-looking poll in the history panel.
	defer func() {
		if returnErr != nil {
			message := returnErr.Error()
			if syncEventID != uuid.Nil {
				if err := p.setSyncEvent(ctx, syncEventID, "failed", &tenantID, nil, message); err != nil {
					slog.Default().Warn("could not mark scheduled sync failed", "sync_event_id", syncEventID, "error", err)
				}
			}
			if err := p.updateGitSyncState(ctx, stateID, "failed", nil, nil, nil, nil, message); err != nil {
				slog.Default().Warn("could not persist scheduled sync failure", "sync_state_id", stateID, "error", err)
			}
			return
		}
		completedAt := time.Now().UTC()
		if err := p.updateGitSyncState(ctx, stateID, "succeeded", nil, &completedAt, &pollStartedAt, &pollStartedAt, ""); err != nil {
			returnErr = fmt.Errorf("mark scheduled sync succeeded: %w", err)
			if syncEventID != uuid.Nil {
				if eventErr := p.setSyncEvent(ctx, syncEventID, "failed", &tenantID, nil, returnErr.Error()); eventErr != nil {
					slog.Default().Warn("could not mark scheduled sync cursor failure", "sync_event_id", syncEventID, "error", eventErr)
				}
			}
			return
		}
		if syncEventID != uuid.Nil {
			if err := p.setSyncEvent(ctx, syncEventID, "succeeded", &tenantID, nil, ""); err != nil {
				slog.Default().Warn("could not mark scheduled sync succeeded", "sync_event_id", syncEventID, "error", err)
			}
		}
	}()

	var state db.GitSyncState
	if err = p.Store.DB.NewSelect().Model(&state).
		Where("id = ? AND tenant_id = ? AND project_id = ? AND repository_id = ?", stateID, tenantID, projectID, repositoryID).
		Scan(ctx); err != nil {
		return fmt.Errorf("load scheduled sync state: %w", err)
	}

	pollStartedAt = time.Now().UTC()
	if err = p.updateGitSyncState(ctx, state.ID, "processing", &pollStartedAt, nil, nil, nil, ""); err != nil {
		return fmt.Errorf("mark scheduled sync processing: %w", err)
	}
	if syncEventID != uuid.Nil {
		if err = p.setSyncEvent(ctx, syncEventID, "processing", &tenantID, nil, ""); err != nil {
			return err
		}
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "poll", "Scheduled repository poll started", map[string]any{
			"jobId":        job.ID.String(),
			"projectId":    projectID.String(),
			"repositoryId": repositoryID.String(),
		})
	}

	var project db.Project
	if err = p.Store.DB.NewSelect().Model(&project).Where("id = ? AND tenant_id = ?", projectID, tenantID).Scan(ctx); err != nil {
		return fmt.Errorf("load scheduled sync project: %w", err)
	}
	var repository db.GitRepository
	if err = p.Store.DB.NewSelect().Model(&repository).Where("id = ?", repositoryID).Scan(ctx); err != nil {
		return fmt.Errorf("load scheduled sync repository: %w", err)
	}
	var connection db.GitConnection
	if err = p.Store.DB.NewSelect().Model(&connection).
		Where("id = ? AND tenant_id = ? AND active = true", repository.ConnectionID, tenantID).
		Scan(ctx); err != nil {
		return fmt.Errorf("load scheduled sync connection: %w", err)
	}
	providerName := connection.Provider
	if providerName == "" {
		providerName = "github"
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "repository", fmt.Sprintf("Polling %s repository %s", providerName, repository.FullName), map[string]any{
			"projectId":    projectID.String(),
			"repositoryId": repositoryID.String(),
		})
	}

	client, err := p.clientForConnection(ctx, connection)
	if err != nil {
		return fmt.Errorf("initialize scheduled %s client: %w", providerName, err)
	}
	incremental, supportsIncremental := client.(integrations.IncrementalProvider)

	milestoneSince := pollingSince(state.MilestoneCursorAt)
	milestoneMode := pollingMode(state.MilestoneCursorAt, supportsIncremental)
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "fetch", fmt.Sprintf("Loading %s milestones (%s)", providerName, describePollingWindow(milestoneMode, milestoneSince)), nil)
	}
	var milestones []integrations.Milestone
	if milestoneSince != nil && supportsIncremental {
		milestones, err = incremental.ListMilestonesSince(ctx, repository.Owner, repository.Name, *milestoneSince)
	} else {
		milestones, err = client.ListMilestones(ctx, repository.Owner, repository.Name)
	}
	if err != nil {
		return fmt.Errorf("list %s milestones: %w", providerName, err)
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "milestones", fmt.Sprintf("Loaded %d milestones", len(milestones)), map[string]any{
			"count": len(milestones),
			"mode":  milestoneMode,
		})
	}
	milestoneFailures := make([]string, 0)
	milestoneCount := 0
	for _, milestone := range milestones {
		if _, reconcileErr := p.reconcileMilestone(ctx, tenantID, project, repository, milestone, job.ID.String(), milestone.UpdatedAt); reconcileErr != nil {
			failure := fmt.Sprintf("milestone #%d %q: %v", milestone.Number, milestone.Title, reconcileErr)
			milestoneFailures = append(milestoneFailures, failure)
			if syncEventID != uuid.Nil {
				p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "milestone", "Could not reconcile "+failure, map[string]any{"number": milestone.Number})
			}
			continue
		}
		milestoneCount++
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "milestones", fmt.Sprintf("Reconciled %d of %d milestones", milestoneCount, len(milestones)), map[string]any{
			"count":  milestoneCount,
			"failed": len(milestoneFailures),
		})
	}

	workflowLabelBackfill := state.WorkflowLabelBackfilledAt == nil
	issueSince, issueMode := issuePollingWindow(state.IssueCursorAt, state.WorkflowLabelBackfilledAt, supportsIncremental)
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "fetch", fmt.Sprintf("Loading %s issues (%s)", providerName, describePollingWindow(issueMode, issueSince)), nil)
	}
	var issues []integrations.Issue
	if issueSince != nil && supportsIncremental {
		issues, err = incremental.ListIssuesSince(ctx, repository.Owner, repository.Name, *issueSince)
	} else {
		issues, err = client.ListIssues(ctx, repository.Owner, repository.Name)
	}
	if err != nil {
		return fmt.Errorf("list %s issues: %w", providerName, err)
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "issues", fmt.Sprintf("Loaded %d issues", len(issues)), map[string]any{
			"count": len(issues),
			"mode":  issueMode,
		})
	}
	issueFailures := make([]string, 0)
	issueCount := 0
	for _, issue := range issues {
		if reconcileErr := p.reconcileIssue(ctx, tenantID, project, repository, issue, job.ID.String(), issue.UpdatedAt); reconcileErr != nil {
			failure := fmt.Sprintf("issue #%d %q: %v", issue.Number, issue.Title, reconcileErr)
			issueFailures = append(issueFailures, failure)
			if syncEventID != uuid.Nil {
				p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "issue", "Could not reconcile "+failure, map[string]any{"number": issue.Number})
			}
			continue
		}
		if repaired, repairErr := p.repairProviderStatusLabel(ctx, client, tenantID, project, repository, issue); repairErr != nil {
			failure := fmt.Sprintf("issue #%d %q status label: %v", issue.Number, issue.Title, repairErr)
			issueFailures = append(issueFailures, failure)
			if syncEventID != uuid.Nil {
				p.appendSyncLog(ctx, syncEventID, &tenantID, "error", "issue", "Could not repair "+failure, map[string]any{"number": issue.Number})
			}
			continue
		} else if repaired && syncEventID != uuid.Nil {
			p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "issue", fmt.Sprintf("Applied workflow status label to issue #%d", issue.Number), map[string]any{"number": issue.Number})
		}
		issueCount++
	}
	if syncEventID != uuid.Nil {
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "issues", fmt.Sprintf("Reconciled %d of %d issues", issueCount, len(issues)), map[string]any{
			"count":  issueCount,
			"failed": len(issueFailures),
		})
	}

	failures := append(milestoneFailures, issueFailures...)
	if len(failures) > 0 {
		preview := failures
		if len(preview) > 3 {
			preview = preview[:3]
		}
		return fmt.Errorf("scheduled poll completed with %d reconciliation errors: %s", len(failures), strings.Join(preview, "; "))
	}
	if workflowLabelBackfill {
		backfilledAt := time.Now().UTC()
		if err := p.markWorkflowLabelBackfilled(ctx, state.ID, backfilledAt); err != nil {
			return fmt.Errorf("mark workflow label backfill complete: %w", err)
		}
		if syncEventID != uuid.Nil {
			p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "completed", "Workflow status labels backfilled for existing linked issues", map[string]any{
				"completedAt": backfilledAt.Format(time.RFC3339),
			})
		}
	}
	if syncEventID != uuid.Nil {
		if len(milestones) == 0 && len(issues) == 0 {
			p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "completed", "No new or changed provider items were returned", map[string]any{"mode": "incremental"})
		}
		p.appendSyncLog(ctx, syncEventID, &tenantID, "info", "completed", "Scheduled repository poll completed successfully", map[string]any{
			"milestones": len(milestones),
			"issues":     len(issues),
		})
	}
	return nil
}

func (p Processor) markWorkflowLabelBackfilled(ctx context.Context, stateID uuid.UUID, completedAt time.Time) error {
	_, err := p.Store.DB.NewUpdate().Model((*db.GitSyncState)(nil)).
		Set("workflow_label_backfilled_at = ?", completedAt).
		Set("updated_at = ?", time.Now().UTC()).
		Where("id = ? AND workflow_label_backfilled_at IS NULL", stateID).
		Exec(ctx)
	return err
}

func pollingSince(cursor *time.Time) *time.Time {
	if cursor == nil {
		return nil
	}
	since := cursor.UTC().Add(-time.Second)
	return &since
}

func issuePollingWindow(cursor, workflowLabelBackfilledAt *time.Time, supportsIncremental bool) (*time.Time, string) {
	if workflowLabelBackfilledAt == nil {
		// Incremental polling cannot discover an old issue that is missing its
		// managed workflow label. Run one full issue listing after the upgrade;
		// the durable marker prevents repeating that provider-wide scan.
		return nil, "workflow label backfill"
	}
	return pollingSince(cursor), pollingMode(cursor, supportsIncremental)
}

func pollingMode(cursor *time.Time, supportsIncremental bool) string {
	if cursor == nil {
		return "baseline"
	}
	if supportsIncremental {
		return "incremental"
	}
	return "full compatibility scan"
}

func describePollingWindow(mode string, since *time.Time) string {
	if since == nil {
		return mode
	}
	return fmt.Sprintf("%s since %s", mode, since.UTC().Format(time.RFC3339))
}

func (p Processor) updateGitSyncState(ctx context.Context, stateID uuid.UUID, status string, startedAt, completedAt, issueCursorAt, milestoneCursorAt *time.Time, errorMessage string) error {
	query := p.Store.DB.NewUpdate().Model((*db.GitSyncState)(nil)).
		Set("status = ?", status).
		Set("updated_at = ?", time.Now().UTC())
	if startedAt != nil {
		query = query.Set("last_started_at = ?", *startedAt)
	}
	if completedAt != nil {
		query = query.Set("last_completed_at = ?", *completedAt)
	}
	if issueCursorAt != nil {
		query = query.Set("issue_cursor_at = ?", *issueCursorAt)
	}
	if milestoneCursorAt != nil {
		query = query.Set("milestone_cursor_at = ?", *milestoneCursorAt)
	}
	if errorMessage == "" {
		if status == "processing" || status == "succeeded" {
			query = query.Set("last_error = NULL")
		}
	} else {
		query = query.Set("last_error = ?", errorMessage)
	}
	_, err := query.Where("id = ?", stateID).Exec(ctx)
	return err
}

// seedGitSyncCursor records that a full manual import already covered the
// provider up to its start time. Without this handoff, the first scheduled
// run after a manual import would unnecessarily download the entire
// repository again.
func (p Processor) seedGitSyncCursor(ctx context.Context, tenantID, projectID, repositoryID uuid.UUID, coveredThrough time.Time) error {
	interval := p.Config.SyncPollInterval
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	now := time.Now().UTC()
	state := &db.GitSyncState{
		RecordFields:              db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:                  tenantID,
		ProjectID:                 projectID,
		RepositoryID:              repositoryID,
		IssueCursorAt:             &coveredThrough,
		MilestoneCursorAt:         &coveredThrough,
		WorkflowLabelBackfilledAt: &coveredThrough,
		LastStartedAt:             &coveredThrough,
		LastCompletedAt:           &now,
		NextRunAt:                 now.Add(interval),
		Status:                    "succeeded",
	}
	_, err := p.Store.DB.NewInsert().Model(state).On(`CONFLICT (project_id, repository_id) DO UPDATE SET
		issue_cursor_at = EXCLUDED.issue_cursor_at,
		milestone_cursor_at = EXCLUDED.milestone_cursor_at,
		workflow_label_backfilled_at = EXCLUDED.workflow_label_backfilled_at,
		last_started_at = EXCLUDED.last_started_at,
		last_completed_at = EXCLUDED.last_completed_at,
		next_run_at = EXCLUDED.next_run_at,
		status = EXCLUDED.status,
		last_error = NULL,
		updated_at = EXCLUDED.updated_at`).Exec(ctx)
	return err
}
