import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, guestCheckIn, live, randomPlate } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const day = (n: number) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Row = {
  id: string;
  status: string;
  checked_in_at: string;
  released_at: string | null;
  area_id: number;
  service_id: number;
  vehicles: { plate: string };
};

/** The visits the page should be counting, straight from the database. */
async function visitsBetween(from: string, to: string, filter: { area?: number; service?: number } = {}): Promise<Row[]> {
  // The database answers at most 1000 rows at a time, so read every page
  const rows: Row[] = [];
  for (let start = 0; ; start += 1000) {
    let q = adminClient()
      .from("visits")
      .select("id, status, checked_in_at, released_at, area_id, service_id, vehicles(plate)")
      .gte("service_date", from)
      .lte("service_date", to)
      .order("id")
      .range(start, start + 999);
    if (filter.area) q = q.eq("area_id", filter.area);
    if (filter.service) q = q.eq("service_id", filter.service);
    const { data } = await q;
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) return rows;
  }
}

const expected = (rows: Row[]) => {
  const stays = rows
    .filter((r) => r.status === "released" && r.released_at)
    .map((r) => (Date.parse(r.released_at!) - Date.parse(r.checked_in_at)) / 60_000)
    .filter((m) => m >= 0 && m <= 1440)
    .map((m) => Math.round(m));
  return {
    checkedIn: rows.length,
    left: rows.filter((r) => r.status === "released" && r.released_at).length,
    average: stays.length ? Math.round(stays.reduce((a, b) => a + b, 0) / stays.length) : null,
    unique: new Set(rows.map((r) => r.vehicles.plate)).size,
  };
};

