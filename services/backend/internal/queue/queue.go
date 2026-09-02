package queue

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/JustLABv1/justprojects/services/backend/internal/db"
	"github.com/google/uuid"
)

type Queue struct {
	Store *db.Store
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

func (q Queue) RunOnce(ctx context.Context, process func(context.Context, *db.OutboxJob) error) (bool, error) {
	job, err := q.Claim(ctx)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if err = process(ctx, job); err != nil {
		return true, q.Fail(ctx, job.ID, fmt.Errorf("process %s: %w", job.Kind, err), job.Attempts < 8)
	}
	return true, q.Succeed(ctx, job.ID)
}
