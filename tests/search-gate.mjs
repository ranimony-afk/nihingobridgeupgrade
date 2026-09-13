#!/usr/bin/env node
/**
 * Phase 08.1 gate — PostgreSQL exact / full-text / fuzzy search.
 *
 *   node tests/search-gate.mjs http://127.0.0.1:3000
 *
 * No external engine is accepted. The gate verifies pg_trgm, GIN indexes,
 * projection integrity and the complete search → result → detail journey.
 */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function json(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, body: await response.json().catch(() => null), headers: response.headers };
}

async function html(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, text: await response.text() };
}

async function databaseChecks() {
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
  const isLocal = /@(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
  const client = new pg.Client({
    connectionString: url,
    ssl: isLocal || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  const extension = await client.query(
    `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_trgm') AS present`,
  );
  check("db: pg_trgm enabled", extension.rows[0]?.present === true);

  const indexes = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='search_documents' ORDER BY indexname`,
  );
  const names = indexes.rows.map((row) => row.indexname);
  check("db: full-text GIN index", names.includes("search_documents_fts_idx"));
  check(
    "db: trigram indexes",
    names.filter((name) => name.includes("trgm")).length >= 3,
    `${names.filter((name) => name.includes("trgm")).length} indexes`,
  );
  check("db: aliases GIN index", names.includes("search_documents_aliases_idx"));

  const counts = await client.query(`
    SELECT entity_type, count(*) FILTER (WHERE active)::int AS active,
           count(*) FILTER (WHERE NOT active)::int AS inactive
    FROM search_documents GROUP BY entity_type ORDER BY entity_type
  `);
  const countMap = new Map(counts.rows.map((row) => [row.entity_type, Number(row.active)]));
  check("db: kanji projected", countMap.get("kanji") > 10000, `${countMap.get("kanji")} docs`);
  check("db: dictionary projected", countMap.get("dictionary") > 20000, `${countMap.get("dictionary")} docs`);
  check("db: grammar projected", countMap.get("grammar") > 40, `${countMap.get("grammar")} docs`);
  check(
    "db: no stale rows in current projection domains",
    counts.rows
      .filter((row) => row.entity_type !== "vocabulary")
      .every((row) => Number(row.inactive) === 0),
    JSON.stringify(counts.rows),
  );
  check(
    "db: legacy vocabulary rows are inactive",
    counts.rows
      .filter((row) => row.entity_type === "vocabulary")
      .every((row) => Number(row.active) === 0),
  );

  const integrity = await client.query(`
    SELECT
      (SELECT count(*) FROM search_documents sd LEFT JOIN kanji k ON k.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='kanji' AND k.id IS NULL) AS bad_kanji,
      (SELECT count(*) FROM search_documents sd LEFT JOIN vocabulary v ON v.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='dictionary' AND v.id IS NULL) AS bad_dictionary,
      (SELECT count(*) FROM search_documents sd LEFT JOIN grammar_points g ON g.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='grammar' AND g.id IS NULL) AS bad_grammar
  `);
  check(
    "db: projection has no dangling entities",
    Object.values(integrity.rows[0]).every((value) => Number(value) === 0),
    JSON.stringify(integrity.rows[0]),
  );

  const sample = await client.query(
    `SELECT primary_text, secondary_text, aliases, search_text, route
     FROM search_documents WHERE entity_type='grammar' AND external_key='te-shimau' AND active`,
  );
  check("db: grammar search text includes meaning", sample.rows[0]?.search_text.includes("completion"));
  check("db: grammar aliases include pattern", sample.rows[0]?.aliases.includes("〜てしまう"));
  check("db: result route points to canonical detail", sample.rows[0]?.route === "/grammar/te-shimau");

  await client.end();
}

async function apiChecks() {
  /* exact */
  const exact = await json(`/api/search?q=${encodeURIComponent("語")}&mode=exact`);
  check("api: exact search 200", exact.status === 200);
  check("api: engine is PostgreSQL", exact.body?.meta?.engine === "postgresql");
  check("api: exact kanji found", (exact.body?.data?.hits ?? []).some((hit) => hit.entityType === "kanji" && hit.primaryText === "語"));
  check("api: exact match classified", exact.body?.data?.hits?.[0]?.matchedOn === "exact", exact.body?.data?.hits?.[0]?.matchedOn);
  check("api: exact score band", exact.body?.data?.hits?.[0]?.score >= 1000, String(exact.body?.data?.hits?.[0]?.score));
  check("api: facets returned", typeof exact.body?.data?.facets?.kanji === "number");

  const reading = await json(`/api/search?q=${encodeURIComponent("みず")}&mode=exact&types=kanji`);
  check(
    "api: exact reading alias",
    (reading.body?.data?.hits ?? []).some((hit) => hit.primaryText === "水" && hit.matchedOn === "exact"),
    `${reading.body?.data?.hits?.length ?? 0} hits`,
  );

  /* full-text */
  const fullText = await json(`/api/search?q=${encodeURIComponent("completion regret")}&mode=full_text&types=grammar`);
  check("api: full-text search 200", fullText.status === 200);
  check(
    "api: full-text grammar hit",
    (fullText.body?.data?.hits ?? []).some((hit) => hit.externalKey === "te-shimau"),
    (fullText.body?.data?.hits ?? []).map((hit) => hit.externalKey).join(", "),
  );
  check(
    "api: full-text classified",
    (fullText.body?.data?.hits ?? []).every((hit) => hit.matchedOn === "full_text"),
  );

  /* fuzzy */
  const fuzzy = await json(`/api/search?q=conditonal&mode=fuzzy&types=grammar&threshold=0.2`);
  check("api: fuzzy search 200", fuzzy.status === 200);
  check("api: fuzzy typo returns grammar", (fuzzy.body?.data?.hits ?? []).length > 0,
    `${fuzzy.body?.data?.hits?.length ?? 0} hits`);
  check(
    "api: fuzzy classified",
    (fuzzy.body?.data?.hits ?? []).every((hit) => hit.matchedOn === "fuzzy"),
  );
  check(
    "api: fuzzy exposes similarity",
    (fuzzy.body?.data?.hits ?? []).every((hit) => typeof hit.similarity === "number" && hit.similarity > 0),
  );

  const kanaTypo = await json(`/api/search?q=${encodeURIComponent("にほんこ")}&mode=fuzzy&types=dictionary&threshold=0.25`);
  check(
    "api: fuzzy kana typo finds dictionary result 日本語",
    (kanaTypo.body?.data?.hits ?? []).some((hit) => hit.primaryText.includes("日本語")),
    (kanaTypo.body?.data?.hits ?? []).slice(0, 3).map((hit) => hit.primaryText).join(", "),
  );

  /* auto ranking / filtering */
  const auto = await json(`/api/search?q=${encodeURIComponent("てしまう")}&mode=auto`);
  check("api: auto strategies disclosed", Array.isArray(auto.body?.meta?.strategies) && auto.body.meta.strategies.length === 4);
  const classes = (auto.body?.data?.hits ?? []).map((hit) => hit.matchedOn);
  const rank = { exact: 0, prefix: 1, full_text: 2, fuzzy: 3 };
  check(
    "api: auto ranking preserves strategy order",
    classes.every((value, index) => index === 0 || rank[classes[index - 1]] <= rank[value]),
    classes.join(" → "),
  );

  const grammarOnly = await json(`/api/search?q=because&types=grammar`);
  check(
    "api: type filter",
    (grammarOnly.body?.data?.hits ?? []).length > 0 &&
      (grammarOnly.body?.data?.hits ?? []).every((hit) => hit.entityType === "grammar"),
  );

  const jlpt = await json(`/api/search?q=grammar&types=grammar&jlpt=4&threshold=0.1`);
  check(
    "api: JLPT filter",
    (jlpt.body?.data?.hits ?? []).every((hit) => hit.jlptLevel === 4),
  );

  const page1 = await json(`/api/search?q=water&limit=2&offset=0&threshold=0.1`);
  const page2 = await json(`/api/search?q=water&limit=2&offset=2&threshold=0.1`);
  const firstKeys = (page1.body?.data?.hits ?? []).map((hit) => `${hit.entityType}:${hit.externalKey}`);
  const secondKeys = (page2.body?.data?.hits ?? []).map((hit) => `${hit.entityType}:${hit.externalKey}`);
  check("api: pagination pages disjoint", firstKeys.every((key) => !secondKeys.includes(key)), `${firstKeys} / ${secondKeys}`);
  check("api: pagination meta", page1.body?.meta?.pagination?.limit === 2);

  const invalidMode = await json("/api/search?q=water&mode=meilisearch");
  check("api: invalid/non-PostgreSQL mode rejected", invalidMode.status === 400);
  const invalidType = await json("/api/search?q=water&types=kanji,unknown");
  check("api: unknown type rejected", invalidType.status === 400);
  const legacyVocabulary = await json("/api/search?q=water&types=vocabulary&limit=2");
  check(
    "api: legacy vocabulary type maps to dictionary",
    legacyVocabulary.status === 200 &&
      legacyVocabulary.body?.data?.types?.includes("dictionary") &&
      !legacyVocabulary.body?.data?.types?.includes("vocabulary"),
  );
  const missingQuery = await json("/api/search");
  check("api: missing query rejected", missingQuery.status === 400);

  /* suggestions / stats */
  const suggest = await json(`/api/search/suggest?q=${encodeURIComponent("てし")}&types=grammar`);
  check("api: suggestions 200", suggest.status === 200);
  check(
    "api: grammar pattern suggestion",
    (suggest.body?.data?.suggestions ?? []).some((item) => item.externalKey === "te-shimau"),
  );

  const stats = await json("/api/search/stats");
  check("api: stats engine", stats.body?.data?.engine === "postgresql");
  check("api: stats active documents", stats.body?.data?.active > 30000, String(stats.body?.data?.active));
  check("api: stats pg_trgm", stats.body?.data?.pgTrgm === true);
  check("api: stats full-text index", stats.body?.data?.fullTextIndex === true);
  check("api: stats trigram indexes", stats.body?.data?.trigramIndexes >= 3);
}

async function uiChecks() {
  const empty = await html("/search");
  check("ui: /search 200", empty.status === 200);
  check("ui: unified search shell", empty.text.includes('data-testid="unified-search"'));
  check("ui: strategy selector", empty.text.includes('aria-label="Search strategy"'));
  check("ui: PostgreSQL-only disclosure", empty.text.includes("PostgreSQL only"));
  check("ui: no Meilisearch runtime claim", !empty.text.includes("Meilisearch is active"));

  const exactPage = await html(`/search?q=${encodeURIComponent("語")}&mode=exact`);
  check("ui: exact deep link 200", exactPage.status === 200);
  check("ui: exact result server-rendered", exactPage.text.includes('/kanji/%E8%AA%9E'));
  check("ui: exact badge server-rendered", exactPage.text.includes("exact"));

  const fullTextPage = await html(`/search?q=${encodeURIComponent("completion regret")}&mode=full_text&types=grammar`);
  check("ui: full-text deep link 200", fullTextPage.status === 200);
  check("ui: grammar result server-rendered", fullTextPage.text.includes("/grammar/te-shimau"));

  const detail = await html("/grammar/te-shimau");
  check("journey: open search result detail", detail.status === 200 && detail.text.includes('data-testid="grammar-meaning"'));
}

async function main() {
  console.log(`# PostgreSQL search gate — phase 08.1 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) {
    await apiChecks();
    await uiChecks();
  } else {
    console.log("SKIP  API/UI checks (no BASE_URL provided)");
  }
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
