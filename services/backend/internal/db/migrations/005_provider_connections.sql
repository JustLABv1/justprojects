-- Generalize the original GitHub-only connection tables without losing
-- existing installations. A GitLab connection may point at gitlab.com or a
-- self-hosted instance, so the API base URL is part of the connection record.
DO $$
BEGIN
    IF to_regclass('public.github_connections') IS NOT NULL
        AND to_regclass('public.git_connections') IS NULL THEN
        ALTER TABLE github_connections RENAME TO git_connections;
    END IF;
    IF to_regclass('public.github_repositories') IS NOT NULL
        AND to_regclass('public.git_repositories') IS NULL THEN
        ALTER TABLE github_repositories RENAME TO git_repositories;
    END IF;
    IF to_regclass('public.github_user_mappings') IS NOT NULL
        AND to_regclass('public.git_user_mappings') IS NULL THEN
        ALTER TABLE github_user_mappings RENAME TO git_user_mappings;
    END IF;
END $$;

ALTER TABLE git_connections
    ADD COLUMN IF NOT EXISTS provider text,
    ADD COLUMN IF NOT EXISTS name text,
    ADD COLUMN IF NOT EXISTS api_base_url text,
    ADD COLUMN IF NOT EXISTS encrypted_webhook_secret text;

UPDATE git_connections
SET provider = COALESCE(NULLIF(provider, ''), 'github'),
    api_base_url = COALESCE(NULLIF(api_base_url, ''), 'https://api.github.com'),
    name = COALESCE(name, external_account_login);

ALTER TABLE git_connections
    ALTER COLUMN provider SET DEFAULT 'github',
    ALTER COLUMN provider SET NOT NULL,
    ALTER COLUMN api_base_url SET DEFAULT 'https://api.github.com',
    ALTER COLUMN api_base_url SET NOT NULL;

ALTER TABLE git_connections DROP CONSTRAINT IF EXISTS github_connections_auth_method_check;
ALTER TABLE git_connections DROP CONSTRAINT IF EXISTS git_connections_auth_method_check;
ALTER TABLE git_connections DROP CONSTRAINT IF EXISTS git_connections_provider_check;
ALTER TABLE git_connections
    ADD CONSTRAINT git_connections_auth_method_check
        CHECK (auth_method IN ('app', 'oauth', 'pat')),
    ADD CONSTRAINT git_connections_provider_check
        CHECK (provider IN ('github', 'gitlab'));

DROP INDEX IF EXISTS github_connections_account_idx;
DROP INDEX IF EXISTS git_connections_account_idx;
CREATE UNIQUE INDEX git_connections_account_idx
    ON git_connections (tenant_id, provider, api_base_url, auth_method, external_account_id);

ALTER TABLE git_user_mappings ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE git_user_mappings ADD COLUMN IF NOT EXISTS remote_id bigint;
ALTER TABLE git_user_mappings ADD COLUMN IF NOT EXISTS remote_login text;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'git_user_mappings' AND column_name = 'github_login'
    ) THEN
        UPDATE git_user_mappings
        SET remote_login = COALESCE(NULLIF(remote_login, ''), github_login);
        ALTER TABLE git_user_mappings DROP COLUMN github_login;
    END IF;
END $$;

UPDATE git_user_mappings
SET provider = COALESCE(NULLIF(provider, ''), 'github');

ALTER TABLE git_user_mappings
    ALTER COLUMN provider SET DEFAULT 'github',
    ALTER COLUMN provider SET NOT NULL,
    ALTER COLUMN remote_login SET NOT NULL;

DROP INDEX IF EXISTS github_user_mappings_login_idx;
DROP INDEX IF EXISTS git_user_mappings_login_idx;
CREATE UNIQUE INDEX git_user_mappings_login_idx
    ON git_user_mappings (tenant_id, provider, lower(remote_login));

ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS provider text;
UPDATE sync_events SET provider = COALESCE(NULLIF(provider, ''), 'github');
ALTER TABLE sync_events
    ALTER COLUMN provider SET DEFAULT 'github',
    ALTER COLUMN provider SET NOT NULL;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS connection_id uuid;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_connection_id_fkey;
ALTER TABLE projects
    ADD CONSTRAINT projects_connection_id_fkey
        FOREIGN KEY (connection_id) REFERENCES git_connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS projects_connection_idx ON projects (connection_id);
