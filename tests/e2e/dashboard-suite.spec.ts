import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

async function visitIdOf(plate: string) {
  const { data } = await adminClient().from("visits").select("id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
  return data!.id as string;
}

test("analytics counts real visits, draws the charts with plain-words descriptions, and compares with the period before", async ({ page, browser }) => {
  const db = adminClient();
  await guestCheckIn(browser, randomPlate("AN"));
  await adminSignIn(page);
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Parking analytics" })).toBeVisible({ timeout: 60_000 });

  const { data: rows } = await db.from("visits").select("status, areas(name)").eq("service_date", today());
  const all = rows ?? [];
  await expect(page.getByTestId("a-checked-in")).toHaveText(String(all.length));
  await expect(page.getByTestId("a-released")).toHaveText(String(all.filter((r) => r.status === "released").length));
  await expect(page.getByTestId("a-missed")).toHaveText(String(all.filter((r) => r.status === "missed").length));

  // The time chart describes itself, and its hidden table adds up to the total
  const chart = page.getByRole("img", { name: /^Check-ins by time of day\. The busiest time was/ });
  await expect(chart).toBeVisible();
  const tableTotal = await page.locator("table.sr-only tbody tr td:nth-child(2)").evaluateAll((tds) =>
    tds.reduce((n, td) => n + Number(td.textContent), 0),
  );
  expect(tableTotal).toBe(all.length);

  // Visit outcomes ring: its parts add up to the total
  const ring = page.getByRole("img", { name: /^Visit outcomes: Currently parked \d+, Released \d+, Missed \d+\. Total \d+\./ });
  await expect(ring).toBeVisible();
  await expect(ring).toHaveAttribute("aria-label", new RegExp(`Total ${all.length}\\.`));

  // Car park usage, peak times and which car park fills first
  await expect(page.getByRole("region", { name: "Car park usage" }).getByText("Car Park 1")).toBeVisible();
  await expect(page.getByRole("region", { name: "Peak periods" }).getByText("Busiest", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Which car park fills first" }).getByText(/half full/).first()).toBeVisible();

  // A different period, and a bad one falls back to today
  await page.getByRole("link", { name: "Last 28 days" }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=/, { timeout: 60_000 });
  await expect(page.getByTestId("a-checked-in")).toBeVisible();
  await page.goto("/admin/analytics?from=nonsense&to=2026-01-01");
  await expect(page.getByRole("heading", { name: "Parking analytics" })).toBeVisible();

  // Fits a phone and a desktop with no sideways scrolling
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/analytics");
    await expect(page.getByTestId("a-checked-in")).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `analytics at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("vehicles: search by plate, member or guest, visit count, and no names or phone numbers", async ({ page, browser }) => {
  const plate = randomPlate("VH");
  await guestCheckIn(browser, plate);
  await adminSignIn(page);
  await page.goto("/admin/vehicles");
  await expect(page.getByRole("heading", { name: "Vehicles", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/The cars seen most recently/)).toBeVisible();

  await page.goto(`/admin/vehicles?q=${plate}`);
  const row = page.locator("li").filter({ hasText: spaced(plate) });
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  await expect(row).toContainText("Guest");
  await expect(row).toContainText("1 visit");
  await expect(row).toContainText("Parked");
  await expect(page.locator("main")).not.toContainText("Stability Guest");
  await expect(page.locator("main")).not.toContainText(/\+?234\d{9}|080\d{8}/);

  // Look-alike letters still find it, and an unknown plate says so
  await page.goto(`/admin/vehicles?q=${plate.replace(/[0-9]/, (d) => (d === "0" ? "O" : d))}`);
  await expect(page.locator("li").filter({ hasText: spaced(plate) })).toHaveCount(1);
  await page.goto("/admin/vehicles?q=ZZZ999ZZ");
  await expect(page.getByText("No car found with that plate.")).toBeVisible({ timeout: 60_000 });

  // Opening the car goes to its latest visit
  await page.goto(`/admin/vehicles?q=${plate}`);
  await page.getByRole("link", { name: `Latest visit of ${spaced(plate)}` }).click();
  await expect(page).toHaveURL(/\/admin\/visits\/[0-9a-f-]{36}$/, { timeout: 60_000 });
});

test("visit details: the facts, the driver masked until Show number (which is logged), and a timeline that follows a hold and a release", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("VD");
  await guestCheckIn(browser, plate);
  const id = await visitIdOf(plate);
  const attendant = await createStaff("attendant");
  const lead = await createStaff("coordinator");
  try {
    // The attendant puts it on hold, then a coordinator clears it, then the attendant releases it
    const a = await (await browser.newContext()).newPage();
    await staffSignIn(a, attendant.phone, attendant.password);
    await a.goto("/staff/search");
    await a.getByLabel("Vehicle plate number").fill(plate);
    await a.getByRole("button", { name: "Search" }).click();
    await a.getByRole("button", { name: "Does not match" }).click();
    await expect(a.getByRole("heading", { name: "Car held" })).toBeVisible({ timeout: 60_000 });

    await adminSignIn(page);
    await page.goto(`/admin/visits/${id}`);
    await expect(page.locator("[data-plate]").first()).toHaveText(spaced(plate), { timeout: 60_000 });
    await expect(page.getByText("ON HOLD", { exact: true })).toBeVisible();
    await expect(page.getByText("Currently parked")).toBeVisible();
    await expect(page.locator("[data-area]")).toHaveText(/Car Park 1|Roadside|Car Park 2/);

    // The driver: first name and last four only; the number is shown on request and the request is logged
    await expect(page.getByText("GUEST", { exact: true })).toBeVisible();
    await expect(page.getByText("Stability", { exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Stability Guest");
    await expect(page.getByText(/^•••• \d{4}$/)).toBeVisible();
    await page.getByRole("button", { name: "Show number" }).click();
    await expect(page.getByText(/^\+?\d{11,15}$/)).toBeVisible({ timeout: 30_000 });
    expect((await db.from("audit_events").select("id", { count: "exact", head: true }).eq("visit_id", id).eq("action", "reveal_phone")).count).toBe(1);

    // Clear the hold and release, then the timeline shows all of it in order
    await db.rpc("clear_hold", { p_visit: id, p_staff: (await db.from("staff").select("id").eq("phone", process.env.ADMIN_PHONE!).single()).data!.id, p_reason: "Driver showed their licence" });
    await a.goto("/staff/search");
    await a.getByLabel("Vehicle plate number").fill(plate);
    await a.getByRole("button", { name: "Search" }).click();
    await a.getByRole("button", { name: "Release car" }).click();
    await expect(a.getByRole("heading", { name: "Car released" })).toBeVisible({ timeout: 60_000 });

    await page.reload();
    await expect(page.getByText("Released", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    const events = await page.locator("section[aria-label='Timeline'] li span.min-w-0 > span.font-semibold").allInnerTexts();
    expect(events).toEqual(["Checked in", "Put on hold (Does not match)", "Phone number was shown", "Hold cleared", "Released"]);
    await expect(page.getByText("Reason: Driver showed their licence")).toBeVisible();
    await expect(page.getByText("Scanned pass").or(page.getByText("Looked up by hand (no pass)"))).toBeVisible();

    // Coordinators can open it; attendants cannot; a made-up id is not found
    const c = await (await browser.newContext()).newPage();
    await staffSignIn(c, lead.phone, lead.password);
    await c.goto(`/admin/visits/${id}`);
    await expect(c.locator("[data-plate]").first()).toBeVisible({ timeout: 60_000 });
    await a.goto(`/admin/visits/${id}`);
    await expect(a).toHaveURL(/\/staff$/, { timeout: 60_000 });
    await page.goto("/admin/visits/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "We cannot find that page" })).toBeVisible({ timeout: 60_000 });
    await page.goto("/admin/visits/not-an-id");
    await expect(page.getByRole("heading", { name: "We cannot find that page" })).toBeVisible({ timeout: 60_000 });
  } finally {
    await attendant.remove();
    await lead.remove();
  }
});

test("a report transaction opens its visit details", async ({ page, browser }) => {
  const plate = randomPlate("RV");
  await guestCheckIn(browser, plate);
  await adminSignIn(page);
  await page.goto("/admin/reports?view=visitors");
  await page.getByRole("link", { name: `Visit details for ${spaced(plate)}` }).click();
  await expect(page).toHaveURL(/\/admin\/visits\//, { timeout: 60_000 });
  await expect(page.locator("[data-plate]").first()).toHaveText(spaced(plate));
});

test("settings shows the rules in force and a log of what staff did, admin only", async ({ page, browser }) => {
  await adminSignIn(page);
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Service selection rules" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Pick the next service that starts within 30 minutes.")).toBeVisible();
  await expect(page.getByText("5 an hour")).toBeVisible();
  await expect(page.getByText("12 hours")).toBeVisible();
  await expect(page.getByText("180 days")).toBeVisible();
  await expect(page.getByText("Africa/Lagos (no clock changes)")).toBeVisible();

  const log = page.getByRole("region", { name: "Activity log table, scroll sideways on a small screen" });
  await expect(log.locator("tbody tr").first()).toBeVisible();
  expect(await log.locator("tbody tr").count()).toBeGreaterThan(0);
  await expect(page.locator("main")).not.toContainText(/\+?234\d{9}/);

  const lead = await createStaff("coordinator");
  try {
    const c = await (await browser.newContext()).newPage();
    await staffSignIn(c, lead.phone, lead.password);
    for (const path of ["/admin/settings", "/admin/analytics", "/admin/vehicles"]) {
      await c.goto(path);
      await expect(c).toHaveURL(/\/staff$/, { timeout: 60_000 });
    }
  } finally {
    await lead.remove();
  }
});

test("the side menu and the admin overview link to the four new screens, and Services shows the selection rules", async ({ page }) => {
  await adminSignIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  const side = page.getByRole("navigation", { name: "Parking team, desktop" });
  for (const name of ["Analytics", "Vehicles", "Settings"]) {
    await expect(side.getByRole("link", { name })).toBeVisible({ timeout: 60_000 });
  }
  await side.getByRole("link", { name: "Analytics" }).click();
  await expect(page).toHaveURL(/\/admin\/analytics/, { timeout: 60_000 });
  await expect(side.getByRole("link", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
  await page.goto("/admin/services");
  await expect(page.getByRole("heading", { name: "Service selection rules" })).toBeVisible({ timeout: 60_000 });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/admin");
  for (const row of ["Analytics", "Vehicles", "Settings"]) {
    await expect(page.locator("main").getByRole("link", { name: new RegExp(`^${row}`) })).toBeVisible({ timeout: 60_000 });
  }
});
