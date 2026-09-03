ALTER TABLE project_statuses
    ADD COLUMN IF NOT EXISTS provider_label text;

UPDATE project_statuses AS ps
SET provider_label = 'jp-status:' ||
    COALESCE(
        NULLIF(
            BTRIM(
                LEFT(
                    BTRIM(REGEXP_REPLACE(lower(trim(p.key)), '[^a-z0-9]+', '-', 'g'), '-'),
                    12
                ),
                '-'
            ),
            ''
        ),
        'project'
    ) || ':' ||
    COALESCE(
        NULLIF(
            BTRIM(
                LEFT(
                    BTRIM(REGEXP_REPLACE(lower(trim(ps.name)), '[^a-z0-9]+', '-', 'g'), '-'),
                    20
                ),
                '-'
            ),
            ''
        ),
        'status'
    ) || '-' || LEFT(REPLACE(ps.id::text, '-', ''), 6)
FROM projects AS p
WHERE p.id = ps.project_id
  AND (ps.provider_label IS NULL OR BTRIM(ps.provider_label) = '');

ALTER TABLE project_statuses
    ALTER COLUMN provider_label SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_statuses_provider_label_idx
    ON project_statuses (project_id, provider_label);
