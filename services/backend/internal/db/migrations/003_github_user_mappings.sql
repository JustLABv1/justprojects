CREATE TABLE github_user_mappings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    github_login text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, github_login),
    UNIQUE (tenant_id, user_id)
);

CREATE INDEX github_user_mappings_lookup_idx ON github_user_mappings (tenant_id, github_login);
