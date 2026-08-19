CREATE TABLE IF NOT EXISTS kg_grammar_meta (
  grammar_id text PRIMARY KEY REFERENCES kg_grammar(id) ON DELETE CASCADE,
  difficulty integer NOT NULL DEFAULT 1,
  formation text NOT NULL,
  nuance text NOT NULL,
  ai_explanation text NOT NULL,
  timeline jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS kg_grammar_edges (
  id text PRIMARY KEY,
  from_id text NOT NULL,
  to_id text NOT NULL,
  kind text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS kg_grammar_edges_unique ON kg_grammar_edges (from_id, to_id, kind);

CREATE TABLE IF NOT EXISTS kg_grammar_examples (
  id text PRIMARY KEY,
  grammar_id text NOT NULL REFERENCES kg_grammar(id) ON DELETE CASCADE,
  ja text NOT NULL,
  en text NOT NULL
);

CREATE TABLE IF NOT EXISTS kg_grammar_builder (
  id text PRIMARY KEY,
  grammar_id text NOT NULL REFERENCES kg_grammar(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  tiles jsonb NOT NULL,
  answer text NOT NULL
);

CREATE TABLE IF NOT EXISTS tutor_sessions (
  id text PRIMARY KEY,
  learner_id text,
  persona text NOT NULL,
  scenario text NOT NULL,
  level text NOT NULL,
  provider text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  turns integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tutor_messages (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  analysis jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_posts (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  tags text NOT NULL DEFAULT '',
  seo_title text,
  seo_description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_courses (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL,
  level text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  modules jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS cms_media (
  id text PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL,
  alt text NOT NULL DEFAULT '',
  bytes integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cms_notifications (
  id text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cms_seo (
  path text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  og_image text,
  noindex boolean NOT NULL DEFAULT false
);
