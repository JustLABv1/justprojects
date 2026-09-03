ALTER TABLE users
    ADD COLUMN IF NOT EXISTS platform_admin boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS platform_settings (
    singleton_id boolean PRIMARY KEY NOT NULL DEFAULT true CHECK (singleton_id = true),
    login_enabled boolean NOT NULL DEFAULT true,
    signup_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (singleton_id, login_enabled, signup_enabled)
VALUES (true, true, true)
ON CONFLICT (singleton_id) DO NOTHING;

-- Existing self-hosted installations need a recovery path immediately after
-- upgrading. Promote the oldest account only when no administrator exists.
UPDATE users
SET platform_admin = true,
    updated_at = now()
WHERE id = (
    SELECT id
    FROM users
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE platform_admin = true)
    ORDER BY created_at ASC, id ASC
    LIMIT 1
);
