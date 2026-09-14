#!/usr/bin/env node
/**
 * Phase 07.3 gate — Grammar explorer UI.
 *
 *   node tests/grammar-explorer-gate.mjs http://127.0.0.1:3000
 *
 * Verifies that the explorer, the relation map and the interactive example list
 * render server-side (SEO / no-JS), that they are wired to the canonical API
 * contract, and that the underlying endpoints return the payloads the UI needs.
 */
const BASE_URL = process.argv[2] ?? process.env.BASE_URL ?? "http://127.0.0.1:3000";
const SAMPLE = "te-shimau";

let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function html(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, text: await response.text() };
}

async function json(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  console.log(`# Grammar explorer gate — phase 07.3 (${new Date().toISOString()})`);

  /* ------------------------------- explorer -------------------------------- */
  const explorer = await html("/grammar/explorer");
  check("GET /grammar/explorer", explorer.status === 200);
  check("explorer: shell rendered", explorer.text.includes('data-testid="grammar-explorer"'));
  check("explorer: server-rendered cards", (explorer.text.match(/\/grammar\/[a-z0-9-]+"/g) ?? []).length > 10,
    `${(explorer.text.match(/\/grammar\/[a-z0-9-]+"/g) ?? []).length} links`);
  check("explorer: search input", explorer.text.includes('aria-label="Search grammar points"'));
  check("explorer: JLPT filter buttons", explorer.text.includes(">N5<") && explorer.text.includes(">N4<"));
  check("explorer: sort control", explorer.text.includes('aria-label="Sort grammar points"'));
  check("explorer: register control", explorer.text.includes('aria-label="Filter by register"'));
  check("explorer: documents API usage", explorer.text.includes("GET /api/grammar"));
  check("explorer: link to map", explorer.text.includes("/grammar/map"));

  const explorerFiltered = await html("/grammar/explorer?jlpt=4");
  check("GET /grammar/explorer?jlpt=4", explorerFiltered.status === 200);
  check(
    "explorer: level preselected from URL",
    explorerFiltered.text.includes("JLPT N4") || explorerFiltered.text.includes(">N4<"),
  );

  /* --------------------------------- map ----------------------------------- */
  const map = await html("/grammar/map");
  check("GET /grammar/map", map.status === 200);
  check("map: shell rendered", map.text.includes('data-testid="grammar-map"'));
  check("map: svg canvas", map.text.includes("<svg") && map.text.includes("Grammar relation map"));
  check("map: relation legend", map.text.includes("prerequisite") && map.text.includes("contrast"));
  check("map: level rings", map.text.includes("All levels"));
  check("map: link to explorer", map.text.includes("/grammar/explorer"));

  const mapLevel = await html("/grammar/map?jlpt=5");
  check("GET /grammar/map?jlpt=5", mapLevel.status === 200);
  check("map: level deep link renders nodes", (mapLevel.text.match(/<circle/g) ?? []).length > 5,
    `${(mapLevel.text.match(/<circle/g) ?? []).length} circles`);

  /* ------------------------- detail + example list -------------------------- */
  const detail = await html(`/grammar/${SAMPLE}`);
  check("GET /grammar/[slug]", detail.status === 200);
  check("detail: interactive example list", detail.text.includes('data-testid="grammar-examples"'));
  check("detail: highlights matches server-side", detail.text.includes("<mark"));
  check("detail: reveal translations control", detail.text.includes("Hide translations"));
  check("detail: length filter control", detail.text.includes("Max length"));
  check("detail: explorer entry point", detail.text.includes("/grammar/explorer"));
  check("detail: map entry point", detail.text.includes("/grammar/map?jlpt="));
  check("detail: provenance footer", detail.text.includes("Tanaka corpus"));

  /* --------------------- API payloads the UI depends on --------------------- */
  const catalogue = await json("/api/grammar?limit=24&sort=order");
  check("api: explorer payload", (catalogue.body?.data?.points ?? []).length === 24);
  check(
    "api: every card has the fields the UI renders",
    (catalogue.body?.data?.points ?? []).every(
      (point) =>
        typeof point.slug === "string" &&
        typeof point.title === "string" &&
        Array.isArray(point.patterns) &&
        typeof point.exampleCount === "number",
    ),
  );

  const paged = await json("/api/grammar?limit=24&offset=24");
  const firstSlug = catalogue.body?.data?.points?.[0]?.slug;
  const secondPageSlugs = (paged.body?.data?.points ?? []).map((point) => point.slug);
  check(
    "api: second page is disjoint (load-more works)",
    !secondPageSlugs.includes(firstSlug),
    `${secondPageSlugs.length} more`,
  );

  const graph = await json("/api/grammar/graph?limit=200");
  const nodeSlugs = new Set((graph.body?.data?.nodes ?? []).map((node) => node.slug));
  check("api: graph nodes", nodeSlugs.size > 20, `${nodeSlugs.size} nodes`);
  check(
    "api: graph edges join known nodes (map renders lines)",
    (graph.body?.data?.edges ?? []).every(
      (edge) => nodeSlugs.has(edge.from) && nodeSlugs.has(edge.to),
    ),
    `${graph.body?.data?.edges?.length ?? 0} edges`,
  );

  const pointsForMap = await json("/api/grammar?limit=200");
  check(
    "api: map nodes expose a short pattern label",
    (pointsForMap.body?.data?.points ?? []).every((point) => (point.patterns ?? []).length > 0),
  );

  const examples = await json(`/api/grammar/${SAMPLE}/examples?limit=5`);
  check(
    "api: example payload highlights correctly",
    (examples.body?.data?.examples ?? []).every((example) =>
      (example.matches ?? []).every((m) => example.japanese.slice(m.startIndex, m.endIndex) === m.matchedText),
    ),
  );

  /* ----------------------------- entry points ------------------------------- */
  const listPage = await html("/grammar");
  check("GET /grammar", listPage.status === 200);
  check("list: links to explorer", listPage.text.includes("/grammar/explorer"));
  check("list: links to map", listPage.text.includes("/grammar/map"));

  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
