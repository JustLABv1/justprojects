CREATE TABLE sync_event_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sync_event_id uuid NOT NULL REFERENCES sync_events(id) ON DELETE CASCADE,
    level text NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    phase text,
    message text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sync_event_logs_event_created_idx ON sync_event_logs (tenant_id, sync_event_id, created_at ASC);
