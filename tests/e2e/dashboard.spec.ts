import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPlate, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const main = (page: Page) => page.getByRole("main");
const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
const lagosToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

async function adminId() {
  return (await adminClient().from("staff").select("id").eq("phone", process.env.ADMIN_PHONE!).single()).data!.id as string;
}

async function openDashboard(page: Page, query = "") {
  await adminSignIn(page);
  await page.goto(`/admin${query}`);
  await expect(main(page).getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 60_000 });
}

/** What the dashboard should say, counted straight from the records with the same definitions. */
async function expected(from: string, to: string, serviceId: number | null, areaId: number | null = null) {
  const db = adminClient();
  const visits = (status?: string) => {
    let q = db.from("visits").select("id", { count: "exact", head: true }).gte("service_date", from).lte("service_date", to);
    if (serviceId !== null) q = q.eq("service_id", serviceId);
    if (areaId !== null) q = q.eq("area_id", areaId);
    if (status) q = q.eq("status", status);
    return q;
  };
  let parked = db.from("visits").select("id", { count: "exact", head: true }).eq("status", "parked");
  if (serviceId !== null) parked = parked.eq("service_id", serviceId);
  if (areaId !== null) parked = parked.eq("area_id", areaId);
  const [checkedIn, released, now] = await Promise.all([visits(), visits("released"), parked]);
  return { checkedIn: checkedIn.count ?? 0, released: released.count ?? 0, parkedNow: now.count ?? 0 };
}

const card = (page: Page, id: string) => page.getByTestId(id);

test("the dashboard has its title, description, two filters and four cards, with numbers that match the records", async ({ page, browser }) => {
  await guestCheckIn(browser, randomPlate("DA"));
  await openDashboard(page);
  await expect(main(page).getByText("Overview of today's parking activity across all services and areas.")).toBeVisible();
  const filters = page.getByRole("group", { name: "Dashboard filters" });
  await expect(filters.getByLabel("Period")).toHaveValue("today");
  await expect(filters.getByLabel("Service")).toHaveValue("");
  await expect(filters.getByLabel("Service").locator("option").first()).toHaveText("All services");
  for (const label of ["Cars checked in", "Cars left", "Currently parked", "Active alerts"]) await expect(page.getByRole("region", { name: "Summary" }).getByText(label, { exact: true })).toBeVisible();

  const today = lagosToday();
  const want = await expected(today, today, null);
  await expect(card(page, "d-checked-in")).toHaveText(String(want.checkedIn), { timeout: 60_000 });
  await expect(card(page, "d-left")).toHaveText(String(want.released));
  await expect(card(page, "d-parked")).toHaveText(String(want.parkedNow));
  const { data: alerts } = await adminClient().from("alerts").select("id").is("resolved_at", null);
  await expect(card(page, "d-alerts")).toHaveText(String(alerts!.length));
  await expect(main(page).getByText("Checked in today")).toBeVisible();
  await expect(main(page).getByText("Released today")).toBeVisible();
  // No names or phone numbers
  await expect(main(page)).not.toContainText(/\+234\d{9}|\b0[789]0\d{8}\b|Stability Guest/);
});

test("each parking area shows its own numbers, as text only, with no capacity or percentages", async ({ page }) => {
  await openDashboard(page);
  const { data: areas } = await adminClient().from("areas").select("id, name, slug").eq("active", true).order("sort");
  const today = lagosToday();
  const list = page.getByRole("region", { name: "Parking areas" });
  await expect(list.getByRole("link", { name: "View all areas" })).toHaveAttribute("href", "/admin/areas", { timeout: 60_000 });
  for (const a of areas!) {
    const want = await expected(today, today, null, a.id as number);
    await expect(list.getByRole("link", { name: `${a.name}: see its visits` })).toBeVisible();
    await expect(page.getByTestId(`area-${a.slug}-parked`)).toHaveText(String(want.parkedNow));
    await expect(page.getByTestId(`area-${a.slug}-in`)).toHaveText(String(want.checkedIn));
    await expect(page.getByTestId(`area-${a.slug}-out`)).toHaveText(String(want.released));
  }
  await expect(list.locator("img")).toHaveCount(0);
  await expect(list).not.toContainText(/%|spaces|capacity|available/i);
});

