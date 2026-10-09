import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

// Automated accessibility scan (axe, WCAG 2.0/2.1 A and AA). It finds a share of the problems only:
// keyboard use, screen-reader wording and sunlight legibility still need a person with a real phone.
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(600_000);

async function scan(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, `${path} has accessibility problems`).toEqual([]);
}

test("public and member screens have no automatically detectable accessibility problems", async ({ page, browser }) => {
  const passUrl = await guestCheckIn(browser, randomPlate("AX"));
  for (const path of ["/", "/c/cp1", "/account/signin", "/account/signup", "/staff/signin", new URL(passUrl).pathname]) {
    await scan(page, path);
  }
  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

test("attendant screens have no automatically detectable accessibility problems", async ({ page }) => {
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    for (const path of ["/staff", "/staff/scan", "/staff/search", "/staff/register", "/staff/history", "/staff/service", "/staff/more"]) {
      await scan(page, path);
    }
  } finally {
    await attendant.remove();
  }
});

test("coordinator and admin screens have no automatically detectable accessibility problems", async ({ page }) => {
  await adminSignIn(page);
  for (const path of ["/staff/dashboard", "/staff/sweep", "/admin", "/admin/reports", "/admin/services", "/admin/staff", "/admin/members?q=a", "/admin/signs", "/admin/signs/cp1", "/admin/areas"]) {
    await scan(page, path);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ["/admin", "/admin/reports"]) await scan(page, path);
});
