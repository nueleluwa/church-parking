import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, live, randomPhone, randomPlate, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
const main = (page: Page) => page.getByRole("main");
const e164 = (local: string) => `+234${local.slice(1)}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

async function openUsers(page: Page, query = "") {
  await adminSignIn(page);
  await page.goto(`/admin/users${query}`);
  await expect(main(page).getByRole("heading", { name: "Users", exact: true })).toBeVisible({ timeout: 60_000 });
}

/** A member made directly in the database. Remove it when done (it has no visits). */
async function makeMember(name: string, over: Record<string, unknown> = {}, plates: string[] = []) {
  const db = adminClient();
  const local = randomPhone();
  const { data, error } = await db.from("members").insert({ full_name: name, phone: e164(local), pin_hash: "not-a-real-hash", ...over }).select("id").single();
  expect(error).toBeNull();
  const id = data!.id as string;
  for (const plate of plates) {
    const car = (await db.from("vehicles").insert({ plate }).select("id").single()).data!;
    await db.from("member_vehicles").insert({ member_id: id, vehicle_id: car.id });
  }
  return { id, local, phone: e164(local) };
}

async function removeMembers(ids: string[]) {
  const db = adminClient();
  for (const id of ids) {
    const cars = (await db.from("member_vehicles").select("vehicle_id").eq("member_id", id)).data ?? [];
    await db.from("members").delete().eq("id", id);
    if (cars.length) await db.from("vehicles").delete().in("id", cars.map((c) => c.vehicle_id as string));
  }
}

const row = (page: Page, text: string) => main(page).locator("li").filter({ hasText: text });

async function memberSignIn(page: Page, local: string, pin: string) {
  await page.goto("/account/signin");
  await page.getByLabel("Phone number").fill(local);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("one Users entry replaces Members and Staff Accounts, with two tabs, and the old addresses still work", async ({ page }) => {
  const member = await makeMember("Zqr Redirect Member");
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openUsers(page);
    await expect(main(page).getByText("Manage church members and staff accounts for the parking system.")).toBeVisible();
    const side = page.getByRole("navigation", { name: "Parking team, desktop" });
    await expect(side.getByRole("link", { name: "Users", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(side.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
    await expect(side.getByRole("link", { name: "Staff Accounts", exact: true })).toHaveCount(0);
    const tabs = main(page).getByRole("navigation", { name: "Users", exact: true });
    await expect(tabs.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Staff accounts" }).click();
    await expect(page).toHaveURL(/tab=staff/, { timeout: 60_000 });
    await expect(side.getByRole("link", { name: "Users", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(main(page).getByRole("navigation", { name: "Users", exact: true }).getByRole("link", { name: "Staff accounts" })).toHaveAttribute("aria-current", "page");

    // Old bookmarks land on the right tab, and a search or role is carried over
    await page.goto("/admin/members?q=zqr");
    await expect(page).toHaveURL(/\/admin\/users\?q=zqr$/, { timeout: 60_000 });
    await page.goto("/admin/members");
    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 60_000 });
    await page.goto("/admin/staff?role=admin&q=lead");
    await expect(page).toHaveURL(/\/admin\/users\?tab=staff&q=lead&role=admin$/, { timeout: 60_000 });
    await page.goto("/admin/staff");
    await expect(page).toHaveURL(/\/admin\/users\?tab=staff$/, { timeout: 60_000 });
    // A member's own page keeps its address, and goes back to Users
    await page.goto(`/admin/members/${member.id}`);
    await expect(main(page).getByRole("heading", { name: "Zqr Redirect Member" })).toBeVisible({ timeout: 60_000 });
    await expect(main(page).getByRole("link", { name: "All users" })).toHaveAttribute("href", "/admin/users");
    await page.goto("/admin/members/not-an-id");
    await expect(page.getByRole("heading", { name: "We cannot find that page" })).toBeVisible({ timeout: 60_000 });
  } finally {
    await removeMembers([member.id]);
  }
});

test("the member numbers come from the records and do not overlap or invent anything", async ({ page }) => {
  await openUsers(page);
  const db = adminClient();
  const count = async (table: string) => (await db.from(table).select("*", { count: "exact", head: true })).count ?? 0;
  const lagosMonth = new Date(Date.now() + 3600_000);
  const monthStart = `${lagosMonth.getUTCFullYear()}-${String(lagosMonth.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00+01:00`;
  const total = await count("members");
  const links = await count("member_vehicles");
  const fresh = (await db.from("members").select("*", { count: "exact", head: true }).gte("created_at", monthStart)).count ?? 0;
  const off = (await db.from("members").select("*", { count: "exact", head: true }).eq("active", false)).count ?? 0;
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary.getByTestId("u-total")).toHaveText(String(total), { timeout: 60_000 });
  await expect(summary.getByTestId("u-vehicles")).toHaveText(String(links));
  await expect(summary.getByTestId("u-new")).toHaveText(String(fresh));
  await expect(summary.getByTestId("u-inactive")).toHaveText(String(off));
  await expect(page.getByTestId("u-count")).toHaveText(String(total));
  await expect(summary).toContainText("Registered vehicles");
});

test("members: search by name, phone and plate, the status and vehicles filters, Reset, and the counts on each row", async ({ page }) => {
  const car1 = randomPlate("MA");
  const car2 = randomPlate("MB");
  const car3 = randomPlate("MC");
  const withCars = await makeMember("Zqk Alpha Member", {}, [car1, car2]);
  const off = await makeMember("Zqk Bravo Member", { active: false });
  const oneCar = await makeMember("Zqk Charlie Member", {}, [car3]);
  try {
    await openUsers(page, "?q=Zqk");
    await expect(page.getByTestId("u-count")).toHaveText("3", { timeout: 60_000 });
    await expect(row(page, "Zqk Alpha Member")).toContainText("2 vehicles");
    await expect(row(page, "Zqk Alpha Member")).toContainText("Active");
    await expect(row(page, "Zqk Bravo Member")).toContainText("0 vehicles");
    await expect(row(page, "Zqk Bravo Member")).toContainText("Inactive");
    await expect(row(page, "Zqk Charlie Member")).toContainText("1 vehicle ");

    // A phone number (with or without the leading 0), and a plate, find the owner
    await page.goto(`/admin/users?q=${withCars.local}`);
    await expect(page.getByTestId("u-count")).toHaveText("1", { timeout: 60_000 });
    await expect(row(page, "Zqk Alpha Member")).toHaveCount(1);
    await page.goto(`/admin/users?q=${car3}`);
    await expect(row(page, "Zqk Charlie Member")).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId("u-count")).toHaveText("1");
    await page.goto(`/admin/users?q=${car3.replace(/[0-9]/, (d) => (d === "0" ? "O" : d))}`);
    await expect(row(page, "Zqk Charlie Member")).toHaveCount(1, { timeout: 60_000 });

    // Filters
    await page.goto("/admin/users?q=Zqk&status=inactive");
    await expect(page.getByTestId("u-count")).toHaveText("1", { timeout: 60_000 });
    await expect(row(page, "Zqk Bravo Member")).toHaveCount(1);
    await page.goto("/admin/users?q=Zqk&cars=none");
    await expect(page.getByTestId("u-count")).toHaveText("1", { timeout: 60_000 });
    await expect(row(page, "Zqk Bravo Member")).toHaveCount(1);
    await page.goto("/admin/users?q=Zqk&cars=with");
    await expect(page.getByTestId("u-count")).toHaveText("2", { timeout: 60_000 });
    await page.goto("/admin/users?status=active&cars=with&q=Zqk%20Alpha");
    await expect(page.getByTestId("u-count")).toHaveText("1", { timeout: 60_000 });
    await page.goto("/admin/users?q=nobody-zzzzqq");
    await expect(main(page).getByText("No members match these filters.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("u-showing")).toHaveText("Showing 0–0 of 0 members");

    // The form applies filters, and Reset clears them
    await page.goto("/admin/users?q=Zqk");
    const filters = main(page).getByRole("form", { name: "Filters" });
    await filters.getByLabel("Status").selectOption("inactive");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/status=inactive/, { timeout: 60_000 });
    await filters.getByRole("link", { name: "Reset" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 60_000 });

    // Switching tabs does not carry a member filter into the staff list
    await page.goto("/admin/users?q=Zqk&status=inactive");
    await main(page).getByRole("navigation", { name: "Users", exact: true }).getByRole("link", { name: "Staff accounts" }).click();
    await expect(page).toHaveURL(/\/admin\/users\?tab=staff$/, { timeout: 60_000 });
    await expect(main(page).getByRole("form", { name: "Filters" }).getByLabel("Search by name or phone number")).toHaveValue("");

    // Cars show with the illustration at desktop width
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/users?q=Zqk`);
    const table = main(page).getByRole("table", { name: "Members" });
    await expect(table.getByRole("columnheader", { name: "Date joined" })).toBeVisible({ timeout: 60_000 });
    await expect(table.locator("tr").filter({ hasText: "Zqk Alpha Member" }).locator("img")).toHaveCount(1);
  } finally {
    await removeMembers([withCars.id, off.id, oneCar.id]);
  }
});