const duration = (m: number) => (m < 1 ? "Under 1m" : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

async function openAnalytics(page: Page, query: string) {
  await adminSignIn(page);
  await page.goto(`/admin/analytics${query}`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Analytics", exact: true })).toBeVisible({ timeout: 60_000 });
}

test("the page has its title, subtitle, filters and export, and the four numbers match the visit records", async ({ page, browser }) => {
  const plate = randomPlate("AN");
  await guestCheckIn(browser, plate);
  // One completed visit, so there is a real stay to average
  const db = adminClient();
  const { data: visit } = await db.from("visits").select("id, service_date").eq("service_date", today()).order("checked_in_at", { ascending: false }).limit(1).single();
  const { data: admin } = await db.from("staff").select("id").eq("phone", process.env.ADMIN_PHONE!).single();
  await db.rpc("release_visit", { p_visit: visit!.id, p_staff: admin!.id, p_method: "scan", p_today: visit!.service_date });

  await openAnalytics(page, `?from=${today()}&to=${today()}`);
  await expect(page.getByText("Insights from your parking operations")).toBeVisible();
  const filters = page.getByRole("form", { name: "Filters" });
  for (const name of ["from", "to", "service", "area"]) await expect(filters.locator(`[name="${name}"]`)).toBeVisible();
  await expect(filters.getByText("Parking area")).toBeVisible();
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();

  const want = expected(await visitsBetween(today(), today()));
  await expect(page.getByTestId("a-checked-in")).toHaveText(String(want.checkedIn));
  await expect(page.getByTestId("a-left")).toHaveText(String(want.left));
  await expect(page.getByTestId("a-unique")).toHaveText(String(want.unique));
  await expect(page.getByTestId("a-average")).toHaveText(want.average === null ? "None yet" : duration(want.average));
  expect(want.left).toBeGreaterThan(0);
});

test("the activity chart, the rankings and the live car park figures add up to the same records", async ({ page }) => {
  await openAnalytics(page, `?from=${today()}&to=${today()}`);
  const rows = await visitsBetween(today(), today());
  const want = expected(rows);

  // The chart's hidden table: columns add up to the check-ins and the check-outs
  const chart = page.getByRole("region", { name: "Vehicle activity" });
  await expect(chart.getByRole("img")).toBeVisible();
  const column = (n: number) =>
    chart.locator("table.sr-only tbody tr").evaluateAll((trs, i) => trs.reduce((sum, tr) => sum + Number(tr.children[i].textContent), 0), n);
  expect(await column(1)).toBe(want.checkedIn);
  expect(await column(2)).toBe(want.left);

  // Top parking areas and top services each add up to the check-ins, most first
  for (const name of ["Top parking areas by check-ins", "Top services by check-ins"]) {
    const counts = (await page.getByRole("region", { name }).locator("ol > li > span:nth-child(3)").allInnerTexts()).map(Number);
    expect(counts.reduce((a, b) => a + b, 0), name).toBe(want.checkedIn);
    expect([...counts].sort((a, b) => b - a), name).toEqual(counts);
  }

  // Vehicles by parking area is the live count of parked cars, and says so
  const live = page.getByRole("region", { name: "Vehicles by parking area" });
  await expect(live).toContainText("Live");
  const parkedNow = (await adminClient().from("visits").select("id", { count: "exact", head: true }).eq("status", "parked")).count ?? 0;
  if (parkedNow > 0) {
    const counts = (await live.locator("ul > li > span:nth-child(2)").allInnerTexts()).map(Number);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(parkedNow);
  }
  await expect(live).not.toContainText(/%|capacity|spaces/i);
});

test("the car park and service filters change the figures, the rankings and the export", async ({ page }) => {
  const db = adminClient();
  const { data: areas } = await db.from("areas").select("id, name, slug").eq("active", true).order("sort");
  const { data: services } = await db.from("services").select("id, name").eq("active", true).order("id");
  const area = areas![0];
  const service = services![0];
  const from = day(-27);
  const to = today();

  // Area
  await openAnalytics(page, `?from=${from}&to=${to}&area=${area.slug}`);
  const byArea = expected(await visitsBetween(from, to, { area: area.id }));
  await expect(page.getByTestId("a-checked-in")).toHaveText(String(byArea.checkedIn));
  await expect(page.getByRole("region", { name: "Top parking areas by check-ins" })).not.toContainText(areas![1].name);
  await expect(page.getByTestId("range-summary")).toContainText(area.name);

  // Service: only that service is ranked
  await page.goto(`/admin/analytics?from=${from}&to=${to}&service=${service.id}`);
  const byService = expected(await visitsBetween(from, to, { service: service.id }));
  await expect(page.getByTestId("a-checked-in")).toHaveText(String(byService.checkedIn));
  const ranked = page.getByRole("region", { name: "Top services by check-ins" });
  await expect(ranked).toContainText(service.name);
  for (const other of services!.slice(1)) await expect(ranked).not.toContainText(other.name);

  // Both together, and the export carries both
  await page.goto(`/admin/analytics?from=${from}&to=${to}&area=${area.slug}&service=${service.id}`);
  const both = expected(await visitsBetween(from, to, { area: area.id, service: service.id }));
  await expect(page.getByTestId("a-checked-in")).toHaveText(String(both.checkedIn));
  const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  expect(href).toContain(`area=${area.slug}`);
  expect(href).toContain(`service=${service.id}`);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const csv = (await res.text()).trim().split("\r\n");
  expect(csv.length - 1, "CSV rows match the filtered check-ins").toBe(both.checkedIn);
  expect(csv[0]).toContain("Plate");
  expect(res.headers()["content-disposition"]).toContain(`service-${service.id}`);

  // Reset puts everything back
  await page.getByRole("link", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(/\/admin\/analytics$/, { timeout: 60_000 });
  await expect(page.getByTestId("range-summary")).toContainText("All services");
  await expect(page.getByTestId("range-summary")).toContainText("All areas");
});

test("a period with no visits shows plain empty states, and no NaN, infinity or made-up figures", async ({ page }) => {
  await openAnalytics(page, "?from=2020-01-01&to=2020-01-07");
  await expect(page.getByTestId("a-checked-in")).toHaveText("0");
  await expect(page.getByTestId("a-left")).toHaveText("0");
  await expect(page.getByTestId("a-unique")).toHaveText("0");
  await expect(page.getByTestId("a-average")).toHaveText("None yet");
  await expect(page.getByText("No activity in this period.")).toBeVisible();
  await expect(page.getByText(/Not enough completed visits/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Peak hours" })).toContainText("No check-ins in this period.");
  await expect(page.getByRole("region", { name: "Top parking areas by check-ins" })).toContainText("No check-ins in this period.");
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/NaN|Infinity|undefined/);
  // No change percentage is invented from a zero baseline
  await expect(page.locator("main")).not.toContainText(/[↑↓] \d+%/);
});

test("the range can be chosen, is shown in full, is capped when huge, and a bad one falls back to the last 7 days", async ({ page }) => {
  await openAnalytics(page, `?from=${day(-2)}&to=${today()}`);
  await expect(page.getByTestId("range-summary")).toContainText("3 days");
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByTestId("range-summary")).toContainText("1 day", { timeout: 60_000 });
  await page.goto(`/admin/analytics?from=2000-01-01&to=${today()}`);
  await expect(page.getByTestId("range-summary")).toContainText("Showing the latest 366 days");
  await page.goto("/admin/analytics?from=nonsense&to=2026-01-01");
  await expect(page.getByTestId("range-summary")).toContainText("7 days");
});

test("peak hours are arrivals in Lagos time, and the page says it is not cars on site", async ({ page, browser }) => {
  await guestCheckIn(browser, randomPlate("PH"));
  await openAnalytics(page, `?from=${today()}&to=${today()}`);
  const peaks = page.getByRole("region", { name: "Peak hours" });
  await expect(peaks.locator("ol > li").first()).toContainText(/\d\d:00 – \d\d:00/);
  await expect(peaks).toContainText("arrivals, not cars on site");

  // The busiest hour on the page is the busiest hour in the records
  const rows = await visitsBetween(today(), today());
  const perHour = new Map<number, number>();
  for (const r of rows) {
    const h = new Date(Date.parse(r.checked_in_at) + 3_600_000).getUTCHours();
    perHour.set(h, (perHour.get(h) ?? 0) + 1);
  }
  const top = Math.max(...perHour.values());
  const first = await peaks.locator("ol > li").first().innerText();
  expect(first).toContain(`${top}`);
});

test("the analytics page fits every width from 320 to 1440 and keeps the brand", async ({ page }) => {
  await adminSignIn(page);
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/admin/analytics?from=${day(-27)}&to=${today()}`);
    await expect(page.getByRole("main").getByRole("heading", { name: "Analytics", exact: true })).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `analytics at ${width}px`).toBeLessThanOrEqual(0);
  }
  // The side menu still marks Analytics as the current page on a wide screen
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/analytics");
  await expect(page.getByRole("navigation", { name: "Parking team, desktop" }).getByRole("link", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
});

test("only an admin can open analytics or export", async ({ browser }) => {
  const { createStaff, staffSignIn } = await import("./helpers");
  const lead = await createStaff("coordinator");
  try {
    const page = await (await browser.newContext()).newPage();
    await staffSignIn(page, lead.phone, lead.password);
    await page.goto("/admin/analytics");
    await expect(page).toHaveURL(/\/staff$/, { timeout: 60_000 });
    expect((await page.request.get(`/admin/reports/export?from=${today()}&to=${today()}`)).status()).toBe(401);
  } finally {
    await lead.remove();
  }
});

test("a change against the period before is shown only for a finished period, and only when it can be worked out", async ({ page }) => {
  await adminSignIn(page);

  // Including today: not finished, so no arrows and the page says why
  await page.goto(`/admin/analytics?from=${day(-1)}&to=${today()}`);
  await expect(page.getByTestId("range-summary")).toContainText("no comparison is shown", { timeout: 60_000 });
  await expect(page.locator("section[aria-label='Summary']")).not.toContainText(/[↑↓] d+%/);

  // Yesterday, a finished day: the percentage matches the records, and a zero baseline shows none
  const now = (await visitsBetween(day(-1), day(-1))).length;
  const then = (await visitsBetween(day(-2), day(-2))).length;
  await page.goto(`/admin/analytics?from=${day(-1)}&to=${day(-1)}`);
  await expect(page.getByTestId("a-checked-in")).toHaveText(String(now), { timeout: 60_000 });
  const summary = page.locator("section[aria-label='Summary']").locator("div").filter({ has: page.getByTestId("a-checked-in") }).first();
  if (then === 0 || now === then) {
    await expect(summary).not.toContainText(/[↑↓] d+%/);
  } else {
    const pct = Math.round(((now - then) / then) * 100);
    await expect(summary).toContainText(`${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%`);
    await expect(summary).toContainText("vs the day before");
  }
});
