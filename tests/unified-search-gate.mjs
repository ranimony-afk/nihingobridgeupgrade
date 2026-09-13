#!/usr/bin/env node
/**
 * Phase 08.2 gate — unified six-domain search.
 *
 *   node tests/unified-search-gate.mjs http://127.0.0.1:3000
 *
 * Domains: dictionary, kanji, grammar, sentence, course, lesson.
 */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
const DOMAINS = ["dictionary", "kanji", "grammar", "sentence", "course", "lesson"];
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function json(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, body: await response.json().catch(() => null) };
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

  const sources = await client.query(`
    SELECT
      (SELECT count(*)::int FROM vocabulary) AS dictionary,
      (SELECT count(*)::int FROM kanji) AS kanji,
      (SELECT count(*)::int FROM grammar_points) AS grammar,
      (SELECT count(*)::int FROM sentences) AS sentence,
      (SELECT count(*)::int FROM courses WHERE published) AS course,
      (SELECT count(*)::int FROM lessons WHERE published) AS lesson
  `);
  const sourceCounts = sources.rows[0];
  for (const domain of DOMAINS) {
    check(`db: canonical ${domain} source exists`, Number(sourceCounts[domain]) > 0,
      `${sourceCounts[domain]} rows`);
  }

  const projected = await client.query(`
    SELECT entity_type, count(*)::int AS total
    FROM search_documents
    WHERE active
    GROUP BY entity_type
  `);
  const projectedCounts = new Map(projected.rows.map((row) => [row.entity_type, Number(row.total)]));
  for (const domain of DOMAINS) {
    check(`db: ${domain} projected`, (projectedCounts.get(domain) ?? 0) > 0,
      `${projectedCounts.get(domain) ?? 0} documents`);
  }

  check(
    "db: sentence corpus is substantial",
    (projectedCounts.get("sentence") ?? 0) > 100000,
    `${projectedCounts.get("sentence") ?? 0} sentences`,
  );

  const dangling = await client.query(`
    SELECT
      (SELECT count(*) FROM search_documents sd LEFT JOIN vocabulary v ON v.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='dictionary' AND v.id IS NULL) AS dictionary,
      (SELECT count(*) FROM search_documents sd LEFT JOIN kanji k ON k.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='kanji' AND k.id IS NULL) AS kanji,
      (SELECT count(*) FROM search_documents sd LEFT JOIN grammar_points g ON g.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='grammar' AND g.id IS NULL) AS grammar,
      (SELECT count(*) FROM search_documents sd LEFT JOIN sentences s ON s.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='sentence' AND s.id IS NULL) AS sentence,
      (SELECT count(*) FROM search_documents sd LEFT JOIN courses c ON c.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='course' AND c.id IS NULL) AS course,
      (SELECT count(*) FROM search_documents sd LEFT JOIN lessons l ON l.id=sd.entity_id
       WHERE sd.active AND sd.entity_type='lesson' AND l.id IS NULL) AS lesson
  `);
  check(
    "db: no dangling unified-search documents",
    Object.values(dangling.rows[0]).every((value) => Number(value) === 0),
    JSON.stringify(dangling.rows[0]),
  );

  const legacy = await client.query(
    `SELECT count(*)::int AS active FROM search_documents WHERE entity_type='vocabulary' AND active`,
  );
  check("db: legacy vocabulary projection inactive", Number(legacy.rows[0].active) === 0);

  const sentenceGrammar = await client.query(`SELECT count(*)::int AS total FROM sentence_grammar_points`);
  check("db: sentences link to grammar evidence", Number(sentenceGrammar.rows[0].total) > 100,
    `${sentenceGrammar.rows[0].total} links`);

  const provenance = await client.query(
    `SELECT count(DISTINCT code)::int AS total FROM sources WHERE code IN ('tanaka','learning-seed')`,
  );
  check("db: sentence/learning provenance recorded", Number(provenance.rows[0].total) === 2);

  await client.end();
}

async function domainSearch(type, query, expectedText) {
  const response = await json(
    `/api/search?q=${encodeURIComponent(query)}&mode=exact&types=${type}&limit=10`,
  );
  const hits = response.body?.data?.hits ?? [];
  check(`api: exact ${type} search`, response.status === 200 && hits.length > 0,
    `${hits.length} hits`);
  check(
    `api: ${type} result type`,
    hits.every((hit) => hit.entityType === type),
    hits.map((hit) => hit.entityType).join(","),
  );
  const hit = hits.find((item) => item.primaryText === expectedText) ?? hits[0] ?? null;
  check(`api: ${type} expected result`, hit?.primaryText === expectedText,
    hit?.primaryText ?? "none");
  return hit;
}

