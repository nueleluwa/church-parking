import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

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
  for (const path of ["/", "/c", "/c/cp1", "/account/signin", "/account/signup", "/staff/signin", new URL(passUrl).pathname]) {
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
  // The analytics, vehicles, visit details and settings screens, on a phone and on a wide screen
  const { data: visit } = await adminClient().from("visits").select("id").limit(1).single();
  const extra = ["/admin/analytics", "/admin/vehicles", `/admin/visits/${visit!.id}`, "/admin/settings"];
  for (const path of extra) await scan(page, path);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of extra) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} at 320px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ["/admin", "/admin/reports", ...extra]) await scan(page, path);
});

async function scanHere(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, `${label} has accessibility problems`).toEqual([]);
}

test("the screens with fact lists (the owner's pass and the attendant's result card) have none either", async ({ page, browser }) => {
  // The driver's own pass: the same phone that checked in
  const plate = randomPlate("AY");
  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await page.getByLabel("Your name").fill("Access Guest");
  await page.getByLabel("Phone number").fill(`080${Math.floor(10000000 + Math.random() * 89999999)}`);
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Get my pass" }).click();
  await scanHere(page, "the check-in review");
  await page.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  await scanHere(page, "the owner's pass");

  // The attendant's result card
  const attendant = await createStaff("attendant");
  try {
    const a = await (await browser.newContext()).newPage();
    await staffSignIn(a, attendant.phone, attendant.password);
    await a.goto("/staff/search");
    await a.getByLabel("Vehicle plate number").fill(plate);
    await a.getByRole("button", { name: "Search" }).click();
    await expect(a.getByRole("heading", { name: "Ready for exit" })).toBeVisible({ timeout: 60_000 });
    await scanHere(a, "the attendant's result card");
    await a.getByRole("button", { name: "Does not match" }).click();
    await expect(a.getByRole("heading", { name: "Car held" })).toBeVisible({ timeout: 60_000 });
    await scanHere(a, "the held car card");
  } finally {
    await attendant.remove();
  }
});
