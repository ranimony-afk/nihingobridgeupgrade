import { expect, test } from "@playwright/test";

test.describe("enterprise authentication", () => {
  test("renders password and registration controls and opens account recovery", async ({ page }) => {
    await page.goto("/auth/sign-in");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Password" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();

    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  });

  test("returns generic feedback for an invalid password login", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await page.getByLabel("Email address").fill("missing@example.com");
    await page.getByLabel("Password").fill("ValidPassword!42");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("status")).toContainText("Invalid credentials.");
  });
});
