package queue

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
)

type Queue struct {
	Store *db.Store
}

// ErrDeferred tells the worker that a job was safely rescheduled and that it
// should stop claiming more work for this poll cycle.
var ErrDeferred = errors.New("outbox job deferred")

// RetryAtProvider lets integrations provide a provider-specific retry time
// without making the generic queue depend on any integration package.
type RetryAtProvider interface {
	RetryAt() (time.Time, bool)
}

func (q Queue) Enqueue(ctx context.Context, kind string, payload map[string]any) error {
	now := time.Now().UTC()
	job := &db.OutboxJob{
		RecordFields: db.RecordFields{ID: uuid.New(), CreatedAt: now, UpdatedAt: now},
		Kind:         kind,
		Payload:      payload,
		Status:       "pending",
		RunAt:        now,
	}
	_, err := q.Store.DB.NewInsert().Model(job).Exec(ctx)
	return err
}

func (q Queue) Claim(ctx context.Context) (*db.OutboxJob, error) {
	job := new(db.OutboxJob)
	err := q.Store.DB.NewRaw(`
		WITH next_job AS (
			SELECT id FROM outbox_jobs
			WHERE status = 'pending' AND run_at <= now()
			ORDER BY run_at ASC, created_at ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		UPDATE outbox_jobs AS jobs
		SET status = 'processing', locked_at = now(), attempts = jobs.attempts + 1, updated_at = now()
		FROM next_job
		WHERE jobs.id = next_job.id
		RETURNING jobs.id, jobs.kind, jobs.payload, jobs.status, jobs.attempts, jobs.run_at, jobs.locked_at, jobs.last_error, jobs.created_at, jobs.updated_at
	`).Scan(ctx, job)
	if err != nil {
		return nil, err
	}
	return job, nil
}

func (q Queue) Succeed(ctx context.Context, jobID uuid.UUID) error {
	_, err := q.Store.DB.NewUpdate().Model((*db.OutboxJob)(nil)).
		Set("status = 'succeeded'").Set("locked_at = NULL").Set("updated_at = now()").
		Where("id = ?", jobID).Exec(ctx)
	return err
}

func (q Queue) Fail(ctx context.Context, jobID uuid.UUID, jobErr error, retry bool) error {
	status := "failed"
	setRunAt := ""
	if retry {
		status = "pending"
		setRunAt = ", run_at = now() + LEAST((attempts * attempts) * interval '5 seconds', interval '1 hour')"
	}
	_, err := q.Store.DB.NewUpdate().Model((*db.OutboxJob)(nil)).
		Set("status = ?", status).
		Set("last_error = ?", jobErr.Error()).
		Set("locked_at = NULL").
		Set("updated_at = now()"+setRunAt).
		Where("id = ?", jobID).Exec(ctx)
	return err
}

func (q Queue) DeferUntil(ctx context.Context, jobID uuid.UUID, jobErr error, retryAt time.Time) error {
	now := time.Now().UTC()
	if !retryAt.After(now) {
		retryAt = now.Add(time.Minute)
	}
	_, err := q.Store.DB.NewUpdate().Model((*db.OutboxJob)(nil)).
		Set("status = 'pending'").
		Set("last_error = ?", jobErr.Error()).
		Set("locked_at = NULL").
		Set("run_at = ?", retryAt).
		Set("updated_at = ?", now).
		Where("id = ?", jobID).Exec(ctx)
	return err
}

func (q Queue) RunOnce(ctx context.Context, process func(context.Context, *db.OutboxJob) error) (bool, error) {
	startedAt := time.Now()
	job, err := q.Claim(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	slog.Default().Info("outbox job claimed", "job_id", job.ID, "kind", job.Kind, "attempt", job.Attempts)
	if err = process(ctx, job); err != nil {
		var retryAtProvider RetryAtProvider
		if errors.As(err, &retryAtProvider) {
			if retryAt, ok := retryAtProvider.RetryAt(); ok {
				if deferErr := q.DeferUntil(ctx, job.ID, err, retryAt); deferErr != nil {
					slog.Default().Error("outbox job could not be deferred", "job_id", job.ID, "kind", job.Kind, "attempt", job.Attempts, "duration_ms", time.Since(startedAt).Milliseconds(), "error", deferErr)
					return true, deferErr
				}
				slog.Default().Warn("outbox job deferred", "job_id", job.ID, "kind", job.Kind, "attempt", job.Attempts, "run_at", retryAt.UTC().Format(time.RFC3339), "duration_ms", time.Since(startedAt).Milliseconds(), "error", err)
				return true, fmt.Errorf("%w until %s", ErrDeferred, retryAt.UTC().Format(time.RFC3339))
			}
		}
		wrappedErr := fmt.Errorf("process %s: %w", job.Kind, err)
		retry := job.Attempts < 8
		if failErr := q.Fail(ctx, job.ID, wrappedErr, retry); failErr != nil {
			slog.Default().Error("outbox job status update failed", "job_id", job.ID, "kind", job.Kind, "attempt", job.Attempts, "duration_ms", time.Since(startedAt).Milliseconds(), "error", failErr)
			return true, failErr
		}
		if retry {
			slog.Default().Warn("outbox job failed; retry scheduled", "job_id", job.ID, "kind", job.Kind, "attempt", job.Attempts, "duration_ms", time.Since(startedAt).Milliseconds(), "error", wrappedErr)
		} else {
			slog.Default().Error("outbox job failed permanently", "job_id", job.ID, "kind", job.Kind, "attempt", job.Attempts, "duration_ms", time.Since(startedAt).Milliseconds(), "error", wrappedErr)
		}
		return true, nil
	}
	if err = q.Succeed(ctx, job.ID); err != nil {
		slog.Default().Error("outbox job success update failed", "job_id", job.ID, "kind", job.Kind, "attempt", job.Attempts, "duration_ms", time.Since(startedAt).Milliseconds(), "error", err)
		return true, err
	}
	slog.Default().Info("outbox job succeeded", "job_id", job.ID, "kind", job.Kind, "attempt", job.Attempts, "duration_ms", time.Since(startedAt).Milliseconds())
	return true, nil
}
