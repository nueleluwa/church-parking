import { expect, test, type Page } from "@playwright/test";
import {
  adminSignIn,
  createStaff,
  guestCheckIn,
  live,
  memberSignUp,
  randomPhone,
  staffSignIn,
} from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

// The smallest phones we support, a common size, and a larger phone
const WIDTHS = [320, 360, 412];
const ILLUSTRATION_SELECTOR = 'img[src="/vehicle-illustration.png"]';

// The longest plate the app accepts (10 characters). Random each time, so a plate parked by
// an earlier test never blocks this one.
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const longPlate = () => `${letters(3)}${1000 + Math.floor(Math.random() * 9000)}${letters(3)}`;

/** Everything marked as a plate must be whole, on one line, inside the screen. */
async function expectPlatesWhole(page: Page, label: string, minFontPx = 18) {
  const report = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-plate]")].map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rect = el.getBoundingClientRect();
      return {
        text: el.textContent ?? "",
        lines: range.getClientRects().length,
        clipped: el.scrollWidth > el.clientWidth + 1,
        offScreen: rect.left < 0 || rect.right > window.innerWidth + 0.5,
        fontPx: parseFloat(getComputedStyle(el).fontSize),
      };
    }),
  );
  expect(report.length, `${label}: no plate found`).toBeGreaterThan(0);
  for (const p of report) {
    expect(p.lines, `${label}: "${p.text}" wrapped onto ${p.lines} lines`).toBe(1);
    expect(p.clipped, `${label}: "${p.text}" is clipped`).toBe(false);
    expect(p.offScreen, `${label}: "${p.text}" runs off the screen`).toBe(false);
    expect(p.fontPx, `${label}: "${p.text}" shrank to ${p.fontPx}px`).toBeGreaterThanOrEqual(minFontPx);
  }
}

/** No sideways scrolling, and no one-line fact has spilled outside its box. */
async function expectNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const spilled: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main *, header *, nav *")) {
      const style = getComputedStyle(el);
      if (style.whiteSpace !== "nowrap" || style.textOverflow === "ellipsis") continue;
      if (el.clientWidth <= 1) continue; // visually hidden on purpose (screen-reader text)
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (own && el.scrollWidth > el.clientWidth + 1) spilled.push(el.textContent?.trim().slice(0, 40) ?? "");
    }
    return { page: document.documentElement.scrollWidth - window.innerWidth, spilled };
  });
  expect(overflow.page, `${label}: the page scrolls sideways`).toBeLessThanOrEqual(0);
  expect(overflow.spilled, `${label}: text spills out of its box`).toEqual([]);
}

/** Car park names are never shortened with "...": they are the key fact for an attendant. */
async function expectAreaNamesWhole(page: Page, label: string) {
  const report = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-area]")].map((el) => ({
      text: el.textContent ?? "",
      cut: el.scrollWidth > el.clientWidth + 1,
    })),
  );
  expect(report.length, `${label}: no car park name found`).toBeGreaterThan(0);
  for (const a of report) expect(a.cut, `${label}: "${a.text}" is cut off`).toBe(false);
}

/** The header's pieces must not overlap each other or the sign-out button, and every tab label must fit its tab. */
async function expectHeaderAndTabsFit(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const header = document.querySelector("header");
    const group = header?.querySelectorAll<HTMLElement>("a, span[aria-hidden], span:not([aria-hidden])");
    const boxes = [...(group ?? [])]
      .filter((el) => el.getBoundingClientRect().width > 0 && !el.closest("[data-header-right]"))
      .map((el) => el.getBoundingClientRect());
    const button = header?.querySelector<HTMLElement>("[data-header-right]")?.getBoundingClientRect();
    const overlaps =
      button !== undefined &&
      boxes.some((b) => b.right > button.left + 0.5 && b.left < button.right - 0.5 && b.bottom > button.top && b.top < button.bottom);
    const tabs = [...document.querySelectorAll<HTMLElement>('nav[aria-label="Parking team"] a')].map((a) => ({
      text: a.textContent ?? "",
      cut: a.scrollWidth > a.clientWidth + 1,
    }));
    return { overlaps, offScreen: button ? button.right > window.innerWidth + 0.5 : false, tabs };
  });
  expect(result.overlaps, `${label}: the sign-out button overlaps the header`).toBe(false);
  expect(result.offScreen, `${label}: the sign-out button is off the screen`).toBe(false);
  for (const t of result.tabs) expect(t.cut, `${label}: tab "${t.text}" does not fit`).toBe(false);
}

