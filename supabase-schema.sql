-- Gibi Finder - Supabase Schema
-- Run this SQL in your Supabase SQL Editor to set up the required tables.

-- Table: search_history
CREATE TABLE IF NOT EXISTS search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_type TEXT NOT NULL DEFAULT 'text',
  query TEXT,
  images TEXT[] DEFAULT '{}',
  revista TEXT,
  titulo TEXT,
  editora TEXT,
  ano TEXT,
  pagina TEXT,
  personagens TEXT[] DEFAULT '{}',
  descricao TEXT,
  confianca NUMERIC,
  nota TEXT,
  balloon_text TEXT,
  result_json JSONB
);

-- Table: result_feedback
CREATE TABLE IF NOT EXISTS result_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID REFERENCES search_history(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL,
  correction_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster history queries
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_revista ON search_history(revista);
CREATE INDEX IF NOT EXISTS idx_search_history_titulo ON search_history(titulo);
CREATE INDEX IF NOT EXISTS idx_result_feedback_result_id ON result_feedback(result_id);

-- Enable Row Level Security (optional but recommended)
-- ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE result_feedback ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read/write for the app (using anon key)
-- If you enabled RLS, add these policies:
-- CREATE POLICY "Allow all operations" ON search_history FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all operations" ON result_feedback FOR ALL USING (true) WITH CHECK (true);
