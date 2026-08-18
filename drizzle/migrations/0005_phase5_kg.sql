-- Knowledge graph. Sized for full JMdict/Tatoeba loads; core corpus is incremental.
-- Run after 0004. drizzle-kit push also applies the Drizzle tables.

CREATE INDEX IF NOT EXISTS kg_lexemes_fts
  ON kg_lexemes USING GIN (to_tsvector('simple', search_document));
CREATE INDEX IF NOT EXISTS kg_kanji_fts
  ON kg_kanji USING GIN (to_tsvector('simple', search_document));
CREATE INDEX IF NOT EXISTS kg_sentences_fts
  ON kg_sentences USING GIN (to_tsvector('simple', search_document));
