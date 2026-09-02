ALTER TABLE public_pages DROP CONSTRAINT IF EXISTS public_pages_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS public_pages_active_slug_idx
    ON public_pages (slug)
    WHERE revoked = false;
