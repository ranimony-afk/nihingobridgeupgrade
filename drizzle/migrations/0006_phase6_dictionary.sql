CREATE TABLE IF NOT EXISTS kg_links (
  id text PRIMARY KEY,
  from_id text NOT NULL,
  to_id text NOT NULL,
  kind text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS kg_links_unique ON kg_links (from_id, to_id, kind);

CREATE TABLE IF NOT EXISTS kg_forms (
  id text PRIMARY KEY,
  lexeme_id text NOT NULL REFERENCES kg_lexemes(id) ON DELETE CASCADE,
  style text NOT NULL,
  surface text NOT NULL,
  reading text NOT NULL
);

CREATE TABLE IF NOT EXISTS kg_conjugations (
  id text PRIMARY KEY,
  lexeme_id text NOT NULL REFERENCES kg_lexemes(id) ON DELETE CASCADE,
  form text NOT NULL,
  surface text NOT NULL,
  reading text NOT NULL
);

CREATE TABLE IF NOT EXISTS kg_lexeme_grammar (
  lexeme_id text NOT NULL REFERENCES kg_lexemes(id) ON DELETE CASCADE,
  grammar_id text NOT NULL REFERENCES kg_grammar(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS kg_lexeme_grammar_pk ON kg_lexeme_grammar (lexeme_id, grammar_id);

CREATE TABLE IF NOT EXISTS kg_bookmarks (
  id text PRIMARY KEY,
  learner_id text NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kg_bookmarks_unique ON kg_bookmarks (learner_id, target_type, target_id);

CREATE TABLE IF NOT EXISTS kg_offline_packs (
  id text PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL,
  bytes integer NOT NULL,
  checksum text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
