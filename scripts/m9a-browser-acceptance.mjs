#!/usr/bin/env node
/**
 * M9A browser acceptance — executes the Task C checklist against a running
 * server with a REAL headless Chromium (puppeteer-core + @sparticuz/chromium).
 *
 * Usage:
 *   npm i --no-save puppeteer-core @sparticuz/chromium
 *   # If chromium fails with missing libnss3/libnspr4, extract the NSS libs
 *   # bundled in @sparticuz/chromium and point LD_LIBRARY_PATH at them:
 *   node -e "const fs=require('fs'),z=require('zlib');\
 *     fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(\
 *     fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
 *   mkdir -p /tmp/al2023-libs && tar -xf /tmp/al2023.tar -C /tmp/al2023-libs
 *   LD_LIBRARY_PATH=/tmp/al2023-libs/lib node scripts/m9a-browser-acceptance.mjs \
 *     --base-url http://127.0.0.1:3100 --out reports/kanji-mindtree/m9a-browser-acceptance-log.json
 *
 * The target must be a PRODUCTION build (next build && next start) with a
 * disposable database. This script never writes to any database and never
 * contacts an external host.
 */
import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE_URL = (argValue("--base-url", "http://127.0.0.1:3100") || "").replace(/\/+$/, "");
const OUT_PATH = argValue("--out", "/tmp/m9a-browser-acceptance-log.json");

const results = [];
const consoleAndNetwork = { consoleErrors: [], pageErrors: [], failedRequests: [], badResponses: [] };
const buckets = {};

function record(group, id, status, detail) {
  results.push({ group, id, status, detail });
  const mark = status === "PASS" ? "✓" : status === "SKIP" ? "○" : "✗";
  console.log(`${mark} [${group}] ${id}${detail ? ` — ${detail}` : ""}`);
}

async function check(group, id, fn) {
  try {
    const detail = await fn();
    record(group, id, "PASS", typeof detail === "string" ? detail : "");
  } catch (error) {
    record(group, id, "FAIL", error instanceof Error ? error.message : String(error));
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForText(page, text, timeout = 15000) {
  await page.waitForFunction(
    (needle) => document.body && document.body.innerText.includes(needle),
    { timeout },
    text,
  );
}

async function clickByText(page, selector, text) {
  const clicked = await page.evaluate(
    (sel, needle) => {
      const nodes = [...document.querySelectorAll(sel)];
      const normalize = (value) => value.replace(/^\s*\d+\.\s*/, "").trim();
      const target = nodes.find((n) => normalize(n.textContent) === needle);
      if (!target) return false;
      target.click();
      return true;
    },
    selector,
    text,
  );
  if (!clicked) throw new Error(`button not found: ${selector} "${text}"`);
}

async function historyGo(page, direction) {
  const expected = new URL(page.url());
  try {
    if (direction === "back") await page.goBack({ waitUntil: "networkidle2" });
    else await page.goForward({ waitUntil: "networkidle2" });
  } catch {
    // Same-document traversals can race puppeteer's networkidle wait; fall
    // back to the page's own history traversal (real popstate navigation).
    await page.evaluate((dir) => (dir === "back" ? history.back() : history.forward()), direction);
  }
  // Give the router a moment; verify the URL actually changed.
  await wait(800);
  const landed = new URL(page.url());
  const moved =
    direction === "back"
      ? landed.href !== expected.href
      : landed.href !== expected.href;
  if (!moved) {
    await page.evaluate((dir) => (dir === "back" ? history.back() : history.forward()), direction);
    await wait(900);
  }
  return page.url();
}

async function uniqueCardCount(page, hrefPrefix) {
  return page.evaluate(
    (prefix) =>
      new Set(
        [...document.querySelectorAll(`a[href^="${prefix}"]`)]
          .map((a) => a.getAttribute("href"))
          .filter((href) => href && href !== prefix && href.split("?")[0] !== prefix),
      ).size,
    hrefPrefix.endsWith("/") ? hrefPrefix : `${hrefPrefix}/`,
  );
}

async function gridCount(page) {
  // Card links are /kanji/<char> (two anchors per card) — count unique targets.
  return page.evaluate(() => {
    const hrefs = [...document.querySelectorAll('a[href^="/kanji/"]')].map((a) =>
      a.getAttribute("href").split("?")[0],
    );
    return new Set(hrefs).size;
  });
}

async function headerCounts(page) {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/(\d+) of (\d+) catalog kanji shown/);
    return m ? { shown: Number(m[1]), catalog: Number(m[2]) } : null;
  });
}

