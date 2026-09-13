import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 05.3 deployment gate — the dictionary user journey.
 *
 * Runs against a production `next start` server (see playwright.config.ts).
 * Every element required by the prompt has an explicit assertion:
 *   readings · meanings · JLPT · kanji · examples · conjugations · audio ·
 *   related content.
 *
 * Data comes from the Phase 04 fixture corpus loaded through the ETL. The
 * 食べる (taberu) entry is used because it exercises every section at once:
 * a kanji component, a conjugatable ichidan verb, a curated JLPT label,
 * linked Tatoeba examples, and related "shares kanji" entries.
 */

async function searchFor(page: Page, term: string) {
  await page.getByTestId("dictionary-search-input").fill(term);
  await page.getByTestId("dictionary-search-submit").click();
  await expect(page.getByTestId("dictionary-result-count")).toBeVisible();
}

test.describe("Dictionary journey", () => {
  test("lands on /dictionary in the idle state", async ({ page }) => {
    await page.goto("/dictionary");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Look it up");
    await expect(page.getByTestId("dictionary-idle")).toBeVisible();
    await expect(page.getByTestId("dictionary-search-input")).toBeVisible();
  });

  test("searches by kanji and lists ranked results", async ({ page }) => {
    await page.goto("/dictionary");
    await searchFor(page, "食べる");

    const results = page.getByTestId("dictionary-result");
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText("食べる");
    await expect(results.first()).toContainText("たべる");
    await expect(results.first()).toContainText("to eat");
    // URL is deep-linkable after search
    await expect(page).toHaveURL(/\/dictionary\?q=/);
  });

  test("searches by romaji and English via the same UI", async ({ page }) => {
    await page.goto("/dictionary");
    await searchFor(page, "mizu");
    await expect(page.getByTestId("dictionary-result").first()).toContainText("水");

    await searchFor(page, "water");
    await expect(page.getByTestId("dictionary-result").first()).toContainText("水");
  });

  test("filters by JLPT level without a query", async ({ page }) => {
    await page.goto("/dictionary");
    await page.getByTestId("dictionary-jlpt-select").selectOption("N5");
    await page.getByTestId("dictionary-search-submit").click();
    await expect(page.getByTestId("dictionary-result-count")).toContainText("N5");
    await expect(page.getByTestId("dictionary-result").first()).toBeVisible();
  });

  test("shows a friendly empty state for no matches", async ({ page }) => {
    await page.goto("/dictionary");
    await searchFor(page, "zzzzqqqq");
    await expect(page.getByTestId("dictionary-empty")).toBeVisible();
  });

  test("full journey: search → open entry → every required section renders", async ({ page }) => {
    await page.goto("/dictionary");
    await searchFor(page, "食べる");

    // Click the first result and land on /dictionary/[id]
    await page.getByTestId("dictionary-result").first().click();
    await expect(page).toHaveURL(/\/dictionary\/\d+$/);
    await expect(page.getByTestId("dictionary-entry-page")).toBeVisible();

    // Headword + reading (with furigana ruby)
    await expect(page.getByTestId("entry-headword")).toContainText("食");
    await expect(page.getByTestId("entry-headword").locator("ruby rt")).toContainText("た");
    await expect(page.getByTestId("entry-reading")).toHaveText("たべる");

    // ✅ readings
    await expect(page.getByTestId("section-readings")).toBeVisible();
    await expect(page.getByTestId("section-readings")).toContainText("たべる");

    // ✅ meanings
    await expect(page.getByTestId("section-meanings")).toBeVisible();
    await expect(page.getByTestId("section-meanings")).toContainText("to eat");

    // ✅ JLPT (source-curated fixture label)
    await expect(page.getByTestId("section-jlpt")).toBeVisible();
    await expect(page.getByTestId("jlpt-level").first()).toHaveText("N5");

    // ✅ kanji breakdown
    await expect(page.getByTestId("section-kanji")).toBeVisible();
    const kanji = page.getByTestId("kanji-component").first();
    await expect(kanji).toContainText("食");
    await expect(kanji).toContainText("eat");
    await expect(kanji).toContainText("9 strokes");

    // ✅ examples — with mandatory per-sentence CC BY attribution
    await expect(page.getByTestId("section-examples")).toBeVisible();
    const example = page.getByTestId("example-sentence").first();
    await expect(example).toContainText("食べる");
    await expect(example).toContainText("I eat an apple");
    await expect(page.getByTestId("example-attribution").first()).toContainText("CC BY 2.0 FR");
    await expect(page.getByTestId("section-examples")).toContainText("Tatoeba");

    // ✅ conjugations (ichidan: negative / polite / past / te)
    await expect(page.getByTestId("section-conjugations")).toBeVisible();
    const forms = page.getByTestId("conjugation-form");
    await expect(forms).toHaveCount(4);
    await expect(page.getByTestId("section-conjugations")).toContainText("食べない");
    await expect(page.getByTestId("section-conjugations")).toContainText("食べます");
    await expect(page.getByTestId("section-conjugations")).toContainText("食べた");
    await expect(page.getByTestId("section-conjugations")).toContainText("食べて");

    // ✅ audio — honest unavailable state, never a broken play button
    await expect(page.getByTestId("audio-unavailable")).toBeVisible();
    await expect(page.getByTestId("audio-unavailable")).toContainText("No audio");
    await expect(page.getByTestId("audio-play")).toHaveCount(0);

    // ✅ related content
    await expect(page.getByTestId("section-related")).toBeVisible();
    await expect(page.getByTestId("related-entry").first()).toBeVisible();

    // provenance / licence footer
    await expect(page.getByTestId("section-provenance")).toContainText("jmdict");
  });

  test("related entries navigate to another /dictionary/[id] page", async ({ page }) => {
    await page.goto("/dictionary");
    await searchFor(page, "食べる");
    await page.getByTestId("dictionary-result").first().click();
    await expect(page).toHaveURL(/\/dictionary\/\d+$/);
    const firstUrl = page.url();

    // Capture the target BEFORE clicking so the assertion is deterministic and
    // not a race against client-side navigation.
    const related = page.getByTestId("related-entry").first();
    const targetHref = await related.getAttribute("href");
    expect(targetHref).toMatch(/^\/dictionary\/\d+$/);
    expect(targetHref).not.toBe(new URL(firstUrl).pathname);

    await related.click();
    await expect(page).toHaveURL(new RegExp(`${targetHref}$`));
    await expect(page.getByTestId("dictionary-entry-page")).toBeVisible();
    await expect(page.getByTestId("section-meanings")).toBeVisible();
  });

  test("back link returns to the dictionary search", async ({ page }) => {
    await page.goto("/dictionary/2");
    await expect(page.getByTestId("dictionary-entry-page")).toBeVisible();
    await page.getByRole("link", { name: "← Dictionary" }).click();
    await expect(page).toHaveURL(/\/dictionary$/);
  });

  test("unknown entry ids render the not-found page", async ({ page }) => {
    const response = await page.goto("/dictionary/999999999");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("dictionary-not-found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to dictionary" })).toBeVisible();
  });

  test("malformed entry ids render the not-found page", async ({ page }) => {
    const response = await page.goto("/dictionary/not-a-number");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("dictionary-not-found")).toBeVisible();
  });

  test("entry page has meaningful metadata title", async ({ page }) => {
    await page.goto("/dictionary/2");
    await expect(page).toHaveTitle(/食べる.*たべる.*to eat/);
  });
});
