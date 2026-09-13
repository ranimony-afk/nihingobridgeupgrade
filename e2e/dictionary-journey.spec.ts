import { expect, test } from "@playwright/test";

/**
 * Phase 05.3 deployment gate: the dictionary journey.
 *
 * Covers /dictionary (search) and /dictionary/:id (detail) including readings,
 * meanings, JLPT, kanji, examples, conjugations, audio and related content.
 *
 * Note: the headword renders with <ruby> furigana, so DOM text for a heading
 * includes the reading annotation (e.g. 食べる reads back as 食たべる).
 * Assertions therefore check the component characters rather than the exact
 * surface string.
 */

const meaningsSection = (page: import("@playwright/test").Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Meanings" }) });

const examplesSection = (page: import("@playwright/test").Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Examples" }) });

const relatedSection = (page: import("@playwright/test").Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Related" }) });

test.describe("dictionary journey", () => {
  test("search by kanji then view a full entry detail page", async ({ page }) => {
    // --- /dictionary : search -------------------------------------------------
    await page.goto("/dictionary");
    await expect(page.getByRole("heading", { name: /Look it up/i })).toBeVisible();

    await page.getByLabel("Japanese word or reading").fill("水");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText(/result(s)? for/)).toBeVisible();
    const resultLink = page.locator('a[href^="/dictionary/"]').first();
    await expect(resultLink).toContainText("水");
    await expect(resultLink).toContainText("みず");

    // --- /dictionary/[id] : detail -------------------------------------------
    await resultLink.click();

    await expect(page).toHaveURL(/\/dictionary\/\d+$/);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("水");

    // Reading
    await expect(page.getByTestId("entry-reading")).toHaveText("みず");

    // Meanings
    await expect(meaningsSection(page).getByText("water")).toBeVisible();

    // JLPT (source-curated) badge
    await expect(page.getByText("N5", { exact: true })).toBeVisible();

    // Kanji breakdown
    await expect(page.getByRole("heading", { name: "Kanji", exact: true })).toBeVisible();
    await expect(page.getByText(/4 strokes/)).toBeVisible();
    await expect(page.getByText("スイ")).toBeVisible();

    // Examples carry their CC BY 2.0 FR attribution
    await expect(examplesSection(page).getByText("水を飲みます。").first()).toBeVisible();
    await expect(
      examplesSection(page).getByText("I drink water.", { exact: true }).first(),
    ).toBeVisible();
    await expect(examplesSection(page).getByText(/Tatoeba sentence #\d+/).first()).toBeVisible();
    await expect(examplesSection(page).getByText(/CC BY 2\.0 FR/).first()).toBeVisible();

    // Audio control
    const audio = page.getByTestId("audio-button");
    await expect(audio).toBeVisible();
    await expect(audio).toHaveAttribute("aria-label", "Play audio for 水");

    // Related content
    const related = relatedSection(page).locator('a[href^="/dictionary/"]');
    await expect(related.first()).toBeVisible();
    expect(await related.count()).toBeGreaterThan(0);

    // Provenance is surfaced
    await expect(page.getByText(/JMdict/).first()).toBeVisible();
  });

  test("search by romaji and english reach the same entry", async ({ page }) => {
    await page.goto("/dictionary");

    await page.getByLabel("Japanese word or reading").fill("mizu");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(/result(s)? for/)).toBeVisible();
    await expect(page.locator('a[href^="/dictionary/"]').first()).toContainText("水");

    await page.getByLabel("Japanese word or reading").fill("water");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(/result(s)? for/)).toBeVisible();
    await expect(page.locator('a[href^="/dictionary/"]').first()).toContainText("水");
  });

  test("verb entry shows conjugations and navigates to related content", async ({ page }) => {
    await page.goto("/dictionary");

    await page.getByLabel("Japanese word or reading").fill("食べる");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText(/result(s)? for/)).toBeVisible();

    await page.locator('a[href^="/dictionary/"]').first().click();
    await expect(page).toHaveURL(/\/dictionary\/\d+$/);

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("食");
    await expect(heading).toContainText("べる");
    await expect(page.getByTestId("entry-reading")).toHaveText("たべる");

    // Conjugations
    await expect(page.getByRole("heading", { name: "Conjugations" })).toBeVisible();
    await expect(page.getByText("食べない")).toBeVisible();
    await expect(page.getByText("食べます")).toBeVisible();
    await expect(page.getByText("食べた")).toBeVisible();
    await expect(page.getByText("食べて")).toBeVisible();

    // Related content links navigate to another detail page
    const relatedLink = relatedSection(page).locator('a[href^="/dictionary/"]').first();
    await relatedLink.click();
    await expect(page).toHaveURL(/\/dictionary\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("entry-reading")).toBeVisible();
  });

  test("an unknown entry id renders a friendly not-found page", async ({ page }) => {
    await page.goto("/dictionary/999999999");
    await expect(page.getByRole("heading", { name: /Entry not found/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to search/i })).toBeVisible();
  });
});
