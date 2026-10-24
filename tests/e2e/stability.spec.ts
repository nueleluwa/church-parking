import { expect, test } from "@playwright/test";
import {
  adminSignIn,
  createStaff,
  guestCheckIn,
  live,
  memberSignUp,
  observe,
  randomPhone,
  randomPlate,
  staffSignIn,
} from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const WATCH_SECONDS = 22; // longer than every polling interval in the app

function expectCalm(result: Awaited<ReturnType<typeof observe>>, label: string) {
  expect(result.loads, `${label}: the page was reloaded`).toBe(0);
  expect(result.markerSurvived, `${label}: the document was replaced`).toBe(true);
  expect(result.headerStillThere, `${label}: the header was rebuilt`).toBe(true);
  expect(result.headerRemoved, `${label}: the header was torn down`).toBe(0);
  expect(result.urlChanged, `${label}: the page navigated away`).toBe(false);
}

test.describe("background updates never interrupt the user", () => {
  test("member: account page keeps typed text and stays put", async ({ page }) => {
    await memberSignUp(page);
    await expect(page).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
    await page.getByLabel("Plate number").fill("TYPING");
    await page.evaluate(() => window.scrollTo(0, 120));

    const result = await observe(page, WATCH_SECONDS);
    expectCalm(result, "member account");
    await expect(page.getByLabel("Plate number")).toHaveValue("TYPING");
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(result.requests, "member account should make no background calls").toEqual([]);
  });

  test("member: check-in page keeps the selected car, and the open pass only checks its status", async ({
    page,
    browser,
  }) => {
    await memberSignUp(page);
    await expect(page).toHaveURL(/welcome=1/, { timeout: 60_000 });
    await page.getByLabel("Plate number").fill(randomPlate("ST"));
    await page.getByRole("button", { name: "Save car" }).click();
    await expect(page.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Plate number").fill(randomPlate("S2"));
    await page.getByRole("button", { name: "Save car" }).click();
    // Wait until BOTH cars are listed: the first "Car saved." message may still be on screen
    await expect(page.locator("[data-plate]")).toHaveCount(2, { timeout: 30_000 });
    await page.goto("/c/cp1");

    // Two cars: tap one, and the confirmation for that car appears (the first of the two taps)
    const cars = page.getByRole("group", { name: "Your cars" }).getByRole("button");
    await cars.first().click();
    await expect(page.getByRole("button", { name: "Check in" })).toBeVisible({ timeout: 30_000 });
    const result = await observe(page, WATCH_SECONDS);
    expectCalm(result, "member check-in");
    await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();

    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
    const pass = await observe(page, WATCH_SECONDS);
    expectCalm(pass, "member pass");
    // Only tiny status checks, never the page itself
    expect(pass.requests.every((r) => r.endsWith("/status"))).toBe(true);
    expect(pass.requests.length).toBeLessThanOrEqual(3);
    void browser;
  });

  test("attendant: scan, search and register keep what was typed", async ({ page }) => {
    const attendant = await createStaff("attendant");
    try {
      await staffSignIn(page, attendant.phone, attendant.password);
      await page.goto("/staff/scan");
      await expect(page.getByRole("heading", { name: "Scan Pass" })).toBeVisible({ timeout: 60_000 });
      expectCalm(await observe(page, WATCH_SECONDS), "attendant scanner");

      await page.goto("/staff/search");
      await expect(page.getByRole("heading", { name: "Manual Lookup" })).toBeVisible({ timeout: 60_000 });
      await page.getByLabel("Vehicle plate number").fill("PARTIAL");
      const search = await observe(page, WATCH_SECONDS);
      expectCalm(search, "attendant search");
      await expect(page.getByLabel("Vehicle plate number")).toHaveValue("PARTIAL");
      expect(search.requests).toEqual([]);

      await page.goto("/staff/register");
      await expect(page.getByRole("heading", { name: "Add car" })).toBeVisible({ timeout: 60_000 });
      await page.getByLabel("Plate number").fill("HALFWAY");
      await page.getByLabel("Name (if they want to give it)").fill("Half Typed");
      const register = await observe(page, WATCH_SECONDS);
      expectCalm(register, "attendant register");
      await expect(page.getByLabel("Plate number")).toHaveValue("HALFWAY");
      await expect(page.getByLabel("Name (if they want to give it)")).toHaveValue("Half Typed");
    } finally {
      await attendant.remove();
    }
  });

  test("coordinator: live board updates its numbers in place, keeping the chosen service and scroll", async ({
    page,
  }) => {
    const coordinator = await createStaff("coordinator");
    try {
      await staffSignIn(page, coordinator.phone, coordinator.password);
      await page.goto("/staff/dashboard");
      await expect(page.getByTestId("total-checked-in")).toBeVisible({ timeout: 60_000 });
      await page.evaluate(() => window.scrollTo(0, 60));

      const result = await observe(page, WATCH_SECONDS);
      expectCalm(result, "live board");
      // It polls a small data feed, never the page
      expect(result.requests.every((r) => r === "GET /staff/dashboard/data")).toBe(true);
      expect(result.requests.length).toBeGreaterThan(3);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      await page.goto("/staff/sweep");
      await expect(page.getByRole("main").getByRole("heading", { name: "Sweep", exact: true })).toBeVisible({ timeout: 60_000 });
      expectCalm(await observe(page, WATCH_SECONDS), "sweep");
    } finally {
      await coordinator.remove();
    }
  });

  test("admin: live board stays calm too", async ({ page }) => {
    await adminSignIn(page);
    await page.goto("/staff/dashboard");
    await expect(page.getByTestId("total-checked-in")).toBeVisible({ timeout: 60_000 });
    expectCalm(await observe(page, WATCH_SECONDS), "admin live board");
  });

  test("guest pass: stays put while open, and only checks its status", async ({ browser }) => {
    const driver = await browser.newContext();
    const dp = await driver.newPage();
    await dp.goto("/c/cp1");
    await dp.getByRole("button", { name: "Continue as guest" }).click();
    await dp.getByLabel("Your name").fill("Driver");
    await dp.getByLabel("Phone number").fill(randomPhone());
    await dp.getByLabel("Plate number").fill(randomPlate("DR"));
    await dp.getByRole("button", { name: "Get my pass" }).click();
    await dp.getByRole("button", { name: "Yes, get my pass" }).click();
    await expect(dp.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
    const pass = await observe(dp, WATCH_SECONDS);
    expectCalm(pass, "guest pass");
    expect(pass.requests.every((r) => r.endsWith("/status"))).toBe(true);
    await driver.close();
  });
});

test.describe("what the user typed survives a server response", () => {
  test("guest check-in: details are kept when the car is already checked in", async ({ browser }) => {
    const plate = randomPlate("KP");
    await guestCheckIn(browser, plate);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const phone = randomPhone();
    await page.goto("/c/cp2");
    await page.getByRole("button", { name: "Continue as guest" }).click();
    await page.getByLabel("Your name").fill("Second Person");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByLabel("Plate number").fill(plate);
    await page.getByRole("button", { name: "Get my pass" }).click();
    await page.getByRole("button", { name: "Yes, get my pass" }).click();
    await expect(page.getByText("This car is already checked in.")).toBeVisible({ timeout: 60_000 });

    // Going back shows the form again with everything still filled in
    await page.getByRole("button", { name: "Go back" }).click();
    await expect(page.getByLabel("Your name")).toHaveValue("Second Person");
    await expect(page.getByLabel("Phone number")).toHaveValue(phone);
    await expect(page.getByLabel("Plate number")).toHaveValue(plate);
    await ctx.close();
  });

  test("sign-up: name and phone are kept when the number already has an account", async ({ browser }) => {
    const first = await browser.newContext();
    const taken = await memberSignUp(await first.newPage());
    await first.close();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/account/signup");
    await page.getByLabel("Your name").fill("Someone Else");
    await page.getByLabel("Phone number").fill(taken);
    await page.getByLabel("Choose a PIN (4 numbers)").fill("1357");
    await page.getByLabel("Type the PIN again").fill("1357");
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.getByText("This phone number already has an account.")).toBeVisible({ timeout: 60_000 });

    await expect(page.getByLabel("Your name")).toHaveValue("Someone Else");
    await expect(page.getByLabel("Phone number")).toHaveValue(taken);
    await ctx.close();
  });

  test("sign-in: the phone number is kept after a wrong PIN", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const phone = randomPhone();
    await page.goto("/account/signin");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByLabel("PIN (4 numbers)").fill("0000");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Phone number or PIN is wrong.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel("Phone number")).toHaveValue(phone);
    await ctx.close();
  });

  test("staff sign-in: the phone number is kept after a wrong password", async ({ page }) => {
    const phone = randomPhone();
    await page.goto("/staff/signin");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Phone number or password is wrong.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel("Phone number")).toHaveValue(phone);
  });

  test("member account: a saved car appears in the list without leaving the page", async ({ page }) => {
    await memberSignUp(page);
    await expect(page).toHaveURL(/welcome=1/, { timeout: 60_000 });
    await page.evaluate(() => ((window as unknown as Record<string, unknown>).__keep = "same document"));
    const plate = randomPlate("LS");
    await page.getByLabel("Plate number").fill(plate);
    await page.getByRole("button", { name: "Save car" }).click();
    await expect(page.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });
    // The list updates in place, and the page was not reloaded
    await expect(page.getByText(`${plate.slice(0, 3)} ${plate.slice(3, 6)} ${plate.slice(6)}`)).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__keep)).toBe("same document");
  });
});

