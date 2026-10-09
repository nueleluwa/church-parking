import { expect, test, type Locator } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, live, memberSignUp, randomPlate, staffSignIn } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

// The colours from app/globals.css, as the browser reports them
const GREEN = "rgb(22, 101, 52)"; // --color-success
const RED = "rgb(179, 18, 27)"; // --color-danger
const WHITE = "rgb(255, 255, 255)";

const bg = (el: Locator) => el.evaluate((n) => getComputedStyle(n).backgroundColor);
const fg = (el: Locator) => el.evaluate((n) => getComputedStyle(n).color);

test("a valid pass is green with white text and a tick, a released one is not green, an expired one is red", async ({
  browser,
}) => {
  const plate = randomPlate("SC");
  const ctx = await browser.newContext();
  const driver = await ctx.newPage();
  await driver.goto("/c/cp1");
  await driver.getByLabel("Your name").fill("Colour Driver");
  await driver.getByLabel("Phone number").fill(`080${Math.floor(10000000 + Math.random() * 89999999)}`);
  await driver.getByLabel("Plate number").fill(plate);
  await driver.getByRole("button", { name: "Get my pass" }).click();
  await driver.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(driver.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });

  // VALID: green background, white text, and a check mark (an icon as well as colour)
  const banner = driver.getByRole("status").filter({ hasText: "VALID" }).first();
  expect(await bg(banner)).toBe(GREEN);
  expect(await fg(banner)).toBe(WHITE);
  await expect(banner.locator("svg")).toHaveCount(1);

  // The scanner card agrees: a valid pass has a green bar, a problem has a red bar
  const attendant = await createStaff("attendant");
  const page = await (await browser.newContext()).newPage();
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await page.goto("/staff/search");
    await page.getByLabel("Plate number, phone number or reference").fill(plate);
    await page.getByRole("button", { name: "Find car" }).click();
    const validBar = page.getByRole("status").filter({ hasText: "VALID PASS" });
    await expect(validBar).toBeVisible({ timeout: 60_000 });
    expect(await bg(validBar)).toBe(GREEN);

    // After the release the pass is finished, so it is no longer green
    await page.getByRole("button", { name: "Release car" }).click();
    const done = page.getByRole("status").filter({ hasText: "Car released" });
    await expect(done).toBeVisible({ timeout: 60_000 });

    await driver.reload();
    const released = driver.getByRole("status").filter({ hasText: "CAR RELEASED" }).first();
    await expect(released).toBeVisible({ timeout: 60_000 });
    expect(await bg(released)).not.toBe(GREEN);
    expect(await bg(released)).not.toBe(RED);

    // Searching again: "already released" is a problem for the scanner, so it is red
    await page.goto("/staff/search");
    await page.getByLabel("Plate number, phone number or reference").fill(plate);
    await page.getByRole("button", { name: "Find car" }).click();
    const problem = page.getByRole("status").filter({ hasText: "ALREADY RELEASED" });
    await expect(problem).toBeVisible({ timeout: 60_000 });
    expect(await bg(problem)).toBe(RED);
    expect(await fg(problem)).toBe(WHITE);
  } finally {
    await attendant.remove();
  }

  // An expired pass (an earlier day) is red. Make one by moving a parked visit to an old date.
  const db = adminClient();
  const plate2 = randomPlate("EX");
  const ctx2 = await browser.newContext();
  const d2 = await ctx2.newPage();
  await d2.goto("/c/cp1");
  await d2.getByLabel("Your name").fill("Old Pass");
  await d2.getByLabel("Phone number").fill(`080${Math.floor(10000000 + Math.random() * 89999999)}`);
  await d2.getByLabel("Plate number").fill(plate2);
  await d2.getByRole("button", { name: "Get my pass" }).click();
  await d2.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(d2.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  const token = d2.url().split("/p/")[1];
  const { error } = await db.from("visits").update({ service_date: "2026-01-04" }).eq("pass_token", token);
  expect(error).toBeNull();
  await d2.reload();
  const expired = d2.getByRole("status").filter({ hasText: "EXPIRED" }).first();
  await expect(expired).toBeVisible({ timeout: 60_000 });
  expect(await bg(expired)).toBe(RED);
  expect(await fg(expired)).toBe(WHITE);
  await expect(expired.locator("svg")).toHaveCount(1); // a warning icon, not colour alone

  await ctx.close();
  await ctx2.close();
});

test("a member's history shows a parked car in green and a finished visit in neutral grey", async ({ page, browser }) => {
  await memberSignUp(page);
  await expect(page).toHaveURL(/welcome=1/, { timeout: 60_000 });
  const plate = randomPlate("HS");
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Save car" }).click();
  await expect(page.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });
  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.goto("/account");

  const parked = page.getByText("Parked", { exact: true });
  await expect(parked).toBeVisible({ timeout: 60_000 });
  // The soft green pill: light green background with a green border
  expect(await parked.evaluate((n) => getComputedStyle(n.closest("span")!).borderColor)).toBe(GREEN);

  // Close it from the staff side, and the history turns neutral
  const admin = await (await browser.newContext()).newPage();
  await adminSignIn(admin);
  await admin.goto("/staff/search");
  await admin.getByLabel("Plate number, phone number or reference").fill(plate);
  await admin.getByRole("button", { name: "Find car" }).click();
  await admin.getByRole("button", { name: "Release car" }).click();
  await expect(admin.getByText("Car released")).toBeVisible({ timeout: 60_000 });

  await page.reload();
  const left = page.getByText("Left", { exact: true });
  await expect(left).toBeVisible({ timeout: 60_000 });
  expect(await left.evaluate((n) => getComputedStyle(n.closest("span")!).borderColor)).not.toBe(GREEN);
});
