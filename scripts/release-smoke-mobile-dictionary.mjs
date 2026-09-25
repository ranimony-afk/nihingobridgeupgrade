#!/usr/bin/env node
/**
 * RELEASE SMOKE TEST — mobile dictionary search (`GET /api/v1/mobile/dictionary/search`).
 *
 * Purpose: make the PR / deployment acceptance criterion *executable* instead of asserted in prose.
 * It is a release check, not a test suite: it runs against an already-running server (a local dev
 * server, a preview deployment or a non-production environment) and exits non-zero if any mandatory
 * check fails.
 *
 *   node scripts/release-smoke-mobile-dictionary.mjs
 *   node scripts/release-smoke-mobile-dictionary.mjs --base-url https://preview.example.com
 *
 * Determinism rules:
 *   - Protocol-level checks (status codes, envelope shape, key sets, leakage, cap behaviour, method
 *     rejection, inertness, byte determinism) are MANDATORY and data-independent.
 *   - Content checks (which row `q=mizu` returns) are MANDATORY only when the target has the seed
 *     corpus, and SKIP with an explicit printed reason when it does not. A skip is never silent and
 *     never counts as a pass for a check that ran.
 *
 * Dependency-free by design: Node's global `fetch`. No test framework, no imports from `src/`, so it
 * can run against a built artifact that has no repository context.
 */

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE_URL = (argValue("--base-url", "http://127.0.0.1:3000") || "").replace(/\/+$/, "");
const TIMEOUT_MS = Number(argValue("--timeout-ms", "30000"));
const PATH = "/api/v1/mobile/dictionary/search";

const FROZEN_ITEM_KEYS = [
  "headword",
  "id",
  "isCommon",
  "jlptLevel",
  "jlptStatus",
  "kanjiCharacters",
  "primaryGlosses",
  "reading",
  "romaji",
];
const FROZEN_DATA_KEYS = [
  "appliedJlptLevel",
  "detectedScript",
  "entries",
  "hasMore",
  "limit",
  "offset",
  "query",
  "total",
];
/** Substrings that must never appear anywhere in a mobile response body. */
const FORBIDDEN_SUBSTRINGS = [
  "sourceRef",
  "source_ref",
  "ent_seq",
  "entSeq",
  "frequencyRank",
  "frequency_rank",
  "partsOfSpeech",
  "parts_of_speech",
  "provenance",
  "localizedGlosses",
  "senses",
  "keigo",
  "stack",
  "ECONNREFUSED",
  "password",
  "supersecret",
  "postgresql://",
];

