-- Phase 12 search. Additive: no existing table is modified.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE TABLE IF NOT EXISTS search_index (
  id text PRIMARY KEY,
  kind text NOT NULL,
  ref_id text NOT NULL,
  href text NOT NULL,
  title text NOT NULL,
  title_norm text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  jlpt text,
  pos text,
  difficulty integer,
  boost real NOT NULL DEFAULT 0,
  tsv tsvector,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS search_index_kind_ref ON search_index (kind, ref_id);
CREATE INDEX IF NOT EXISTS search_index_kind_idx ON search_index (kind);
CREATE INDEX IF NOT EXISTS search_index_jlpt_idx ON search_index (jlpt);

-- Full text ranking
CREATE INDEX IF NOT EXISTS search_index_tsv ON search_index USING GIN (tsv);
-- Fuzzy + autocomplete (works for Japanese too, since trigrams are codepoint based)
CREATE INDEX IF NOT EXISTS search_index_title_trgm ON search_index USING GIN (title_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS search_index_body_trgm ON search_index USING GIN (body gin_trgm_ops);

CREATE TABLE IF NOT EXISTS search_queries (
  id text PRIMARY KEY,
  query text NOT NULL,
  normalized text NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  took_ms integer NOT NULL DEFAULT 0,
  filters text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_queries_norm_idx ON search_queries (normalized);

CREATE TABLE IF NOT EXISTS search_synonyms (
  id text PRIMARY KEY,
  term text NOT NULL,
  expands_to text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS search_synonyms_pair ON search_synonyms (term, expands_to);

CREATE TABLE IF NOT EXISTS search_terms (
  term text PRIMARY KEY,
  display text NOT NULL,
  weight integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS search_terms_trgm ON search_terms USING GIN (term gin_trgm_ops);
