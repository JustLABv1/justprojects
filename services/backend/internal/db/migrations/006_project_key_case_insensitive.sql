-- Project keys are a workspace-scoped namespace. Keep the uniqueness rule
-- case-insensitive so legacy lowercase records cannot collide with new keys.
CREATE UNIQUE INDEX IF NOT EXISTS projects_tenant_key_lower_idx
    ON projects (tenant_id, lower(key));
