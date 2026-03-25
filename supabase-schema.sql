-- Gibi Finder - Supabase Schema
-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- ============================================================
-- Table: gibis (your personal comic book collection)
-- ============================================================
CREATE TABLE IF NOT EXISTS gibis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  revista TEXT,
  editora TEXT,
  ano TEXT,
  numero TEXT,
  personagens TEXT[] DEFAULT '{}',
  descricao TEXT,
  imagem_url TEXT,
  tags TEXT[] DEFAULT '{}',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_gibis_titulo ON gibis(titulo);
CREATE INDEX IF NOT EXISTS idx_gibis_revista ON gibis(revista);
CREATE INDEX IF NOT EXISTS idx_gibis_editora ON gibis(editora);
CREATE INDEX IF NOT EXISTS idx_gibis_personagens ON gibis USING GIN(personagens);
CREATE INDEX IF NOT EXISTS idx_gibis_tags ON gibis USING GIN(tags);

-- Full text search index on titulo + revista + descricao
CREATE INDEX IF NOT EXISTS idx_gibis_fts ON gibis USING GIN(
  to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(revista, '') || ' ' || coalesce(descricao, ''))
);

-- ============================================================
-- Table: search_history (search log)
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_revista ON search_history(revista);
CREATE INDEX IF NOT EXISTS idx_search_history_titulo ON search_history(titulo);

-- ============================================================
-- Table: result_feedback
-- ============================================================
CREATE TABLE IF NOT EXISTS result_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID REFERENCES search_history(id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL,
  correction_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_result_feedback_result_id ON result_feedback(result_id);

-- ============================================================
-- Allow anonymous read/write (anon key)
-- Uncomment these if you enable Row Level Security:
-- ============================================================
-- ALTER TABLE gibis ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE result_feedback ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all" ON gibis FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all" ON search_history FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all" ON result_feedback FOR ALL USING (true) WITH CHECK (true);
