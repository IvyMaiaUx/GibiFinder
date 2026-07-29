-- Gibi Finder - Fase 2: Reading Sessions
-- Run this in Supabase SQL Editor before deploying the new version.

CREATE TABLE IF NOT EXISTS reading_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  provider_id TEXT        NOT NULL,
  manga_id    TEXT        NOT NULL,
  chapter_id  TEXT,
  chapter_num TEXT,
  duration_ms INTEGER     NOT NULL,
  pages_read  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reading_sessions DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rs_manga    ON reading_sessions(manga_id);
CREATE INDEX IF NOT EXISTS idx_rs_user     ON reading_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_rs_provider ON reading_sessions(provider_id, manga_id);
