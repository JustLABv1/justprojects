CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    name text NOT NULL,
    password_hash text,
    email_verified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    subject text NOT NULL,
    email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, subject)
);

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_expiry_idx ON sessions (user_id, expires_at);

CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);

CREATE TABLE permission_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id uuid,
    permission text NOT NULL,
    effect text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX permission_grants_lookup_idx ON permission_grants (tenant_id, user_id, project_id, permission);

CREATE TABLE projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    key text NOT NULL,
    description text,
    start_date date,
    target_date date,
    status text NOT NULL DEFAULT 'active',
    created_by uuid NOT NULL REFERENCES users(id),
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, key)
);

CREATE TABLE project_statuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    category text NOT NULL CHECK (category IN ('backlog', 'todo', 'in_progress', 'blocked', 'done')),
    position integer NOT NULL DEFAULT 0,
    color text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, name),
    UNIQUE (project_id, position)
);

CREATE TABLE labels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#64748b',
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX labels_project_name_idx ON labels (tenant_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE TABLE milestones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    start_date date,
    due_date date,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'customer')),
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
    milestone_id uuid REFERENCES milestones(id) ON DELETE SET NULL,
    status_id uuid NOT NULL REFERENCES project_statuses(id),
    title text NOT NULL,
    description text,
    priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    start_date date,
    due_date date,
    estimate_minutes integer CHECK (estimate_minutes IS NULL OR estimate_minutes >= 0),
    assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
    visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'customer')),
    position integer NOT NULL DEFAULT 0,
    version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_project_status_position_idx ON tasks (project_id, status_id, position);
CREATE INDEX tasks_parent_idx ON tasks (project_id, parent_id);

CREATE TABLE task_labels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (task_id, label_id)
);

CREATE TABLE github_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    auth_method text NOT NULL CHECK (auth_method IN ('app', 'oauth')),
    external_account_id bigint NOT NULL,
    external_account_login text,
    encrypted_access_token text,
    encrypted_refresh_token text,
    token_expires_at timestamptz,
    scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX github_connections_account_idx ON github_connections (tenant_id, auth_method, external_account_id);

CREATE TABLE github_repositories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id uuid NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
    external_id bigint NOT NULL,
    owner text NOT NULL,
    name text NOT NULL,
    full_name text NOT NULL,
    private boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (connection_id, external_id)
);

CREATE TABLE project_repositories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    repository_id uuid NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, repository_id)
);

CREATE TABLE external_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    repository_id uuid NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
    local_type text NOT NULL CHECK (local_type IN ('task', 'milestone')),
    local_id uuid NOT NULL,
    external_type text NOT NULL CHECK (external_type IN ('issue', 'milestone')),
    external_id bigint NOT NULL,
    external_number integer,
    remote_updated_at timestamptz,
    field_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (repository_id, local_type, local_id),
    UNIQUE (repository_id, external_type, external_id)
);

CREATE TABLE sync_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
    connection_id uuid REFERENCES github_connections(id) ON DELETE SET NULL,
    delivery_id text NOT NULL UNIQUE,
    event_name text NOT NULL,
    action text,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed')),
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_conflicts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_link_id uuid NOT NULL REFERENCES external_links(id) ON DELETE CASCADE,
    field text NOT NULL,
    local_value jsonb NOT NULL,
    remote_value jsonb NOT NULL,
    local_changed_at timestamptz NOT NULL,
    remote_changed_at timestamptz NOT NULL,
    delivery_id text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
    resolution text,
    resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (external_link_id, field, status)
);

CREATE TABLE outbox_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    run_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox_jobs (status, run_at);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_created_idx ON audit_events (tenant_id, created_at DESC);

CREATE TABLE public_pages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slug text NOT NULL UNIQUE,
    token_hash text NOT NULL UNIQUE,
    access_mode text NOT NULL DEFAULT 'link' CHECK (access_mode IN ('link', 'login')),
    title text,
    visible_task_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    visible_milestone_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    revoked boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public_page_viewers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_page_id uuid NOT NULL REFERENCES public_pages(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (public_page_id, user_id)
);