test("pages: range, total, page numbers and rows per page agree with the records", async ({ page }) => {
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) ids.push((await makeMember(`Zqp Page Member ${String(i).padStart(2, "0")}`)).id);
  try {
    await openUsers(page, "?q=Zqp&size=10");
    await expect(page.getByTestId("u-showing")).toHaveText("Showing 1–10 of 12 members", { timeout: 60_000 });
    await expect(main(page).locator("li").filter({ hasText: "Zqp Page Member" })).toHaveCount(10);
    await main(page).getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Page 2" }).click();
    await expect(page).toHaveURL(/page=2/, { timeout: 60_000 });
    await expect(page.getByTestId("u-showing")).toHaveText("Showing 11–12 of 12 members");
    await main(page).getByRole("navigation", { name: "Rows per page" }).getByRole("link", { name: "50" }).click();
    await expect(page).toHaveURL(/size=50/, { timeout: 60_000 });
    await expect(page.getByTestId("u-showing")).toHaveText("Showing 1–12 of 12 members");
    await page.goto("/admin/users?q=Zqp&size=10&page=99");
    await expect(page.getByTestId("u-showing")).toHaveText("Showing 11–12 of 12 members", { timeout: 60_000 });
  } finally {
    await removeMembers(ids);
  }
});

test("adding a member: each problem shows on its own field, a good one is saved, audited and can sign in, and duplicates are refused", async ({ page, browser }) => {
  const db = adminClient();
  const local = randomPhone();
  const plate = randomPlate("MN");
  const name = `Zqa New Member ${Math.floor(Math.random() * 100000)}`;
  let memberId = "";
  try {
    await openUsers(page);
    await main(page).getByRole("link", { name: "Add member" }).click();
    const panel = page.getByRole("dialog", { name: "Add member" });
    await expect(panel).toBeVisible({ timeout: 60_000 });

    await panel.getByRole("button", { name: "Save member" }).click();
    await expect(panel.getByText("Enter the member's full name.").first()).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText("Enter the phone number.")).toBeVisible();
    // The PIN is optional, but a plate is needed (one vehicle row is already open)
    await expect(panel.getByText("Add the member's vehicle plate number.")).toBeVisible();

    await panel.getByLabel("Full name").fill(name);
    await panel.getByLabel("Phone number").fill(local);
    // A PIN that is typed must still be 4 numbers
    await panel.getByLabel("PIN (4 numbers, optional)").fill("12");
    await panel.getByLabel("Plate number of vehicle 1").fill(plate.toLowerCase());
    await panel.getByRole("button", { name: "Save member" }).click();
    await expect(panel.getByText("The PIN must be 4 numbers.").first()).toBeVisible({ timeout: 30_000 });
    await panel.getByLabel("PIN (4 numbers, optional)").fill("4821");
    await panel.getByLabel("Plate number of vehicle 1").fill(plate.toLowerCase());
    await panel.getByLabel("Make and model of vehicle 1").fill("Toyota Camry");
    await panel.getByRole("button", { name: "Save member" }).click();
    await expect(page).toHaveURL(/notice=added/, { timeout: 60_000 });
    await expect(page.locator('[data-toast="success"]')).toContainText("The member was added.");

    const { data: m } = await db.from("members").select("id, full_name, phone, active, pin_hash").eq("phone", e164(local)).single();
    memberId = m!.id as string;
    expect(m).toMatchObject({ full_name: name, active: true });
    expect(m!.pin_hash).not.toBe("4821");
    expect(String(m!.pin_hash)).toMatch(/^\$argon2/);
    const links = (await db.from("member_vehicles").select("vehicles(plate, make)").eq("member_id", memberId)).data as unknown as { vehicles: { plate: string; make: string } }[];
    expect(links.map((l) => l.vehicles)).toEqual([{ plate, make: "Toyota Camry" }]);
    const { data: audit } = await db.from("audit_events").select("staff_id, action").eq("action", "member_created").eq("after->>member_id", memberId);
    expect(audit).toHaveLength(1);
    expect(audit![0].staff_id).not.toBeNull();

    // The new member really can sign in with that PIN
    const mem = await (await browser.newContext()).newPage();
    await memberSignIn(mem, local, "4821");
    await expect(mem).toHaveURL(/\/account/, { timeout: 60_000 });
    await expect(mem).not.toHaveURL(/signin/);

    // The same phone number again is refused, and no second member is made
    await page.goto("/admin/users?add=1");
    const again = page.getByRole("dialog", { name: "Add member" });
    await again.getByLabel("Full name").fill("Someone Else");
    await again.getByLabel("Phone number").fill(local);
    await again.getByLabel("PIN (4 numbers, optional)").fill("1234");
    await again.getByLabel("Plate number of vehicle 1").fill(randomPlate("MD"));
    await again.getByRole("button", { name: "Save member" }).click();
    await expect(again.getByText("Someone already has an account with that phone number.").first()).toBeVisible({ timeout: 30_000 });
    expect((await db.from("members").select("id").eq("phone", e164(local))).data).toHaveLength(1);

    // A car already saved to a member is refused, nothing is created, and what was typed stays
    const other = randomPhone();
    await again.getByLabel("Phone number").fill(other);
    await again.getByLabel("Plate number of vehicle 1").fill(plate);
    await again.getByRole("button", { name: "Save member" }).click();
    await expect(again.getByText(`${spaced(plate)} is already saved to a member.`).first()).toBeVisible({ timeout: 30_000 });
    expect((await db.from("members").select("id").eq("phone", e164(other))).data).toHaveLength(0);
    await expect(again.getByLabel("Full name")).toHaveValue("Someone Else");
    expect((await db.from("vehicles").select("id").eq("plate", plate)).data).toHaveLength(1);

    // Cancel closes the panel without saving
    await again.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
  } finally {
    if (memberId) await removeMembers([memberId]);
    await db.from("vehicles").delete().eq("plate", plate);
  }
});

