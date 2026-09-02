CREATE TABLE project_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_public_page_id uuid REFERENCES public_pages(id) ON DELETE SET NULL,
    requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    requester_name text NOT NULL,
    requester_email text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    requested_start_date date,
    requested_target_date date,
    priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'needs_info', 'approved', 'rejected', 'converted', 'cancelled')),
    assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
    internal_notes text,
    converted_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
    request_token_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_requests_tenant_status_created_idx ON project_requests (tenant_id, status, created_at DESC);
CREATE INDEX project_requests_requester_idx ON project_requests (requester_user_id, created_at DESC);

CREATE TABLE project_updates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id uuid REFERENCES users(id) ON DELETE SET NULL,
    title text NOT NULL,
    body text NOT NULL,
    visibility text NOT NULL DEFAULT 'customer' CHECK (visibility IN ('internal', 'customer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_updates_project_created_idx ON project_updates (project_id, created_at DESC);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    link text,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_unread_idx ON notifications (tenant_id, user_id, read_at, created_at DESC);
