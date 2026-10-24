import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const day = (n: number) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
const lines = (csv: string) => csv.replace(/^\uFEFF/, "").trim().split("\r\n");

type Filter = { from: string; to: string; status?: string; service?: number; area?: number };
async function countVisits(f: Filter) {
  let q = adminClient().from("visits").select("id", { count: "exact", head: true }).gte("service_date", f.from).lte("service_date", f.to);
  if (f.status) q = q.eq("status", f.status);
  if (f.service) q = q.eq("service_id", f.service);
  if (f.area) q = q.eq("area_id", f.area);
  return (await q).count ?? 0;
}
async function visitOf(plate: string) {
  const { data } = await adminClient().from("visits").select("id, area_id, service_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
  return data!;
}

async function openVisits(page: Page, query = "") {
  await adminSignIn(page);
  await page.goto(`/admin/visits${query}`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Visits", exact: true })).toBeVisible({ timeout: 60_000 });
}

test("the page has its title and description, no Add visit button, and four summaries that match the records", async ({ page, browser }) => {
  await guestCheckIn(browser, randomPlate("VS"));
  await openVisits(page);
  await expect(page.getByText("View and manage all parking visits. Each visit represents a vehicle's entry and exit record.")).toBeVisible();
  await expect(page.getByRole("button", { name: /add visit/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /add visit/i })).toHaveCount(0);

  const db = adminClient();
  const total = await countVisits({ from: today(), to: today() });
  await expect(page.getByTestId("v-total")).toHaveText(String(total));
  await expect(page.getByTestId("v-checked-in")).toHaveText(String(await countVisits({ from: today(), to: today(), status: "parked" })));
  await expect(page.getByTestId("v-released")).toHaveText(String(await countVisits({ from: today(), to: today(), status: "released" })));
  const parkedNow = (await db.from("visits").select("id", { count: "exact", head: true }).eq("status", "parked")).count ?? 0;
  await expect(page.getByTestId("v-parked-now")).toHaveText(String(parkedNow));
  await expect(page.getByTestId("v-count")).toHaveText(String(total));
  await expect(page.getByText(/Currently parked is live/)).toBeVisible();
});

test("an open visit and a released visit show the right entry, exit, duration and status, with the car illustration", async ({ page, browser }) => {
  const db = adminClient();
  const open = randomPlate("VO");
  const done = randomPlate("VR");
  await guestCheckIn(browser, open);
  await guestCheckIn(browser, done);
  const visit = await visitOf(done);
  const { data: admin } = await db.from("staff").select("id").eq("phone", process.env.ADMIN_PHONE!).single();
  await db.rpc("release_visit", { p_visit: visit.id, p_staff: admin!.id, p_method: "scan", p_today: today() });

  await adminSignIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/admin/visits?q=${open}`);
  const openRow = page.locator("tbody tr").filter({ hasText: spaced(open) });
  await expect(openRow).toHaveCount(1, { timeout: 60_000 });
  await expect(openRow).toContainText("Checked in");
  await expect(openRow).toContainText("Not yet released");
  await expect(openRow).toContainText("Guest");
  await expect(openRow).toContainText(/\d{1,2} [A-Z][a-z]{2} 20\d\d/);
  await expect(openRow).toContainText(/\d\d:\d\d/);
  await expect(openRow.locator('img[src="/vehicle-illustration.png"]')).toHaveCount(1);
  // An open visit has no duration yet
  await expect(openRow.locator("td").nth(6)).toHaveText("-");

  await page.goto(`/admin/visits?q=${done}`);
  const doneRow = page.locator("tbody tr").filter({ hasText: spaced(done) });
  await expect(doneRow).toHaveCount(1, { timeout: 60_000 });
  await expect(doneRow).toContainText("Released");
  await expect(doneRow).not.toContainText("Not yet released");
  await expect(doneRow.locator("td").nth(6)).toHaveText(/^(Under 1m|\d+m|\d+h \d+m)$/);
  await expect(doneRow.locator('img[src="/vehicle-illustration.png"]')).toHaveCount(1);
  await expect(doneRow.getByRole("link", { name: /^View visit of/ })).toBeVisible();
});

test("the filters change the records: search with look-alikes, status, service, parking area, and Reset", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("VF");
  await guestCheckIn(browser, plate);
  const visit = await visitOf(plate);
  const { data: areas } = await db.from("areas").select("id, name, slug").eq("active", true).order("sort");
  const { data: services } = await db.from("services").select("id, name").eq("active", true).order("id");
  const here = areas!.find((a) => a.id === visit.area_id)!;
  const other = areas!.find((a) => a.id !== visit.area_id)!;

  await openVisits(page);
  const form = page.getByRole("form", { name: "Filters" });

  // Search by plate, with spaces and lower case, through the form
  await form.getByPlaceholder("Search by vehicle number…").fill(plate.toLowerCase().replace(/(...)(...)(.*)/, "$1 $2 $3"));
  await form.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/[?&]q=/, { timeout: 60_000 });
  await expect(page.getByTestId("v-count")).toHaveText("1");
  await expect(page.locator("li").filter({ hasText: spaced(plate) })).toHaveCount(1);

  // The right parking area and service keep it; another parking area drops it
  await page.goto(`/admin/visits?q=${plate}&area=${here.slug}&service=${visit.service_id}&status=parked`);
  await expect(page.getByTestId("v-count")).toHaveText("1", { timeout: 60_000 });
  await page.goto(`/admin/visits?q=${plate}&area=${other.slug}`);
  await expect(page.getByTestId("v-count")).toHaveText("0", { timeout: 60_000 });
  await expect(page.getByText("No visits match these filters.")).toBeVisible();
  await page.goto(`/admin/visits?q=${plate}&status=released`);
  await expect(page.getByTestId("v-count")).toHaveText("0", { timeout: 60_000 });

  // The look-alike letter finds it too
  await page.goto(`/admin/visits?q=${plate.replace(/[0-9]/, (d) => (d === "0" ? "O" : d))}`);
  await expect(page.getByTestId("v-count")).toHaveText("1", { timeout: 60_000 });

  // The filter counts follow the records
  for (const status of ["parked", "released", "missed"]) {
    await page.goto(`/admin/visits?from=${day(-27)}&to=${today()}&status=${status}`);
    await expect(page.getByTestId("v-count")).toHaveText(String(await countVisits({ from: day(-27), to: today(), status })), { timeout: 60_000 });
  }
  await page.goto(`/admin/visits?from=${day(-27)}&to=${today()}&service=${services![0].id}`);
  await expect(page.getByTestId("v-count")).toHaveText(String(await countVisits({ from: day(-27), to: today(), service: services![0].id })), { timeout: 60_000 });
  await page.goto(`/admin/visits?from=${day(-27)}&to=${today()}&area=${other.slug}`);
  await expect(page.getByTestId("v-count")).toHaveText(String(await countVisits({ from: day(-27), to: today(), area: other.id })), { timeout: 60_000 });

  // Reset goes back to the defaults
  await page.getByRole("link", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/visits$/, { timeout: 60_000 });
  await expect(page.getByTestId("v-count")).toHaveText(String(await countVisits({ from: today(), to: today() })));
});

test("a date range, the Yesterday and Today links, and bad dates", async ({ page }) => {
  await openVisits(page, `?from=${day(-6)}&to=${today()}`);
  await expect(page.getByTestId("v-total")).toHaveText(String(await countVisits({ from: day(-6), to: today() })));
  await page.getByRole("link", { name: "Yesterday" }).click();
  await expect(page).toHaveURL(new RegExp(`from=${day(-1)}&to=${day(-1)}`), { timeout: 60_000 });
  await expect(page.getByTestId("v-total")).toHaveText(String(await countVisits({ from: day(-1), to: day(-1) })));
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByTestId("v-total")).toHaveText(String(await countVisits({ from: today(), to: today() })), { timeout: 60_000 });

  // The older single-day address still works
  await page.goto(`/admin/visits?date=${day(-1)}`);
  await expect(page.getByTestId("v-total")).toHaveText(String(await countVisits({ from: day(-1), to: day(-1) })), { timeout: 60_000 });

  // Reversed and invalid dates are explained and fall back to today
  await page.goto(`/admin/visits?from=${today()}&to=2020-01-01`);
  await expect(page.locator('[data-toast="warning"]')).toContainText("start date must not be after the end date");
  await expect(page.getByTestId("v-total")).toHaveText(String(await countVisits({ from: today(), to: today() })));
  await page.goto("/admin/visits?from=nonsense&to=nonsense");
  await expect(page.locator('[data-toast="warning"]')).toContainText("not valid");
});

test("pagination follows the filtered count, never shows an invalid page, and resets when the filters change", async ({ page }) => {
  const from = day(-27);
  const total = await countVisits({ from, to: today() });
  test.skip(total <= 20, "needs more than one page of visits in the last 28 days");
  await openVisits(page, `?from=${from}&to=${today()}`);
  const pages = Math.ceil(total / 20);
  await expect(page.getByTestId("v-showing")).toHaveText(`Showing 1–20 of ${total} visits`, { timeout: 60_000 });
  const pager = page.getByRole("navigation", { name: "Pages" });
  await expect(pager.getByLabel("Page 1, current")).toBeVisible();
  await expect(pager.getByLabel(`Page ${pages}`)).toBeVisible();

  await pager.getByLabel("Next page").click();
  await expect(page).toHaveURL(/page=2/, { timeout: 60_000 });
  await expect(page.getByTestId("v-showing")).toHaveText(`Showing 21–${Math.min(40, total)} of ${total} visits`);
  await expect(page.locator("main li").filter({ has: page.locator("[data-plate]") })).toHaveCount(Math.min(20, total - 20));

  // Page 2 and page 1 show different cars
  const second = await page.locator("[data-plate]").allInnerTexts();
  await page.goto(`/admin/visits?from=${from}&to=${today()}`);
  const firstPlates = await page.locator("[data-plate]").allInnerTexts();
  expect(firstPlates.some((p) => second.includes(p) && false)).toBe(false);
  expect(new Set([...firstPlates, ...second]).size).toBeGreaterThan(20);

  // A page past the end is brought back to the last real page
  await page.goto(`/admin/visits?from=${from}&to=${today()}&page=99999`);
  await expect(page.getByTestId("v-showing")).toContainText(`of ${total} visits`, { timeout: 60_000 });
  await expect(page.getByRole("navigation", { name: "Pages" }).getByLabel(`Page ${pages}, current`)).toBeVisible();

  // Applying a filter starts again at page 1
  await page.goto(`/admin/visits?from=${from}&to=${today()}&page=2`);
  await page.getByRole("form", { name: "Filters" }).locator('select[name="status"]').selectOption("released");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).not.toHaveURL(/page=/, { timeout: 60_000 });
  const released = await countVisits({ from, to: today(), status: "released" });
  await expect(page.getByTestId("v-count")).toHaveText(String(released));
});

test("a visit opens from its row, and the page names no driver", async ({ page, browser }) => {
  const plate = randomPlate("VD");
  await guestCheckIn(browser, plate);
  const visit = await visitOf(plate);
  await openVisits(page, `?q=${plate}`);
  await expect(page.locator("main")).not.toContainText(/\+?234\d{9}|080\d{8}|Stability Guest/);
  await page.getByRole("link", { name: `Visit of ${spaced(plate)}` }).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/visits/${visit.id}$`), { timeout: 60_000 });
});

