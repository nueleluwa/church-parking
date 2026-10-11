import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

async function visitIdOf(plate: string) {
  const { data } = await adminClient().from("visits").select("id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
  return data!.id as string;
}

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
    await page.goto(`/admin/visits/${id}?tab=driver`);
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

    await page.goto(`/admin/visits/${id}`);
    await expect(page.getByText("Released", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Scanned pass").or(page.getByText("Looked up by hand (no pass)"))).toBeVisible();
    await page.goto(`/admin/visits/${id}?tab=timeline`);
    const events = await page.locator("section[aria-label='Timeline'] li span.min-w-0 > span.font-semibold").allInnerTexts();
    expect(events).toEqual(["Checked in", "Put on hold (Does not match)", "Phone number was shown", "Hold cleared", "Released"]);
    await expect(page.getByText("Reason: Driver showed their licence")).toBeVisible();

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