const results = [];
const record = (kind, name, detail = "") => {
  results.push({ kind, name, detail });
  const icon = kind === "PASS" ? "PASS" : kind === "FAIL" ? "FAIL" : "SKIP";
  console.log(`${icon}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function request(pathWithQuery, init = {}) {
  const res = await fetch(`${BASE_URL}${pathWithQuery}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

const sortedKeys = (value) => Object.keys(value ?? {}).sort();

/** Mandatory: every body is leak-free. Returns null when clean, else the offending token. */
function leakIn(text) {
  return FORBIDDEN_SUBSTRINGS.find((token) => text.includes(token)) ?? null;
}

function checkEnvelope(name, res, expectedStatus) {
  if (res.status !== expectedStatus) {
    record("FAIL", name, `expected HTTP ${expectedStatus}, got ${res.status}`);
    return null;
  }
  const leak = leakIn(res.text);
  if (leak) {
    record("FAIL", `${name} (leakage scan)`, `body contains "${leak}"`);
    return null;
  }
  return res;
}

async function main() {
  console.log(`RELEASE SMOKE — ${BASE_URL}${PATH}\n`);

  // 1. Baseline request + envelope + frozen key sets.
  const base = await request(`${PATH}?q=mizu`);
  if (!checkEnvelope("GET q=mizu → 200", base, 200)) return finish();
  const baseBody = JSON.parse(base.text);
  if (baseBody.success !== true || sortedKeys(baseBody).join() !== "data,success") {
    record("FAIL", "envelope is exactly {success,data}", `got ${sortedKeys(baseBody).join()}`);
    return finish();
  }
  const dataKeyMismatch = sortedKeys(baseBody.data).join() !== [...FROZEN_DATA_KEYS].sort().join();
  dataKeyMismatch
    ? record("FAIL", "data key set is exactly the 8 frozen keys", sortedKeys(baseBody.data).join())
    : record("PASS", "data key set is exactly the 8 frozen keys");
  record("PASS", "GET q=mizu → 200 with a leak-free body");

  // 2. Closed 9-field item projection.
  const firstEntry = baseBody.data.entries[0];
  if (firstEntry) {
    const keys = sortedKeys(firstEntry).join();
    keys === FROZEN_ITEM_KEYS.join()
      ? record("PASS", "item key set is exactly the 9 frozen fields")
      : record("FAIL", "item key set is exactly the 9 frozen fields", keys);
  } else {
    record("SKIP", "item key set is exactly the 9 frozen fields", "no entries returned by this target");
  }

  // 3. Script classification (pure classifier, data-independent).
  const kanji = await request(`${PATH}?q=${encodeURIComponent("水")}`);
  if (checkEnvelope("GET q=水 → 200", kanji, 200)) {
    const script = JSON.parse(kanji.text).data.detectedScript;
    script === "kanji"
      ? record("PASS", "detectedScript(水) === kanji")
      : record("FAIL", "detectedScript(水) === kanji", `got ${script}`);
  }
  baseBody.data.detectedScript === "romaji"
    ? record("PASS", "detectedScript(mizu) === romaji")
    : record("FAIL", "detectedScript(mizu) === romaji", `got ${baseBody.data.detectedScript}`);

  // 4. Pagination boundaries — the applied value must be echoed.
  const limitCases = [
    ["limit=1", 1, 1],
    ["limit=100", 100, 100],
    ["limit=201", 201, 100], // boundary 1..200, service clamps to 100
  ];
  for (const [label, requested, applied] of limitCases) {
    const res = await request(`${PATH}?q=mizu&${label}`);
    if (!checkEnvelope(`GET q=mizu&${label} → 200`, res, 200)) continue;
    const body = JSON.parse(res.text);
    body.data.limit === applied
      ? record("PASS", `${label} applied as ${applied}`)
      : record("FAIL", `${label} applied as ${applied}`, `got ${body.data.limit} (requested ${requested})`);
  }
  const offsetRes = await request(`${PATH}?q=mizu&offset=100001`);
  if (checkEnvelope("GET q=mizu&offset=100001 → 200", offsetRes, 200)) {
    const body = JSON.parse(offsetRes.text);
    body.data.offset === 100000
      ? record("PASS", "offset=100001 clamped to applied offset 100000")
      : record("FAIL", "offset=100001 clamped to applied offset 100000", `got ${body.data.offset}`);
  }

  // 5. hasMore is exact over the applied window.
  const hm = await request(`${PATH}?q=mizu&limit=1&offset=0`);
  if (checkEnvelope("GET q=mizu&limit=1 → 200", hm, 200)) {
    const d = JSON.parse(hm.text).data;
    d.hasMore === d.offset + d.entries.length < d.total
      ? record("PASS", "hasMore === offset + entries.length < total")
      : record("FAIL", "hasMore === offset + entries.length < total", JSON.stringify(d.hasMore));
  }

  // 6. Missing / sanitized-empty query.
  const missing = await request(PATH);
  if (checkEnvelope("GET without q → 400", missing, 400)) {
    JSON.parse(missing.text).error?.code === "MISSING_QUERY"
      ? record("PASS", "missing q → 400 MISSING_QUERY")
      : record("FAIL", "missing q → 400 MISSING_QUERY", missing.text.slice(0, 120));
  }

  // 7. Cap ladder — 1000 accepted, 1001 rejected.
  const atCap = await request(`${PATH}?q=${"a".repeat(1000)}`);
  checkEnvelope("GET q=1000 chars → 200", atCap, 200) &&
    record("PASS", "q of 1000 code units accepted");
  const overCap = await request(`${PATH}?q=${"a".repeat(1001)}`);
  if (checkEnvelope("GET q=1001 chars → 400", overCap, 400)) {
    const body = JSON.parse(overCap.text);
    body.error?.code === "VALIDATION_ERROR" && !body.error?.details && !body.error?.stack
      ? record("PASS", "q of 1001 code units → 400 VALIDATION_ERROR (no details, no stack)")
      : record("FAIL", "q of 1001 code units → 400 VALIDATION_ERROR (no details, no stack)", overCap.text.slice(0, 140));
  }

  // 8. targetLanguage stays inert — byte-for-byte, not merely deep-equal.
  for (const language of ["en", "ta", "ml", "klingon", ""]) {
    const res = await request(`${PATH}?q=mizu&targetLanguage=${encodeURIComponent(language)}`);
    if (res.status !== 200) {
      record("FAIL", `targetLanguage=${language || "(empty)"} inert`, `expected 200, got ${res.status}`);
      continue;
    }
    res.text === base.text
      ? record("PASS", `targetLanguage=${language || "(empty)"} inert (byte-identical)`)
      : record("FAIL", `targetLanguage=${language || "(empty)"} inert (byte-identical)`, "body differs");
  }

  // 9. GET-only transport.
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await request(`${PATH}?q=mizu`, { method });
    res.status === 405
      ? record("PASS", `${method} ${PATH.split("/").pop()} → 405`)
      : record("FAIL", `${method} → 405`, `got ${res.status}`);
  }

  // 10. No detail endpoint exists under the mobile surface.
  const detail = await request("/api/v1/mobile/dictionary/entry/de-mizu");
  detail.status === 404
    ? record("PASS", "no mobile detail endpoint (404)")
    : record("FAIL", "no mobile detail endpoint (404)", `got ${detail.status}`);

  // 11. Byte determinism: the same request twice returns the same bytes.
  const again = await request(`${PATH}?q=mizu&limit=5&offset=0`);
  const once = await request(`${PATH}?q=mizu&limit=5&offset=0`);
  again.text === once.text
    ? record("PASS", "repeat request is byte-identical (deterministic ordering)")
    : record("FAIL", "repeat request is byte-identical (deterministic ordering)");

  // 12. Seed-corpus content — mandatory only when the corpus is present.
  if (baseBody.data.total > 0) {
    const entry = firstEntry ?? {};
    entry.id === "de-mizu" && Array.isArray(entry.primaryGlosses) && entry.primaryGlosses.includes("water")
      ? record("PASS", "q=mizu ranks de-mizu first with its stored glosses")
      : record("FAIL", "q=mizu ranks de-mizu first with its stored glosses", JSON.stringify(entry).slice(0, 160));
    entry.jlptStatus === "known" && entry.jlptLevel === "N5"
      ? record("PASS", "jlptLevel N5 with jlptStatus known")
      : record("FAIL", "jlptLevel N5 with jlptStatus known", `${entry.jlptLevel}/${entry.jlptStatus}`);
  } else {
    record("SKIP", "seed-corpus content checks", "target returned total=0 (no seeded corpus in this environment)");
  }

  finish();
}

function finish() {
  const failed = results.filter((r) => r.kind === "FAIL");
  const passed = results.filter((r) => r.kind === "PASS").length;
  const skipped = results.filter((r) => r.kind === "SKIP");
  console.log(
    `\nSMOKE RESULT: ${failed.length === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed.length} failed, ${skipped.length} skipped`
  );
  if (skipped.length) for (const s of skipped) console.log(`  skipped: ${s.name} — ${s.detail}`);
  if (failed.length) {
    console.log("MANDATORY FAILURES:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  }
  console.log(
    `\nPRODUCTION EXPOSURE: BLOCKED (D-13). See docs/api/MOBILE-DICTIONARY-SEARCH-PRODUCTION-STATUS.md`
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.log(`FAIL  smoke test could not complete — ${error instanceof Error ? error.message : String(error)}`);
  console.log(`\nSMOKE RESULT: FAIL — server unreachable at ${BASE_URL}`);
  process.exit(1);
});