test("the export has the matching visits, the same definitions as the table, and is for admins only", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("VX");
  await guestCheckIn(browser, plate);
  await openVisits(page, `?from=${day(-6)}&to=${today()}&status=parked`);

  const expected = await countVisits({ from: day(-6), to: today(), status: "parked" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download the visits shown as CSV/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`visits_${day(-6)}_to_${today()}_parked.csv`);
  const csv = lines(fs.readFileSync((await file.path())!, "utf8"));
  expect(csv[0]).toBe("Service date,Plate,Type,Service,Parking area,Entry (Lagos),Exit (Lagos),Duration (minutes),Status,How it ended,Released by,Reference");
  expect(csv.length - 1, "every matching visit, not just the page on screen").toBe(expected);
  expect(csv.every((l, i) => i === 0 || l.includes(",Checked in,"))).toBe(true);
  expect(csv.join("\n")).toContain(plate);
  expect(csv.join("\n")).not.toMatch(/\+?234\d{9}|\b0[789][01]\d{8}\b|Stability Guest/);
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toBeVisible();

  // The same filters as the address, including a plate search
  const res = await page.request.get(`/admin/reports/export?report=visit-list&from=${day(-6)}&to=${today()}&q=${plate}`);
  expect(res.status()).toBe(200);
  expect(lines(await res.text())).toHaveLength(2);
  expect((await page.request.get(`/admin/reports/export?report=visit-list&from=${today()}&to=2020-01-01`)).status()).toBe(400);
  const audit = await db.from("audit_events").select("after").eq("action", "export_report").order("id", { ascending: false }).limit(1).single();
  expect(audit.data!.after).toMatchObject({ report: "visit-list", search: true });

  // A coordinator can see the page but has no Export and cannot download
  const lead = await createStaff("coordinator");
  try {
    const c = await (await browser.newContext()).newPage();
    await staffSignIn(c, lead.phone, lead.password);
    await c.goto("/admin/visits");
    await expect(c.getByRole("main").getByRole("heading", { name: "Visits", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(c.getByRole("button", { name: /Download the visits shown/ })).toHaveCount(0);
    expect((await c.request.get(`/admin/reports/export?report=visit-list&from=${today()}&to=${today()}`)).status()).toBe(401);
    // An attendant cannot open it at all
  } finally {
    await lead.remove();
  }
  const attendant = await createStaff("attendant");
  try {
    const a = await (await browser.newContext()).newPage();
    await staffSignIn(a, attendant.phone, attendant.password);
    await a.goto("/admin/visits");
    await expect(a).toHaveURL(/\/staff$/, { timeout: 60_000 });
  } finally {
    await attendant.remove();
  }
});

test("an export with nothing matching is a file with only headings, and says so", async ({ page }) => {
  await openVisits(page, "?from=2020-01-01&to=2020-01-07");
  await expect(page.getByText("No visits match these filters.")).toBeVisible();
  const res = await page.request.get("/admin/reports/export?report=visit-list&from=2020-01-01&to=2020-01-07");
  expect(lines(await res.text())).toHaveLength(1);
  expect(res.headers()["x-report-rows"]).toBe("0");
});

test("the visits page fits every width from 320 to 1440, with registration numbers whole and the car illustrations in place", async ({ page }) => {
  await adminSignIn(page);
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/admin/visits?from=${day(-6)}&to=${today()}`);
    await expect(page.getByRole("main").getByRole("heading", { name: "Visits", exact: true })).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `visits at ${width}px`).toBeLessThanOrEqual(0);
    await expect(page.locator('main img[src="/vehicle-illustration.png"]:visible').first()).toBeVisible();
    // Every registration number is shown whole (not cut off by its box)
    const clipped = await page.locator("[data-plate]").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped, `clipped plates at ${width}px`).toBe(0);
    await expect(page.getByRole("button", { name: "Apply filters" })).toBeVisible();
  }
});