test("a member added without a PIN has none, gets a local phone number, and cannot sign in with any PIN, including 0000", async ({ page, browser }) => {
  const db = adminClient();
  const local = randomPhone();
  const plate = randomPlate("MP");
  let memberId = "";
  try {
    await openUsers(page, "?add=1");
    const panel = page.getByRole("dialog", { name: "Add member" });
    await panel.getByLabel("Full name").fill("Zqn No Pin Member");
    await panel.getByLabel("Phone number").fill(local);
    await panel.getByLabel("Plate number of vehicle 1").fill(plate);
    await panel.getByRole("button", { name: "Save member" }).click();
    await expect(page).toHaveURL(/notice=added/, { timeout: 60_000 });
    await expect(page.locator('[data-toast="success"]')).toContainText("The member was added.");

    const { data: m } = await db.from("members").select("id, pin_hash, phone_local").eq("phone", e164(local)).single();
    memberId = m!.id as string;
    expect(m!.pin_hash).toBeNull();
    expect(m!.phone_local).toBe(local);

    // "0000" is what an unknown phone number is compared against; it must not open this account
    for (const pin of ["0000", "1234"]) {
      const mem = await (await browser.newContext()).newPage();
      await memberSignIn(mem, local, pin);
      await expect(mem.getByText("Phone number or PIN is wrong.")).toBeVisible({ timeout: 60_000 });
      await expect(mem).toHaveURL(/signin/);
    }
  } finally {
    // Look the member up by phone, so a failure before memberId was read still cleans up
    const found = (await db.from("members").select("id").eq("phone", e164(local))).data ?? [];
    await removeMembers(found.map((f) => f.id as string));
    if (memberId && !found.some((f) => f.id === memberId)) await removeMembers([memberId]);
    await db.from("vehicles").delete().eq("plate", plate);
  }
});

