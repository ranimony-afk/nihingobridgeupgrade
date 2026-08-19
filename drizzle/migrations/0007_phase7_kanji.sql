CREATE TABLE IF NOT EXISTS kg_radicals (
  id text PRIMARY KEY,
  character text NOT NULL UNIQUE,
  meaning text NOT NULL,
  strokes integer NOT NULL
);

CREATE TABLE IF NOT EXISTS kg_kanji_radicals (
  kanji_id text NOT NULL REFERENCES kg_kanji(id) ON DELETE CASCADE,
  radical_id text NOT NULL REFERENCES kg_radicals(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS kg_kanji_radicals_pk ON kg_kanji_radicals (kanji_id, radical_id);

CREATE TABLE IF NOT EXISTS kg_kanji_meta (
  kanji_id text PRIMARY KEY REFERENCES kg_kanji(id) ON DELETE CASCADE,
  branch text NOT NULL,
  history text NOT NULL,
  origin text NOT NULL,
  mnemonic text NOT NULL,
  rtk_index integer,
  rtk_keyword text,
  wanikani integer,
  nanori text
);

CREATE TABLE IF NOT EXISTS kg_kanji_edges (
  id text PRIMARY KEY,
  from_id text NOT NULL REFERENCES kg_kanji(id) ON DELETE CASCADE,
  to_id text NOT NULL REFERENCES kg_kanji(id) ON DELETE CASCADE,
  kind text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS kg_kanji_edges_unique ON kg_kanji_edges (from_id, to_id, kind);
