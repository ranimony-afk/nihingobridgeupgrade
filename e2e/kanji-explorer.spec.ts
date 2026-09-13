import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 06.2 deployment gate: the kanji explorer journey.
 *
 * Covers /kanji (search + filters + pagination) and /kanji/:literal (detail),
 * including reverse component lookup and cross-links into the dictionary.
 */

const kanjiSection = (page: Page, title: string) =>
  page.locator("section", { has: page.getByRole("heading", { name: title }) });

test.describe("kanji explorer", () => {
  test("shows an idle prompt before any criteria are supplied", async ({ page }) => {
    await page.goto("/kanji");
    await expect(page.getByRole("heading", { name: /Every character, broken down/i })).toBeVisible();
    await expect(page.getByText(/Enter a search term or choose a filter/i)).toBeVisible();
  });

  test("search by English meaning then open the kanji detail page", async ({ page }) => {
    await page.goto("/kanji");

    await page.getByLabel("Search").fill("water");
    await page.getByRole("button", { name: "Explore" }).click();

    await expect(page.getByTestId("result-total")).toHaveText("1");
    const card = page.getByTestId("kanji-results").locator("a").first();
    await expect(card).toContainText("水");
    await expect(card).toContainText("water");
    await expect(card).toContainText("4 strokes");

    // --- detail page ---------------------------------------------------------
    await card.click();
    await expect(page).toHaveURL(/\/kanji\/%E6%B0%B4$/);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("水");
    // The vocabulary list also contains "water" glosses, so scope to the header.
    await expect(
      page.locator("p", { hasText: /^water$/ }).first(),
    ).toBeVisible();

    // Readings
    await expect(kanjiSection(page, "Readings").getByText("On")).toBeVisible();
    await expect(kanjiSection(page, "Readings").getByText("スイ")).toBeVisible();
    // exact: 水 has both みず and みず- kun readings.
    await expect(kanjiSection(page, "Readings").getByText("みず", { exact: true })).toBeVisible();
    await expect(kanjiSection(page, "Readings").getByText("みず-", { exact: true })).toBeVisible();

    // Strokes / grade / frequency / codepoint stats
    const stats = page.locator("dl");
    await expect(stats).toContainText("Strokes");
    await expect(stats).toContainText("4");
    await expect(stats).toContainText("Grade");
    await expect(stats).toContainText("Frequency");
    await expect(stats).toContainText("6C34");
    // The source records an alternate stroke count for 水.
    await expect(
      page.getByText(/Alternate stroke counts recorded by the source: 5/i),
    ).toBeVisible();

    // Radicals + components
    const radicals = kanjiSection(page, "Radicals & components");
    await expect(radicals.getByText("Radical 85 (classical)")).toBeVisible();
    await expect(radicals.getByText("Composed of")).toBeVisible();

    // JLPT: legacy scale must be labelled as NOT a modern N-level
    const jlpt = kanjiSection(page, "JLPT");
    await expect(jlpt.getByText(/No modern N1–N5 level assigned/i)).toBeVisible();
    await expect(jlpt.getByText(/Source legacy JLPT scale: 4/i)).toBeVisible();
    await expect(jlpt.getByText(/not.*equivalent to a modern N1–N5 level/i)).toBeVisible();

    // Audio control
    const audio = page.getByTestId("audio-button");
    await expect(audio).toBeVisible();
    await expect(audio).toHaveAttribute("aria-label", "Play audio for 水");

    // Vocabulary cross-links into the dictionary
    const words = kanjiSection(page, "Words using this kanji");
    await expect(words.locator('a[href^="/dictionary/"]').first()).toBeVisible();

    // Provenance / licence is surfaced
    await expect(page.getByText(/KANJIDIC2/).first()).toBeVisible();
    await expect(page.getByText(/CC BY-SA 4\.0/).first()).toBeVisible();
  });

  test("vocabulary link navigates from kanji into the dictionary entry", async ({ page }) => {
    await page.goto("/kanji/%E6%B0%B4"); // 水
    const wordLink = kanjiSection(page, "Words using this kanji")
      .locator('a[href^="/dictionary/"]')
      .first();
    await wordLink.click();
    await expect(page).toHaveURL(/\/dictionary\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("grade filter is deep-linkable and paginates without overlap", async ({ page }) => {
    await page.goto("/kanji?grade=1");
    await expect(page.getByTestId("result-total")).not.toHaveText("0");

    const firstPage = await page
      .getByTestId("kanji-results")
      .locator("a")
      .allTextContents();
    expect(firstPage).toHaveLength(20);

    await expect(page.getByText(/Page 1 of/)).toBeVisible();
    await page.getByRole("button", { name: /Next/i }).click();

    await expect(page).toHaveURL(/offset=20/);
    await expect(page.getByText(/Page 2 of/)).toBeVisible();
    const secondPage = await page
      .getByTestId("kanji-results")
      .locator("a")
      .allTextContents();
    expect(secondPage.length).toBeGreaterThan(0);

    const overlap = firstPage.filter((text) => secondPage.includes(text));
    expect(overlap).toEqual([]);

    await page.getByRole("button", { name: /Previous/i }).click();
    await expect(page).toHaveURL(/\/kanji\?grade=1$/);
  });

  test("component filter performs a reverse KRADFILE lookup", async ({ page }) => {
    // 語 : 言 五 口  and  話 : 言 舌
    await page.goto("/kanji?component=%E8%A8%80"); // 言
    await expect(page.getByTestId("result-total")).toHaveText("2");

    const literals = await page
      .getByTestId("kanji-results")
      .locator("a span")
      .allTextContents();
    expect(literals).toContain("語");
    expect(literals).toContain("話");
  });

  test("component chips on a detail page link to that component's kanji", async ({ page }) => {
    await page.goto("/kanji/%E8%AA%9E"); // 語
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("語");

    const radicals = kanjiSection(page, "Radicals & components");
    await expect(radicals.getByText("Composed of")).toBeVisible();

    // 語 is composed of 言 五 口; each chip links to its own kanji page.
    const componentLinks = radicals.locator('a[aria-label^="View kanji"]');
    await expect(componentLinks).toHaveCount(3);
    await expect(componentLinks.first()).toHaveAttribute(
      "href",
      /\/kanji\/%E8%A8%80/,
    );

    // Reverse lookup for this character is offered
    await expect(
      radicals.getByRole("link", { name: /Find kanji built from 語/ }),
    ).toHaveAttribute("href", /\/kanji\?component=%E8%AA%9E/);
  });

  test("radical and stroke chips link back into filtered explorer views", async ({ page }) => {
    await page.goto("/kanji/%E6%B0%B4"); // 水
    const radicals = kanjiSection(page, "Radicals & components");
    await expect(radicals.getByRole("link", { name: "Radical 85 (classical)" })).toHaveAttribute(
      "href",
      "/kanji?radical=85",
    );
    await expect(radicals.getByRole("link", { name: "4 strokes" })).toHaveAttribute(
      "href",
      "/kanji?strokes=4",
    );

    await radicals.getByRole("link", { name: "Radical 85 (classical)" }).click();
    await expect(page).toHaveURL(/\/kanji\?radical=85$/);
    await expect(page.getByTestId("result-total")).not.toHaveText("0");
  });

  test("clearing filters returns the explorer to its idle prompt", async ({ page }) => {
    await page.goto("/kanji?q=water");
    await expect(page.getByTestId("result-total")).toHaveText("1");

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/kanji$/);
    await expect(page.getByText(/Enter a search term or choose a filter/i)).toBeVisible();
  });

  test("an invalid kanji path and an unknown kanji both fail gracefully", async ({ page }) => {
    await page.goto("/kanji/%E3%81%82"); // あ — kana, not a kanji
    await expect(page.getByRole("heading", { name: /Invalid kanji/i })).toBeVisible();

    await page.goto("/kanji/%E9%AC%B1"); // 鬱 — valid ideograph, absent from corpus
    await expect(page.getByRole("heading", { name: /Kanji not found/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to explorer/i })).toBeVisible();
  });

  test("the explorer is reachable from the global navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Kanji", exact: true }).click();
    await expect(page).toHaveURL(/\/kanji$/);
    await expect(
      page.getByRole("heading", { name: /Every character, broken down/i }),
    ).toBeVisible();
  });
});
