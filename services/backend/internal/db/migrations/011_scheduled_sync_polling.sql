CREATE TABLE git_sync_states (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    repository_id uuid NOT NULL REFERENCES git_repositories(id) ON DELETE CASCADE,
    issue_cursor_at timestamptz,
    milestone_cursor_at timestamptz,
    last_started_at timestamptz,
    last_completed_at timestamptz,
    next_run_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'queued', 'processing', 'succeeded', 'failed')),
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, repository_id)
);

CREATE INDEX git_sync_states_due_idx ON git_sync_states (next_run_at);
CREATE INDEX git_sync_states_tenant_idx ON git_sync_states (tenant_id, project_id);
