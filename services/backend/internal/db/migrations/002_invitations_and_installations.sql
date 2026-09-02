CREATE TABLE tenant_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenant_invitations_lookup_idx ON tenant_invitations (tenant_id, email, expires_at);

ALTER TABLE github_connections ADD COLUMN installation_id bigint;
CREATE UNIQUE INDEX github_connections_installation_idx
    ON github_connections (tenant_id, installation_id)
    WHERE installation_id IS NOT NULL;

