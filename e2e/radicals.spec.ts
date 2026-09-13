import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 06.3 gate: radical & component relationship journeys.
 *
 * Covers /radicals (index), /radicals/:number (detail, both relation types)
 * and the multi-radical component picker in the kanji explorer.
 */

const section = (page: Page, title: string | RegExp) =>
  page.locator("section", { has: page.getByRole("heading", { name: title }) });

test.describe("radicals & components", () => {
  test("radical index lists all 214 radicals grouped by stroke count", async ({ page }) => {
    await page.goto("/radicals");

    await expect(
      page.getByRole("heading", { name: /The 214 building blocks/i }),
    ).toBeVisible();

    // 1-stroke group contains 一 and 乙; 4-stroke contains 水.
    await expect(page.getByTestId("radical-group-1")).toBeVisible();
    await expect(page.getByTestId("radical-group-1")).toContainText("一");
    await expect(page.getByTestId("radical-group-4")).toContainText("水");

    // Radicals show their meaning, not just a bare number.
    await expect(page.getByTestId("radical-group-4")).toContainText("water");
  });

  test("index can be narrowed to radicals present in the corpus", async ({ page }) => {
    await page.goto("/radicals");
    await expect(page.getByTestId("radical-group-1")).toBeVisible();
    const before = await page.locator('a[href^="/radicals/"]').count();
    expect(before).toBe(214);

    // NOTE: the synthetic KANJIDIC2 fixture assigns radical numbers
    // round-robin across all 214, so every radical is "used" in this corpus
    // and the filter is a no-op here. Assert the invariant that actually
    // holds — it never grows the set, and never drops below the used count —
    // rather than a reduction this fixture cannot produce.
    const usedLabel = await page.getByText(/Only radicals present in this corpus/).textContent();
    const usedCount = Number(usedLabel?.match(/\((\d+)\)/)?.[1] ?? "0");
    expect(usedCount).toBeGreaterThan(0);

    await page.getByRole("checkbox").check();
    await expect(page.getByTestId("radical-group-1")).toBeVisible();
    const after = await page.locator('a[href^="/radicals/"]').count();

    expect(after).toBe(usedCount);
    expect(after).toBeLessThanOrEqual(before);
  });

  test("radical detail distinguishes classification from component usage", async ({ page }) => {
    await page.goto("/radicals/149"); // 言

    await expect(
      page.getByRole("heading", { name: /Radical 149 — speech/i }),
    ).toBeVisible();
    await expect(page.getByText("7 strokes")).toBeVisible();

    // Two genuinely different relationships, presented separately.
    await expect(page.getByTestId("kanji-by-radical")).toContainText("語");
    await expect(page.getByTestId("kanji-by-component")).toContainText("語");
    await expect(page.getByTestId("kanji-by-component")).toContainText("話");

    await expect(
      section(page, /Kanji classified under this radical/i).getByText(
        /exactly one classifying radical/i,
      ),
    ).toBeVisible();

    // Provenance is honest about where the radical list came from.
    await expect(page.getByText(/public domain/i)).toBeVisible();
  });

  test("radical detail shows positional variants", async ({ page }) => {
    await page.goto("/radicals/85"); // 水 → 氵, 氺
    await expect(page.getByRole("heading", { name: /Radical 85 — water/i })).toBeVisible();
    await expect(page.getByText(/氵/)).toBeVisible();
  });

  test("a radical links through to a kanji detail page", async ({ page }) => {
    await page.goto("/radicals/149");
    await page.getByTestId("kanji-by-component").locator("a").first().click();
    await expect(page).toHaveURL(/\/kanji\/%[0-9A-F]{2}/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("out-of-range radical numbers fail gracefully", async ({ page }) => {
    await page.goto("/radicals/999");
    await expect(page.getByRole("heading", { name: /Invalid radical/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to radicals/i })).toBeVisible();
  });

  test("multi-radical picker narrows results with AND semantics", async ({ page }) => {
    await page.goto("/kanji");

    const picker = page.getByTestId("component-picker");
    await expect(picker).toBeVisible();

    // Select 言 → both 語 and 話 contain it.
    await picker.getByRole("button", { name: "言", exact: true }).click();
    await expect(page).toHaveURL(/components=/);
    await expect(page.getByTestId("result-total")).toHaveText("2");

    // Add 口 → only 語 contains BOTH.
    await picker.getByRole("button", { name: "口", exact: true }).click();
    await expect(page.getByTestId("result-total")).toHaveText("1");
    await expect(page.getByTestId("kanji-results")).toContainText("語");
    await expect(page.getByTestId("kanji-results")).not.toContainText("話");

    await expect(page.getByTestId("component-selection")).toContainText("言 + 口");

    // Deselecting widens the result set again.
    await picker.getByRole("button", { name: "口", exact: true }).click();
    await expect(page.getByTestId("result-total")).toHaveText("2");
  });

  test("a component selection is deep-linkable", async ({ page }) => {
    await page.goto("/kanji?components=%E8%A8%80,%E5%8F%A3");
    await expect(page.getByTestId("result-total")).toHaveText("1");
    await expect(page.getByTestId("kanji-results")).toContainText("語");
    // Selection state is restored from the URL.
    await expect(page.getByTestId("component-selection")).toContainText("言 + 口");
  });

  test("radicals are reachable from the global navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Radicals", exact: true }).click();
    await expect(page).toHaveURL(/\/radicals$/);
    await expect(
      page.getByRole("heading", { name: /The 214 building blocks/i }),
    ).toBeVisible();
  });
});
