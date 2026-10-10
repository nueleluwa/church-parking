import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, guestCheckIn, live, randomPlate } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

async function openBoard(page: Page) {
  await adminSignIn(page);
  await page.goto("/staff/dashboard");
  await expect(page.getByRole("heading", { name: "Live Parking" })).toBeVisible({ timeout: 60_000 });
}

test("the live board: header, four summary numbers that agree with the car parks, and text-only car park cards", async ({ page }) => {
  await openBoard(page);
  await expect(page.getByText("Real-time view of vehicle activity")).toBeVisible();
  await expect(page.getByTestId("updated")).toContainText("Live");
  await expect(page.getByLabel("Service")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();

  const areas = page.getByRole("region", { name: "Parking areas" });
  await expect(areas.getByRole("heading", { name: "Parking Areas" })).toBeVisible();

  // No pictures, and no percentage or capacity figure, in the car park cards
  expect(await areas.locator("img, picture, video, canvas").count()).toBe(0);
  await expect(areas).not.toContainText(/%|spaces|capacity|full/i);

  // The totals are the sum of the car parks
  const total = async (id: string) => Number(await page.getByTestId(id).innerText());
  const column = async (label: string) =>
    (await areas.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd").allInnerTexts()).map(Number);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  expect(await total("total-checked-in")).toBe(sum(await column("Checked in")));
  expect(await total("total-left")).toBe(sum(await column("Left")));
  expect(await total("total-parked")).toBe(sum(await column("Still parked")));
  await expect(page.getByTestId("total-alerts")).toHaveText(/^\d+$/);
});

test("Refresh asks only for fresh numbers, and a car park card and View all vehicles open the visits", async ({ page }) => {
  await openBoard(page);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "fetch" || r.resourceType() === "document") requests.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((r) => r === "GET /staff/dashboard/data")).toBe(true);
  await expect(page).toHaveURL(/\/staff\/dashboard$/);

  await page.getByRole("link", { name: /see the cars parked here/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/visits\?area=[a-z0-9-]+&status=parked/, { timeout: 60_000 });
  await page.goBack();
  await page.getByRole("link", { name: "View all vehicles" }).click();
  await expect(page).toHaveURL(/\/admin\/visits\?status=parked/, { timeout: 60_000 });
});

test("the service chooser lists the real services and switches the numbers without reloading", async ({ page }) => {
  const db = adminClient();
  const name = `Board test ${Math.floor(Math.random() * 100000)}`;
  const { data: extra } = await db
    .from("services")
    .insert({ name, weekday: new Date().getUTCDay(), starts_at: "00:00", ends_at: "23:59", active: true })
    .select("id")
    .single();
  try {
    await openBoard(page);
    const select = page.getByLabel("Service");
    await expect(select.locator("option", { hasText: name })).toHaveCount(1);
    const seen: string[] = [];
    page.on("request", (r) => seen.push(r.url()));
    await select.selectOption(String(extra!.id));
    await expect.poll(() => seen.some((u) => u.includes(`/staff/dashboard/data?service=${extra!.id}`)), { timeout: 15_000 }).toBe(true);
    await expect(select).toHaveValue(String(extra!.id));
    await expect(page).toHaveURL(/\/staff\/dashboard$/);
  } finally {
    await db.from("services").delete().eq("id", extra!.id);
  }
});

test("an alert shows what happened, where, the car, and Investigate opens the visit; dealing with it removes it", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("LV");
  await guestCheckIn(browser, plate);
  const { data: visit } = await db.from("visits").select("id, area_id, service_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
  await db.from("vehicles").update({ make: "Toyota Corolla", colour: "Silver" }).eq("plate", plate);
  const { data: alert } = await db
    .from("alerts")
    .insert({ kind: "member_plate_claim", visit_id: visit!.id, plate, detail: { area_id: visit!.area_id, service_id: visit!.service_id } })
    .select("id")
    .single();

  try {
    await openBoard(page);
    const row = page.locator("li").filter({ hasText: "A guest tried to check in a member" }).filter({ hasText: spaced(plate) });
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await expect(row).toContainText("The plate belongs to a member");
    await expect(row).toContainText("Toyota Corolla");
    await expect(row).toContainText("Silver");
    await expect(row).toContainText(/\d\d:\d\d/);
    await expect(row.locator("[data-plate]")).toBeVisible();

    // Investigate goes to the visit; the page names no member or driver
    await row.getByRole("link", { name: "Investigate" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/visits/${visit!.id}$`), { timeout: 60_000 });
    await expect(page.locator("main")).not.toContainText(/\+?234\d{9}|080\d{8}/);

    await page.goBack();
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await row.getByRole("button", { name: "Mark as dealt with" }).click();
    await expect(row).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(async () => (await db.from("alerts").select("resolved_at").eq("id", alert!.id).single()).data!.resolved_at).not.toBeNull();
  } finally {
    await db.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("id", alert!.id);
  }
});

test("a conflict alert, which has no visit of its own, investigates by plate", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("LC");
  await guestCheckIn(browser, plate);
  const { data: visit } = await db.from("visits").select("area_id, service_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
  const { data: alert } = await db
    .from("alerts")
    .insert({ kind: "plate_conflict", plate, detail: { area_id: visit!.area_id, service_id: visit!.service_id } })
    .select("id")
    .single();
  try {
    await openBoard(page);
    const row = page.locator("li").filter({ hasText: "Second check-in for a car already checked in" }).filter({ hasText: spaced(plate) });
    await expect(row).toHaveCount(1, { timeout: 30_000 });
    await row.getByRole("link", { name: "Investigate" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/visits\\?q=${plate}`), { timeout: 60_000 });
    await expect(page.locator("li").filter({ hasText: spaced(plate) })).toHaveCount(1, { timeout: 60_000 });
  } finally {
    await db.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("id", alert!.id);
  }
});

test("the live board fits every width from 320 to 1440 with nothing cut off", async ({ page }) => {
  await adminSignIn(page);
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/staff/dashboard");
    await expect(page.getByRole("heading", { name: "Live Parking" })).toBeVisible({ timeout: 60_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `live board at ${width}px`).toBeLessThanOrEqual(0);

    // The header controls do not overlap one another
    const boxes = await page
      .getByRole("heading", { name: "Live Parking" })
      .locator("xpath=ancestor::header[1]//*[self::p or self::label or self::button]")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const nested =
          (a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom) ||
          (b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom);
        expect(overlap && !nested, `controls overlap at ${width}px`).toBe(false);
      }
    }
  }
});