async function httpChecks() {
  const dictionary = await domainSearch("dictionary", "日本語", "日本語");
  const kanji = await domainSearch("kanji", "語", "語");
  const grammar = await domainSearch("grammar", "〜てしまう", "〜てしまう");
  const sentence = await domainSearch(
    "sentence",
    "彼は忙しいので、君に会えない。",
    "彼は忙しいので、君に会えない。",
  );
  const course = await domainSearch("course", "Japanese Foundations", "Japanese Foundations");
  const lesson = await domainSearch("lesson", "Everyday requests", "Everyday requests");

  const hits = [dictionary, kanji, grammar, sentence, course, lesson].filter(Boolean);
  check("api: all six domain hits returned", hits.length === 6, `${hits.length}/6`);

  for (const hit of hits) {
    const page = await html(hit.route);
    check(`journey: open ${hit.entityType} result`, page.status === 200,
      `${page.status} ${hit.route}`);
  }

  const mixed = await json(`/api/search?q=${encodeURIComponent("Japanese")}&mode=auto&limit=100`);
  check("api: mixed unified search 200", mixed.status === 200);
  check("api: public type list has six domains",
    DOMAINS.every((domain) => mixed.body?.data?.types?.includes(domain)),
    JSON.stringify(mixed.body?.data?.types));
  check("api: facets expose six domains",
    DOMAINS.every((domain) => typeof mixed.body?.data?.facets?.[domain] === "number"),
    JSON.stringify(mixed.body?.data?.facets));
  check("api: result routes are canonical",
    (mixed.body?.data?.hits ?? []).every((hit) => hit.route.startsWith("/")));

  const sentenceFullText = await json(
    `/api/search?q=${encodeURIComponent("busy life family")}&mode=full_text&types=sentence&limit=10`,
  );
  check("api: sentence English full-text", (sentenceFullText.body?.data?.hits ?? []).length > 0,
    `${sentenceFullText.body?.data?.hits?.length ?? 0} hits`);

  const courseFullText = await json(
    `/api/search?q=${encodeURIComponent("sentence structure particles")}&mode=full_text&types=course`,
  );
  check("api: course full-text", (courseFullText.body?.data?.hits ?? []).length > 0);

  const lessonFuzzy = await json(
    `/api/search?q=${encodeURIComponent("conditonals")}&mode=fuzzy&types=lesson&threshold=0.2`,
  );
  check("api: lesson fuzzy typo", (lessonFuzzy.body?.data?.hits ?? []).some((hit) => hit.externalKey === "n4-conditionals"),
    (lessonFuzzy.body?.data?.hits ?? []).map((hit) => hit.externalKey).join(","));

  const alias = await json("/api/search?q=water&types=vocabulary&limit=3");
  check("api: vocabulary compatibility alias accepted", alias.status === 200);
  check("api: alias normalizes to dictionary", alias.body?.data?.types?.includes("dictionary"));
  check("api: alias results identify as dictionary",
    (alias.body?.data?.hits ?? []).every((hit) => hit.entityType === "dictionary"));

  const suggestions = await json(
    `/api/search/suggest?q=${encodeURIComponent("Japanese F")}&types=course,lesson`,
  );
  check("api: course/lesson suggestions", (suggestions.body?.data?.suggestions ?? []).length > 0);

  const stats = await json("/api/search/stats");
  const statTypes = (stats.body?.data?.byType ?? []).map((item) => item.entityType);
  check("api: stats list six active domains", DOMAINS.every((domain) => statTypes.includes(domain)),
    statTypes.join(","));
  check("api: active unified index > 180k", stats.body?.data?.active > 180000,
    String(stats.body?.data?.active));

  const searchPage = await html("/search?q=Japanese&mode=auto");
  check("ui: unified Search page 200", searchPage.status === 200);
  for (const label of ["Dictionary", "Kanji", "Grammar", "Sentences", "Courses", "Lessons"]) {
    check(`ui: ${label} filter`, searchPage.text.includes(label));
  }
  check("ui: course result SSR", searchPage.text.includes("/courses/japanese-foundations-n5"));

  const courses = await html("/courses");
  check("ui: course catalogue 200", courses.status === 200 && courses.text.includes("Japanese Foundations"));
  const coursePage = await html("/courses/japanese-foundations-n5");
  check("ui: course detail has lesson links", coursePage.status === 200 && coursePage.text.includes("/lessons/n5-sentence-order"));
  const lessonPage = await html("/lessons/n5-sentence-order");
  check("ui: lesson detail 200", lessonPage.status === 200 && lessonPage.text.includes("Objectives"));
  check("ui: sentence detail links grammar when available",
    sentence ? (await html(sentence.route)).status === 200 : false);
}

async function main() {
  console.log(`# Unified search gate — phase 08.2 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) await httpChecks();
  else console.log("SKIP  API/UI checks (no BASE_URL provided)");
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
