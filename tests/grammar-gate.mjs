#!/usr/bin/env node
/**
 * Phase 07.1 gate — canonical grammar schema + service.
 *
 *   node tests/grammar-gate.mjs
 *   node tests/grammar-gate.mjs http://127.0.0.1:3000
 *
 * Verifies the schema, the curated catalogue, the corpus evidence chain
 * (point -> pattern -> example -> match), cross-domain links and the HTTP API.
 */
import pg from "pg";

const BASE_URL = process.argv[2] ?? process.env.BASE_URL ?? null;
const SAMPLE_SLUG = "te-shimau";

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

async function databaseChecks() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
  const isLocal = /@(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
  const client = new pg.Client({
    connectionString: url,
    ssl: isLocal || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'grammar%'`,
  );
  const names = tables.rows.map((row) => row.table_name).sort();
  check("db: grammar tables exist", names.length >= 9, names.join(", "));

  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM grammar_points) AS points,
      (SELECT count(*)::int FROM grammar_patterns) AS patterns,
      (SELECT count(*)::int FROM grammar_examples) AS examples,
      (SELECT count(*)::int FROM grammar_example_matches) AS matches,
      (SELECT count(*)::int FROM grammar_relations) AS relations,
      (SELECT count(*)::int FROM grammar_point_kanji) AS kanji_links,
      (SELECT count(*)::int FROM grammar_point_vocabulary) AS vocab_links,
      (SELECT count(*)::int FROM grammar_tags) AS tags
  `);
  const c = counts.rows[0];
  check("db: grammar points seeded", c.points > 20, `${c.points} points`);
  check("db: patterns seeded", c.patterns > 20, `${c.patterns} patterns`);
  check("db: examples harvested", c.examples > 50, `${c.examples} examples`);
  check("db: every example has match evidence", c.matches >= c.examples, `${c.matches} matches`);
  check("db: relations seeded", c.relations > 10, `${c.relations} relations`);
  check("db: kanji cross-links", c.kanji_links > 100, `${c.kanji_links} links`);
  check("db: vocabulary cross-links", c.vocab_links > 0, `${c.vocab_links} links`);
  check("db: tags seeded", c.tags > 5, `${c.tags} tags`);

  const orphan = await client.query(`
    SELECT
      (SELECT count(*) FROM grammar_patterns p LEFT JOIN grammar_points g ON g.id = p.grammar_point_id WHERE g.id IS NULL) AS bad_patterns,
      (SELECT count(*) FROM grammar_examples e LEFT JOIN grammar_points g ON g.id = e.grammar_point_id WHERE g.id IS NULL) AS bad_examples,
      (SELECT count(*) FROM grammar_example_matches m LEFT JOIN grammar_examples e ON e.id = m.example_id WHERE e.id IS NULL) AS bad_matches,
      (SELECT count(*) FROM grammar_point_kanji gk LEFT JOIN kanji k ON k.id = gk.kanji_id WHERE k.id IS NULL) AS bad_kanji,
      (SELECT count(*) FROM grammar_point_vocabulary gv LEFT JOIN vocabulary v ON v.id = gv.vocabulary_id WHERE v.id IS NULL) AS bad_vocab
  `);
  const bad = orphan.rows[0];
  check(
    "db: no dangling grammar edges",
    Object.values(bad).every((value) => Number(value) === 0),
    JSON.stringify(bad),
  );

  const sample = await client.query(
    `SELECT p.id, p.slug,
            (SELECT count(*) FROM grammar_patterns WHERE grammar_point_id = p.id) AS patterns,
            (SELECT count(*) FROM grammar_examples WHERE grammar_point_id = p.id) AS examples
       FROM grammar_points p WHERE p.slug = $1`,
    [SAMPLE_SLUG],
  );
  check(
    "db: sample point has patterns + examples",
    Number(sample.rows[0]?.patterns ?? 0) > 0 && Number(sample.rows[0]?.examples ?? 0) > 0,
    JSON.stringify(sample.rows[0] ?? {}),
  );

  const provenance = await client.query(
    `SELECT count(DISTINCT code)::int AS total FROM sources WHERE code IN ('tanaka','grammar-seed')`,
  );
  check("db: grammar provenance recorded", Number(provenance.rows[0].total) === 2,
    `${provenance.rows[0].total} sources`);

  await client.end();
}

async function httpChecks() {
  const catalog = await json("/api/grammar?limit=100");
  check("http: catalogue", catalog.status === 200, `${catalog.body?.meta?.pagination?.total ?? 0} points`);
  check("http: catalogue non-empty", (catalog.body?.data?.points ?? []).length > 20);

  const filtered = await json("/api/grammar?jlpt=4");
  check(
    "http: filter by JLPT level",
    filtered.status === 200 &&
      (filtered.body?.data?.points ?? []).every((point) => point.jlptLevel === 4),
    `${filtered.body?.meta?.pagination?.total ?? 0} N4 points`,
  );

  const searched = await json(`/api/grammar?q=${encodeURIComponent("conditional")}`);
  check(
    "http: search grammar",
    searched.status === 200 && (searched.body?.data?.points ?? []).length > 0,
    `${searched.body?.meta?.pagination?.total ?? 0} results`,
  );

  const detail = await json(`/api/grammar/${SAMPLE_SLUG}`);
  check("http: grammar detail", detail.status === 200);
  check("http: detail has patterns", (detail.body?.data?.patternDetails ?? []).length > 0);
  check("http: detail has examples", (detail.body?.data?.examples ?? []).length > 0);
  check(
    "http: examples carry match offsets",
    (detail.body?.data?.examples ?? []).every((example) => (example.matches ?? []).length > 0),
  );
  check("http: detail has related points", (detail.body?.data?.related ?? []).length > 0);
  check("http: detail has kanji links", (detail.body?.data?.kanji ?? []).length > 0);
  check("http: detail has provenance", (detail.body?.data?.provenance ?? []).length > 0);

  const listPage = await fetch(`${BASE_URL}/grammar`);
  const listHtml = await listPage.text();
  check("http: /grammar page renders", listPage.status === 200);
  const pointLinks = (listHtml.match(/\/grammar\/[a-z0-9-]+/g) ?? []).length;
  check("http: /grammar lists points", pointLinks > 20, `${pointLinks} point links`);
  check("http: /grammar has level filters", listHtml.includes("JLPT N"));

  const detailPage = await fetch(`${BASE_URL}/grammar/${SAMPLE_SLUG}`);
  const detailHtml = await detailPage.text();
  check("http: /grammar/[slug] renders", detailPage.status === 200);
  check("http: /grammar/[slug] shows examples", detailHtml.includes("Example sentences"));
  check("http: /grammar/[slug] highlights matches", detailHtml.includes("<mark"));

  const admin = await fetch(`${BASE_URL}/admin`);
  const adminHtml = await admin.text();
  check("http: admin shows grammar stats", admin.status === 200 && adminHtml.includes("Grammar knowledge"));
}

async function main() {
  console.log(`# Grammar gate — phase 07.1 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) {
    await httpChecks();
  } else {
    console.log("SKIP  http checks (no BASE_URL provided)");
  }
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
