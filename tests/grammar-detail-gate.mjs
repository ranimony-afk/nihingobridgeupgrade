#!/usr/bin/env node
/**
 * Phase 07.4 gate — grammar search/detail end to end.
 *
 *   node tests/grammar-detail-gate.mjs http://127.0.0.1:3000
 *
 * Journey under test:
 *   search grammar → open a result → read JLPT / meaning / structure /
 *   formation / examples / related grammar / common mistakes
 * plus the dedicated /structures and /mistakes endpoints and the HTML sections.
 */
const BASE_URL = process.argv[2] ?? process.env.BASE_URL ?? "http://127.0.0.1:3000";

const QUERIES = ["てしまう", "conditional", "purpose", "ながら"];
const SAMPLE = "te-shimau";

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

function hasAllSections(point) {
  return {
    jlpt: typeof point?.jlptLevel === "number",
    meaning: Boolean(point?.summary || point?.explanation),
    structure: Array.isArray(point?.structures) && point.structures.length > 0,
    formation: Boolean(point?.formation),
    examples: Array.isArray(point?.examples) && point.examples.length > 0,
    related: Array.isArray(point?.related) && point.related.length > 0,
    mistakes: Array.isArray(point?.mistakes) && point.mistakes.length > 0,
  };
}

async function main() {
  console.log(`# Grammar search/detail gate — phase 07.4 (${new Date().toISOString()})`);

  /* ------------------------------- search --------------------------------- */
  for (const query of QUERIES) {
    const search = await json(`/api/grammar/search?q=${encodeURIComponent(query)}&limit=5`);
    check(
      `search: "${query}" returns hits`,
      search.status === 200 && (search.body?.data?.hits ?? []).length > 0,
      `${search.body?.data?.hits?.length ?? 0} hits`,
    );
  }

  const catalogue = await json(`/api/grammar?q=${encodeURIComponent("てしまう")}&limit=5`);
  const first = catalogue.body?.data?.points?.[0] ?? null;
  check("catalogue search: resolves the point", first?.slug === SAMPLE, first?.slug ?? "none");

  const explorer = await html(`/grammar/explorer?q=${encodeURIComponent("てしまう")}`);
  check("ui: explorer search page", explorer.status === 200);
  check(
    "ui: explorer server-renders the searched card",
    explorer.text.includes(`/grammar/${SAMPLE}`),
  );

  /* ------------------------------- detail --------------------------------- */
  const detail = await json(`/api/grammar/${SAMPLE}`);
  check("api: detail 200", detail.status === 200);
  const point = detail.body?.data ?? {};
  const sections = hasAllSections(point);

  check("detail: JLPT level", sections.jlpt, point.jlptLevel ? `N${point.jlptLevel}` : "missing");
  check("detail: meaning", sections.meaning);
  check("detail: structure slots", sections.structure, `${point.structures?.length ?? 0} slots`);
  check("detail: formation", sections.formation);
  check("detail: examples", sections.examples, `${point.examples?.length ?? 0} sentences`);
  check("detail: related grammar", sections.related, `${point.related?.length ?? 0} related`);
  check("detail: common mistakes", sections.mistakes, `${point.mistakes?.length ?? 0} mistakes`);

  check(
    "detail: structure slots are ordered and labelled",
    (point.structures ?? []).every(
      (slot, index) => typeof slot.label === "string" && typeof slot.content === "string" && slot.position === index,
    ),
  );
  check(
    "detail: every example carries match evidence",
    (point.examples ?? []).every((example) => (example.matches ?? []).length > 0),
  );
  check(
    "detail: mistakes have wrong + right + why",
    (point.mistakes ?? []).every(
      (mistake) =>
        mistake.incorrect &&
        mistake.correction &&
        mistake.explanation &&
        ["common", "subtle", "critical"].includes(mistake.severity),
    ),
  );
  check(
    "detail: related points are resolvable slugs",
    (point.related ?? []).every((related) => typeof related.slug === "string" && related.slug.length > 0),
  );

  /* -------------------------- dedicated endpoints -------------------------- */
  const structures = await json(`/api/grammar/${SAMPLE}/structures`);
  check(
    "api: /structures",
    structures.status === 200 && (structures.body?.data?.structures ?? []).length > 0,
    `${structures.body?.data?.structures?.length ?? 0} slots`,
  );

  const mistakes = await json(`/api/grammar/${SAMPLE}/mistakes`);
  check(
    "api: /mistakes",
    mistakes.status === 200 && (mistakes.body?.data?.mistakes ?? []).length > 0,
    `${mistakes.body?.data?.mistakes?.length ?? 0} mistakes`,
  );

  const critical = await json(`/api/grammar/${SAMPLE}/mistakes?severity=critical`);
  const criticalCount = (critical.body?.data?.mistakes ?? []).length;
  check(
    "api: /mistakes severity filter",
    criticalCount <= (mistakes.body?.data?.mistakes ?? []).length &&
      (critical.body?.data?.mistakes ?? []).every((item) => item.severity === "critical"),
    `${criticalCount} critical`,
  );

  const missing = await json("/api/grammar/not-a-point/structures");
  check("api: unknown slug -> 404 on /structures", missing.status === 404);

  /* ------------------------------ HTML page ------------------------------- */
  const page = await html(`/grammar/${SAMPLE}`);
  check("ui: detail page 200", page.status === 200);
  check("ui: JLPT badge", page.text.includes("JLPT N") && page.text.includes('data-testid="grammar-jlpt"'));
  check("ui: meaning section", page.text.includes('data-testid="grammar-meaning"'));
  check("ui: structure section", page.text.includes('data-testid="grammar-structure"'));
  check("ui: formation section", page.text.includes('data-testid="grammar-formation"'));
  check("ui: examples section", page.text.includes('data-testid="grammar-examples-section"'));
  check("ui: mistakes section", page.text.includes('data-testid="grammar-mistakes-section"'));
  check("ui: related section", page.text.includes('data-testid="grammar-related"'));
  check("ui: mistake cards rendered", page.text.includes("Show correction"));
  check("ui: sentences highlighted", page.text.includes("<mark"));
  check("ui: structure slot labels", page.text.includes("Completion auxiliary"));
  check(
    "ui: level navigation",
    page.text.includes(`/grammar?jlpt=${point.jlptLevel}`) ||
      page.text.includes("start of level") ||
      page.text.includes("end of level"),
    `level link N${point.jlptLevel}`,
  );

  /* ------------------- follow a relation (search → detail) ---------------- */
  const relatedSlug = point.related?.[0]?.slug;
  const relatedPage = relatedSlug ? await html(`/grammar/${relatedSlug}`) : null;
  check(
    "journey: follow first related point",
    Boolean(relatedSlug) && relatedPage?.status === 200,
    relatedSlug ?? "no relation",
  );
  check(
    "journey: related point also has the sections",
    Boolean(relatedPage && relatedPage.text.includes('data-testid="grammar-meaning"')),
  );

  /* ------------------- coverage across the whole catalogue ---------------- */
  const all = await json("/api/grammar?limit=200");
  const points = all.body?.data?.points ?? [];
  check("coverage: catalogue loaded", points.length > 40, `${points.length} points`);

  let withAll = 0;
  for (const summary of points.slice(0, 12)) {
    const response = await json(`/api/grammar/${summary.slug}`);
    const body = response.body?.data ?? {};
    const flags = hasAllSections(body);
    if (Object.values(flags).every(Boolean)) withAll += 1;
  }
  check("coverage: sampled points expose all sections", withAll >= 10, `${withAll}/12 complete`);

  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