test("recent activity lists real entries and exits, newest first, with the car illustration and links to the visit", async ({ page, browser }) => {
  const db = adminClient();
  const a = randomPlate("DB");
  const b = randomPlate("DC");
  await guestCheckIn(browser, a);
  await guestCheckIn(browser, b);
  const getVisit = async (plate: string) => (await db.from("visits").select("id, checked_in_at, released_at, vehicles!inner(plate)").eq("vehicles.plate", plate).single()).data!;
  const va = await getVisit(a);
  const vb = await getVisit(b);
  await db.rpc("release_visit", { p_visit: vb.id, p_staff: await adminId(), p_method: "scan", p_today: lagosToday() });
  const released = await getVisit(b);
  expect(released.released_at).not.toBeNull();
  try {
    await openDashboard(page);
    const section = page.getByRole("region", { name: "Recent activity" });
    // Phone: one card per event
    const exit = section.getByRole("link", { name: `Exit of ${spaced(b)}` });
    const entryB = section.getByRole("link", { name: `Entry of ${spaced(b)}` });
    const entryA = section.getByRole("link", { name: `Entry of ${spaced(a)}` });
    await expect(exit).toBeVisible({ timeout: 60_000 });
    await expect(entryB).toBeVisible();
    await expect(entryA).toBeVisible();
    await expect(exit).toContainText("Released");
    await expect(exit).toContainText(hhmm(released.released_at as string));
    await expect(entryA).toContainText("Checked in");
    await expect(entryA).toContainText(hhmm(va.checked_in_at as string));
    // The exit of B is newer than its entry, and B's entry is newer than A's: newest first
    const order = await section.locator("li a").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(order.indexOf(`Exit of ${spaced(b)}`)).toBeLessThan(order.indexOf(`Entry of ${spaced(b)}`));
    expect(order.indexOf(`Entry of ${spaced(b)}`)).toBeLessThan(order.indexOf(`Entry of ${spaced(a)}`));
    await expect(section.locator('img[src="/vehicle-illustration.png"]').first()).toBeVisible();
    // The count says how many events there are in all, from the same records
    const today = lagosToday();
    const want = await expected(today, today, null);
    await expect(page.getByTestId("d-activity-count")).toContainText(`of ${want.checkedIn + want.released} events`);
    // A row opens that visit, and View all opens Visits for the same dates
    await exit.click();
    await expect(page).toHaveURL(new RegExp(`/admin/visits/${vb.id}$`), { timeout: 60_000 });
    await page.goBack();
    await section.getByRole("link", { name: "View all" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/visits\\?from=${today}&to=${today}`), { timeout: 60_000 });
  } finally {
    await db.rpc("release_visit", { p_visit: va.id, p_staff: await adminId(), p_method: "scan", p_today: lagosToday() });
  }
});

test("the desktop table has the five columns, an entry and an exit are different, and a missed visit is not shown as an exit", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("DD");
  await guestCheckIn(browser, plate);
  const v = (await db.from("visits").select("id, vehicles!inner(plate)").eq("vehicles.plate", plate).single()).data!;
  // Close it as missed: that is neither an exit nor a release
  await db.from("visits").update({ status: "missed", released_at: new Date().toISOString(), release_method: "sweep" }).eq("id", v.id);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDashboard(page);
    const table = page.getByRole("table", { name: "Recent activity" });
    await expect(table).toBeVisible({ timeout: 60_000 });
    for (const c of ["Vehicle", "Type", "Car park", "Time", "Status"]) await expect(table.getByRole("columnheader", { name: c })).toBeVisible();
    const rows = table.locator("tr").filter({ hasText: spaced(plate) });
    await expect(rows).toHaveCount(1); // the entry only
    await expect(rows.first()).toContainText("Entry");
    await expect(rows.first()).toContainText("Checked in");
    await expect(table.locator("tr").filter({ hasText: "Exit" }).filter({ hasText: spaced(plate) })).toHaveCount(0);
    await expect(rows.first().locator('img[src="/vehicle-illustration.png"]')).toBeVisible();
  } finally {
    await db.from("visits").update({ status: "released" }).eq("id", v.id);
  }
});

test("the period filter: yesterday, a chosen date and a date that has not happened; live figures say they are live", async ({ page }) => {
  await openDashboard(page);
  const today = lagosToday();
  const yesterday = addDays(today, -1);
  const filters = page.getByRole("group", { name: "Dashboard filters" });

  await filters.getByLabel("Period").selectOption("yesterday");
  await expect(page).toHaveURL(/range=yesterday/, { timeout: 60_000 });
  const want = await expected(yesterday, yesterday, null);
  await expect(card(page, "d-checked-in")).toHaveText(String(want.checkedIn), { timeout: 60_000 });
  await expect(card(page, "d-left")).toHaveText(String(want.released));
  await expect(main(page).getByText("Checked in yesterday")).toBeVisible();
  // Right now is still right now: the live card says so and does not pretend to be yesterday's
  await expect(card(page, "d-parked")).toHaveText(String(want.parkedNow));
  await expect(main(page).getByText("Live now, not for yesterday")).toBeVisible();
  await expect(main(page).getByText(/Currently parked is live and does not change with the date/)).toBeVisible();
  await expect(main(page).getByText("Overview of parking activity yesterday across all services and areas.")).toBeVisible();

  // A chosen day
  const day = addDays(today, -5);
  await filters.getByLabel("Period").selectOption("date");
  await filters.locator('input[type="date"]').fill(day);
  await expect(page).toHaveURL(new RegExp(`range=date&date=${day}`), { timeout: 60_000 });
  const chosen = await expected(day, day, null);
  await expect(card(page, "d-checked-in")).toHaveText(String(chosen.checkedIn), { timeout: 60_000 });

  // The last 7 days
  await filters.getByLabel("Period").selectOption("7d");
  await expect(page).toHaveURL(/range=7d/, { timeout: 60_000 });
  const week = await expected(addDays(today, -6), today, null);
  await expect(card(page, "d-checked-in")).toHaveText(String(week.checkedIn), { timeout: 60_000 });

  // Addresses typed by hand never show a day that has not happened
  await page.goto(`/admin?range=date&date=${addDays(today, 3)}`);
  await expect(filters.locator('input[type="date"]')).toHaveValue(today, { timeout: 60_000 });
  await page.goto("/admin?range=date&date=2026-02-31");
  await expect(filters.locator('input[type="date"]')).toHaveValue(today, { timeout: 60_000 });
});

test("the service filter changes the cards, the car parks and the activity together, and keeps the period", async ({ page, browser }) => {
  const db = adminClient();
  const weekday = new Date(`${lagosToday()}T12:00:00Z`).getUTCDay();
  const name = `Dash filter ${Math.floor(Math.random() * 100000)}`;
  const empty = (await db.from("services").insert({ name, weekday, starts_at: "00:00", ends_at: "23:59", active: true }).select("id").single()).data!;
  const plate = randomPlate("DE");
  await guestCheckIn(browser, plate);
  const v = (await db.from("visits").select("id, service_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single()).data!;
  try {
    await openDashboard(page);
    const filters = page.getByRole("group", { name: "Dashboard filters" });
    await expect(filters.getByLabel("Service").locator("option", { hasText: name })).toHaveCount(1);

    // A service with no visits: zeros everywhere, and an honest empty message
    await filters.getByLabel("Service").selectOption(String(empty.id));
    await expect(page).toHaveURL(new RegExp(`service=${empty.id}`), { timeout: 60_000 });
    await expect(card(page, "d-checked-in")).toHaveText("0", { timeout: 60_000 });
    await expect(card(page, "d-left")).toHaveText("0");
    await expect(card(page, "d-parked")).toHaveText("0");
    await expect(main(page).getByText(`No cars have checked in or left today for ${name}.`)).toBeVisible();
    for (const t of ["parked", "in", "out"]) {
      for (const el of await page.locator(`[data-testid$="-${t}"][data-testid^="area-"]`).all()) await expect(el).toHaveText("0");
    }

    // The service the car checked in for: the car is counted, with the same numbers as the records
    const today = lagosToday();
    const want = await expected(today, today, v.service_id as number);
    await filters.getByLabel("Service").selectOption(String(v.service_id));
    await expect(card(page, "d-checked-in")).toHaveText(String(want.checkedIn), { timeout: 60_000 });
    await expect(card(page, "d-parked")).toHaveText(String(want.parkedNow));
    await expect(page.getByRole("region", { name: "Recent activity" }).getByRole("link", { name: `Entry of ${spaced(plate)}` })).toBeVisible();

    // Changing the period keeps the service
    await filters.getByLabel("Period").selectOption("yesterday");
    await expect(page).toHaveURL(new RegExp(`range=yesterday.*service=${v.service_id}|service=${v.service_id}.*range=yesterday`), { timeout: 60_000 });
    await expect(filters.getByLabel("Service")).toHaveValue(String(v.service_id));
  } finally {
    await db.rpc("release_visit", { p_visit: v.id, p_staff: await adminId(), p_method: "scan", p_today: lagosToday() });
    await db.from("services").delete().eq("id", empty.id);
  }
});

test("every card and link opens a real screen showing the same numbers", async ({ page, browser }) => {
  await guestCheckIn(browser, randomPlate("DF"));
  await openDashboard(page);
  const today = lagosToday();
  const checked = Number(await card(page, "d-checked-in").textContent());

  await main(page).getByRole("link", { name: /^Cars checked in/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/visits\\?from=${today}&to=${today}$`), { timeout: 60_000 });
  await expect(page.getByTestId("v-total")).toHaveText(String(checked), { timeout: 60_000 });

  await page.goto("/admin");
  const left = Number(await card(page, "d-left").textContent());
  await main(page).getByRole("link", { name: /^Cars left/ }).click();
  await expect(page).toHaveURL(/status=released/, { timeout: 60_000 });
  await expect(page.getByTestId("v-count")).toHaveText(String(left), { timeout: 60_000 });

  await page.goto("/admin");
  await main(page).getByRole("link", { name: /^Currently parked/ }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard$/, { timeout: 60_000 });

  await page.goto("/admin");
  await main(page).getByRole("link", { name: /^Active alerts/ }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard$/, { timeout: 60_000 });

  await page.goto("/admin");
  const { data: area } = await adminClient().from("areas").select("name, slug").eq("active", true).order("sort").limit(1).single();
  const inArea = Number(await page.getByTestId(`area-${area!.slug}-in`).textContent());
  await page.getByRole("link", { name: `${area!.name}: see its visits` }).click();
  await expect(page).toHaveURL(new RegExp(`area=${area!.slug}`), { timeout: 60_000 });
  await expect(page.getByTestId("v-total")).toHaveText(String(inArea), { timeout: 60_000 });

  await page.goto("/admin");
  await page.getByRole("link", { name: "View all areas" }).click();
  await expect(page).toHaveURL(/\/admin\/areas$/, { timeout: 60_000 });
});

test("active alerts count only open alerts, show red with a way in, and drop when resolved", async ({ page }) => {
  const db = adminClient();
  const plate = randomPlate("DG");
  await openDashboard(page);
  const before = Number(await card(page, "d-alerts").textContent());
  const { data: alert } = await db.from("alerts").insert({ kind: "plate_conflict", plate, detail: {} }).select("id").single();
  try {
    await page.reload();
    await expect(card(page, "d-alerts")).toHaveText(String(before + 1), { timeout: 60_000 });
    await expect(main(page).getByText("Need attention · view")).toBeVisible();
    await expect(card(page, "d-alerts")).toHaveClass(/text-accent/);
    await db.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("id", alert!.id);
    await page.reload();
    await expect(card(page, "d-alerts")).toHaveText(String(before), { timeout: 60_000 });
  } finally {
    await db.from("alerts").delete().eq("id", alert!.id);
  }
});

test("only an administrator sees the dashboard", async ({ browser }) => {
  const lead = await createStaff("coordinator");
  try {
    const page = await (await browser.newContext()).newPage();
    await staffSignIn(page, lead.phone, lead.password);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/staff$/, { timeout: 60_000 });
  } finally {
    await lead.remove();
  }
});

