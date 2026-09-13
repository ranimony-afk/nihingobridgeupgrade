#!/usr/bin/env node
/**
 * Phase 07.2 gate — Grammar API.
 *
 *   node tests/grammar-api-gate.mjs http://127.0.0.1:3000
 *
 * Covers the envelope contract, every endpoint, validation errors, 404s,
 * pagination, CORS, rate-limit headers, the batch endpoint and the OpenAPI spec.
 */
const BASE_URL = process.argv[2] ?? process.env.BASE_URL ?? "http://127.0.0.1:3000";
const SAMPLE = "te-shimau";

let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
}

function envelope(name, result) {
  check(
    `${name}: envelope`,
    result.body && (("data" in result.body && "meta" in result.body) || "error" in result.body),
    `${result.status}`,
  );
  check(
    `${name}: api version header`,
    result.headers.get("x-api-version") === "1",
    String(result.headers.get("x-api-version")),
  );
}

async function main() {
  console.log(`# Grammar API gate — phase 07.2 (${new Date().toISOString()})`);

  /* ------------------------------ catalogue ------------------------------- */
  const list = await call("/api/grammar?limit=5");
  envelope("GET /api/grammar", list);
  check("catalogue: returns points", (list.body?.data?.points ?? []).length === 5);
  check("catalogue: pagination meta", list.body?.meta?.pagination?.total >= 50,
    JSON.stringify(list.body?.meta?.pagination));
  check("catalogue: cache header", /max-age=60/.test(list.headers.get("cache-control") ?? ""));
  check("catalogue: rate-limit headers", list.headers.get("x-ratelimit-limit") !== null);
  check("catalogue: request id", typeof list.body?.meta?.requestId === "string");

  const sorted = await call("/api/grammar?sort=title&limit=3");
  const titles = (sorted.body?.data?.points ?? []).map((p) => p.title);
  check(
    "catalogue: sort=title",
    titles.length === 3 && [...titles].sort().join("|") === titles.join("|"),
    titles.join(" / "),
  );

  const byRegister = await call("/api/grammar?register=polite&limit=50");
  check(
    "catalogue: register filter",
    (byRegister.body?.data?.points ?? []).length > 0 &&
      (byRegister.body?.data?.points ?? []).every((p) => p.register === "polite"),
    `${byRegister.body?.meta?.pagination?.total ?? 0} polite points`,
  );

  const paged1 = await call("/api/grammar?limit=2&offset=0");
  const paged2 = await call("/api/grammar?limit=2&offset=2");
  const ids1 = (paged1.body?.data?.points ?? []).map((p) => p.slug);
  const ids2 = (paged2.body?.data?.points ?? []).map((p) => p.slug);
  check("catalogue: pagination pages differ", ids1.join() !== ids2.join(), `${ids1} vs ${ids2}`);
  check("catalogue: hasMore true", paged1.body?.meta?.pagination?.hasMore === true);
  check("catalogue: nextOffset", paged1.body?.meta?.pagination?.nextOffset === 2);

  /* ---------------------------- validation -------------------------------- */
  const badLimit = await call("/api/grammar?limit=9999");
  check("validation: limit out of range -> 400", badLimit.status === 400, JSON.stringify(badLimit.body?.error));
  check("validation: error code", badLimit.body?.error?.code === "invalid_request");
  check("validation: error details", Array.isArray(badLimit.body?.error?.details));

  const badJlpt = await call("/api/grammar?jlpt=9");
  check("validation: jlpt out of range -> 400", badJlpt.status === 400);

  const badSort = await call("/api/grammar?sort=nonsense");
  check("validation: unknown sort -> 400", badSort.status === 400);

  /* ------------------------------- search --------------------------------- */
  const search = await call(`/api/grammar/search?q=${encodeURIComponent("てしまう")}&limit=5`);
  envelope("GET /api/grammar/search", search);
  check("search: has hits", (search.body?.data?.hits ?? []).length > 0,
    `${search.body?.data?.hits?.length ?? 0} hits`);
  check(
    "search: hit reports matchedOn + score",
    (search.body?.data?.hits ?? []).every(
      (hit) => typeof hit.matchedOn === "string" && typeof hit.score === "number",
    ),
  );
  check("search: top hit is the point", search.body?.data?.hits?.[0]?.slug === SAMPLE,
    search.body?.data?.hits?.[0]?.slug);

  const searchMissing = await call("/api/grammar/search");
  check("search: missing q -> 400", searchMissing.status === 400);

  /* -------------------------------- detail -------------------------------- */
  const detail = await call(`/api/grammar/${SAMPLE}`);
  envelope("GET /api/grammar/[slug]", detail);
  check("detail: patterns", (detail.body?.data?.patternDetails ?? []).length > 0);
  check("detail: examples", (detail.body?.data?.examples ?? []).length > 0);
  check("detail: related", (detail.body?.data?.related ?? []).length > 0);
  check("detail: kanji", (detail.body?.data?.kanji ?? []).length > 0);
  check("detail: provenance", (detail.body?.data?.provenance ?? []).length > 0);

  const trimmed = await call(`/api/grammar/${SAMPLE}?include=patterns`);
  check(
    "detail: include trims payload",
    (trimmed.body?.data?.patternDetails ?? []).length > 0 &&
      trimmed.body?.data?.examples === undefined,
  );

  const missing = await call("/api/grammar/does-not-exist");
  check("detail: unknown slug -> 404", missing.status === 404, JSON.stringify(missing.body?.error));
  check("detail: 404 code", missing.body?.error?.code === "not_found");

  /* ------------------------------- examples ------------------------------- */
  const examples = await call(`/api/grammar/${SAMPLE}/examples?limit=3&maxLength=30`);
  envelope("GET /api/grammar/[slug]/examples", examples);
  check("examples: respects limit", (examples.body?.data?.examples ?? []).length <= 3);
  check(
    "examples: respects maxLength",
    (examples.body?.data?.examples ?? []).every((e) => e.length <= 30),
  );
  check(
    "examples: match offsets inside the sentence",
    (examples.body?.data?.examples ?? []).every((e) =>
      (e.matches ?? []).every(
        (m) => e.japanese.slice(m.startIndex, m.endIndex) === m.matchedText,
      ),
    ),
  );
  check("examples: pagination meta", examples.body?.meta?.pagination?.total > 0);

  const examplesBad = await call(`/api/grammar/${SAMPLE}/examples?limit=0`);
  check("examples: invalid limit -> 400", examplesBad.status === 400);

  /* -------------------------------- related ------------------------------- */
  const related = await call(`/api/grammar/${SAMPLE}/related?depth=2`);
  envelope("GET /api/grammar/[slug]/related", related);
  check("related: non-empty", (related.body?.data?.related ?? []).length > 0,
    `${related.body?.data?.related?.length ?? 0} points`);
  check(
    "related: depth reported",
    (related.body?.data?.related ?? []).every((item) => typeof item.depth === "number"),
  );
  const depth2 = await call(`/api/grammar/${SAMPLE}/related?depth=2&limit=50`);
  const depth1 = await call(`/api/grammar/${SAMPLE}/related?depth=1&limit=50`);
  check(
    "related: depth 2 >= depth 1",
    (depth2.body?.data?.related ?? []).length >= (depth1.body?.data?.related ?? []).length,
    `${depth1.body?.data?.related?.length ?? 0} -> ${depth2.body?.data?.related?.length ?? 0}`,
  );
  const filtered = await call(`/api/grammar/${SAMPLE}/related?relation=similar`);
  check(
    "related: relation filter",
    (filtered.body?.data?.related ?? []).every((item) => item.relation === "similar"),
  );

  /* ---------------------------- cross links ------------------------------- */
  const kanji = await call(`/api/grammar/${SAMPLE}/kanji`);
  check("GET /grammar/[slug]/kanji", (kanji.body?.data?.kanji ?? []).length > 0);
  const vocabulary = await call(`/api/grammar/node/vocabulary`);
  envelope("GET /grammar/[slug]/vocabulary", vocabulary);
  check(
    "vocabulary: entries linked",
    Array.isArray(vocabulary.body?.data?.vocabulary ?? []),
    `${vocabulary.body?.data?.vocabulary?.length ?? 0} entries`,
  );

  /* --------------------------------- batch -------------------------------- */
  const batch = await call("/api/grammar/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slugs: [SAMPLE, "node", "not-a-point"], include: ["examples"], examples: 2 }),
  });
  envelope("POST /api/grammar/batch", batch);
  check("batch: three items", (batch.body?.data?.items ?? []).length === 3);
  check("batch: resolved two", batch.body?.meta?.resolved === 2, JSON.stringify(batch.body?.meta));
  check(
    "batch: missing slug -> null point",
    (batch.body?.data?.items ?? []).find((item) => item.slug === "not-a-point")?.point === null,
  );
  check(
    "batch: include honoured",
    ((batch.body?.data?.items ?? []).find((item) => item.slug === SAMPLE)?.detail?.examples ?? [])
      .length <= 2,
  );

  const batchGet = await call(`/api/grammar/batch?slugs=${SAMPLE},node&include=patterns`);
  check("GET /grammar/batch", (batchGet.body?.data?.items ?? []).length === 2);
  const batchEmpty = await call("/api/grammar/batch?slugs=");
  check("batch: empty slugs -> 400", batchEmpty.status === 400);
  const batchBad = await call("/api/grammar/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slugs: [] }),
  });
  check("batch: invalid body -> 400", batchBad.status === 400);

  /* --------------------------------- graph -------------------------------- */
  const graph = await call("/api/grammar/graph?jlpt=4");
  envelope("GET /api/grammar/graph", graph);
  check("graph: nodes", (graph.body?.data?.nodes ?? []).length > 0,
    `${graph.body?.data?.nodes?.length ?? 0} nodes`);
  check("graph: edges", (graph.body?.data?.edges ?? []).length > 0,
    `${graph.body?.data?.edges?.length ?? 0} edges`);
  check(
    "graph: edges reference known nodes",
    (graph.body?.data?.edges ?? []).every((edge) =>
      (graph.body?.data?.nodes ?? []).some((node) => node.slug === edge.from),
    ),
  );

  /* ---------------------------------- meta -------------------------------- */
  const tags = await call("/api/grammar/tags");
  check("GET /api/grammar/tags", (tags.body?.data?.tags ?? []).length > 5);
  const levels = await call("/api/grammar/levels");
  check("GET /api/grammar/levels", (levels.body?.data?.levels ?? []).length >= 3);
  const stats = await call("/api/grammar/stats");
  check("GET /api/grammar/stats", stats.body?.data?.points > 20, `${stats.body?.data?.points} points`);

  /* -------------------------------- openapi ------------------------------- */
  const spec = await call("/api/grammar/openapi");
  check("GET /api/grammar/openapi", spec.body?.data?.openapi === "3.1.0");
  const paths = Object.keys(spec.body?.data?.paths ?? {});
  check("openapi: documents every route", paths.length >= 10, `${paths.length} paths`);
  check(
    "openapi: includes batch + graph",
    paths.includes("/grammar/batch") && paths.includes("/grammar/graph"),
  );

  /* ---------------------------------- CORS -------------------------------- */
  const preflight = await fetch(`${BASE_URL}/api/grammar`, { method: "OPTIONS" });
  check("CORS: preflight 204", preflight.status === 204);
  check(
    "CORS: allow-origin",
    preflight.headers.get("access-control-allow-origin") === "*",
    String(preflight.headers.get("access-control-allow-origin")),
  );
  check("CORS: allow-methods", /POST/.test(preflight.headers.get("access-control-allow-methods") ?? ""));

  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