test("a member added as inactive cannot sign in, and a guest's car or a deactivated vehicle is not quietly taken over", async ({ page, browser }) => {
  const db = adminClient();
  const local = randomPhone();
  const guestPlate = randomPlate("MG");
  const offPlate = randomPlate("MO");
  let memberId = "";
  try {
    await db.from("vehicles").insert({ plate: guestPlate });
    await db.from("vehicles").insert({ plate: offPlate, active: false });
    await openUsers(page, "?add=1");
    const panel = page.getByRole("dialog", { name: "Add member" });
    await panel.getByLabel("Full name").fill("Zqi Inactive Member");
    await panel.getByLabel("Phone number").fill(local);
    await panel.getByLabel("PIN (4 numbers, optional)").fill("4821");
    await panel.getByLabel("Plate number of vehicle 1").fill(offPlate);
    await panel.getByRole("button", { name: "Save member" }).click();
    await expect(panel.getByText(`${spaced(offPlate)} is deactivated. Activate it in Vehicles first.`).first()).toBeVisible({ timeout: 30_000 });
    await panel.getByLabel("Plate number of vehicle 1").fill(guestPlate);
    await panel.getByRole("switch", { name: "Account is active" }).click();
    await panel.getByRole("button", { name: "Save member" }).click();
    await expect(page).toHaveURL(/notice=added/, { timeout: 60_000 });
    const { data: m } = await db.from("members").select("id, active").eq("phone", e164(local)).single();
    memberId = m!.id as string;
    expect(m!.active).toBe(false);
    // The guest-used car is now this member's: one vehicle record, not a copy
    expect((await db.from("vehicles").select("id").eq("plate", guestPlate)).data).toHaveLength(1);
    expect((await db.from("member_vehicles").select("vehicle_id").eq("member_id", memberId)).data).toHaveLength(1);

    const mem = await (await browser.newContext()).newPage();
    await memberSignIn(mem, local, "4821");
    await expect(mem.getByText(/This account is locked/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("u-inactive")).toBeVisible();
  } finally {
    if (memberId) await removeMembers([memberId]);
    await db.from("vehicles").delete().in("plate", [guestPlate, offPlate]);
  }
});

test("a member's page: correct the name or phone, set a PIN, save a car, and switch the account off and on without losing anything", async ({ page, browser }) => {
  const db = adminClient();
  const taken = await makeMember("Zqm Taken Phone");
  const plate = randomPlate("MS");
  const original = await makeMember("Zqm Detail Member");
  const hash = await (await import("@node-rs/argon2")).hash("4821");
  await db.from("members").update({ pin_hash: hash }).eq("id", original.id);
  try {
    await openUsers(page);
    await page.goto(`/admin/members/${original.id}`);
    await expect(main(page).getByRole("heading", { name: "Zqm Detail Member" })).toBeVisible({ timeout: 60_000 });
    const manage = main(page).getByRole("region", { name: "Manage this member" });

    // Name and phone: a number someone else has is refused
    await manage.getByLabel("Phone number").fill(taken.local);
    await manage.getByRole("button", { name: "Save name and phone" }).click();
    await expect(page.locator('[data-toast="error"]')).toContainText("Someone already has an account with that phone number.", { timeout: 30_000 });
    await manage.getByLabel("Full name").fill("Zqm Renamed Member");
    await manage.getByLabel("Phone number").fill(original.local);
    await manage.getByRole("button", { name: "Save name and phone" }).click();
    await expect(page.locator('[data-toast="success"]').first()).toBeVisible({ timeout: 30_000 });
    expect((await db.from("members").select("full_name").eq("id", original.id).single()).data!.full_name).toBe("Zqm Renamed Member");

    // A car: saved once, not twice, and not a number of cars that is too long
    await page.getByText("Save another car").click();
    const cars = main(page).getByRole("region", { name: "Saved cars" });
    await cars.getByLabel("Plate number").fill(plate);
    await cars.getByRole("button", { name: "Save car" }).click();
    await expect(cars.getByText(`${spaced(plate)} was saved.`)).toBeVisible({ timeout: 30_000 });
    await cars.getByLabel("Plate number").fill(plate);
    await cars.getByRole("button", { name: "Save car" }).click();
    await expect(cars.getByText("This member has already saved this vehicle.")).toBeVisible({ timeout: 30_000 });
    await expect(cars.getByRole("link", { name: spaced(plate) })).toHaveAttribute("href", /\/admin\/vehicles\/[0-9a-f-]{36}$/);

    // A PIN that is not 4 numbers is refused
    await manage.getByLabel("New PIN (4 numbers)").fill("12");
    await manage.getByRole("button", { name: "Set PIN and unlock" }).click();
    await expect.poll(async () => (await db.from("members").select("pin_hash").eq("id", original.id).single()).data!.pin_hash).toBe(hash);

    // Switch off: asked first, then they cannot sign in and cannot be checked in; their car and history stay
    await manage.getByRole("button", { name: "Switch account off" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Their visits and saved cars are kept");
    await page.getByRole("button", { name: "Yes, switch off" }).click();
    await expect(main(page).getByRole("status").filter({ hasText: "switched off" })).toBeVisible({ timeout: 30_000 });
    expect((await db.from("members").select("active").eq("id", original.id).single()).data!.active).toBe(false);
    expect((await db.from("member_vehicles").select("vehicle_id").eq("member_id", original.id)).data).toHaveLength(1);

    const mem = await (await browser.newContext()).newPage();
    await memberSignIn(mem, original.local, "4821");
    await expect(mem.getByText(/This account is locked/)).toBeVisible({ timeout: 60_000 });
    const car = (await db.from("vehicles").select("id").eq("plate", plate).single()).data!;
    const area = (await db.from("areas").select("id").eq("active", true).limit(1).single()).data!;
    const service = (await db.from("services").select("id").limit(1).single()).data!;
    const claim = (
      await db.rpc("claim_member_visit", {
        p_member: original.id, p_vehicle: car.id, p_plate: plate, p_service: service.id, p_area: area.id, p_date: today(), p_staff: null,
        p_candidates: [{ reference: "ZZZZZZ", token: "u".repeat(32) }], p_key: null,
      })
    ).data;
    expect(claim).toMatchObject({ status: "blocked", reason: "member_inactive" });
    expect((await db.from("visits").select("id").eq("vehicle_id", car.id)).data).toHaveLength(0);

    // Switch on again: they can sign in
    await manage.getByRole("button", { name: "Switch account on" }).click();
    await page.getByRole("button", { name: "Yes, switch on" }).click();
    await expect(main(page).getByRole("status").filter({ hasText: "switched on" })).toBeVisible({ timeout: 30_000 });
    await memberSignIn(mem, original.local, "4821");
    await expect(mem).toHaveURL(/\/account/, { timeout: 60_000 });
    await expect(mem).not.toHaveURL(/signin/);

    const { data: events } = await db.from("audit_events").select("action, staff_id").in("action", ["member_updated", "member_vehicle_added", "member_deactivated", "member_reactivated"]).eq("after->>member_id", original.id);
    expect(events!.map((e) => e.action).sort()).toEqual(["member_deactivated", "member_reactivated", "member_updated", "member_vehicle_added"]);
    expect(events!.every((e) => e.staff_id !== null)).toBe(true);
  } finally {
    await removeMembers([original.id, taken.id]);
    await db.from("vehicles").delete().eq("plate", plate);
  }
});

test("the row menu switches a member off after asking, and links to the member's page and the PIN form", async ({ page }) => {
  const m = await makeMember("Zqz Menu Member");
  try {
    await openUsers(page, "?q=Zqz");
    const card = row(page, "Zqz Menu Member");
    await expect(card).toHaveCount(1, { timeout: 60_000 });
    await card.getByRole("button", { name: "More actions for Zqz Menu Member" }).click();
    await expect(page.getByRole("menuitem", { name: "View details" })).toHaveAttribute("href", `/admin/members/${m.id}`);
    await expect(page.getByRole("menuitem", { name: "Set a new PIN" })).toHaveAttribute("href", `/admin/members/${m.id}#pin`);
    await page.getByRole("menuitem", { name: "Switch account off" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    expect((await adminClient().from("members").select("active").eq("id", m.id).single()).data!.active).toBe(true);
    // Cancel leaves the menu open, so the same action can be chosen again
    await page.getByRole("menuitem", { name: "Switch account off" }).click();
    await page.getByRole("button", { name: "Yes, switch off" }).click();
    await expect(card).toContainText("Inactive", { timeout: 30_000 });
    expect((await adminClient().from("members").select("active").eq("id", m.id).single()).data!.active).toBe(false);
  } finally {
    await removeMembers([m.id]);
  }
});

test("a locked member is unlocked by setting a new PIN on the member's page", async ({ page, browser }) => {
  const db = adminClient();
  const m = await makeMember("Zqu Locked Member", { locked_until: "9999-12-31T00:00:00.000Z" });
  try {
    await openUsers(page, "?q=Zqu");
    await expect(row(page, "Zqu Locked Member")).toContainText("Locked", { timeout: 60_000 });
    await page.goto(`/admin/members/${m.id}`);
    await main(page).getByLabel("New PIN (4 numbers)").fill("9034");
    await main(page).getByRole("button", { name: "Set PIN and unlock" }).click();
    await expect(page.locator('[data-toast="success"]')).toContainText("PIN changed and the account is unlocked", { timeout: 30_000 });
    expect((await db.from("members").select("locked_until").eq("id", m.id).single()).data!.locked_until).toBeNull();
    const mem = await (await browser.newContext()).newPage();
    await memberSignIn(mem, m.local, "9034");
    await expect(mem).toHaveURL(/\/account/, { timeout: 60_000 });
    await expect(mem).not.toHaveURL(/signin/);
    expect((await db.from("audit_events").select("id").eq("action", "member_pin_reset").eq("after->>member_id", m.id)).data).toHaveLength(1);
  } finally {
    await removeMembers([m.id]);
  }
});

test("staff accounts: summary, search, role and status filters, add, manage, and the protections all still work", async ({ page, browser }) => {
  const db = adminClient();
  const local = randomPhone();
  const name = `Zqs Audit Person ${Math.floor(Math.random() * 100000)}`;
  let staffId = "";
  try {
    await openUsers(page, "?tab=staff");
    const summary = page.getByRole("region", { name: "Summary" });
    const staff = (await db.from("staff").select("role, active").limit(2000)).data!;
    await expect(summary.getByTestId("s-admins")).toHaveText(String(staff.filter((s) => s.active && s.role === "admin").length), { timeout: 60_000 });
    await expect(summary.getByTestId("s-coordinators")).toHaveText(String(staff.filter((s) => s.active && s.role === "coordinator").length));
    await expect(summary.getByTestId("s-attendants")).toHaveText(String(staff.filter((s) => s.active && s.role === "attendant").length));
    await expect(summary.getByTestId("s-off")).toHaveText(String(staff.filter((s) => !s.active).length));
    await expect(page.getByTestId("s-count")).toHaveText(String(staff.length));
    await expect(main(page).getByText("Everyone on the team has their own account.")).toBeVisible();

    // Add a staff account in the panel; a phone number already used is refused
    await main(page).getByRole("link", { name: "Add staff account" }).click();
    const add = page.getByRole("dialog", { name: "Add staff account" });
    await add.getByLabel("Full name").fill(name);
    await add.getByLabel("Phone number").fill(local);
    await add.getByLabel(/^Password/).fill("a-long-enough-password");
    await add.getByRole("button", { name: "Create account" }).click();
    await expect(add.getByText(/Account created/)).toBeVisible({ timeout: 30_000 });
    await add.getByLabel("Full name").fill(name);
    await add.getByLabel("Phone number").fill(local);
    await add.getByLabel(/^Password/).fill("a-long-enough-password");
    await add.getByRole("button", { name: "Create account" }).click();
    await expect(add.getByText("Someone already has an account with that phone number.")).toBeVisible({ timeout: 30_000 });
    const created = (await db.from("staff").select("id, role, active, password_hash").eq("full_name", name).single()).data!;
    staffId = created.id as string;
    expect(created).toMatchObject({ role: "attendant", active: true });
    expect(String(created.password_hash)).toMatch(/^\$argon2/);

    // The new person signs in as an attendant
    const other = await (await browser.newContext()).newPage();
    await staffSignIn(other, local, "a-long-enough-password");
    await expect(other.getByRole("navigation", { name: "Parking team", exact: true }).getByRole("link")).toHaveCount(3);

    // Search and filters
    await page.goto(`/admin/users?tab=staff&q=${encodeURIComponent(name)}`);
    await expect(page.getByTestId("s-count")).toHaveText("1", { timeout: 60_000 });
    await page.goto(`/admin/users?tab=staff&q=${local.slice(-7)}`);
    await expect(page.getByTestId("s-count")).toHaveText("1", { timeout: 60_000 });
    await page.goto(`/admin/users?tab=staff&q=${encodeURIComponent(name)}&role=admin`);
    await expect(main(page).getByText("No one matches.")).toBeVisible({ timeout: 60_000 });
    await page.goto("/admin/users?tab=staff&role=admin&status=active");
    await expect(main(page).locator("li").getByText("(you)")).toBeVisible({ timeout: 60_000 });

    // Manage: change the role
    await page.goto(`/admin/users?tab=staff&q=${encodeURIComponent(name)}`);
    await main(page).getByRole("link", { name: `Manage ${name}` }).click();
    const manage = page.getByRole("dialog", { name: `Manage ${name}` });
    await expect(manage).toBeVisible({ timeout: 60_000 });
    await manage.getByLabel("Role").selectOption("coordinator");
    await manage.getByRole("button", { name: "Save role" }).click();
    await expect(page.locator('[data-toast="success"]').first()).toBeVisible({ timeout: 30_000 });
    expect((await db.from("staff").select("role").eq("id", staffId).single()).data!.role).toBe("coordinator");

    // New password, then name and phone (a taken number is refused)
    await manage.getByLabel(/^New password/).fill("another-long-password");
    await manage.getByRole("button", { name: "Set new password" }).click();
    await expect(page.locator('[data-toast="success"]').last()).toBeVisible({ timeout: 30_000 });
    const lead = await createStaff("attendant");
    try {
      await manage.getByLabel("Phone number").fill(lead.phone);
      await manage.getByRole("button", { name: "Save name and phone" }).click();
      await expect(manage.getByText("Someone already has an account with that phone number.")).toBeVisible({ timeout: 30_000 });
    } finally {
      await lead.remove();
    }

    // Switch off: they are signed out at once, and their record is kept
    await manage.getByRole("button", { name: "Switch account off" }).click();
    await expect.poll(async () => (await db.from("staff").select("active").eq("id", staffId).single()).data!.active, { timeout: 30_000 }).toBe(false);
    await other.goto("/staff/history");
    await expect(other).toHaveURL(/\/staff\/signin$/, { timeout: 60_000 });
    expect((await db.from("staff").select("id").eq("id", staffId)).data).toHaveLength(1);
    await page.goto(`/admin/users?tab=staff&status=inactive&q=${encodeURIComponent(name)}`);
    await expect(main(page).locator("li").filter({ hasText: name })).toBeVisible({ timeout: 60_000 });

    // The admin cannot switch themselves off or remove their own admin role
    await page.goto("/admin/users?tab=staff&role=admin&status=active");
    const me = main(page).locator("li").filter({ hasText: "(you)" });
    await me.getByRole("link", { name: /^Manage/ }).click();
    const mine = page.getByRole("dialog", { name: /^Manage/ });
    await mine.getByRole("button", { name: "Switch account off" }).click();
    await expect(mine.getByText("You cannot switch off your own account.")).toBeVisible({ timeout: 30_000 });
    await mine.getByLabel("Role").selectOption("attendant");
    await mine.getByRole("button", { name: "Save role" }).click();
    await expect(mine.getByText(/cannot remove your own admin access/)).toBeVisible({ timeout: 30_000 });

    const { data: audit } = await db.from("audit_events").select("action").in("action", ["staff_create", "staff_role", "staff_password_reset", "staff_deactivate"]).eq("after->>staff_id", staffId);
    expect((audit ?? []).map((a) => a.action).sort()).toEqual(["staff_create", "staff_deactivate", "staff_password_reset", "staff_role"]);
  } finally {
    if (staffId) await db.from("staff").update({ active: false }).eq("id", staffId);
  }
});

test("staff pages keep their range and page size in the address", async ({ page }) => {
  await openUsers(page, "?tab=staff&size=10");
  const total = Number(await page.getByTestId("s-count").textContent());
  const shown = Math.min(10, total);
  await expect(page.getByTestId("s-showing")).toHaveText(`Showing 1–${shown} of ${total} ${total === 1 ? "account" : "accounts"}`);
  await page.goto("/admin/users?tab=staff&page=99");
  await expect(page.getByTestId("s-showing")).toContainText(`of ${total}`, { timeout: 60_000 });
});

test("only an administrator can use Users, and the old addresses do not let anyone in", async ({ browser }) => {
  const lead = await createStaff("coordinator");
  const m = await makeMember("Zqx Permission Member");
  try {
    const page = await (await browser.newContext()).newPage();
    await staffSignIn(page, lead.phone, lead.password);
    for (const path of ["/admin/users", "/admin/users?tab=staff", "/admin/users?add=1", "/admin/members", "/admin/staff", `/admin/members/${m.id}`]) {
      // A redirect that happens while the page is streaming can abort the load, so wait only for the first answer
      await page.goto(path, { waitUntil: "commit" }).catch(() => undefined);
      await expect(page, path).toHaveURL(/\/staff$/, { timeout: 60_000 });
    }
  } finally {
    await lead.remove();
    await removeMembers([m.id]);
  }
});

test("both tabs and their panels fit every screen width from 320 to 1440 without sideways scrolling", async ({ page }) => {
  const m = await makeMember("Zqw Width Member With A Rather Long Name Indeed", {}, [randomPlate("MW")]);
  try {
    await openUsers(page);
    for (const [width, height] of [[320, 640], [375, 700], [390, 800], [768, 1000], [1024, 800], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const url of ["/admin/users?q=Zqw", "/admin/users?tab=staff", "/admin/users?q=Zqw&add=1", "/admin/users?tab=staff&add=1"]) {
        await page.goto(url);
        await expect(main(page).getByRole("heading", { name: "Users", exact: true })).toBeVisible({ timeout: 60_000 });
        // A phone widens its view to fit wide content, so the view must still be exactly the screen's width
        expect(await page.evaluate(() => window.innerWidth), `${url} is wider than ${width}px`).toBe(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${url} scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
        if (url.endsWith("add=1")) {
          const panel = page.getByRole("dialog");
          expect((await panel.boundingBox())!.width).toBeLessThanOrEqual(width);
          await expect(panel.getByRole("button", { name: /^(Save member|Create account)$/ })).toBeInViewport();
        }
      }
      await page.goto("/admin/users?q=Zqw");
      if (width >= 1440) await expect(main(page).getByRole("table", { name: "Members" })).toBeVisible({ timeout: 60_000 });
      else await expect(main(page).locator("li").filter({ hasText: "Zqw Width Member" })).toBeVisible({ timeout: 60_000 });
    }
  } finally {
    await removeMembers([m.id]);
  }
});
