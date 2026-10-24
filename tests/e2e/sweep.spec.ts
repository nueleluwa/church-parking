import { expect, test, type Browser, type Page } from "@playwright/test";
import { isOverstaying } from "../../lib/rules/sweep";
import { adminClient, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const lagosHour = () => Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }));
const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

async function adminId() {
  return (await adminClient().from("staff").select("id").eq("phone", process.env.ADMIN_PHONE!).single()).data!.id as string;
}

/** A parked guest car, and its visit. */
async function newCar(browser: Browser, tag = "SW") {
  const plate = randomPlate(tag);
  await guestCheckIn(browser, plate);
  const { data } = await adminClient().from("visits").select("id, service_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
  return { plate, id: data!.id as string, serviceId: data!.service_id as number };
}

/** A service that ended long ago today, so cars checked in for it count as overstaying. */
async function earlyService() {
  const weekday = new Date(`${today()}T12:00:00Z`).getUTCDay();
  const name = `Sweep early ${Math.floor(Math.random() * 100000)}`;
  const { data } = await adminClient().from("services").insert({ name, weekday, starts_at: "00:00", ends_at: "00:10", active: true }).select("id").single();
  return { id: data!.id as number, name };
}

/** A service that starts at 12:00, later than the early one. */
async function lateService() {
  const weekday = new Date(`${today()}T12:00:00Z`).getUTCDay();
  const name = `Sweep late ${Math.floor(Math.random() * 100000)}`;
  const { data } = await adminClient().from("services").insert({ name, weekday, starts_at: "12:00", ends_at: "13:00", active: true }).select("id").single();
  return { id: data!.id as number, name };
}

async function openSweep(page: Page, query = "") {
  await staffSignIn(page, process.env.ADMIN_PHONE!, process.env.ADMIN_PASSWORD!);
  await page.goto(`/staff/sweep${query}`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Sweep", exact: true })).toBeVisible({ timeout: 60_000 });
}

const row = (page: Page, plate: string) => page.locator("main li").filter({ hasText: spaced(plate) });

test("the page has its title, description and history link, and four summaries worked out from the records", async ({ page, browser }) => {
  await newCar(browser);
  await openSweep(page);
  await expect(page.getByText("Manage vehicles still on site and record their check-out.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View sweep history" })).toHaveAttribute("href", "/staff/sweep/history");

  const db = adminClient();
  const { data: parked } = await db.from("visits").select("id, service_date, vehicles(plate), services(ends_at)").eq("status", "parked");
  const plates = new Set(parked!.map((v) => (v.vehicles as unknown as { plate: string }).plate));
  await expect(page.getByTestId("sw-on-site")).toHaveText(String(plates.size));

  const now = Date.now();
  const overdue = new Set(
    parked!
      .filter((v) => isOverstaying({ serviceDate: v.service_date, serviceEnd: (v.services as unknown as { ends_at: string }).ends_at }, now))
      .map((v) => (v.vehicles as unknown as { plate: string }).plate),
  );
  await expect(page.getByTestId("sw-overstaying")).toHaveText(String(overdue.size));

  // Released today counts real releases only, never cars closed as missed, and the no-record card does not invent a count
  const lo = `${today()}T00:00:00+01:00`;
  const hi = `${new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:00:00+01:00`;
  const released = (await db.from("visits").select("id", { count: "exact", head: true }).eq("status", "released").gte("released_at", lo).lt("released_at", hi)).count ?? 0;
  await expect(page.getByTestId("sw-released")).toHaveText(String(released));
  await expect(page.getByTestId("sw-no-record")).toHaveText("Not tracked");
  await expect(page.getByTestId("board-count")).toHaveText(String(parked!.length));
});

test("no sweep action releases a car, and there is no Check out button that could", async ({ page, browser }) => {
  const car = await newCar(browser);
  await openSweep(page, `?q=${car.plate}`);
  await expect(page.getByRole("button", { name: /release/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /check out/i })).toHaveCount(0);
  await expect(row(page, car.plate).getByRole("button")).toHaveText(["Still here", "Gone"]);
  await expect(page.getByText(/released only at the exit, against its pass/)).toBeVisible();
});

test("the table shows the vehicle with its picture, service times, entry time, a live duration and the right status", async ({ page, browser }) => {
  const car = await newCar(browser);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSweep(page, `?q=${car.plate}`);
  const tr = page.locator("tbody tr").filter({ hasText: spaced(car.plate) });
  await expect(tr).toHaveCount(1, { timeout: 60_000 });
  await expect(tr.locator('img[src="/vehicle-illustration.png"]')).toHaveCount(1);
  await expect(tr).toContainText(/\d\d:\d\d – \d\d:\d\d/);
  await expect(tr).toContainText(/\d{1,2} [A-Z][a-z]{2} 20\d\d/);
  await expect(tr.locator("td").nth(5)).toHaveText(/^(Under 1m|\d+m|\d+h \d+m)$/);
  await expect(tr.locator("td").nth(6)).toContainText("On site");
  await expect(tr.getByRole("link", { name: /^View visit of/ })).toBeVisible(); // the plate opens the visit
});

test("an overstaying car is flagged, filtered by status and duration, and the filters, search and Reset change the records", async ({ page, browser }) => {
  test.skip(lagosHour() < 1, "needs it to be past 00:40 in Lagos for the early service to have ended");
  const db = adminClient();
  const early = await earlyService();
  const car = await newCar(browser);
  const other = await newCar(browser, "SO");
  try {
    await db.from("visits").update({ service_id: early.id }).eq("id", car.id);
    await openSweep(page, `?q=${car.plate}`);
    await expect(row(page, car.plate)).toContainText("Overstaying", { timeout: 60_000 });
    await expect(row(page, car.plate)).toContainText(early.name);

    // Status: overstaying lists it and only overstaying cars; on site lists none of them
    await page.goto(`/staff/sweep?status=overstaying`);
    await expect(row(page, car.plate)).toHaveCount(1, { timeout: 60_000 });
    for (const chip of await page.locator("main li").getByText(/^(On site|Overstaying)$/).allInnerTexts()) expect(chip).toBe("Overstaying");
    await page.goto(`/staff/sweep?status=onsite&q=${car.plate}`);
    await expect(page.getByTestId("board-count")).toHaveText("0", { timeout: 60_000 });

    // Service: the early service holds only the moved car
    await page.goto(`/staff/sweep?service=${early.id}`);
    await expect(page.getByTestId("board-count")).toHaveText("1", { timeout: 60_000 });
    await expect(row(page, car.plate)).toHaveCount(1);
    await expect(row(page, other.plate)).toHaveCount(0);

    // Duration: within its service time and longer than it cover every car between them
    const all = Number(await (await (async () => { await page.goto("/staff/sweep"); return page.getByTestId("board-count"); })()).innerText());
    await page.goto("/staff/sweep?timing=within");
    const within = Number(await page.getByTestId("board-count").innerText());
    await page.goto("/staff/sweep?timing=longer");
    const longer = Number(await page.getByTestId("board-count").innerText());
    expect(within + longer).toBe(all);

    // Search with the form, then Reset
    await page.goto("/staff/sweep");
    const form = page.getByRole("form", { name: "Filters" });
    await form.getByPlaceholder("Search by vehicle number…").fill(other.plate.toLowerCase());
    await form.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByTestId("board-count")).toHaveText("1", { timeout: 60_000 });
    await form.getByRole("link", { name: "Reset" }).click();
    await expect(page).toHaveURL(/\/staff\/sweep$/, { timeout: 60_000 });
    await expect(page.getByTestId("board-count")).toHaveText(String(all));
  } finally {
    await db.from("visits").update({ service_id: car.serviceId }).eq("id", car.id);
    await db.from("services").delete().eq("id", early.id);
  }
});

