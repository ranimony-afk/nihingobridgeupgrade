#!/usr/bin/env node
/**
 * End-to-end gate for the Kanji Mind Tree (phase 06.4).
 *
 *   node tests/knowledge-gate.mjs                     # DB only
 *   node tests/knowledge-gate.mjs http://127.0.0.1:3000   # DB + HTTP
 *
 * Gate: search kanji -> open kanji -> inspect radical -> inspect components
 *       -> inspect vocabulary
 */
import pg from "pg";

const BASE_URL = process.argv[2] ?? process.env.BASE_URL ?? null;
const SAMPLE = "語";

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

  const kanji = await client.query(
    `SELECT k.id, k.literal,
            (SELECT count(*) FROM kanji_radicals kr WHERE kr.kanji_id = k.id) AS radicals,
            (SELECT count(*) FROM kanji_components kc WHERE kc.kanji_id = k.id) AS components,
            (SELECT count(*) FROM kanji_vocabulary kv WHERE kv.kanji_id = k.id) AS vocabulary
       FROM kanji k WHERE k.literal = $1`,
    [SAMPLE],
  );
  check("db: sample kanji exists", kanji.rows.length === 1, JSON.stringify(kanji.rows[0] ?? {}));

  const row = kanji.rows[0] ?? { radicals: 0, components: 0, vocabulary: 0, id: 0 };
  check("db: kanji has radical links", Number(row.radicals) > 0, `${row.radicals} links`);
  check("db: kanji has component links", Number(row.components) > 0, `${row.components} links`);
  check("db: kanji has vocabulary links", Number(row.vocabulary) > 0, `${row.vocabulary} links`);

  const orphan = await client.query(`
    SELECT
      (SELECT count(*) FROM kanji_components kc LEFT JOIN kanji k ON k.id = kc.kanji_id WHERE k.id IS NULL) AS bad_kanji,
      (SELECT count(*) FROM kanji_components kc LEFT JOIN components c ON c.id = kc.component_id WHERE c.id IS NULL) AS bad_component,
      (SELECT count(*) FROM kanji_radicals kr LEFT JOIN radicals r ON r.id = kr.radical_id WHERE r.id IS NULL) AS bad_radical,
      (SELECT count(*) FROM kanji_vocabulary kv LEFT JOIN vocabulary v ON v.id = kv.vocabulary_id WHERE v.id IS NULL) AS bad_vocabulary
  `);
  const bad = orphan.rows[0];
  check(
    "db: no dangling graph edges",
    Number(bad.bad_kanji) + Number(bad.bad_component) + Number(bad.bad_radical) + Number(bad.bad_vocabulary) === 0,
    JSON.stringify(bad),
  );

  const recursive = await client.query(
    `SELECT count(*)::int AS total FROM components WHERE kind = 'kanji' AND kanji_id IS NOT NULL`,
  );
  check(
    "db: components linked back to kanji entries (recursion possible)",
    Number(recursive.rows[0].total) > 100,
    `${recursive.rows[0].total} components`,
  );

  await client.end();
  return row;
}

async function httpChecks() {
  const health = await json("/api/health");
  check("http: /api/health", health.status === 200 && health.body?.status === "ok");

  const search = await json(`/api/kanji/search?q=${encodeURIComponent(SAMPLE)}`);
  check(
    "http: search kanji",
    search.status === 200 && (search.body?.results ?? []).some((item) => item.literal === SAMPLE),
    `${search.body?.total ?? 0} results`,
  );

  const detail = await json(`/api/kanji/${encodeURIComponent(SAMPLE)}`);
  check("http: open kanji", detail.status === 200, `id ${detail.body?.kanji?.id}`);
  check("http: kanji radicals", (detail.body?.kanji?.radicals ?? []).length > 0);
  check("http: kanji components", (detail.body?.kanji?.components ?? []).length > 0);
  check("http: kanji vocabulary", (detail.body?.vocabulary ?? []).length > 0);

  const tree = await json(`/api/kanji/${encodeURIComponent(SAMPLE)}/mind-tree?depth=3`);
  const nodes = tree.body?.nodes ?? [];
  const edges = tree.body?.edges ?? [];
  check("http: mind tree nodes", nodes.length > 1, `${nodes.length} nodes`);
  check("http: mind tree is a tree", edges.length === nodes.length - 1, `${edges.length} edges`);
  check(
    "http: mind tree branches",
    ["radical", "component", "vocabulary"].every((kind) => nodes.some((node) => node.kind === kind)),
  );
  check(
    "http: mind tree recursion depth",
    Math.max(...nodes.map((node) => node.depth)) >= 2,
    `max depth ${Math.max(...nodes.map((node) => node.depth))}`,
  );

  const radicalNode = nodes.find((node) => node.kind === "radical");
  const radicalId = Number((radicalNode?.href ?? "").split("/").pop());
  const radical = await json(`/api/radicals/${radicalId}`);
  check(
    "http: inspect radical",
    radical.status === 200 && (radical.body?.kanji ?? []).length > 0,
    `radical ${radical.body?.literal ?? "?"} · ${radical.body?.kanjiCount ?? 0} kanji`,
  );

  const htmlRadical = await fetch(`${BASE_URL}/kanji/radicals/${radicalId}`);
  check("http: radical page renders", htmlRadical.status === 200);

  const vocabNode = nodes.find((node) => node.kind === "vocabulary");
  const dictionary = await json(
    `/api/dictionary/search?q=${encodeURIComponent(vocabNode?.label ?? "日本語")}`,
  );
  check(
    "http: inspect vocabulary",
    dictionary.status === 200 && (dictionary.body?.results ?? []).length > 0,
    `${dictionary.body?.total ?? 0} entries`,
  );

  const kanjiPage = await fetch(`${BASE_URL}/kanji/${encodeURIComponent(SAMPLE)}`);
  const html = await kanjiPage.text();
  check("http: kanji page renders", kanjiPage.status === 200);
  check("http: kanji page contains mind tree", html.includes("Kanji Mind Tree"));
  check("http: kanji page shows components", html.includes("Components"));
  check("http: kanji page shows vocabulary", html.includes("Vocabulary"));

  const searchPage = await fetch(`${BASE_URL}/kanji?q=${encodeURIComponent("water")}`);
  const searchHtml = await searchPage.text();
  check("http: search page renders results", searchPage.status === 200 && searchHtml.includes("result"));
}

async function main() {
  console.log(`# Kanji Mind Tree gate (${new Date().toISOString()})`);
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
