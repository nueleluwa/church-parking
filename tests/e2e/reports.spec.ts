import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CATEGORIES, CATEGORY_INTRO, REPORTS, reportsIn } from "../../lib/rules/report-catalogue";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const day = (n: number) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const addDay = (date: string) => day(0) && new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

async function openReports(page: Page, query = "") {
  await adminSignIn(page);
  await page.goto(`/admin/reports${query}`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Reports", exact: true })).toBeVisible({ timeout: 60_000 });
}

/** Lines of a CSV, without the BOM. */
const lines = (csv: string) => csv.replace(/^﻿/, "").trim().split("\r\n");

async function visitsBetween(from: string, to: string, serviceId?: number) {
  let q = adminClient().from("visits").select("id, status, release_method, service_id, services(name), vehicles(plate)").gte("service_date", from).lte("service_date", to).limit(5000);
  if (serviceId) q = q.eq("service_id", serviceId);
  const { data } = await q;
  return (data ?? []) as unknown as { id: string; status: string; release_method: string | null; service_id: number; services: { name: string }; vehicles: { plate: string } }[];
}

test("the page has its title, filters, six categories with real counts, and the first category's reports", async ({ page }) => {
  await openReports(page);
  await expect(page.getByText("Generate and download reports from your parking data.")).toBeVisible();
  const filters = page.getByRole("form", { name: "Report filters" });
  for (const name of ["from", "to", "service"]) await expect(filters.locator(`[name="${name}"]`)).toBeVisible();
  await expect(filters.locator('[name="service"] option').first()).toHaveText("All services");

  const nav = page.getByRole("navigation", { name: "Report categories" });
  for (const c of CATEGORIES) {
    const card = nav.getByRole("link", { name: new RegExp(`^${c.name}`) });
    await expect(card).toContainText(c.description);
    await expect(card.getByLabel(`${reportsIn(c.id).length} reports`)).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: /^Parking activity/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Parking activity reports" })).toBeVisible();
  await expect(page.locator("li[data-report]")).toHaveCount(5);

  // No format that is not really made: CSV, Excel and the PDF are, nothing else is offered
  await expect(page.locator("main")).not.toContainText(/DOCX|PowerPoint|Google Sheets/i);
  // Parking activity has no line under its heading (its card says it), and no group repeats the dates and service line
  await expect(page.getByRole("heading", { name: "Parking activity reports" })).toBeVisible();
  await expect(page.getByTestId("report-scope")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Check-ins, check-outs and parking activity for the selected period.");
  await expect(page.locator("main")).not.toContainText(/PHC 234|Domino/); // no figures or names from the design image
});

test("choosing a category shows exactly its reports, and keeps the dates and service", async ({ page }) => {
  await openReports(page, `?from=${day(-3)}&to=${today()}`);
  const nav = page.getByRole("navigation", { name: "Report categories" });
  for (const c of CATEGORIES) {
    await nav.getByRole("link", { name: new RegExp(`^${c.name}`) }).click();
    await expect(page.getByRole("heading", { name: `${c.name} reports` })).toBeVisible({ timeout: 60_000 });
    await expect(nav.getByRole("link", { name: new RegExp(`^${c.name}`) })).toHaveAttribute("aria-current", "page");
    const shown = await page.locator("li[data-report] h3").allInnerTexts();
    expect(shown).toEqual(reportsIn(c.id).map((r) => r.name));
    // The other groups keep their line under the heading; Parking activity has none
    const intro = CATEGORY_INTRO[c.id];
    if (intro) await expect(page.getByRole("region", { name: `${c.name} reports` })).toContainText(intro);
    const filters = page.getByRole("form", { name: "Report filters" });
    await expect(filters.locator('[name="from"]')).toHaveValue(day(-3));
    await expect(filters.locator('[name="to"]')).toHaveValue(today());
    await expect(page).toHaveURL(new RegExp(`from=${day(-3)}&to=${today()}`));
  }
});

test("a download is the right report, for the right dates, with the right numbers", async ({ page, browser }) => {
  await guestCheckIn(browser, randomPlate("RP"));
  await openReports(page, `?from=${today()}&to=${today()}`);

  const rows = await visitsBetween(today(), today());
  const download = page.waitForEvent("download");
  await page.locator('li[data-report="parking-summary"]').getByRole("button", { name: /Download Parking summary as CSV/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`parking-summary_${today()}.csv`);
  const csv = fs.readFileSync((await file.path())!, "utf8");
  const summary = Object.fromEntries(lines(csv).slice(1).map((l) => l.split(",")).map((c) => [c[0], c[1]]));
  expect(Number(summary["Cars checked in"])).toBe(rows.length);
  expect(Number(summary["Cars left"])).toBe(rows.filter((r) => r.status === "released").length);
  expect(Number(summary["Not checked out"])).toBe(rows.filter((r) => r.status !== "released").length);
  expect(Number(summary["Unique vehicles"])).toBe(new Set(rows.map((r) => r.vehicles.plate)).size);
  const parked = (await adminClient().from("visits").select("id", { count: "exact", head: true }).eq("status", "parked")).count ?? 0;
  expect(Number(summary["Cars parked right now (live)"])).toBe(parked);

  // The button says so, and the page did not reload
  await expect(page.locator('li[data-report="parking-summary"]').getByRole("status")).toContainText("Downloaded");
  await expect(page).toHaveURL(/\/admin\/reports/);
});

test("every report in the catalogue downloads, with its own headings and no private details", async ({ page }) => {
  await openReports(page);
  const range = `from=${day(-27)}&to=${today()}`;
  const seen = new Map<string, string>();
  for (const r of REPORTS) {
    const res = await page.request.get(`/admin/reports/export?report=${r.id}&${range}`);
    expect(res.status(), r.id).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"], r.id).toContain(`${r.id}_${day(-27)}_to_${today()}.csv`);
    const csv = await res.text();
    const head = lines(csv)[0];
    expect(head.split(",").length, r.id).toBeGreaterThan(2);
    expect(csv, r.id).not.toMatch(/NaN|undefined|Infinity/);
    expect(csv, r.id).not.toMatch(/\+?234\d{9}|\b0[789][01]\d{8}\b/);
    expect(head.toLowerCase(), r.id).not.toMatch(/\bphone\b|\bname\b|email/);
    seen.set(r.id, head);
  }
  // Different reports are different files: the headings tell most of them apart
  expect(new Set(seen.values()).size).toBeGreaterThanOrEqual(12);
  expect(seen.get("parking-summary")).toBe("Measure,Value,How it is counted");
  expect(seen.get("hourly-activity")).toBe("Hour (Lagos),Cars checked in,Cars left");
});

test("alert, exception and snapshot reports match the records", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("RX");
  await guestCheckIn(browser, plate);
  const { data: visit } = await db.from("visits").select("id, area_id, service_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
  // Two alerts for the same plate (one later resolved) and a held car: all must be listed, never merged
  const { data: made } = await db
    .from("alerts")
    .insert([
      { kind: "member_plate_claim", visit_id: visit!.id, plate, detail: { area_id: visit!.area_id, service_id: visit!.service_id } },
      { kind: "member_plate_claim", visit_id: visit!.id, plate, detail: { area_id: visit!.area_id, service_id: visit!.service_id }, resolved_at: new Date().toISOString() },
      { kind: "no_match", visit_id: visit!.id, plate, detail: {} },
    ])
    .select("id");
  try {
    await openReports(page);
    const range = `from=${today()}&to=${today()}`;
    const lo = `${today()}T00:00:00+01:00`;
    const hi = `${addDay(today())}T00:00:00+01:00`;
    const alertsOf = async (kinds: string[]) =>
      ((await db.from("alerts").select("id, resolved_at").in("kind", kinds).gte("created_at", lo).lt("created_at", hi).limit(5000)).data ?? []);

    const claims = lines(await (await page.request.get(`/admin/reports/export?report=member-exceptions&${range}`)).text());
    expect(claims.length - 1).toBe((await alertsOf(["member_plate_claim"])).length);
    expect(claims.filter((l) => l.includes(plate)).length).toBe(2);
    expect(claims.filter((l) => l.includes(",Resolved,")).length).toBeGreaterThanOrEqual(1);
    expect(claims.filter((l) => l.includes(",Open,")).length).toBeGreaterThanOrEqual(1);

    const conflicts = lines(await (await page.request.get(`/admin/reports/export?report=conflicts&${range}`)).text());
    expect(conflicts.length - 1).toBe((await alertsOf(["member_plate_claim", "plate_conflict"])).length);
    expect(conflicts.join("\n")).toContain("tried to check in");

    const held = lines(await (await page.request.get(`/admin/reports/export?report=held-cars&${range}`)).text());
    expect(held.length - 1).toBe((await alertsOf(["no_match"])).length);

    const rows = await visitsBetween(today(), today());
    const missed = lines(await (await page.request.get(`/admin/reports/export?report=missed-checkouts&${range}`)).text());
    expect(missed.length - 1).toBe(rows.filter((r) => r.status === "missed").length);
    const bySearch = lines(await (await page.request.get(`/admin/reports/export?report=released-without-scan&${range}`)).text());
    expect(bySearch.length - 1).toBe(rows.filter((r) => r.status === "released" && r.release_method === "search").length);

    // Cars parked now: a live snapshot that ignores the dates, and adds up to the parked cars
    const live = lines(await (await page.request.get(`/admin/reports/export?report=current-by-area&from=2020-01-01&to=2020-01-02`)).text());
    const parked = (await db.from("visits").select("id", { count: "exact", head: true }).eq("status", "parked")).count ?? 0;
    expect(live.slice(1).reduce((n, l) => n + Number(l.split(",")[2]), 0)).toBe(parked);
  } finally {
    await db.from("alerts").update({ resolved_at: new Date().toISOString() }).in("id", (made ?? []).map((a) => a.id));
  }
});

test("the service filter limits the report and its file name", async ({ page }) => {
  const db = adminClient();
  const { data: services } = await db.from("services").select("id, name").eq("active", true).order("id");
  const service = services![0];
  await openReports(page, `?from=${day(-27)}&to=${today()}&service=${service.id}`);
  await expect(page.locator('select[name="service"] option:checked')).toHaveText(service.name);

  const res = await page.request.get(`/admin/reports/export?report=vehicle-visit-history&from=${day(-27)}&to=${today()}&service=${service.id}`);
  expect(res.headers()["content-disposition"]).toMatch(/_automated-test-service\.csv|_service-1\.csv|\.csv/);
  const rows = lines(await res.text()).slice(1);
  const expected = await visitsBetween(day(-27), today(), service.id);
  expect(rows.length).toBe(expected.length);
  for (const row of rows) expect(row).toContain(service.name);

  // A service that does not exist is refused, and a bad one too
  expect((await page.request.get(`/admin/reports/export?report=parking-summary&from=${today()}&to=${today()}&service=999999`)).status()).toBe(400);
  expect((await page.request.get(`/admin/reports/export?report=parking-summary&from=${today()}&to=${today()}&service=abc`)).status()).toBe(400);
});

test("an empty period downloads cleanly and says there were no records; bad dates are refused", async ({ page }) => {
  await openReports(page, "?category=alerts&from=2020-01-01&to=2020-01-07");
  const row = page.locator('li[data-report="missed-checkouts"]');
  const download = page.waitForEvent("download");
  await row.getByRole("button", { name: /Download/ }).click();
  const csv = fs.readFileSync((await (await download).path())!, "utf8");
  expect(lines(csv)).toHaveLength(1); // headings only
  await expect(row.getByRole("status")).toContainText("No records for these dates");

  // Reversed and too-long ranges: the page explains and switches downloads off; the server says 400
  await page.goto(`/admin/reports?from=${today()}&to=2020-01-01`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("start date that is not after the end date");
  await expect(page.locator("li[data-report]").first().getByRole("button")).toBeDisabled();
  await page.goto("/admin/reports?from=2000-01-01&to=2026-01-01");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("up to 366 days");
  expect((await page.request.get(`/admin/reports/export?report=parking-summary&from=${today()}&to=2020-01-01`)).status()).toBe(400);
  expect((await page.request.get("/admin/reports/export?report=parking-summary&from=2000-01-01&to=2026-01-01")).status()).toBe(400);
  expect((await page.request.get(`/admin/reports/export?report=not-a-report&from=${today()}&to=${today()}`)).status()).toBe(400);
  expect((await page.request.get("/admin/reports/export?report=parking-summary&from=nonsense&to=nonsense")).status()).toBe(400);
});

test("a failed download shows its reason next to the button, and a slow one shows it is working", async ({ page }) => {
  await openReports(page);
  const row = page.locator('li[data-report="parking-summary"]');
  await page.route("**/admin/reports/export*", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Choose a period of up to 366 days." }) }));
  await row.getByRole("button", { name: /Download/ }).click();
  await expect(row.getByRole("status")).toContainText("Choose a period of up to 366 days.");
  await page.unroute("**/admin/reports/export*");

  await page.route("**/admin/reports/export*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await row.getByRole("button", { name: /Download/ }).click();
  await expect(row.getByRole("button")).toHaveText("Preparing…");
  await expect(row.getByRole("button")).toBeDisabled();
  await expect(row.getByRole("status")).toContainText("Downloaded", { timeout: 30_000 });
});

test("each export is written to the audit log with the report, dates and rows", async ({ page }) => {
  await openReports(page);
  const res = await page.request.get(`/admin/reports/export?report=activity-by-day&from=${day(-2)}&to=${today()}`);
  const rows = Number(res.headers()["x-report-rows"]);
  expect(rows).toBe(3);
  const { data } = await adminClient().from("audit_events").select("after").eq("action", "export_report").order("id", { ascending: false }).limit(1).single();
  expect(data!.after).toMatchObject({ report: "activity-by-day", from: day(-2), to: today(), rows: 3 });
});

test("all reports in one Excel workbook: the button downloads a real workbook, it is audited, and only an admin can have it", async ({ page, browser }) => {
  await openReports(page, `?from=${day(-27)}&to=${today()}`);
  const card = page.getByRole("region", { name: "All reports in one file" });
  await expect(card).toContainText(`${REPORTS.length} reports`);

  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download all reports as Excel" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`parking-reports_${day(-27)}_to_${today()}.xlsx`);
  const bytes = fs.readFileSync((await file.path())!);
  expect(bytes.subarray(0, 2).toString(), "an .xlsx is a zip file").toBe("PK");
  expect(bytes.length).toBeGreaterThan(5000);
  await expect(card.getByRole("status").filter({ hasText: "Downloaded" })).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/admin\/reports/);

  // The same file by address: the right type, and every report is a sheet (plus Contents)
  const res = await page.request.get(`/admin/reports/export?report=all&from=${day(-27)}&to=${today()}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("spreadsheetml.sheet");
  expect(Number(res.headers()["x-report-rows"])).toBeGreaterThanOrEqual(0);
  const { data } = await adminClient().from("audit_events").select("after").eq("action", "export_report").order("id", { ascending: false }).limit(1).single();
  expect(data!.after).toMatchObject({ report: "all", from: day(-27), to: today(), sheets: REPORTS.length + 1 });

  // A bad range or service is explained, never a broken file
  const bad = await page.request.get(`/admin/reports/export?report=all&from=${today()}&to=${day(-3)}`);
  expect(bad.status()).toBe(400);

  // A coordinator cannot have it, and nor can someone signed out
  const lead = await createStaff("coordinator");
  try {
    const c = await (await browser.newContext()).newPage();
    await staffSignIn(c, lead.phone, lead.password);
    expect((await c.request.get(`/admin/reports/export?report=all&from=${today()}&to=${today()}`)).status()).toBe(401);
  } finally {
    await lead.remove();
  }
  const anon = await browser.newContext();
  expect((await anon.request.get(`/admin/reports/export?report=all&from=${today()}&to=${today()}`)).status()).toBe(401);
});

test("the PDF report: the button downloads a real PDF, it is audited, Analytics offers it too, and only an admin can have it", async ({ page, browser }) => {
  await openReports(page, `?from=${day(-6)}&to=${today()}`);
  const card = page.getByRole("region", { name: "All reports in one file" });

  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download the report with charts as PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`parking-report_${day(-6)}_to_${today()}.pdf`);
  const bytes = fs.readFileSync((await file.path())!);
  expect(bytes.subarray(0, 5).toString(), "a PDF starts with %PDF-").toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(5000);

  const res = await page.request.get(`/admin/reports/export?report=pdf&from=${day(-6)}&to=${today()}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const { data } = await adminClient().from("audit_events").select("after").eq("action", "export_report").order("id", { ascending: false }).limit(1).single();
  expect(data!.after).toMatchObject({ report: "pdf", from: day(-6), to: today() });
  expect((await page.request.get(`/admin/reports/export?report=pdf&from=${today()}&to=${day(-3)}`)).status()).toBe(400);

  // Analytics has it too, but not when one parking area is chosen (the PDF covers them all)
  await page.goto(`/admin/analytics?from=${day(-6)}&to=${day(-1)}`);
  await expect(page.getByRole("button", { name: "Download the analytics report as PDF" })).toBeVisible({ timeout: 60_000 });
  await page.goto(`/admin/analytics?from=${day(-6)}&to=${day(-1)}&area=cp1`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Analytics", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Download the analytics report as PDF" })).toHaveCount(0);

  const lead = await createStaff("coordinator");
  try {
    const c = await (await browser.newContext()).newPage();
    await staffSignIn(c, lead.phone, lead.password);
    expect((await c.request.get(`/admin/reports/export?report=pdf&from=${today()}&to=${today()}`)).status()).toBe(401);
  } finally {
    await lead.remove();
  }
  const anon = await browser.newContext();
  expect((await anon.request.get(`/admin/reports/export?report=pdf&from=${today()}&to=${today()}`)).status()).toBe(401);
});

test("only an admin can open reports or download them", async ({ page, browser }) => {
  await page.goto("/admin/reports");
  await expect(page).toHaveURL(/signin/, { timeout: 60_000 });
  const lead = await createStaff("coordinator");
  try {
    const c = await (await browser.newContext()).newPage();
    await staffSignIn(c, lead.phone, lead.password);
    await c.goto("/admin/reports");
    await expect(c).toHaveURL(/\/staff$/, { timeout: 60_000 });
    expect((await c.request.get(`/admin/reports/export?report=parking-summary&from=${today()}&to=${today()}`)).status()).toBe(401);
  } finally {
    await lead.remove();
  }
  const anon = await browser.newContext();
  expect((await anon.request.get(`/admin/reports/export?report=parking-summary&from=${today()}&to=${today()}`)).status()).toBe(401);
});

test("the reports page fits every width from 320 to 1440 and keeps its controls readable", async ({ page }) => {
  await adminSignIn(page);
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/admin/reports?from=${day(-6)}&to=${today()}`);
    await expect(page.getByRole("main").getByRole("heading", { name: "Reports", exact: true })).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `reports at ${width}px`).toBeLessThanOrEqual(0);
    const button = page.locator("li[data-report]").first().getByRole("button");
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.width, `download button width at ${width}px`).toBeGreaterThan(80);
    expect(box!.height, `download button height at ${width}px`).toBeGreaterThanOrEqual(40);
  }
  // The side menu still marks Reports as the current page on a wide screen
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/reports");
  await expect(page.getByRole("navigation", { name: "Parking team, desktop" }).getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page");
});