test("sorting uses the real check-in times, and the parking area, in both directions", async ({ page, browser }) => {
  await newCar(browser);
  await newCar(browser);
  await openSweep(page);
  const times = async () => {
    const plates = await page.locator("main li [data-plate]").allInnerTexts();
    const normal = plates.map((p) => p.replace(/\s/g, ""));
    const { data } = await adminClient().from("visits").select("checked_in_at, vehicles!inner(plate)").in("vehicles.plate", normal);
    const at = new Map((data ?? []).map((v) => [(v.vehicles as unknown as { plate: string }).plate, Date.parse(v.checked_in_at as string)]));
    return normal.map((p) => at.get(p)!);
  };
  const sorted = (xs: number[], dir: 1 | -1) => xs.every((x, i) => i === 0 || (xs[i - 1] - x) * dir <= 0);

  expect(sorted(await times(), 1)).toBe(true); // oldest first by default
  await page.getByLabel("Sort by").selectOption("newest");
  await expect(page).toHaveURL(/sort=newest/, { timeout: 60_000 });
  await expect.poll(async () => sorted(await times(), -1)).toBe(true);
  await page.getByLabel("Sort by").selectOption("area");
  await expect(page).toHaveURL(/sort=area/, { timeout: 60_000 });
  const areas = await page.locator("main li [data-area]").allInnerTexts();
  expect(areas).toEqual([...areas].sort((a, b) => a.localeCompare(b)));
});

