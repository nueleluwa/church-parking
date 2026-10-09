import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, live } from "./helpers";

test.setTimeout(240_000);

test("the home page leads with Check in, the camera is second, and the team sign-in is not shown to the public", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to Church Parking" })).toBeVisible();
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "Check in", exact: true })).toHaveAttribute("href", "/c");
  await expect(main.getByRole("link", { name: "Scan a car park sign" })).toHaveAttribute("href", "/scan");

  // Check in comes first (it is the red main button), the camera second
  const order = await main.locator("a").evaluateAll((links) => links.map((l) => l.textContent?.trim()));
  expect(order.indexOf("Check in")).toBeLessThan(order.indexOf("Scan a car park sign"));

  // Members can still sign in or join, but the parking team's sign-in is nowhere on the page
  await expect(main.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/account/signin");
  await expect(main.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/account/signup");
  await expect(page.getByText(/team sign-in/i)).toHaveCount(0);
  await expect(page.locator('a[href^="/staff"]')).toHaveCount(0);
});

test.describe("choosing a car park", () => {
  test.skip(!live, "needs .env.local with the Supabase key");

  test("/c lists the open car parks, and each one opens its own check-in", async ({ page }) => {
    const { data: areas } = await adminClient().from("areas").select("name, slug").eq("active", true).order("sort");
    expect(areas!.length).toBeGreaterThan(0);

    await page.goto("/c");
    await expect(page.getByRole("heading", { name: "Where are you parking?" })).toBeVisible({ timeout: 60_000 });
    for (const a of areas!) {
      await expect(page.getByRole("link", { name: a.name })).toHaveAttribute("href", `/c/${a.slug}`);
    }

    // Choosing one is the same page the car park's own QR sign opens
    const first = areas![0];
    await page.getByRole("link", { name: first.name }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${first.slug}$`), { timeout: 60_000 });
    await expect(page.getByText(first.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue as guest" })).toBeVisible();
  });

  test("the list page has no scanner, and the old scan link goes to the scanner page", async ({ page }) => {
    await page.goto("/c");
    await expect(page.getByRole("heading", { name: "Where are you parking?" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/scan a car park sign/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /scan/i })).toHaveCount(0);

    await page.goto("/c?scan=1");
    await expect(page).toHaveURL(new RegExp("/scan$"), { timeout: 60_000 });
  });

  test("the scanner page is its own screen: no car park list, a clear message when the camera is refused, and a way back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Scan a car park sign" }).click();
    await expect(page).toHaveURL(new RegExp("/scan$"), { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Scan the car park sign" })).toBeVisible();
    await expect(page.getByText("Where are you parking?")).toHaveCount(0);
    await expect(page.locator("a[href^='/c/']")).toHaveCount(0);

    // The test browser has no camera: the page says so and offers Try again, never a guess at the car park
    await expect(page.getByRole("alert").filter({ hasText: /camera/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp("/scan$"));

    await page.getByRole("link", { name: "Go back" }).click();
    await expect(page).toHaveURL(new RegExp("localhost:\\d+/$"), { timeout: 60_000 });
  });

  test("a switched-off car park is not offered", async ({ page }) => {
    const { data: off } = await adminClient().from("areas").select("name").eq("active", false);
    await page.goto("/c");
    await expect(page.getByRole("heading", { name: "Where are you parking?" })).toBeVisible({ timeout: 60_000 });
    for (const a of off ?? []) await expect(page.getByRole("link", { name: a.name })).toHaveCount(0);
  });
});

test("search engines are told to keep out of the team, admin, member and pass pages", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/User-Agent: \*/i);
  for (const path of ["/staff", "/admin", "/account", "/p/"]) expect(robots).toContain(`Disallow: ${path}`);
  expect(robots).toMatch(/Allow: \//);

  await page.goto("/staff/signin");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("the team installs its own app, Church Parking Team, which opens on /staff; drivers get Church Parking", async ({ page, request }) => {
  // The team's sign-in page offers the team app
  await page.goto("/staff/signin");
  const staffLinks = page.locator('link[rel="manifest"]');
  await expect(staffLinks).toHaveCount(1);
  await expect(staffLinks).toHaveAttribute("href", "/staff/manifest.webmanifest");

  const team = await (await request.get("/staff/manifest.webmanifest")).json();
  expect(team).toMatchObject({
    name: "Church Parking Team",
    short_name: "Parking Team",
    start_url: "/staff",
    scope: "/",
    display: "standalone",
  });
  expect(team.icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of team.icons) expect((await request.get(icon.src)).status()).toBe(200);

  // Drivers get the other one
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const drivers = await (await request.get("/manifest.webmanifest")).json();
  expect(drivers).toMatchObject({ name: "Church Parking", start_url: "/" });
});

test.describe("the general sign", () => {
  test.skip(!live, "needs .env.local with the Supabase key and admin login");

  test("an admin can print one QR code that opens the car park list", async ({ page }) => {
    await adminSignIn(page);
    await page.goto("/admin/signs");
    await expect(page.getByRole("heading", { name: "General sign" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: "Open the general sign to print" }).click();
    await expect(page).toHaveURL(/\/admin\/signs\/general$/, { timeout: 60_000 });

    const sign = page.getByRole("article", { name: "The general sign" });
    await expect(sign.getByText("PARKING CHECK-IN")).toBeVisible();
    await expect(sign.getByText("Scan this code, then choose your car park.")).toBeVisible();
    await expect(sign.getByRole("img", { name: "QR code to choose your car park" }).locator("svg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Print this sign" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "General Sign" })).toBeVisible();

    // Printing leaves only the sign
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(page.getByRole("button", { name: "Print this sign" })).toBeHidden();
    await expect(sign).toBeVisible();
  });
});

test("the new front door fits every phone width with no sideways scrolling", async ({ page }) => {
  for (const width of [320, 360, 412]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/", "/c", "/scan"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