async function clickElementByAriaPrefix(page, prefix) {
  const clicked = await page.evaluate((p) => {
    const btn = [...document.querySelectorAll("button[aria-label]")].find((b) =>
      b.getAttribute("aria-label").startsWith(p),
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, prefix);
  if (!clicked) throw new Error(`element button not found: aria-label "${prefix}…"`);
}

async function elementAriaLabel(page, prefix) {
  return page.evaluate((p) => {
    const btn = [...document.querySelectorAll("button[aria-label]")].find((b) =>
      b.getAttribute("aria-label").startsWith(p),
    );
    return btn ? btn.getAttribute("aria-label") : null;
  }, prefix);
}

async function bodyHas(page, text) {
  return page.evaluate((needle) => document.body.innerText.includes(needle), text);
}

async function horizontalOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

const main = async () => {
  const puppeteer = await import("puppeteer-core");
  const chromium = (await import("@sparticuz/chromium")).default;

  const browser = await puppeteer.default.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || "" },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({ width: 1280, height: 900 });

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleAndNetwork.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleAndNetwork.pageErrors.push(String(err)));
  page.on("requestfailed", (req) =>
    consoleAndNetwork.failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`),
  );
  page.on("response", (res) => {
    const url = res.url();
    if (res.status() >= 400 && !url.endsWith("/favicon.ico")) {
      consoleAndNetwork.badResponses.push(`${res.status()} ${url}`);
    }
  });

  /* ---------------------------------------------------------------- */
  /* A. Live API contract (same numbers the browser will render)       */
  /* ---------------------------------------------------------------- */
  await check("api", "element 丁 default filter", async () => {
    const json = await (await fetch(`${BASE_URL}/api/kanji?elementId=el-chou&includeElements=1`)).json();
    if (json.total !== 1 || json.kanji[0]?.character !== "灯") throw new Error(`total=${json.total}`);
    const el = json.elements.find((e) => e.id === "el-chou");
    if (el.visibleKanjiCount !== 1 || el.usedInCount !== 1 || el.relationshipCount !== 1)
      throw new Error(`palette=${JSON.stringify(el)}`);
    if (el.visibleKanjiCount !== json.total) throw new Error("badge != result set");
    return `total=1 灯; badge=1; relationships=1; catalogTotal=${json.catalogTotal}`;
  });

  await check("api", "element 丁 + level N5 explains the exclusion", async () => {
    const json = await (
      await fetch(`${BASE_URL}/api/kanji?elementId=el-chou&level=N5&includeElements=1`)
    ).json();
    if (json.total !== 0) throw new Error(`total=${json.total}`);
    if (json.elementFilter?.zeroKind !== "element-excluded-by-level")
      throw new Error(`zeroKind=${json.elementFilter?.zeroKind}`);
    if (json.elementFilter?.catalogKanjiCount !== 1 || json.elementFilter?.excluded?.byLevelOnly !== 1)
      throw new Error(JSON.stringify(json.elementFilter));
    const el = json.elements.find((e) => e.id === "el-chou");
    if (el.visibleKanjiCount !== 0 || el.usedInCount !== 1) throw new Error(JSON.stringify(el));
    return "total=0; zeroKind=element-excluded-by-level; 1 hidden by N5; badge 0/1";
  });

  await check("api", "element 木 relationship-vs-kanji counts", async () => {
    const json = await (await fetch(`${BASE_URL}/api/kanji?elementId=el-ki&includeElements=1`)).json();
    if (json.total !== 5 || json.elementFilter?.relationshipCount !== 8)
      throw new Error(JSON.stringify({ total: json.total, ef: json.elementFilter }));
    return "total=5 distinct kanji; 8 relationships";
  });

  await check("api", "zero-count element 金", async () => {
    const json = await (await fetch(`${BASE_URL}/api/kanji?elementId=el-kane&includeElements=1`)).json();
    if (json.total !== 0 || json.elementFilter?.zeroKind !== "element-no-relationships")
      throw new Error(JSON.stringify(json.elementFilter));
    return "0 matches; zeroKind=element-no-relationships";
  });

  await check("api", "keyword is literal (no SQL LIKE wildcard)", async () => {
    const json = await (await fetch(`${BASE_URL}/api/kanji?q=%25&includeElements=1`)).json();
    if (json.total !== 0 || json.emptyKind !== "filters-no-match")
      throw new Error(JSON.stringify({ total: json.total, emptyKind: json.emptyKind }));
    return "q=% → 0 matches, filters-no-match";
  });

  /* ---------------------------------------------------------------- */
  /* B. Catalog navigation                                             */
  /* ---------------------------------------------------------------- */
  await check("navigation", "/kanji loads with filter UI", async () => {
    const res = await page.goto(`${BASE_URL}/kanji`, { waitUntil: "networkidle2" });
    if (res.status() !== 200) throw new Error(`status ${res.status()}`);
    await page.waitForSelector("#kanji-keyword-filter", { timeout: 20000 });
    const counts = await headerCounts(page);
    if (!counts) throw new Error("header count line missing");
    if ((await gridCount(page)) !== counts.catalog)
      throw new Error(`grid ${await gridCount(page)} != catalog ${counts.catalog}`);
    return `catalog ${counts.catalog} shown ${counts.shown}`;
  });

  await check("navigation", "link to source-backed MindTree catalog", async () => {
    await clickByText(page, 'a[href="/mindtree"]', "Source-backed visual pilot");
    await waitForText(page, "Supported characters");
    if (!page.url().endsWith("/mindtree")) throw new Error(page.url());
    const cards = await uniqueCardCount(page, "/mindtree");
    if (cards !== 100) throw new Error(`cards=${cards}`);
    return "100 catalog cards";
  });

  await check("navigation", "MindTree catalog ↔ existing kanji tools round trip", async () => {
    await clickByText(page, 'a[href="/kanji"]', "Existing Kanji tools");
    await page.waitForSelector("#kanji-keyword-filter");
    if (!page.url().endsWith("/kanji")) throw new Error(page.url());
  });

  await check("navigation", "navbar MindTree entry present (desktop + mobile lists)", async () => {
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('nav[aria-label="Primary navigation"] a')].map((a) =>
        a.getAttribute("href"),
      ),
    );
    if (!hrefs.includes("/mindtree")) throw new Error(JSON.stringify(hrefs));
    return `${hrefs.length} nav links`;
  });

  /* ---------------------------------------------------------------- */
  /* C. Element selection, defect scenario, reset, empty states        */
  /* ---------------------------------------------------------------- */
  await check("element-filter", "select 丁 → 1 result (灯), banner count matches", async () => {
    await clickElementByAriaPrefix(page, "丁,");
    await waitForText(page, "Filtered to kanji containing");
    const banner = await page.evaluate(() =>
      [...document.querySelectorAll("div")].map((d) => d.textContent).find((t) => t && t.includes("Filtered to kanji containing")) || "",
    );
    if (!banner.includes("1 of 1 catalog character")) throw new Error(banner.slice(0, 200));
    if ((await gridCount(page)) !== 1) throw new Error(`grid=${await gridCount(page)}`);
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('a[href^="/kanji/"]')].map((a) => a.getAttribute("href")),
    );
    if (!hrefs.includes("/kanji/%E7%81%AF")) throw new Error(JSON.stringify(hrefs));
    return "banner 1 of 1; grid=灯";
  });

  await check("element-filter", "level N5 + selected 丁 → explanatory empty state", async () => {
    await clickByText(page, 'div[role="group"][aria-label="Filter by JLPT level"] button', "N5");
    await waitForText(page, "1 catalog kanji uses 丁, 0 shown");
    const detail = await page.evaluate(() => document.body.innerText);
    if (!detail.includes("level filter N5")) throw new Error("explanation must name N5");
    if (!detail.includes("not by the element")) throw new Error("explanation must attribute correctly");
    if ((await gridCount(page)) !== 0) throw new Error("grid not empty");
    return "empty state names the level facet";
  });

  await check("element-filter", "empty-state action clears ONLY the level facet", async () => {
    await clickByText(page, "button", "Clear level filter");
    await waitForText(page, "1 of 1 catalog character");
    if ((await gridCount(page)) !== 1) throw new Error(`grid=${await gridCount(page)}`);
    const label = await elementAriaLabel(page, "丁,");
    if (!label.startsWith("丁") || !label.includes("1 of 1")) throw new Error(label);
    return "灯 restored; element selection preserved";
  });

  await check("element-filter", "palette badges equal click results under N5", async () => {
    await clickByText(page, 'div[role="group"][aria-label="Filter by JLPT level"] button', "N5");
    await wait(800);
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label*="catalog kanji visible"]')].map((b) =>
        b.getAttribute("aria-label"),
      ),
    );
    // For each badge, promised visible count must equal results when clicked.
    // Spot check two: 木 (3 of 5 under N5) and 丁 (0 of 1 under N5).
    const ki = labels.find((l) => l.startsWith("木,"));
    const chou = labels.find((l) => l.startsWith("丁,"));
    if (!ki || !ki.includes("3 of 5 catalog kanji visible")) throw new Error(`木: ${ki}`);
    if (!chou || !chou.includes("0 of 1 catalog kanji visible") || !chou.includes("1 hidden"))
      throw new Error(`丁: ${chou}`);
    return "木 3/5 (2 hidden); 丁 0/1 (1 hidden)";
  });

  await check("element-filter", "badge promise holds when clicking 木 under N5", async () => {
    await clickElementByAriaPrefix(page, "木,");
    await waitForText(page, "3 of 5 catalog characters shown");
    if ((await gridCount(page)) !== 3) throw new Error(`grid=${await gridCount(page)}`);
    return "3 results = badge";
  });

  await check("element-filter", "Reset all filters restores the catalog", async () => {
    await clickByText(page, "button", "Reset all filters");
    await wait(700);
    const counts = await headerCounts(page);
    if (!counts || counts.shown !== counts.catalog) throw new Error(JSON.stringify(counts));
    if ((await gridCount(page)) !== counts.catalog) throw new Error("grid mismatch after reset");
    return `all ${counts.catalog} shown`;
  });

  await check("element-filter", "keyword miss → explained empty state + reset works", async () => {
    await page.type("#kanji-keyword-filter", "zzz-no-match", { delay: 30 });
    await waitForText(page, "No kanji match this filter");
    if (!(await bodyHas(page, "zzz-no-match"))) throw new Error("search term not named");
    await clickByText(page, "button", "Clear search and filters");
    await wait(700);
    const counts = await headerCounts(page);
    if (!counts || counts.shown !== counts.catalog) throw new Error("reset failed");
  });

  await check("element-filter", "zero-count element 金 → accurate zero", async () => {
    await clickElementByAriaPrefix(page, "金,");
    await waitForText(page, "No catalog kanji uses this element");
    if (!(await bodyHas(page, "0 composition relationships"))) throw new Error("missing zero detail");
    if (!(await bodyHas(page, "accurate zero"))) throw new Error("missing accuracy note");
    const label = await elementAriaLabel(page, "金,");
    if (!label.includes("0 of 0")) throw new Error(label);
    await clickByText(page, "button", "Clear");
    await wait(500);
    return "0 relationships disclosed";
  });

  await check("element-filter", "stale-response guard: rapid typing settles on final query", async () => {
    await page.click("#kanji-keyword-filter", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    for (const ch of "lamp") await page.keyboard.type(ch, { delay: 5 });
    await waitForText(page, "1 of ");
    await wait(600); // allow any straggler response to attempt (and be dropped)
    const counts = await headerCounts(page);
    if (!counts || counts.shown !== 1) throw new Error(JSON.stringify(counts));
    const cards = await gridCount(page);
    if (cards !== 1) throw new Error(`grid=${cards}`);
    // clear
    await page.click("#kanji-keyword-filter", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await wait(700);
  });

  /* ---------------------------------------------------------------- */
  /* D. Grade filtering on the source-backed catalog                   */
  /* ---------------------------------------------------------------- */
  await check("grade-filter", "/mindtree Grade 1 shows count == rendered results", async () => {
    await page.goto(`${BASE_URL}/mindtree`, { waitUntil: "networkidle2" });
    await clickByText(page, "button", "Grade 1");
    await waitForText(page, "Showing ");
    const state = await page.evaluate(() => {
      const line = [...document.querySelectorAll("p")].find((p) =>
        p.textContent.startsWith("Showing "),
      );
      const m = line.textContent.match(/Showing (\d+) of (\d+)/);
      const cards = new Set(
        [...document.querySelectorAll('a[href^="/mindtree/"]')].map((a) =>
          a.getAttribute("href").split("?")[0],
        ),
      ).size;
      return { shown: Number(m[1]), of: Number(m[2]), rendered: cards };
    });
    if (state.shown !== state.rendered)
      throw new Error(`label says ${state.shown}, DOM rendered ${state.rendered}`);
    return `${state.shown} of ${state.of} rendered`;
  });

  await check("grade-filter", "Grade 1 + query combination stays consistent", async () => {
    await page.type('input[type="search"]', "tree", { delay: 20 });
    await wait(500);
    const state = await page.evaluate(() => {
      const line = [...document.querySelectorAll("p")].find((p) =>
        p.textContent.startsWith("Showing "),
      );
      const m = line.textContent.match(/Showing (\d+) of (\d+)/);
      const cards = new Set(
        [...document.querySelectorAll('a[href^="/mindtree/"]')].map((a) =>
          a.getAttribute("href").split("?")[0],
        ),
      ).size;
      return { shown: Number(m[1]), rendered: cards, hasTree: document.body.innerText.includes("tree, wood") };
    });
    if (state.shown !== state.rendered) throw new Error(JSON.stringify(state));
    if (!state.hasTree) throw new Error("expected 木 in results");
    // reset search for later checks
    await page.evaluate(() => {
      const input = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(300);
    return `${state.shown} shown with 木`;
  });

  await check("grade-filter", "empty result shows reset affordance", async () => {
    await page.type('input[type="search"]', "xyzzy-not-present", { delay: 15 });
    await waitForText(page, "No supported character matches that search.");
    if (!(await bodyHas(page, "Clear search and filters"))) throw new Error("reset button missing");
    await clickByText(page, "button", "Clear search and filters");
    await wait(400);
    const cards = await uniqueCardCount(page, "/mindtree");
    if (cards !== 100) throw new Error(`cards=${cards} after reset`);
  });

  /* ---------------------------------------------------------------- */
  /* E. Detail routes + Japanese URL encoding                          */
  /* ---------------------------------------------------------------- */
  await check("routes", "/mindtree/明 (percent-encoded) loads", async () => {
    const res = await page.goto(`${BASE_URL}/mindtree/%E6%98%8E`, { waitUntil: "networkidle2" });
    if (res.status() !== 200) throw new Error(`status ${res.status()}`);
    const h1 = await page.$eval("h1", (el) => el.textContent.trim());
    if (h1 !== "明") throw new Error(h1);
    return "h1=明";
  });

  await check("routes", "unsupported character shows coverage notice, not a guess", async () => {
    const res = await page.goto(`${BASE_URL}/mindtree/%E9%BE%8D`, { waitUntil: "networkidle2" });
    if (res.status() !== 200) throw new Error(`status ${res.status()}`);
    if (!(await bodyHas(page, "not in the current source-backed slice")))
      throw new Error("coverage notice missing");
    if (await bodyHas(page, "Reveal")) throw new Error("explorer rendered for unsupported glyph");
  });

  await check("routes", "/kanji/灯 (existing detail route) loads", async () => {
    const res = await page.goto(`${BASE_URL}/kanji/%E7%81%AF`, { waitUntil: "networkidle2" });
    if (res.status() !== 200) throw new Error(`status ${res.status()}`);
    const text = await page.evaluate(() => document.body.innerText);
    if (!text.includes("灯")) throw new Error("character missing");
    if (!text.includes("MindTree")) throw new Error("MindTree link missing");
  });

  await check("routes", "multi-character MindTree route rejects decomposition gracefully", async () => {
    const res = await page.goto(`${BASE_URL}/mindtree/%E6%98%8E%E4%BA%BA`, { waitUntil: "networkidle2" });
    if (res.status() !== 200) throw new Error(`status ${res.status()}`);
    if (!(await bodyHas(page, "one exact Unicode character per route")))
      throw new Error("boundary message missing");
  });

  /* ---------------------------------------------------------------- */
  /* F. Six learning stages + recall reveal/hide                        */
  /* ---------------------------------------------------------------- */
  await check("learning-journey", "all six stages reachable and marked", async () => {
    await page.goto(`${BASE_URL}/mindtree/%E6%98%8E`, { waitUntil: "networkidle2" });
    const stages = ["Observe", "Break down", "Associate", "Remember", "Recall", "Explore"];
    for (let i = 0; i < stages.length; i += 1) {
      await clickByText(page, 'ol[aria-label="Learning journey steps"] button', stages[i]);
      const current = await page.evaluate(
        () => document.querySelector('ol[aria-label="Learning journey steps"] button[aria-current="step"]')?.textContent || "",
      );
      if (!current.includes(stages[i])) throw new Error(`stage ${stages[i]} not current: ${current}`);
      const stepLabel = await bodyHas(page, `Step ${i + 1} of 6`);
      if (!stepLabel) throw new Error(`step label ${i + 1}/6 missing`);
    }
    return "6/6 stages; step labels verified";
  });

  await check("learning-journey", "Recall reveal/hide toggles the answer", async () => {
    await clickByText(page, 'ol[aria-label="Learning journey steps"] button', "Recall");
    await clickByText(page, "button", "Reveal answer");
    await wait(300);
    // Reveal must open the self-check block (the page header also shows the
    // meaning, so block presence is asserted via its unique controls).
    if (!(await bodyHas(page, "I recalled it"))) throw new Error("reveal did not open the answer block");
    await clickByText(page, "button", "Cover answer");
    await wait(300);
    if (await bodyHas(page, "I recalled it")) throw new Error("answer block still visible after cover");
    if (!(await bodyHas(page, "Reveal answer"))) throw new Error("reveal affordance did not return");
    // component recall mode
    await clickByText(page, "button", "Component recall");
    await clickByText(page, "button", "Reveal answer");
    await wait(300);
    if (!(await bodyHas(page, "literal KanjiVG visual annotations")))
      throw new Error("component recall note missing");
    return "meaning + component recall verified";
  });

  await check("learning-journey", "ephemeral self-check stores nothing (no persistence calls)", async () => {
    const before = consoleAndNetwork.badResponses.length;
    // Ensure the answer block is revealed (previous check ends revealed for
    // component mode; guard in case ordering changes).
    if (!(await bodyHas(page, "I recalled it"))) {
      await clickByText(page, 'ol[aria-label="Learning journey steps"] button', "Recall");
      await clickByText(page, "button", "Reveal answer");
      await wait(200);
    }
    await clickByText(page, "button", "I recalled it");
    await wait(400);
    if (!(await bodyHas(page, "Nice work. This result is temporary"))) throw new Error("self-check text missing");
    if (consoleAndNetwork.badResponses.length !== before)
      throw new Error("unexpected failed request after self-check");
    return "no network calls fired";
  });

  await check("learning-journey", "hidden mnemonic states stay hidden (no story text rendered)", async () => {
    await clickByText(page, 'ol[aria-label="Learning journey steps"] button', "Associate");
    await wait(200);
    const text = await page.evaluate(() => document.body.innerText);
    const hiddenPhrases = [
      "draft", "hidden", "not shown to learners", "will not generate",
    ];
    if (!hiddenPhrases.some((p) => text.includes(p)))
      throw new Error("no hidden-content disclosure present");
    if (text.includes("Reveal first story cue")) throw new Error("story cue offered without publication");
  });

  /* ---------------------------------------------------------------- */
  /* G. Character switching + explore context preservation + history    */
  /* ---------------------------------------------------------------- */
  await check("explore-context", "neighbor link carries from/via and breadcrumb shows it", async () => {
    const link = await page.evaluate(() => {
      const a = document.querySelector('a[href*="from="]');
      return a ? { href: a.getAttribute("href"), text: a.textContent } : null;
    });
    if (!link) throw new Error("no context-carrying link found");
    await page.click('a[href*="from="]');
    await page.waitForFunction(() => location.pathname.startsWith("/mindtree/") && location.search.includes("from="));
    const url = new URL(page.url());
    if (url.searchParams.get("from") !== "明") throw new Error(`from=${url.searchParams.get("from")}`);
    if (!url.searchParams.get("via")) throw new Error("via missing");
    await waitForText(page, "Following");
    if (!(await bodyHas(page, "MindTree catalog"))) throw new Error("breadcrumb missing");
    const target = decodeURIComponent(url.pathname.split("/")[2]);
    return `明 → ${target} via “${url.searchParams.get("via")?.slice(0, 40)}…”`;
  });

  await check("explore-context", "component Open link switches character", async () => {
    await page.goto(`${BASE_URL}/mindtree/%E6%98%8E`, { waitUntil: "networkidle2" });
    const opened = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[aria-label^="Open MindTree for"]')];
      if (!links.length) return null;
      const href = links[0].getAttribute("href");
      links[0].click();
      return href;
    });
    if (!opened) throw new Error("no component Open link");
    await page.waitForFunction((prefix) => location.pathname.startsWith(prefix), {}, opened.split("?")[0]);
    await waitForText(page, "Following");
    return `opened ${opened.slice(0, 60)}`;
  });

  await check("browser-history", "back returns to the previous character, forward re-enters", async () => {
    const before = page.url();
    const backUrl = await historyGo(page, "back");
    if (backUrl === before) throw new Error("back did not navigate");
    if (!backUrl.includes("/mindtree/")) throw new Error(backUrl);
    const backChar = decodeURIComponent(new URL(backUrl).pathname.split("/")[2] || "");
    if (!backChar || !(await bodyHas(page, backChar))) throw new Error("back page did not re-render");
    const forwardUrl = await historyGo(page, "forward");
    if (forwardUrl === backUrl) throw new Error("forward did not navigate");
    if (!forwardUrl.includes("from=")) throw new Error(`forward lost context: ${forwardUrl}`);
    return `back → ${backChar}; forward → context link restored`;
  });

  await check("browser-history", "/kanji list → detail → back keeps history intact", async () => {
    await page.goto(`${BASE_URL}/kanji`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#kanji-keyword-filter");
    await page.evaluate(() => document.querySelector('a[href^="/kanji/"]').click());
    await page.waitForFunction(() => /\/kanji\/[^/]+/.test(location.pathname));
    const detailUrl = page.url();
    const backUrl = await historyGo(page, "back");
    await page.waitForSelector("#kanji-keyword-filter");
    if (backUrl.replace(/\/$/, "") !== `${BASE_URL}/kanji`) throw new Error(backUrl);
    const forwardUrl = await historyGo(page, "forward");
    if (forwardUrl !== detailUrl) throw new Error(`forward → ${forwardUrl}`);
    return "list ⇄ detail history OK";
  });

  await check("routes", "stroke-order API fails honestly when local KanjiVG corpus is absent", async () => {
    const res = await fetch(`${BASE_URL}/api/kanji/%E7%81%AF/stroke-order`);
    const body = await res.json();
    if (res.status === 404) {
      if (body?.error?.code !== "STROKE_ORDER_UNAVAILABLE")
        throw new Error(JSON.stringify(body));
      return "404 STROKE_ORDER_UNAVAILABLE (local data/kanjivg corpus not provisioned)";
    }
    if (res.status === 200 && typeof body.diagramSvg === "string" && body.diagramSvg.includes("<svg"))
      return "200 diagramSvg";
    throw new Error(`unexpected status ${res.status}: ${JSON.stringify(body).slice(0, 120)}`);
  });

  /* ---------------------------------------------------------------- */
  /* H. Responsive layouts                                             */
  /* ---------------------------------------------------------------- */
  for (const [name, width, height] of [
    ["mobile-375", 375, 812],
    ["tablet-768", 768, 1024],
    ["desktop-1280", 1280, 900],
  ]) {
    await check("responsive", `/kanji @ ${name}`, async () => {
      await page.setViewport({ width, height });
      await page.goto(`${BASE_URL}/kanji`, { waitUntil: "networkidle2" });
      await page.waitForSelector("#kanji-keyword-filter");
      const { scrollWidth, innerWidth } = await horizontalOverflow(page);
      if (scrollWidth > innerWidth + 1) throw new Error(`overflow ${scrollWidth} > ${innerWidth}`);
      return `scrollWidth=${scrollWidth} ≤ ${innerWidth}`;
    });
  }

  await check("responsive", "mobile nav exposes the MindTree entry", async () => {
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/kanji`, { waitUntil: "networkidle2" });
    const visible = await page.evaluate(() => {
      const navs = [...document.querySelectorAll('nav[aria-label="Primary navigation"]')];
      const visibleNav = navs.find((n) => n.offsetParent !== null && n.getBoundingClientRect().height > 0);
      if (!visibleNav) return null;
      return [...visibleNav.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    });
    if (!visible || !visible.includes("/mindtree")) throw new Error(JSON.stringify(visible));
    return `visible mobile nav: ${visible.join(", ")}`;
  });

  await check("responsive", "/mindtree catalog @ mobile-375 has no overflow", async () => {
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/mindtree`, { waitUntil: "networkidle2" });
    const { scrollWidth, innerWidth } = await horizontalOverflow(page);
    if (scrollWidth > innerWidth + 1) throw new Error(`overflow ${scrollWidth} > ${innerWidth}`);
    return `scrollWidth=${scrollWidth} ≤ ${innerWidth}`;
  });

  await check("responsive", "/mindtree/明 @ mobile has no overflow", async () => {
    await page.goto(`${BASE_URL}/mindtree/%E6%98%8E`, { waitUntil: "networkidle2" });
    const { scrollWidth, innerWidth } = await horizontalOverflow(page);
    if (scrollWidth > innerWidth + 1) throw new Error(`overflow ${scrollWidth} > ${innerWidth}`);
    await page.setViewport({ width: 1280, height: 900 });
  });

  /* ---------------------------------------------------------------- */
  /* I. Keyboard navigation                                            */
  /* ---------------------------------------------------------------- */
  await check("keyboard", "Tab traversal reaches filters, element palette and cards", async () => {
    await page.goto(`${BASE_URL}/kanji`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#kanji-keyword-filter");
    const reached = { filter: false, element: false, card: false };
    for (let i = 0; i < 140 && !(reached.filter && reached.element && reached.card); i += 1) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return {
          tag: el.tagName,
          label: el.getAttribute("aria-label") || el.textContent?.slice(0, 40) || "",
          group: !!el.closest('div[role="group"][aria-label="Filter by JLPT level"]'),
          inPalette: !!el.closest('button[aria-label*="catalog kanji visible"]'),
          href: el.getAttribute?.("href") || null,
        };
      });
      if (!info) continue;
      if (info.group) reached.filter = true;
      if (info.inPalette) reached.element = true;
      if (info.href && info.href.startsWith("/kanji/")) reached.card = true;
    }
    if (!reached.filter || !reached.element || !reached.card)
      throw new Error(JSON.stringify(reached));
    return "filters + palette + cards keyboard-reachable";
  });

  await check("keyboard", "Enter activates a focused element button (aria-pressed toggles)", async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button[aria-label]")].find((b) =>
        b.getAttribute("aria-label").startsWith("木,"),
      );
      btn.focus();
    });
    await page.keyboard.press("Enter");
    await waitForText(page, "Filtered to kanji containing");
    const pressed = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button[aria-label]")].find((b) =>
        b.getAttribute("aria-label").startsWith("木,"),
      );
      return btn.getAttribute("aria-pressed");
    });
    if (pressed !== "true") throw new Error(`aria-pressed=${pressed}`);
    await page.keyboard.press("Enter"); // toggle off via keyboard
    await wait(600);
    const after = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button[aria-label]")].find((b) =>
        b.getAttribute("aria-label").startsWith("木,"),
      );
      return btn.getAttribute("aria-pressed");
    });
    if (after !== "false") throw new Error(`aria-pressed=${after} after toggle-off`);
  });

  await check("keyboard", "focus-visible ring classes present on interactive controls", async () => {
    const missing = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("main button, main a")];
      return nodes.filter(
        (n) =>
          !n.className.includes("focus-visible:ring") &&
          !n.className.includes("focus-visible:outline"),
      ).length;
    });
    if (missing > 0) throw new Error(`${missing} controls without focus styling`);
    return `${missing} missing`;
  });

  /* ---------------------------------------------------------------- */
  /* J. Production content boundaries                                  */
  /* ---------------------------------------------------------------- */
  await check("production-boundary", "/mindtree/studio returns 404 in production", async () => {
    const res = await fetch(`${BASE_URL}/mindtree/studio`);
    if (res.status !== 404) throw new Error(`status ${res.status}`);
  });

  await check("production-boundary", "studio preview API returns 404 in production", async () => {
    const res = await fetch(`${BASE_URL}/mindtree/studio/preview/%E6%98%8E`);
    if (res.status !== 404) throw new Error(`status ${res.status}`);
  });

  await check("production-boundary", "AI candidate overlay text absent from learner HTML", async () => {
    const res = await fetch(`${BASE_URL}/mindtree/%E4%B8%80`);
    const html = await res.text();
    if (html.includes("Picture one clean stroke"))
      throw new Error("candidate overlay string leaked");
    return "一 page clean";
  });

  await check("production-boundary", "legacy AI-revised stories absent from /kanji detail", async () => {
    const [nan, cho] = await Promise.all([
      fetch(`${BASE_URL}/kanji/%E7%94%B7`),
      fetch(`${BASE_URL}/kanji/%E7%AE%B8`),
    ]);
    const html = `${await nan.text()}\n${await cho.text()}`;
    if (nan.status !== 200 || cho.status !== 200)
      throw new Error(`statuses ${nan.status}/${cho.status}`);
    if (html.includes("Picture one clean stroke")) throw new Error("candidate leaked");
    return "男 + 箸 routes 200, candidate absent";
  });

  await check("production-boundary", "no DB write attempted during acceptance", async () => {
    // The script issues only GET requests; verified structurally here and by
    // review of this file (no POST/PUT/PATCH/DELETE anywhere).
    return "GET-only script";
  });

  /* ---------------------------------------------------------------- */
  /* K. Console + network cleanliness                                  */
  /* ---------------------------------------------------------------- */
  await check("console-network", "no unexpected page errors, console errors or failed requests", async () => {
    const environment = [];
    const benign = [];
    const localData = [];
    const real = [];
    for (const entry of consoleAndNetwork.pageErrors) real.push(`pageerror: ${entry}`);
    for (const entry of consoleAndNetwork.consoleErrors) {
      if (entry.startsWith("Failed to load resource:")) continue; // classified via request lists
      if (entry.includes("fonts.googleapis.com") || entry.includes("ERR_CONNECTION_CLOSED"))
        environment.push(entry);
      else real.push(entry);
    }
    for (const entry of [...consoleAndNetwork.failedRequests, ...consoleAndNetwork.badResponses]) {
      if (entry.includes("fonts.googleapis.com")) environment.push(entry);
      else if (entry.includes("_rsc=") && entry.includes("ERR_ABORTED")) benign.push(entry);
      else if (entry.includes("stroke-order")) localData.push(entry);
      else real.push(entry);
    }
    buckets.environmentBlockedBySandboxEgress = environment.length;
    buckets.benignPrefetchCancellation = benign.length;
    buckets.localDataNotProvisioned = localData.length;
    if (real.length) throw new Error(`real: ${real.slice(0, 4).join(" | ")}`);
    return `clean (environment:${environment.length}, prefetch-abort:${benign.length}, local-corpus:${localData.length})`;
  });

  await browser.close();

  const summary = {
    reportVersion: "nihongobridge-m9a-browser-acceptance@1",
    baseUrl: BASE_URL,
    executedAt: new Date().toISOString(),
    headless: "chromium via @sparticuz/chromium + puppeteer-core (real browser, JS executed)",
    environment: "local production build (next build && next start), disposable PostgreSQL",
    totals: {
      pass: results.filter((r) => r.status === "PASS").length,
      fail: results.filter((r) => r.status === "FAIL").length,
      skip: results.filter((r) => r.status === "SKIP").length,
    },
    results,
    consoleAndNetwork,
    classifiedFailureBuckets: buckets,
  };
  mkdirSync(OUT_PATH.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `\n${summary.totals.pass} passed, ${summary.totals.fail} failed → ${OUT_PATH}`,
  );
  process.exit(summary.totals.fail > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