test("selecting cars: the count, across pages, the confirmation lists them, and the button is off with none", async ({ page, browser }) => {
  await newCar(browser);
  await newCar(browser);
  await openSweep(page);
  const total = Number(await page.getByTestId("board-count").innerText());
  test.skip(total <= 20, "needs more than one page of cars on site");

  await expect(page.getByRole("button", { name: "Mark selected as still here" })).toBeDisabled();
  await expect(page.getByTestId("selected-count")).toHaveText("0 vehicles selected");
  await expect(page.getByTestId("board-showing")).toHaveText(`Showing 1–20 of ${total} vehicles`);

  const first = page.locator("main li").filter({ has: page.locator("[data-plate]") }).first();
  await first.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("board-showing")).toContainText(`21–${Math.min(40, total)} of ${total}`);
  await page.locator("main li").filter({ has: page.locator("[data-plate]") }).first().getByRole("checkbox").check();
  await expect(page.getByTestId("selected-count")).toHaveText("2 vehicles selected");

  // The selection survives going back, and the dialog lists every selected car
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(first.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Mark selected as still here" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Mark these 2 cars as Still here?");
  await expect(dialog.locator("li")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("selected-count")).toHaveText("0 vehicles selected");
});

test("marking several cars Still here keeps their visits open, is audited for each, and a partial failure is reported honestly", async ({ page, browser }) => {
  const db = adminClient();
  const admin = await adminId();
  // One distinctive tag, so a search finds just these four cars
  const [a, b, c, d] = [await newCar(browser, "QK"), await newCar(browser, "QK"), await newCar(browser, "QK"), await newCar(browser, "QK")];
  try {
    await openSweep(page, "?q=QK");
    for (const car of [a, b, c]) await row(page, car.plate).getByRole("checkbox").check();
    await expect(page.getByTestId("selected-count")).toHaveText("3 vehicles selected");

    // Everything works for two of them: deselect the third and confirm
    await row(page, c.plate).getByRole("checkbox").uncheck();
    await page.getByRole("button", { name: "Mark selected as still here" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, mark them" }).click();
    await expect(page.getByRole("status").filter({ hasText: "marked Still here" })).toContainText("2 cars marked Still here.", { timeout: 30_000 });
    await expect(row(page, a.plate).getByText("Marked still here")).toBeVisible();
    expect((await db.from("visits").select("status").in("id", [a.id, b.id])).data!.map((v) => v.status)).toEqual(["parked", "parked"]);
    const events = (await db.from("audit_events").select("visit_id, staff_id, action").eq("action", "sweep_still_here").in("visit_id", [a.id, b.id])).data!;
    expect(events).toHaveLength(2);
    expect(events.every((e) => typeof e.staff_id === "string")).toBe(true);

    // Partial failure: one car is released by someone else before the confirmation
    await page.goto("/staff/sweep?q=QK");
    await row(page, c.plate).getByRole("checkbox").check();
    await row(page, d.plate).getByRole("checkbox").check();
    await db.rpc("release_visit", { p_visit: d.id, p_staff: admin, p_method: "scan", p_today: today() });
    await page.getByRole("button", { name: "Mark selected as still here" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, mark them" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("1 of 2 cars marked Still here. 1 could not be marked (already released or closed).", { timeout: 30_000 });
    await expect(page.getByTestId("selected-count")).toHaveText("1 vehicle selected"); // the one that failed stays selected
  } finally {
    // Leave no test cars parked
    for (const car of [a, b, c, d]) await db.rpc("release_visit", { p_visit: car.id, p_staff: admin, p_method: "scan", p_today: today() });
  }
});

test("Gone closes the visit as a missed check-out, never a release, and a second attempt is refused", async ({ browser, page }) => {
  const db = adminClient();
  const car = await newCar(browser, "GN");
  await openSweep(page, `?q=${car.plate}`);
  const releasedBefore = Number(await page.getByTestId("sw-released").innerText());

  // A second team lead has the same car on screen
  const second = await (await browser.newContext()).newPage();
  await staffSignIn(second, process.env.ADMIN_PHONE!, process.env.ADMIN_PASSWORD!);
  await second.goto(`/staff/sweep?q=${car.plate}`);
  await expect(row(second, car.plate)).toBeVisible({ timeout: 60_000 });

  await row(page, car.plate).getByRole("button", { name: "Gone" }).click();
  await page.getByRole("button", { name: "Yes, mark as gone" }).click();
  await expect(page.getByText("Closed as a missed check-out. This is not a release.")).toBeVisible({ timeout: 30_000 });
  const { data: visit } = await db.from("visits").select("status, release_method, released_by").eq("id", car.id).single();
  expect(visit).toMatchObject({ status: "missed", release_method: "sweep" });
  expect(visit!.released_by).not.toBeNull();

  // The other screen is out of date: its attempt is refused, and nothing changes again
  await row(second, car.plate).getByRole("button", { name: "Gone" }).click();
  await second.getByRole("button", { name: "Yes, mark as gone" }).click();
  await expect(second.getByRole("main").getByRole("alert")).toContainText("already released or closed", { timeout: 30_000 });
  expect((await db.from("audit_events").select("id").eq("visit_id", car.id).eq("action", "sweep_gone")).data).toHaveLength(1);

  // A missed check-out is not a release: Released today does not move
  await page.reload();
  await expect(page.getByTestId("sw-released")).toHaveText(String(releasedBefore));
});

test("an end-of-service sweep reviews the cars from that service or earlier, and a car marked there leaves its list", async ({ page, browser }) => {
  const db = adminClient();
  const early = await earlyService();
  const late = await lateService();
  const car = await newCar(browser, "ES");
  const later = await newCar(browser, "EL");
  try {
    await db.from("visits").update({ service_id: early.id }).eq("id", car.id);
    await db.from("visits").update({ service_id: late.id }).eq("id", later.id);
    await openSweep(page);
    const panel = page.getByRole("region", { name: "End-of-service sweep" });
    await expect(panel.getByLabel("Service").locator("option", { hasText: early.name })).toHaveCount(1);
    await panel.getByLabel("Service").selectOption(String(early.id));
    await panel.getByRole("button", { name: "Review cars from this service" }).click();
    await expect(page).toHaveURL(new RegExp(`sweep=${early.id}`), { timeout: 60_000 });
    await expect(page.getByText(`Reviewing ${early.name}.`)).toBeVisible();

    // The car from that service is listed; a car checked in for a later service is not
    await page.goto(`/staff/sweep?sweep=${early.id}&q=${car.plate}`);
    await expect(row(page, car.plate)).toHaveCount(1, { timeout: 60_000 });
    await page.goto(`/staff/sweep?sweep=${early.id}&q=${later.plate}`);
    await expect(page.getByTestId("board-count")).toHaveText("0", { timeout: 60_000 });

    // Marking it Still here in this sweep takes it off this sweep's list, but its visit stays open
    await page.goto(`/staff/sweep?sweep=${early.id}&q=${car.plate}`);
    await row(page, car.plate).getByRole("button", { name: "Still here", exact: true }).click();
    await expect(page.getByText("Marked Still here. The visit stays open.")).toBeVisible({ timeout: 30_000 });
    await page.goto(`/staff/sweep?sweep=${early.id}&q=${car.plate}`);
    await expect(page.getByTestId("board-count")).toHaveText("0", { timeout: 60_000 });
    expect((await db.from("visits").select("status").eq("id", car.id).single()).data!.status).toBe("parked");
    const { data: mark } = await db.from("audit_events").select("after").eq("visit_id", car.id).eq("action", "sweep_still_here").single();
    expect(mark!.after).toMatchObject({ sweep_service_id: early.id });
  } finally {
    await db.from("visits").update({ service_id: car.serviceId }).eq("id", car.id);
    await db.from("visits").update({ service_id: later.serviceId }).eq("id", later.id);
    await db.from("services").delete().in("id", [early.id, late.id]);
  }
});

test("the history lists what was recorded, who recorded it and what it means, with an outcome filter and paging", async ({ page, browser }) => {
  const db = adminClient();
  const here = await newCar(browser, "HH");
  const gone = await newCar(browser, "HG");
  await openSweep(page, `?q=${here.plate}`);
  await row(page, here.plate).getByRole("button", { name: "Still here", exact: true }).click();
  await expect(row(page, here.plate).getByText("Marked still here")).toBeVisible({ timeout: 30_000 });
  await page.goto(`/staff/sweep?q=${gone.plate}`);
  await row(page, gone.plate).getByRole("button", { name: "Gone" }).click();
  await page.getByRole("button", { name: "Yes, mark as gone" }).click();
  await expect(page.getByText(/Closed as a missed check-out/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "View sweep history" }).click();
  await expect(page).toHaveURL(/\/staff\/sweep\/history/, { timeout: 60_000 });
  await expect(page.getByRole("main").getByRole("heading", { name: "Sweep history" })).toBeVisible();
  const lo = `${today()}T00:00:00+01:00`;
  const hi = `${new Date(Date.parse(`${today()}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:00:00+01:00`;
  const inRange = async (actions: string[]) => (await db.from("audit_events").select("id", { count: "exact", head: true }).in("action", actions).gte("created_at", lo).lt("created_at", hi)).count ?? 0;
  await page.goto(`/staff/sweep/history?from=${today()}&to=${today()}`);
  await expect(page.getByTestId("history-count")).toHaveText(String(await inRange(["sweep_still_here", "sweep_gone"])), { timeout: 60_000 });

  const hereRow = page.locator("main li").filter({ hasText: spaced(here.plate) });
  await expect(hereRow).toContainText("Still here");
  await expect(hereRow).toContainText(/\d\d:\d\d/);
  const goneRow = page.locator("main li").filter({ hasText: spaced(gone.plate) });
  await expect(goneRow).toContainText("Gone");

  // Outcome filter
  await page.goto(`/staff/sweep/history?from=${today()}&to=${today()}&outcome=gone`);
  await expect(page.getByTestId("history-count")).toHaveText(String(await inRange(["sweep_gone"])), { timeout: 60_000 });
  await expect(page.locator("main li").filter({ hasText: spaced(here.plate) })).toHaveCount(0);

  // A day with nothing says so, and bad dates are explained
  await page.goto("/staff/sweep/history?from=2020-01-01&to=2020-01-07");
  await expect(page.getByText("No sweep outcomes were recorded in these dates.")).toBeVisible();
  await page.goto(`/staff/sweep/history?from=${today()}&to=2020-01-01`);
  await expect(page.locator('[data-toast="warning"]')).toContainText("not valid");
});

test("the notes link to Live Parking and the lookup, and only coordinators and admins can open Sweep", async ({ page, browser }) => {
  await openSweep(page);
  await page.getByRole("link", { name: "Go to Live Parking" }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard$/, { timeout: 60_000 });
  await page.goBack();
  await page.getByRole("link", { name: "Look a car up" }).click();
  await expect(page).toHaveURL(/\/staff\/search$/, { timeout: 60_000 });

  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/staff/sweep");
  await expect(anon).toHaveURL(/signin/, { timeout: 60_000 });
  const attendant = await createStaff("attendant");
  try {
    const a = await (await browser.newContext()).newPage();
    await staffSignIn(a, attendant.phone, attendant.password);
    for (const path of ["/staff/sweep", "/staff/sweep/history"]) {
      await a.goto(path);
      await expect(a).toHaveURL(/\/staff$/, { timeout: 60_000 });
    }
  } finally {
    await attendant.remove();
  }
});

test("the page fits every width from 320 to 1440; the actions panel is beside the table on a very wide screen and below it otherwise", async ({ page }) => {
  await staffSignIn(page, process.env.ADMIN_PHONE!, process.env.ADMIN_PASSWORD!);
  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/staff/sweep", "/staff/sweep/history"]) {
      await page.goto(path);
      await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.goto("/staff/sweep");
    const clipped = await page.locator("[data-plate]").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped, `clipped plates at ${width}px`).toBe(0);
    await expect(page.locator('main img[src="/vehicle-illustration.png"]:visible').first()).toBeVisible();
    const table = await page.getByRole("region", { name: "Vehicles on site" }).boundingBox();
    const panel = await page.getByRole("complementary", { name: "Sweep actions" }).boundingBox();
    if (width >= 1700) {
      expect(panel!.x, `panel beside the table at ${width}px`).toBeGreaterThan(table!.x + table!.width - 2);
    } else {
      expect(panel!.y, `panel below the table at ${width}px`).toBeGreaterThanOrEqual(table!.y + table!.height - 2);
    }
  }
});
