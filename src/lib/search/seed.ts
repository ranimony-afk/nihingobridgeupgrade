import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { searchSynonyms, systemSettings } from "@/db/schema";
import { logger } from "@/lib/infra/logger";
import { reindexSearch } from "./indexer";

const SYNONYMS: Array<[string, string]> = [
  ["eat", "食べる"],
  ["drink", "飲む"],
  ["water", "水"],
  ["book", "本"],
  ["study", "勉強 学"],
  ["school", "学校"],
  ["teacher", "先生"],
  ["student", "学生"],
  ["train", "電車"],
  ["station", "駅"],
  ["japan", "日本"],
  ["cat", "猫"],
  ["dog", "犬"],
  ["mountain", "山"],
  ["hello", "こんにちは"],
  ["thanks", "ありがとう"],
  ["sorry", "すみません"],
  ["particle", "は を に で"],
  ["polite", "です ます"],
  ["keigo", "尊敬語 謙譲語"],
];

/**
 * Installs the Postgres search extensions and the indexes that back
 * full-text, trigram fuzzy matching, and autocomplete.
 */
export async function ensureSearchInfrastructure() {
  for (const extension of ["pg_trgm", "unaccent", "fuzzystrmatch", "btree_gin"]) {
    try {
      await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS ${extension}`));
    } catch (error) {
      logger.warn("search.extension_failed", {
        extension,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const statements = [
    `CREATE INDEX IF NOT EXISTS search_index_tsv ON search_index USING GIN (tsv)`,
    `CREATE INDEX IF NOT EXISTS search_index_title_trgm ON search_index USING GIN (title_norm gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS search_index_body_trgm ON search_index USING GIN (body gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS search_queries_norm_idx ON search_queries (normalized)`,
    `CREATE INDEX IF NOT EXISTS search_terms_trgm ON search_terms USING GIN (term gin_trgm_ops)`,
  ];
  for (const statement of statements) {
    try {
      await db.execute(sql.raw(statement));
    } catch (error) {
      logger.warn("search.index_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}

export async function ensureSearchSeed() {
  await ensureSearchInfrastructure();

  const marked = await db.select().from(systemSettings).where(eq(systemSettings.key, "phase12_search"));
  if (marked.length > 0) return;

  for (const [term, expandsTo] of SYNONYMS) {
    await db
      .insert(searchSynonyms)
      .values({ id: `syn-${term}`, term, expandsTo })
      .onConflictDoNothing();
  }

  const result = await reindexSearch();
  await db.insert(systemSettings).values({ key: "phase12_search", value: String(result.indexed) });
  logger.info("search.indexed", { indexed: result.indexed, tookMs: result.tookMs });
}