test("the dashboard fits every screen width from 320 to 1440, with four cards and three car parks in a row on a wide screen", async ({ page, browser }) => {
  await guestCheckIn(browser, randomPlate("DH"));
  await openDashboard(page);
  for (const [width, height] of [[320, 640], [375, 700], [390, 800], [768, 1000], [1024, 800], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/admin");
    await expect(card(page, "d-checked-in")).toBeVisible({ timeout: 60_000 });
    // A phone widens its view to fit wide content, so the view must still be exactly the screen's width
    expect(await page.evaluate(() => window.innerWidth), `wider than ${width}px`).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `sideways scroll at ${width}px`).toBeLessThanOrEqual(1);
    await expect(page.getByRole("group", { name: "Dashboard filters" }).getByLabel("Period")).toBeInViewport();

    const tops = await page.getByRole("region", { name: "Summary" }).locator("a").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    if (width >= 1280) expect(new Set(tops).size, "four cards in one row").toBe(1);
    else if (width < 640) expect(new Set(tops).size, "two rows of two on a phone").toBe(2);

    const section = page.getByRole("region", { name: "Recent activity" });
    if (width >= 1024) {
      await expect(section.getByRole("table")).toBeVisible();
      await expect(section.locator('tbody img[src="/vehicle-illustration.png"]').first()).toBeVisible();
    } else {
      await expect(section.locator('li img[src="/vehicle-illustration.png"]').first()).toBeVisible();
    }
    if (width >= 1280) {
      const areaTops = await page.getByRole("region", { name: "Parking areas" }).locator("li a").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      if (areaTops.length >= 3) expect(areaTops.slice(0, 3).every((t) => t === areaTops[0]), "three car parks in one row").toBe(true);
    }
  }
});