test("attendant screens keep plates and facts on one line at every phone width", async ({ page, browser }) => {
  const LONG_PLATE = longPlate();
  await guestCheckIn(browser, LONG_PLATE);
  await guestCheckIn(browser, `${letters(3)}${100 + Math.floor(Math.random() * 900)}${letters(2)}`); // a normal Nigerian plate

  const attendant = await createStaff("attendant");
  const coordinator = await createStaff("coordinator");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });

      await page.goto("/staff/search");
      await page.getByLabel("Vehicle plate number").fill(LONG_PLATE);
      await page.getByRole("button", { name: "Search" }).click();
      await expect(page.getByText("VALID PASS").first()).toBeVisible({ timeout: 60_000 });
      await expectPlatesWhole(page, `scan card (long plate) at ${width}px`);
      await expectNoOverflow(page, `scan card at ${width}px`);
      await expectAreaNamesWhole(page, `scan card at ${width}px`);
      await expectHeaderAndTabsFit(page, `attendant header and tabs at ${width}px`);
    }
  } finally {
    await attendant.remove();
    await coordinator.remove();
  }
});

test("coordinator sweep, alerts and the pass keep plates on one line at every phone width", async ({
  page,
  browser,
}) => {
  const passUrl = await guestCheckIn(browser, longPlate());
  const coordinator = await createStaff("coordinator");
  try {
    await staffSignIn(page, coordinator.phone, coordinator.password);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/staff/sweep");
      await expect(page.getByRole("main").getByRole("heading", { name: "Sweep", exact: true })).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("[data-plate]").first()).toBeVisible({ timeout: 60_000 });
      await expectPlatesWhole(page, `sweep at ${width}px`, 16);
      await expectNoOverflow(page, `sweep at ${width}px`);
      await page.goto("/staff/dashboard");
      await expect(page.getByTestId("total-checked-in")).toBeVisible({ timeout: 60_000 });
      await expectNoOverflow(page, `live board at ${width}px`);
      await expectHeaderAndTabsFit(page, `coordinator header and 5 tabs at ${width}px`);
    }
  } finally {
    await coordinator.remove();
  }
  void passUrl;
});

test("the driver's pass, check-in and account keep plates on one line at every phone width", async ({
  page,
  browser,
}) => {
  // The driver's own phone: check in, then look at the pass
  const ctx = await browser.newContext();
  const driver = await ctx.newPage();
  await driver.goto("/c/cp1");
  await driver.getByRole("button", { name: "Continue as guest" }).click();
  await driver.getByLabel("Your name").fill("Layout Driver");
  await driver.getByLabel("Phone number").fill(randomPhone());
  await driver.getByLabel("Plate number").fill(longPlate());
  await driver.getByRole("button", { name: "Get my pass" }).click();
  // The "check your details" step shows the plate too
  await expect(driver.getByText("Please check your details")).toBeVisible();
  await driver.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(driver.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  for (const width of WIDTHS) {
    await driver.setViewportSize({ width, height: 800 });
    await expectPlatesWhole(driver, `pass at ${width}px`, 20);
    await expectNoOverflow(driver, `pass at ${width}px`);
    await expectAreaNamesWhole(driver, `pass at ${width}px`);
  }
  await ctx.close();

  // A member's saved cars and check-in
  await memberSignUp(page);
  await expect(page).toHaveURL(/welcome=1/, { timeout: 60_000 });
  await page.getByLabel("Plate number").fill(longPlate());
  await page.getByRole("button", { name: "Save car" }).click();
  await expect(page.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/account");
    await expect(page.locator("[data-plate]").first()).toBeVisible({ timeout: 60_000 });
    await expectPlatesWhole(page, `account at ${width}px`, 16);
    await expectNoOverflow(page, `account at ${width}px`);
  }
});

test("admin header and all six tabs fit at every phone width", async ({ page }) => {
  await adminSignIn(page);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/staff", "/staff/scan", "/admin", "/admin/areas"]) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "Parking team", exact: true }).locator("a")).toHaveCount(6, { timeout: 60_000 });
      await expectHeaderAndTabsFit(page, `admin ${path} at ${width}px`);
      await expectNoOverflow(page, `admin ${path} at ${width}px`);
    }
  }
});

