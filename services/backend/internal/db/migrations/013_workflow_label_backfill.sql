ALTER TABLE git_sync_states
    ADD COLUMN IF NOT EXISTS workflow_label_backfilled_at timestamptz;

-- Existing cursor rows may otherwise wait for their already scheduled
-- interval before the one-time label repair becomes visible.
UPDATE git_sync_states
SET next_run_at = now(),
    updated_at = now()
WHERE workflow_label_backfilled_at IS NULL
  AND status NOT IN ('queued', 'processing');
