import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, memberSignUp, randomPhone, randomPlate, staffSignIn } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

test("the admin overview shows today's numbers and the way to every admin screen; wide screens get a side menu", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Parking operations" })).toBeVisible({ timeout: 60_000 });
  for (const label of ["Checked in", "Released", "Still parked", "Exceptions"]) {
    await expect(page.locator("main").getByText(label, { exact: true }).first()).toBeVisible();
  }
  for (const row of ["Reports", "Services", "QR Signs", "Staff Accounts", "Members", "Car Parks"]) {
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

test("an admin manages staff: add, change role, new password, switch off; and cannot lock the church out", async ({ page, browser }) => {
  const db = adminClient();
  const phone = randomPhone();
  const name = `Audit Person ${Math.floor(Math.random() * 100000)}`;
  await adminSignIn(page);
  await page.goto("/admin/staff");
  await expect(page.getByRole("heading", { name: "Add a team member" })).toBeVisible({ timeout: 60_000 });

  const add = page.locator("section").filter({ hasText: "Add a team member" });
  await add.getByLabel("Full name").fill(name);
  await add.getByLabel("Phone number").fill(phone);
  await add.getByLabel(/^Password/).fill("a-long-enough-password");
  await add.getByRole("button", { name: "Create account" }).click();
  await expect(add.getByText(/Account created/)).toBeVisible({ timeout: 30_000 });

  // The same number again is refused
  await add.getByLabel("Full name").fill(name);
  await add.getByLabel("Phone number").fill(phone);
  await add.getByLabel(/^Password/).fill("a-long-enough-password");
  await add.getByRole("button", { name: "Create account" }).click();
  await expect(add.getByText("Someone already has an account with that phone number.")).toBeVisible({ timeout: 30_000 });

  const { data: created } = await db.from("staff").select("id, role, active").eq("full_name", name).single();
  expect(created).toMatchObject({ role: "attendant", active: true });

  // The new person can sign in, as an attendant
  const other = await (await browser.newContext()).newPage();
  await staffSignIn(other, phone, "a-long-enough-password");
  await expect(other.getByRole("navigation", { name: "Parking team", exact: true }).getByRole("link")).toHaveCount(3);

  // Change the role
  await page.reload();
  const card = page.locator("li").filter({ hasText: `Manage ${name}` });
  await card.getByText(`Manage ${name}`).click();
  await card.getByLabel("Role").selectOption("coordinator");
  await card.getByRole("button", { name: "Save role" }).click();
  await expect(card.getByText("Saved.").first()).toBeVisible({ timeout: 30_000 });
  expect((await db.from("staff").select("role").eq("id", created!.id).single()).data!.role).toBe("coordinator");

  // Switch off: they are signed out at once
  await card.getByRole("button", { name: "Switch account off" }).click();
  await expect
    .poll(async () => (await db.from("staff").select("active").eq("id", created!.id).single()).data!.active, { timeout: 30_000 })
    .toBe(false);
  await other.goto("/staff/history");
  await expect(other).toHaveURL(/\/staff\/signin$/, { timeout: 60_000 });

  // The admin cannot switch themselves off or remove their own admin role
  const me = page.locator("li").filter({ hasText: "(you)" });
  await me.getByText(/^Manage /).click();
  await me.getByRole("button", { name: "Switch account off" }).click();
  await expect(me.getByText("You cannot switch off your own account.")).toBeVisible({ timeout: 30_000 });
  await me.getByLabel("Role").selectOption("attendant");
  await me.getByRole("button", { name: "Save role" }).click();
  await expect(me.getByText(/cannot remove your own admin access/)).toBeVisible({ timeout: 30_000 });

  // Only an admin can use these actions, whatever the screen shows
  const lead = await createStaff("coordinator");
  try {
    const coord = await (await browser.newContext()).newPage();
    await staffSignIn(coord, lead.phone, lead.password);
    await coord.goto("/admin/staff");
    await expect(coord).toHaveURL(/\/staff$/, { timeout: 60_000 });
  } finally {
    await lead.remove();
  }

  const { data: audit } = await db.from("audit_events").select("action").in("action", ["staff_create", "staff_role", "staff_deactivate"]).order("id", { ascending: false }).limit(3);
  expect((audit ?? []).map((a) => a.action).sort()).toEqual(["staff_create", "staff_deactivate", "staff_role"]);
});

test("an admin unlocks a locked member by setting a new PIN, and the member can sign in", async ({ page, browser }) => {
  const db = adminClient();
  const memberPage = await (await browser.newContext()).newPage();
  const phone = await memberSignUp(memberPage, "4821");
  await expect(memberPage).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
  const e164 = `+234${phone.slice(1)}`;
  await db.from("members").update({ locked_until: "9999-12-31T00:00:00.000Z" }).eq("phone", e164);

  // Locked: the right PIN is refused
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto("/account/signin");
  await fresh.getByLabel("Phone number").fill(phone);
  await fresh.getByLabel("PIN").fill("4821");
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh.getByText(/This account is locked/)).toBeVisible({ timeout: 60_000 });

  await adminSignIn(page);
  await page.goto(`/admin/members?q=${phone}`);
  const card = page.locator("li").filter({ hasText: phone.slice(1) });
  await expect(card.getByText("Locked", { exact: true })).toBeVisible({ timeout: 60_000 });
  await card.getByText("Set a new PIN").click();
  await card.getByLabel("New PIN (4 numbers)").fill("12");
  await card.getByRole("button", { name: "Set PIN and unlock" }).click();
  await expect.poll(async () => (await db.from("members").select("locked_until").eq("phone", e164).single()).data!.locked_until).not.toBeNull();
  await card.getByLabel("New PIN (4 numbers)").fill("9034");
  await card.getByRole("button", { name: "Set PIN and unlock" }).click();
  await expect(card.getByText(/PIN changed and the account is unlocked/)).toBeVisible({ timeout: 30_000 });
  expect((await db.from("members").select("locked_until").eq("phone", e164).single()).data!.locked_until).toBeNull();

  await fresh.goto("/account/signin");
  await fresh.getByLabel("Phone number").fill(phone);
  await fresh.getByLabel("PIN").fill("9034");
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh).toHaveURL(/\/account/, { timeout: 60_000 });
  await expect(fresh).not.toHaveURL(/signin/);

  const { data: audit } = await db.from("audit_events").select("action").eq("action", "member_pin_reset").order("id", { ascending: false }).limit(1);
  expect(audit).toHaveLength(1);
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

test("reports count real visits, export a CSV with no names or phone numbers, and log the export", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("RP");
  await guestCheckIn(browser, plate);
  await adminSignIn(page);
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 60_000 });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const { count } = await db.from("visits").select("id", { count: "exact", head: true }).gte("service_date", new Date(Date.now() - 27 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })).lte("service_date", today);
  await expect(page.getByTestId("r-checked-in")).toHaveText(String(count));
  await expect(page.getByRole("cell", { name: new RegExp(plate.slice(0, 3)) }).first()).toBeVisible();
  for (const id of ["r-released", "r-parked", "r-missed", "r-no-pass", "r-conflicts", "r-member-claims", "r-no-match"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }

  // The export
  const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const csv = await res.text();
  expect(csv).toContain(plate);
  expect(csv.split("\r\n")[0]).toContain("Plate");
  expect(csv).not.toMatch(/Stability Guest/);
  expect(csv).not.toMatch(/\+?234\d{9}|\b080\d{8}\b/);
  const { data: audit } = await db.from("audit_events").select("action, after").eq("action", "export_report").order("id", { ascending: false }).limit(1).single();
  expect((audit!.after as { rows: number }).rows).toBe(count);

  // A bad range is refused, and only an admin can export
  expect((await page.request.get("/admin/reports/export?from=2026-12-01&to=2026-01-01")).status()).toBe(400);
  const coordinator = await createStaff("coordinator");
  try {
    const p = await (await browser.newContext()).newPage();
    await staffSignIn(p, coordinator.phone, coordinator.password);
    expect((await p.request.get(href!)).status()).toBe(401);
    await p.goto("/admin/reports");
    await expect(p).toHaveURL(/\/staff$/, { timeout: 60_000 });
  } finally {
    await coordinator.remove();
  }
  expect((await (await browser.newContext()).request.get(href!)).status()).toBe(401);
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
