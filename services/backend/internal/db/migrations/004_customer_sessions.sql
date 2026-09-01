ALTER TABLE sessions ADD COLUMN public_page_id uuid REFERENCES public_pages(id) ON DELETE CASCADE;
CREATE INDEX sessions_public_page_idx ON sessions (public_page_id) WHERE public_page_id IS NOT NULL;
