-- NihongoBridge canonical PostgreSQL search indexes.
-- Additive and idempotent: no DROP / TRUNCATE / destructive statements.
--
-- PostgreSQL `simple` text search handles English meanings/explanations without
-- stemming away Japanese surface forms. Japanese exact/prefix/fuzzy matching is
-- handled by B-tree and pg_trgm indexes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Full-text search over the flattened canonical search projection.
CREATE INDEX IF NOT EXISTS search_documents_fts_idx
  ON search_documents
  USING GIN (to_tsvector('simple', search_text));

-- Trigram indexes accelerate typo-tolerant matching for Japanese and English.
CREATE INDEX IF NOT EXISTS search_documents_search_text_trgm_idx
  ON search_documents
  USING GIN (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS search_documents_primary_trgm_idx
  ON search_documents
  USING GIN (primary_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS search_documents_secondary_trgm_idx
  ON search_documents
  USING GIN (secondary_text gin_trgm_ops);

-- Case-insensitive exact equality can use B-tree expression indexes.
CREATE INDEX IF NOT EXISTS search_documents_primary_lower_idx
  ON search_documents (lower(primary_text));

CREATE INDEX IF NOT EXISTS search_documents_secondary_lower_idx
  ON search_documents (lower(secondary_text));

-- JSON aliases are exact-matched through jsonb containment when possible.
CREATE INDEX IF NOT EXISTS search_documents_aliases_idx
  ON search_documents
  USING GIN (aliases jsonb_path_ops);

-- The common browse path is active rows ordered inside one domain.
CREATE INDEX IF NOT EXISTS search_documents_active_type_priority_idx
  ON search_documents (entity_type, priority, id)
  WHERE active = true;

ANALYZE search_documents;
