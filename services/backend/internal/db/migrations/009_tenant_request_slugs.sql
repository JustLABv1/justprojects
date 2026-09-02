ALTER TABLE tenants ADD COLUMN request_slug text;

WITH ranked_tenants AS (
    SELECT
        id,
        regexp_replace(slug, '-[0-9a-f]{8}$', '') AS base_slug,
        row_number() OVER (
            PARTITION BY regexp_replace(slug, '-[0-9a-f]{8}$', '')
            ORDER BY created_at ASC, id ASC
        ) AS duplicate_number
    FROM tenants
)
UPDATE tenants AS tenant
SET
    request_slug = CASE
        WHEN ranked_tenants.duplicate_number = 1 THEN ranked_tenants.base_slug
        ELSE ranked_tenants.base_slug || '-' || ranked_tenants.duplicate_number::text
    END,
    updated_at = now()
FROM ranked_tenants
WHERE tenant.id = ranked_tenants.id;

ALTER TABLE tenants ALTER COLUMN request_slug SET NOT NULL;
CREATE UNIQUE INDEX tenants_request_slug_lower_idx ON tenants (lower(request_slug));
