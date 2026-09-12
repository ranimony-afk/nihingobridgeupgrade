import { expect, test } from "@playwright/test";

/**
 * Browser end-to-end: the homepage as a user actually receives it.
 *
 * These assertions cover what an HTTP fetch cannot see — hydration, runtime
 * console errors, and the rendered accessibility tree.
 */

test.describe("homepage", () => {
  test("loads successfully", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("renders visible content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).not.toBeEmpty();

    const text = (await page.locator("body").innerText()).trim();
    expect(text.length).toBeGreaterThan(20);
  });

  test("exposes a document title and language", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
  });

  test("has exactly one top-level heading", async ({ page }) => {
    await page.goto("/");
    // One h1 per document is the baseline accessibility expectation.
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("hydrates without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/", { waitUntil: "networkidle" });
    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("does not surface a server error page", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Internal Server Error|Application error/i);
  });
});

test.describe("health endpoint", () => {
  test("returns ok through the browser stack", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

test.describe("routing", () => {
  test("unknown pages render the not-found view", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
