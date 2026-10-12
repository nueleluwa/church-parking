import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPhone, randomPlate, staffSignIn } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

test("the admin overview shows today's numbers and the way to every admin screen; wide screens get a side menu", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/admin");
  await expect(page.getByRole("main").getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 60_000 });
  for (const label of ["Cars checked in", "Cars left", "Currently parked", "Active alerts"]) {
    await expect(page.locator("main").getByText(label, { exact: true }).first()).toBeVisible();
  }
  for (const row of ["Reports", "Services", "QR Signs", "Users", "Car Parks"]) {
    await expect(page.locator("main").getByRole("link", { name: new RegExp(`^${row}`) })).toBeVisible();
  }
  // Phone: the tab bar, no side menu
  await expect(page.getByRole("navigation", { name: "Parking team", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Parking team, desktop" })).toBeHidden();

  // Wide screen: the side menu, no tab bar
  await page.setViewportSize({ width: 1280, height: 900 });
  const side = page.getByRole("navigation", { name: "Parking team, desktop" });
  await expect(side).toBeVisible();
  await expect(side.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Parking team", exact: true })).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await side.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/, { timeout: 60_000 });
});

test("an admin adds, changes and checks services; bad times are refused", async ({ page }) => {
  const db = adminClient();
  const name = `Test Service ${Math.floor(Math.random() * 100000)}`;
  const day = (new Date().getUTCDay() + 3) % 7; // a day with no real service today
  try {
    await adminSignIn(page);
    await page.goto("/admin/services");
    await expect(page.getByRole("heading", { name: "Add a service" })).toBeVisible({ timeout: 60_000 });

    const add = page.locator("section").filter({ hasText: "Add a service" });
    await add.getByLabel("Name").fill(name);
    await add.getByLabel("Day").selectOption(String(day));
    await add.getByLabel("Starts").fill("14:00");
    await add.getByLabel("Ends").fill("13:00");
    await add.getByRole("button", { name: "Add service" }).click();
    await expect(add.getByText("The service must end after it starts.")).toBeVisible({ timeout: 30_000 });

    await add.getByLabel("Ends").fill("15:30");
    await add.getByRole("button", { name: "Add service" }).click();
    await expect(add.getByText("Service saved.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });

    const { data: row } = await db.from("services").select("id, starts_at, ends_at").eq("name", name).single();
    expect(row!.starts_at).toMatch(/^14:00/);
    expect(row!.ends_at).toMatch(/^15:30/);

    // Change it
    await page.getByText(`Change ${name}`).click();
    const card = page.locator("li").filter({ hasText: `Change ${name}` });
    await card.getByLabel("Ends").fill("16:00");
    await card.getByRole("button", { name: "Save service" }).click();
    await expect(card.getByText("Service saved.")).toBeVisible({ timeout: 30_000 });
    const { data: changed } = await db.from("services").select("ends_at").eq("id", row!.id).single();
    expect(changed!.ends_at).toMatch(/^16:00/);

    const { data: audit } = await db.from("audit_events").select("action").in("action", ["service_create", "service_update"]).order("id", { ascending: false }).limit(2);
    expect((audit ?? []).map((a) => a.action).sort()).toEqual(["service_create", "service_update"]);
  } finally {
    await db.from("services").delete().eq("name", name);
  }
});

test("QR signs: one for each car park, a printable A4 sign with the church name and a code that opens that car park", async ({ page, browser }) => {
  const db = adminClient();
  const { data: areas } = await db.from("areas").select("name, slug").eq("active", true);
  await adminSignIn(page);
  await page.goto("/admin/signs");
  await expect(page.getByRole("heading", { name: areas![0].name })).toBeVisible({ timeout: 60_000 });
  for (const a of areas!) {
    await expect(page.getByRole("img", { name: `QR code for ${a.name}` })).toBeVisible();
    await expect(page.getByText(`/c/${a.slug}`)).toBeVisible();
  }

  await page.goto("/admin/signs/cp1");
  const sign = page.getByRole("article");
  await expect(sign.getByText("PARKING CHECK-IN")).toBeVisible({ timeout: 60_000 });
  await expect(sign.getByText("Christ Church International").first()).toBeVisible();
  await expect(sign.getByText(areas!.find((a) => a.slug === "cp1")!.name)).toBeVisible();
  await expect(sign.getByRole("img", { name: /QR code for/ }).locator("svg")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print this sign" })).toBeVisible();

  // Printing leaves only the sign: no header, no tab bar
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("banner")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Parking team", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Print this sign" })).toBeHidden();
  await expect(sign).toBeVisible();

  // An unknown car park is not found, and an attendant cannot open signs
  await page.emulateMedia({ media: "screen" });
  await page.goto("/admin/signs/nowhere");
  await expect(page.getByRole("heading", { name: "We cannot find that page" })).toBeVisible({ timeout: 60_000 });
  const attendant = await createStaff("attendant");
  try {
    const p = await (await browser.newContext()).newPage();
    await staffSignIn(p, attendant.phone, attendant.password);
    await p.goto("/admin/signs");
    await expect(p).toHaveURL(/\/staff$/, { timeout: 60_000 });
  } finally {
    await attendant.remove();
  }
});

test("the retention job deletes guest visits older than 24 months and keeps recent ones, open ones and members' visits", async () => {
  const db = adminClient();
  const [{ data: service }, { data: area }] = await Promise.all([
    db.from("services").select("id").limit(1).single(),
    db.from("areas").select("id").limit(1).single(),
  ]);
  const old = new Date(Date.now() - 800 * 86_400_000).toISOString();
  const recent = new Date(Date.now() - 100 * 86_400_000).toISOString();

  async function makeVisit(plate: string, checkedInAt: string, status: "released" | "parked") {
    const { data: vehicle } = await db.from("vehicles").insert({ plate }).select("id").single();
    const { data: guest } = await db.from("guests").insert({ full_name: "Retention Test", phone: randomPhone() }).select("id").single();
    const { data: visit, error } = await db
      .from("visits")
      .insert({
        reference: `PK-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        pass_token: `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 22).padEnd(22, "x"),
        vehicle_id: vehicle!.id,
        guest_id: guest!.id,
        service_id: service!.id,
        area_id: area!.id,
        service_date: checkedInAt.slice(0, 10),
        status,
        checked_in_at: checkedInAt,
        released_at: status === "released" ? checkedInAt : null,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return { visitId: visit!.id as string, vehicleId: vehicle!.id as string, guestId: guest!.id as string };
  }

  const oldOne = await makeVisit(randomPlate("OL"), old, "released");
  const recentOne = await makeVisit(randomPlate("RC"), recent, "released");
  const oldOpen = await makeVisit(randomPlate("OP"), old, "parked");

  const cutoff = new Date(Date.now() - 730 * 86_400_000).toISOString();
  const { error } = await db.rpc("delete_expired_guest_data", { p_before: cutoff });
  expect(error).toBeNull();

  const exists = async (table: string, id: string) =>
    ((await db.from(table).select("id", { count: "exact", head: true }).eq("id", id)).count ?? 0) === 1;
  expect(await exists("visits", oldOne.visitId)).toBe(false);
  expect(await exists("guests", oldOne.guestId)).toBe(false);
  expect(await exists("vehicles", oldOne.vehicleId)).toBe(false);
  expect(await exists("visits", recentOne.visitId)).toBe(true);
  expect(await exists("visits", oldOpen.visitId)).toBe(true);

  // Tidy up what this test made
  for (const v of [recentOne, oldOpen]) {
    await db.from("visits").delete().eq("id", v.visitId);
    await db.from("guests").delete().eq("id", v.guestId);
    await db.from("vehicles").delete().eq("id", v.vehicleId);
  }
});

test("an admin adds a car park: it gets its own QR address and sign, drivers can check in there, duplicates are refused, and a car park with cars in it cannot be switched off", async ({ page, browser }) => {
  const db = adminClient();
  const name = `Test Lot ${Math.floor(Math.random() * 100000)}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  try {
    await adminSignIn(page);
    await page.goto("/admin/areas");
    const add = page.locator("section").filter({ hasText: "Add a car park" });
    await add.getByLabel("Name of the car park").fill("Car Park 1");
    await add.getByRole("button", { name: "Add car park" }).click();
    await expect(add.getByText("Another car park already has that name.")).toBeVisible({ timeout: 60_000 });

    await add.getByLabel("Name of the car park").fill(name);
    await add.getByRole("button", { name: "Add car park" }).click();
    await expect(add.getByText(`Its QR address is /c/${slug}`)).toBeVisible({ timeout: 60_000 });
    const { data: area } = await db.from("areas").select("id, active, slug").eq("name", name).single();
    expect(area).toMatchObject({ active: true, slug });

    // It is listed, has a sign, and drivers can check in there
    await page.reload();
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.goto(`/admin/signs/${slug}`);
    await expect(page.getByRole("article").getByText(name)).toBeVisible({ timeout: 60_000 });
    const plate = randomPlate("LT");
    await guestCheckIn(browser, plate, slug);

    // It cannot be switched off while a car is parked in it
    await page.goto("/admin/areas");
    const card = page.locator("li").filter({ hasText: name });
    await card.getByText("Switch off", { exact: true }).click();
    await card.getByRole("button", { name: "Switch off this car park" }).click();
    await expect(card.getByText(/1 car is still parked here/)).toBeVisible({ timeout: 60_000 });

    // Once the car has gone it can be switched off, and then the sign stops working
    await db.from("visits").update({ status: "released", released_at: new Date().toISOString(), release_method: "scan" }).eq("area_id", area!.id);
    await card.getByRole("button", { name: "Switch off this car park" }).click();
    await expect(card.getByText(/Car park switched off/)).toBeVisible({ timeout: 60_000 });
    expect((await db.from("areas").select("active").eq("id", area!.id).single()).data!.active).toBe(false);
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(`/c/${slug}`);
    await expect(guest.getByRole("heading", { name: "We cannot find that page" })).toBeVisible({ timeout: 60_000 });

    const { data: audit } = await db.from("audit_events").select("action").in("action", ["area_create", "area_deactivate"]).order("id", { ascending: false }).limit(2);
    expect((audit ?? []).map((a) => a.action).sort()).toEqual(["area_create", "area_deactivate"]);
  } finally {
    const { data: a } = await db.from("areas").select("id").eq("name", name).maybeSingle();
    if (a) {
      const { data: visits } = await db.from("visits").select("id, vehicle_id, guest_id").eq("area_id", a.id);
      for (const v of visits ?? []) {
        await db.from("audit_events").update({ visit_id: null }).eq("visit_id", v.id);
        await db.from("alerts").delete().eq("visit_id", v.id);
        await db.from("visits").delete().eq("id", v.id);
        await db.from("guests").delete().eq("id", v.guest_id);
        await db.from("vehicles").delete().eq("id", v.vehicle_id);
      }
      await db.from("areas").delete().eq("id", a.id);
    }
  }
});