test.describe("moving between pages never makes the header or tab bar disappear", () => {
  /** Counts the moments the header (or tab bar) was missing from the page while it changed. */
  async function watchForGaps(page: import("@playwright/test").Page) {
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__headerGaps = 0;
      w.__navGaps = 0;
      w.__navNode = document.querySelector("nav[aria-label='Parking team']");
      new MutationObserver(() => {
        if (!document.querySelector("header")) (w.__headerGaps as number)++;
        if (w.__navNode && !document.querySelector("nav[aria-label='Parking team']")) (w.__navGaps as number)++;
      }).observe(document.documentElement, { childList: true, subtree: true });
    });
  }
  const gaps = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return {
        header: w.__headerGaps as number,
        nav: w.__navGaps as number,
        sameNav: w.__navNode ? (w.__navNode as Element).isConnected : true,
      };
    });

  test("staff: tapping the tabs keeps the header and the tab bar in place", async ({ page }) => {
    await adminSignIn(page);
    await expect(page.getByRole("navigation", { name: "Parking team" })).toBeVisible({ timeout: 60_000 });
    await watchForGaps(page);

    for (const [tab, url] of [
      ["History, recent scans", /\/staff\/history$/],
      ["Live board", /\/staff\/dashboard$/],
      ["Sweep", /\/staff\/sweep$/],
      ["Admin", /\/admin$/],
      ["More", /\/staff\/more$/],
      ["Scan pass", /\/staff$/],
    ] as const) {
      await page.getByRole("link", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(url, { timeout: 60_000 });
    }
    const g = await gaps(page);
    expect(g.header, "the header disappeared while moving between staff pages").toBe(0);
    expect(g.nav, "the tab bar disappeared while moving between staff pages").toBe(0);
    expect(g.sameNav, "the tab bar was rebuilt").toBe(true);
  });

  test("public pages: the header is always on screen while moving around", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome to Church Parking" })).toBeVisible({ timeout: 60_000 });
    await watchForGaps(page);

    await page.locator("main").getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible({ timeout: 60_000 });

    const g = await gaps(page);
    expect(g.header, "the header disappeared while moving between public pages").toBe(0);
  });
});
