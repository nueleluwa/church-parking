import { expect, test, type Browser, type Page } from "@playwright/test";
import { live, memberSignUp, randomPhone, randomPlate } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const QR = (page: Page) => page.getByRole("img", { name: "Your pass QR code" });

async function guestCheckIn(page: Page, plate: string, opts: { differentCar?: boolean } = {}) {
  await page.goto("/c/cp1");
  if (opts.differentCar) {
    await page.getByText("Check in a different car").click();
  } else {
    await page.getByRole("button", { name: "Continue as guest" }).click();
  }
  await page.getByLabel("Your name").fill("Ownership Guest");
  await page.getByLabel("Phone number").fill(randomPhone());
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Get my pass" }).click();
  await page.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  return new URL(page.url()).pathname;
}

async function signIn(browser: Browser, phone: string, pin: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/account/signin");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("PIN (4 numbers)", { exact: true }).fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/, { timeout: 60_000 });
  await expect(page).not.toHaveURL(/signin/);
  return page;
}

test("a guest who checks in a second car keeps the first car's pass and QR", async ({ page, browser }) => {
  const plateA = randomPlate("OA");
  const plateB = randomPlate("OB");
  const passA = await guestCheckIn(page, plateA);
  await expect(QR(page)).toBeVisible();

  const passB = await guestCheckIn(page, plateB, { differentCar: true });
  expect(passB).not.toBe(passA);
  await expect(QR(page)).toBeVisible();

  // Both passes still show their QR on this phone
  await page.goto(passA);
  await expect(QR(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("You are checked in")).toBeVisible();
  await expect(page.getByText("Lost this page? The attendant at the exit can find your car by its plate number.")).toBeVisible();

  // The check-in page offers a button for each pass
  await page.goto("/c/cp1");
  await expect(page.getByText("You already have passes on this phone.")).toBeVisible({ timeout: 60_000 });
  const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  await expect(page.getByRole("link", { name: `Show pass for ${spaced(plateA)}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Show pass for ${spaced(plateB)}` })).toBeVisible();

  // Checking in the same car again goes straight to its own pass, not to an error
  await page.getByText("Check in a different car").click();
  await page.getByLabel("Your name").fill("Ownership Guest");
  await page.getByLabel("Phone number").fill(randomPhone());
  await page.getByLabel("Plate number").fill(plateA);
  await page.getByRole("button", { name: "Get my pass" }).click();
  await page.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(page).toHaveURL(new RegExp(passA.replace("/", "\\/") + "$"), { timeout: 60_000 });
  await expect(QR(page)).toBeVisible();

  // Someone else with just the link sees the plate and status, and no QR
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(passA);
  await expect(stranger.getByText("Parking pass")).toBeVisible({ timeout: 60_000 });
  await expect(QR(stranger)).toHaveCount(0);
});

test("a member who signs in on another phone sees their own pass and QR; other people do not", async ({ page, browser }) => {
  const plate = randomPlate("OM");
  const phone = await memberSignUp(page, "4821");
  await expect(page).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Save car" }).click();
  await expect(page.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });

  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  const pass = new URL(page.url()).pathname;
  await expect(QR(page)).toBeVisible();

  // Another phone: signed in as the same member, with no cookie from the first phone
  const second = await signIn(browser, phone, "4821");
  await second.goto(pass);
  await expect(QR(second)).toBeVisible({ timeout: 60_000 });
  await expect(second.getByText("You are checked in")).toBeVisible();
  // ...and the home page and the check-in page both lead to a pass that shows the QR
  await second.goto("/");
  await second.getByRole("link", { name: "Show my pass" }).click();
  await expect(QR(second)).toBeVisible({ timeout: 60_000 });

  // A different member, signed in, sees only the public view
  const otherPage = await (await browser.newContext()).newPage();
  const otherPhone = await memberSignUp(otherPage, "9034");
  await expect(otherPage).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
  expect(otherPhone).not.toBe(phone);
  await otherPage.goto(pass);
  await expect(otherPage.getByText("Parking pass")).toBeVisible({ timeout: 60_000 });
  await expect(QR(otherPage)).toHaveCount(0);

  // And a signed-out visitor too
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(pass);
  await expect(stranger.getByText("Parking pass")).toBeVisible({ timeout: 60_000 });
  await expect(QR(stranger)).toHaveCount(0);
});
