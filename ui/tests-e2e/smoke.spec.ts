import { expect, test } from "@playwright/test";

test("/ loads, canvas mounts, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.waitForSelector("canvas", { timeout: 10_000 });
  await page.waitForTimeout(500);
  expect(errors, errors.join("\n")).toEqual([]);
  await page.screenshot({ path: "test-results/belt.png", fullPage: true });
});

test("/exoplanets loads, canvas mounts, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/exoplanets");
  await page.waitForSelector("canvas", { timeout: 10_000 });
  await page.waitForTimeout(500);
  expect(errors, errors.join("\n")).toEqual([]);
  await page.screenshot({ path: "test-results/exoplanets.png", fullPage: true });
});

test("#sel= deep-link populates SelectedPanel", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("canvas");
  // Pick any designation likely to exist in the populated data set.
  // Note: brackets around the id are CSS pseudo-elements (::before/::after), so
  // we match the span text content directly without the brackets.
  await page.goto("/#sel=100926");
  await expect(page.locator(".id-bracket").filter({ hasText: "100926" }).first()).toBeVisible({ timeout: 5_000 });
});