test("member screens (choose a car, confirm, pass, my vehicles, history) fit at every phone width, with an undistorted picture", async ({
  page,
}) => {
  await memberSignUp(page);
  await expect(page).toHaveURL(/welcome=1/, { timeout: 60_000 });

  // Two cars, one with a very long make and model, to test the tightest case
  const cars: [string, string, string][] = [
    [longPlate(), "Mercedes-Benz E-Class Estate Limited Edition", "Metallic dark blue"],
    [`${letters(3)}${100 + Math.floor(Math.random() * 900)}${letters(2)}`, "Toyota Corolla", "Silver"],
  ];
  for (const [plate, make, colour] of cars) {
    await page.getByLabel("Plate number").fill(plate);
    await page.getByLabel(/Make and model/).fill(make);
    await page.getByLabel(/^Colour/).fill(colour);
    await page.getByRole("button", { name: "Save car" }).click();
    await expect(page.locator("[data-plate]").filter({ hasText: plate.slice(0, 3) })).toBeVisible({ timeout: 30_000 });
  }

  /** The picture keeps its shape: shown size has the same proportions as the file. */
  async function expectPictureUndistorted(label: string) {
    const pics = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('img[src="/vehicle-illustration.png"]')].map((i) => ({
        ratio: i.getBoundingClientRect().width / i.getBoundingClientRect().height,
        natural: i.naturalWidth / i.naturalHeight,
        width: i.getBoundingClientRect().width,
      })),
    );
    expect(pics.length, `${label}: no picture`).toBeGreaterThan(0);
    for (const p of pics) {
      expect(Math.abs(p.ratio - p.natural) / p.natural, `${label}: the picture is stretched`).toBeLessThan(0.03);
      expect(p.width, `${label}: the picture is tiny`).toBeGreaterThanOrEqual(40);
    }
  }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });

    await page.goto("/account");
    await expect(page.locator(ILLUSTRATION_SELECTOR).first()).toBeVisible({ timeout: 60_000 });
    await expectPlatesWhole(page, `my vehicles at ${width}px`, 16);
    await expectNoOverflow(page, `my vehicles at ${width}px`);
    await expectPictureUndistorted(`my vehicles at ${width}px`);

    await page.goto("/c/cp1");
    const list = page.getByRole("group", { name: "Your cars" });
    await expect(list).toBeVisible({ timeout: 60_000 });
    await expectPlatesWhole(page, `choose a car at ${width}px`, 16);
    await expectNoOverflow(page, `choose a car at ${width}px`);
    await expectPictureUndistorted(`choose a car at ${width}px`);

    await list.getByRole("button").first().click();
    await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();
    await expectPlatesWhole(page, `confirm at ${width}px`, 18);
    await expectNoOverflow(page, `confirm at ${width}px`);
    await expectAreaNamesWhole(page, `confirm at ${width}px`);
    await expectPictureUndistorted(`confirm at ${width}px`);
  }

  // Check in once, then check the pass and the history at every width
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  const passUrl = page.url();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(passUrl);
    await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expectPlatesWhole(page, `pass at ${width}px`, 20);
    await expectNoOverflow(page, `pass at ${width}px`);
    await expectAreaNamesWhole(page, `pass at ${width}px`);
    await expectPictureUndistorted(`pass at ${width}px`);

    await page.goto("/account?tab=history");
    await expect(page.getByRole("heading", { name: "Parking history" })).toBeVisible({ timeout: 60_000 });
    await expectNoOverflow(page, `history at ${width}px`);
  }
});
