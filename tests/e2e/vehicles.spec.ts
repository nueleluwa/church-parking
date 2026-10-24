import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPhone, randomPlate, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
const main = (page: Page) => page.getByRole("main");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

async function adminId() {
  return (await adminClient().from("staff").select("id").eq("phone", process.env.ADMIN_PHONE!).single()).data!.id as string;
}

async function openVehicles(page: Page, query = "") {
  await adminSignIn(page);
  await page.goto(`/admin/vehicles${query}`);
  await expect(main(page).getByRole("heading", { name: "Vehicles", exact: true })).toBeVisible({ timeout: 60_000 });
}

/** A vehicle record made directly, with no visits (so it can be removed afterwards). */
async function makeVehicle(tag: string, over: Record<string, unknown> = {}, plateOverride?: string) {
  const plate = plateOverride ?? randomPlate(tag);
  const { data, error } = await adminClient().from("vehicles").insert({ plate, ...over }).select("id").single();
  expect(error).toBeNull();
  return { plate, id: data!.id as string };
}

async function makeMember(name = "Vehicle Owner QA") {
  const { data, error } = await adminClient()
    .from("members")
    .insert({ full_name: name, phone: `+234${randomPhone().slice(1)}`, pin_hash: "not-a-real-hash" })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

const row = (page: Page, plate: string) => main(page).locator("li").filter({ hasText: spaced(plate) });

async function openAddPanel(page: Page) {
  await main(page).getByRole("link", { name: "Add vehicle" }).click();
  const panel = page.getByRole("dialog", { name: "Add vehicle" });
  await expect(panel).toBeVisible({ timeout: 60_000 });
  return panel;
}

test("the page has its title, description and Add vehicle button, and four summaries that add up to the register", async ({ page }) => {
  await openVehicles(page);
  await expect(main(page).getByText("Manage all vehicles registered in the church parking system.")).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Add vehicle" })).toBeVisible();

  const db = adminClient();
  // The database answers at most 1000 rows at a time, so read every page
  const all = async (table: string, columns: string) => {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from(table).select(columns).order(columns.split(",")[0].trim()).range(from, from + 999);
      rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
      if (!data || data.length < 1000) return rows;
    }
  };
  const vehicles = (await all("vehicles", "id, active")) as { id: string; active: boolean }[];
  const linked = new Set((await all("member_vehicles", "vehicle_id, member_id")).map((l) => l.vehicle_id as string));
  const expected = {
    total: vehicles.length,
    member: vehicles.filter((v) => v.active && linked.has(v.id)).length,
    guest: vehicles.filter((v) => v.active && !linked.has(v.id)).length,
    inactive: vehicles.filter((v) => !v.active).length,
  };
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary.getByTestId("vh-total")).toHaveText(String(expected.total), { timeout: 60_000 });
  await expect(summary.getByTestId("vh-member")).toHaveText(String(expected.member));
  await expect(summary.getByTestId("vh-guest")).toHaveText(String(expected.guest));
  await expect(summary.getByTestId("vh-inactive")).toHaveText(String(expected.inactive));
  // The three groups do not overlap, so they add up to the total
  expect(expected.member + expected.guest + expected.inactive).toBe(expected.total);
  // The list heading counts the same vehicles
  await expect(page.getByTestId("vh-count")).toHaveText(String(expected.total));
  // No phone number is ever listed
  await expect(main(page)).not.toContainText(/\+234\d{9}|\b0[789]0\d{8}\b/);
});

test("filters by type, ownership, status and plate (look-alike letters too), Reset clears them, and the choice stays in the address", async ({ page }) => {
  const owner = await makeMember();
  const guestSuv = await makeVehicle("VF", { vehicle_type: "suv", make: "Toyota Prado", colour: "Black" });
  const guestOffBus = await makeVehicle("VG", { vehicle_type: "bus", active: false });
  const memberCar = await makeVehicle("VH", { vehicle_type: "car" });
  const db = adminClient();
  await db.from("member_vehicles").insert({ member_id: owner, vehicle_id: memberCar.id });
  try {
    await openVehicles(page, `?q=${guestSuv.plate}`);
    await expect(row(page, guestSuv.plate)).toHaveCount(1, { timeout: 60_000 });
    await expect(row(page, guestSuv.plate)).toContainText("SUV · Toyota Prado · Black");
    await expect(row(page, guestSuv.plate)).toContainText("Guest vehicle");
    await expect(row(page, guestSuv.plate)).toContainText("Active");

    // Look-alike characters find it too (0 for O, 1 for I)
    const alike = guestSuv.plate.replace(/[0-9]/, (d) => (d === "0" ? "O" : d));
    await page.goto(`/admin/vehicles?q=${alike}`);
    await expect(row(page, guestSuv.plate)).toHaveCount(1, { timeout: 60_000 });

    // Each filter narrows; an unmatched one says so
    await page.goto(`/admin/vehicles?q=${guestSuv.plate}&type=suv&owner=guest&status=active`);
    await expect(row(page, guestSuv.plate)).toHaveCount(1, { timeout: 60_000 });
    for (const miss of ["type=bus", "owner=member", "status=inactive"]) {
      await page.goto(`/admin/vehicles?q=${guestSuv.plate}&${miss}`);
      await expect(main(page).getByText("No vehicles match these filters.")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("vh-count")).toHaveText("0");
      await expect(page.getByTestId("vh-showing")).toHaveText("Showing 0–0 of 0 vehicles");
    }
    await page.goto(`/admin/vehicles?q=${guestOffBus.plate}&status=inactive`);
    await expect(row(page, guestOffBus.plate)).toContainText("Inactive");
    await page.goto(`/admin/vehicles?q=${memberCar.plate}&owner=member`);
    await expect(row(page, memberCar.plate)).toContainText("Member · Vehicle Owner QA", { timeout: 60_000 });

    // The form applies the same filters, and Reset clears them
    await page.goto(`/admin/vehicles?q=${guestSuv.plate}`);
    const filters = main(page).getByRole("form", { name: "Filters" });
    await filters.getByLabel("Ownership").selectOption("guest");
    await filters.getByLabel("Vehicle type").selectOption("suv");
    await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/owner=guest/, { timeout: 60_000 });
    await expect(page).toHaveURL(/type=suv/);
    await expect(page).toHaveURL(/q=/);
    await filters.getByRole("link", { name: "Reset" }).click();
    await expect(page).toHaveURL(/\/admin\/vehicles$/, { timeout: 60_000 });
  } finally {
    await db.from("members").delete().eq("id", owner);
    await db.from("vehicles").delete().in("id", [guestSuv.id, guestOffBus.id, memberCar.id]);
  }
});

test("adding a guest vehicle: each problem shows on its own field, a good one is saved and audited, and a duplicate plate is refused", async ({ page }) => {
  const db = adminClient();
  const plate = randomPlate("VA");
  try {
    await openVehicles(page);
    const panel = await openAddPanel(page);

    await panel.getByRole("button", { name: "Save vehicle" }).click();
    await expect(panel.getByText("Enter the plate number.").first()).toBeVisible({ timeout: 30_000 });
    await panel.getByLabel("Plate number").fill("AB");
    await panel.getByRole("button", { name: "Save vehicle" }).click();
    await expect(panel.getByText("A plate number has at least 3 letters or numbers.").first()).toBeVisible({ timeout: 30_000 });

    // Typed with a dash, a space and lower case: it is saved the way plates are stored
    await panel.getByLabel("Plate number").fill(`${plate.slice(0, 3).toLowerCase()}-${plate.slice(3, 6)} ${plate.slice(6)}`);
    await panel.getByLabel("Vehicle type").selectOption("suv");
    await panel.getByLabel("Make and model").fill("Honda CR-V");
    await panel.getByLabel("Colour").fill("Grey");
    await panel.getByRole("button", { name: "Save vehicle" }).click();
    await expect(page).toHaveURL(/notice=added/, { timeout: 60_000 });
    await expect(page.locator('[data-toast="success"]')).toContainText(`${spaced(plate)} was added.`);

    const { data: saved } = await db.from("vehicles").select("id, plate, vehicle_type, make, colour, active, created_at").eq("plate", plate).single();
    expect(saved).toMatchObject({ plate, vehicle_type: "suv", make: "Honda CR-V", colour: "Grey", active: true });
    expect(saved!.created_at).not.toBeNull();
    expect((await db.from("member_vehicles").select("vehicle_id").eq("vehicle_id", saved!.id)).data).toHaveLength(0);
    const { data: audit } = await db.from("audit_events").select("staff_id, action, after").eq("action", "vehicle_added").eq("after->>vehicle_id", saved!.id);
    expect(audit).toHaveLength(1);
    expect(audit![0].staff_id).toBe(await adminId());

    // The same plate again (typed differently) is refused, and what was typed stays
    await page.goto("/admin/vehicles?add=1");
    const again = page.getByRole("dialog", { name: "Add vehicle" });
    await again.getByLabel("Plate number").fill(plate.toLowerCase());
    await again.getByRole("button", { name: "Save vehicle" }).click();
    await expect(again.getByText("This plate is already registered.").first()).toBeVisible({ timeout: 30_000 });
    await expect(again.getByLabel("Plate number")).toHaveValue(plate.toLowerCase());
    await expect(again.getByRole("button", { name: "Save vehicle" })).toBeEnabled();
    expect((await db.from("vehicles").select("id").eq("plate", plate)).data).toHaveLength(1);

    // Cancel closes the panel without saving anything
    await again.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 60_000 });
  } finally {
    await db.from("vehicles").delete().eq("plate", plate);
  }
});

test("a member vehicle needs a member found by search; it can be edited back to a guest vehicle, and each step is audited", async ({ page }) => {
  const db = adminClient();
  const owner = await makeMember("Vehicle Owner QA");
  const plate = randomPlate("VM");
  try {
    await openVehicles(page);
    const panel = await openAddPanel(page);
    await panel.getByLabel("Plate number").fill(plate);
    await panel.getByRole("radio", { name: "Member" }).check();
    await panel.getByRole("button", { name: "Save vehicle" }).click();
    await expect(panel.getByText("Choose the member who owns this vehicle.").first()).toBeVisible({ timeout: 30_000 });

    await panel.getByLabel("Linked member").fill("zzzz-nobody");
    await expect(panel.getByText("No member found.")).toBeVisible({ timeout: 30_000 });
    await panel.getByLabel("Linked member").fill("Vehicle Owner QA");
    await panel.getByRole("button", { name: /Vehicle Owner QA/ }).first().click();
    await expect(panel.getByTestId("linked-member")).toHaveText("Vehicle Owner QA");
    await panel.getByRole("button", { name: "Save vehicle" }).click();
    await expect(page).toHaveURL(/notice=added/, { timeout: 60_000 });

    const { data: v } = await db.from("vehicles").select("id").eq("plate", plate).single();
    const links = (await db.from("member_vehicles").select("member_id").eq("vehicle_id", v!.id)).data!;
    expect(links).toEqual([{ member_id: owner }]);

    // Now a guest vehicle: the link goes, and the change is recorded with who made it
    await page.goto(`/admin/vehicles?edit=${v!.id}`);
    const edit = page.getByRole("dialog", { name: /Edit / });
    await expect(edit.getByTestId("linked-member")).toHaveText("Vehicle Owner QA");
    await expect(edit.getByLabel("Plate number")).toHaveAttribute("readonly", "");
    await edit.getByRole("radio", { name: "Guest" }).check();
    await edit.getByRole("button", { name: "Save vehicle" }).click();
    await expect(page).toHaveURL(/notice=saved/, { timeout: 60_000 });
    expect((await db.from("member_vehicles").select("member_id").eq("vehicle_id", v!.id)).data).toHaveLength(0);
    const { data: events } = await db.from("audit_events").select("action, staff_id, after").like("action", "vehicle_%").eq("after->>vehicle_id", v!.id);
    expect(events!.map((e) => e.action).sort()).toEqual(["vehicle_added", "vehicle_owner_changed"]);
    expect(events!.every((e) => e.staff_id !== null)).toBe(true);
  } finally {
    await db.from("members").delete().eq("id", owner);
    await db.from("vehicles").delete().eq("plate", plate);
  }
});

test("editing a vehicle changes its details and status, and the vehicle page shows the changes and the facts", async ({ page }) => {
  const db = adminClient();
  const car = await makeVehicle("VE", { vehicle_type: "car", make: "Toyota Corolla", colour: "Red" });
  try {
    await openVehicles(page, `?edit=${car.id}`);
    const edit = page.getByRole("dialog", { name: `Edit ${spaced(car.plate)}` });
    await expect(edit.getByLabel("Make and model")).toHaveValue("Toyota Corolla", { timeout: 60_000 });
    await edit.getByLabel("Colour").fill("Blue");
    await edit.getByLabel("Status").selectOption("inactive");
    await edit.getByRole("button", { name: "Save vehicle" }).click();
    await expect(page).toHaveURL(/notice=saved/, { timeout: 60_000 });
    expect((await db.from("vehicles").select("colour, active, make").eq("id", car.id).single()).data).toEqual({ colour: "Blue", active: false, make: "Toyota Corolla" });

    await page.goto(`/admin/vehicles/${car.id}`);
    const details = page.getByRole("region", { name: "Details" });
    await expect(details).toContainText("Toyota Corolla", { timeout: 60_000 });
    await expect(details).toContainText("Blue");
    await expect(details).toContainText("Guest vehicle (not linked to a member)");
    await expect(details).toContainText("Inactive");
    await expect(page.getByRole("region", { name: "Current visit" })).toContainText("This vehicle has no open visit.");
    const changes = page.getByRole("region", { name: "Changes to this vehicle" });
    await expect(changes).toContainText("Deactivated");
    await expect(changes).toContainText("Details changed");
    await expect(changes).toContainText("Colour".toLowerCase());

    // Too-long values are refused on their own fields
    await page.goto(`/admin/vehicles?edit=${car.id}`);
    const again = page.getByRole("dialog", { name: /Edit / });
    await again.getByLabel("Colour").fill("x".repeat(21));
    await again.getByRole("button", { name: "Save vehicle" }).click();
    await expect(again.getByText("Use 20 letters or fewer.").first()).toBeVisible({ timeout: 30_000 });
    expect((await db.from("vehicles").select("colour").eq("id", car.id).single()).data!.colour).toBe("Blue");
  } finally {
    await db.from("vehicles").delete().eq("id", car.id);
  }
});

test("a deactivated vehicle cannot be checked in, but deactivating a car that is parked does not release it", async ({ page, browser }) => {
  const db = adminClient();
  const off = await makeVehicle("VI", { active: false });
  const plate = randomPlate("VP");
  try {
    // A guest tries the deactivated plate
    const ctx = await browser.newContext();
    const guest = await ctx.newPage();
    await guest.goto("/c/cp1");
    await guest.getByRole("button", { name: "Continue as guest" }).click();
    await guest.getByLabel("Your name").fill("Stability Guest");
    await guest.getByLabel("Phone number").fill(randomPhone());
    await guest.getByLabel("Plate number").fill(off.plate);
    await guest.getByRole("button", { name: "Get my pass" }).click();
    await guest.getByRole("button", { name: "Yes, get my pass" }).click();
    await expect(guest.getByText("This vehicle is not active. Please see an attendant.")).toBeVisible({ timeout: 60_000 });
    await ctx.close();
    expect((await db.from("visits").select("id").eq("vehicle_id", off.id)).data).toHaveLength(0);

    // A member's deactivated vehicle is refused by the database function itself
    const owner = await makeMember("Inactive Owner QA");
    await db.from("member_vehicles").insert({ member_id: owner, vehicle_id: off.id });
    const area = (await db.from("areas").select("id").eq("active", true).limit(1).single()).data!;
    const service = (await db.from("services").select("id").limit(1).single()).data!;
    const { data: claim } = await db.rpc("claim_member_visit", {
      p_member: owner, p_vehicle: off.id, p_plate: off.plate, p_service: service.id, p_area: area.id, p_date: today(), p_staff: null,
      p_candidates: [{ reference: "ZZZZZZ", token: "t".repeat(32) }], p_key: null,
    });
    expect(claim).toMatchObject({ status: "blocked", reason: "vehicle_inactive" });
    await db.from("members").delete().eq("id", owner);

    // Deactivating a car that is parked leaves its visit open, and it can still be released at the exit
    await guestCheckIn(browser, plate);
    const { data: v } = await db.from("vehicles").select("id").eq("plate", plate).single();
    const { data: visit } = await db.from("visits").select("id").eq("vehicle_id", v!.id).single();
    await adminSignIn(page);
    await page.goto(`/admin/vehicles/${v!.id}`);
    await expect(page.getByRole("region", { name: "Current visit" })).toContainText("Checked in", { timeout: 60_000 });
    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("stays open");
    await page.getByRole("button", { name: "Yes, deactivate" }).click();
    await expect(main(page).getByRole("status")).toContainText("1 vehicle deactivated.", { timeout: 30_000 });
    expect((await db.from("vehicles").select("active").eq("id", v!.id).single()).data!.active).toBe(false);
    expect((await db.from("visits").select("status").eq("id", visit!.id).single()).data!.status).toBe("parked");
    await expect(page.getByRole("region", { name: "Current visit" })).toContainText("Checked in");
    const { data: released } = await db.rpc("release_visit", { p_visit: visit!.id, p_staff: await adminId(), p_method: "scan", p_today: today() });
    expect(released).toBeTruthy();
    expect((await db.from("visits").select("status").eq("id", visit!.id).single()).data!.status).toBe("released");

    // Activate it again
    await page.getByRole("button", { name: "Activate", exact: true }).click();
    await page.getByRole("button", { name: "Yes, activate" }).click();
    await expect(main(page).getByRole("status")).toContainText("1 vehicle activated.", { timeout: 30_000 });
    expect((await db.from("vehicles").select("active").eq("id", v!.id).single()).data!.active).toBe(true);
  } finally {
    await db.from("vehicles").delete().eq("id", off.id);
  }
});

test("changing the owner of a parked car is refused; after release it works, and the old visit keeps its own guest", async ({ page, browser }) => {
  const db = adminClient();
  const owner = await makeMember("Vehicle Owner QA");
  const plate = randomPlate("VO");
  try {
    await guestCheckIn(browser, plate);
    const { data: v } = await db.from("vehicles").select("id").eq("plate", plate).single();
    const { data: visit } = await db.from("visits").select("id, guest_id, member_id").eq("vehicle_id", v!.id).single();
    expect(visit!.guest_id).not.toBeNull();

    await openVehicles(page, `?edit=${v!.id}`);
    const edit = page.getByRole("dialog", { name: /Edit / });
    await edit.getByRole("radio", { name: "Member" }).check();
    await edit.getByLabel("Linked member").fill("Vehicle Owner QA");
    await edit.getByRole("button", { name: /Vehicle Owner QA/ }).first().click();
    await edit.getByRole("button", { name: "Save vehicle" }).click();
    await expect(edit.getByText(/checked in right now/).first()).toBeVisible({ timeout: 30_000 });
    expect((await db.from("member_vehicles").select("member_id").eq("vehicle_id", v!.id)).data).toHaveLength(0);

    await db.rpc("release_visit", { p_visit: visit!.id, p_staff: await adminId(), p_method: "scan", p_today: today() });
    await edit.getByRole("button", { name: "Save vehicle" }).click();
    await expect(page).toHaveURL(/notice=saved/, { timeout: 60_000 });
    expect((await db.from("member_vehicles").select("member_id").eq("vehicle_id", v!.id)).data).toEqual([{ member_id: owner }]);
    // History is not rewritten: the visit is still the guest's
    expect((await db.from("visits").select("guest_id, member_id").eq("id", visit!.id).single()).data).toEqual({ guest_id: visit!.guest_id, member_id: null });
  } finally {
    await db.from("members").delete().eq("id", owner);
  }
});

test("bulk: several vehicles can be deactivated after one confirmation, each is audited, and a partial failure is reported exactly", async ({ page }) => {
  const db = adminClient();
  const cars = [await makeVehicle("", {}, "QBG101ZZ"), await makeVehicle("", {}, "QBG102ZZ"), await makeVehicle("", {}, "QBG103ZZ")];
  try {
    await openVehicles(page, "?q=QBG");
    await expect(row(page, cars[0].plate)).toHaveCount(1, { timeout: 60_000 });
    for (const c of cars.slice(0, 2)) await row(page, c.plate).getByRole("checkbox").check();
    await expect(page.getByTestId("selected-count")).toHaveText("2 vehicles selected");
    await page.getByRole("button", { name: "Deactivate selected" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Their history stays");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    expect((await db.from("vehicles").select("active").in("id", [cars[0].id, cars[1].id])).data!.every((v) => v.active)).toBe(true);

    await page.getByRole("button", { name: "Deactivate selected" }).click();
    await page.getByRole("button", { name: "Yes, deactivate" }).click();
    await expect(main(page).getByRole("status")).toContainText("2 vehicles deactivated.", { timeout: 30_000 });
    expect((await db.from("vehicles").select("active").in("id", [cars[0].id, cars[1].id])).data!.every((v) => !v.active)).toBe(true);
    expect((await db.from("vehicles").select("active").eq("id", cars[2].id).single()).data!.active).toBe(true);
    const events = (await db.from("audit_events").select("staff_id, after").eq("action", "vehicle_deactivated").in("after->>vehicle_id", [cars[0].id, cars[1].id])).data!;
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.staff_id !== null)).toBe(true);

    // One of the two is removed behind the screen's back: the other still works and the message says so
    await page.reload();
    for (const c of cars.slice(0, 2)) await row(page, c.plate).getByRole("checkbox").check();
    await db.from("vehicles").delete().eq("id", cars[1].id);
    await page.getByRole("button", { name: "Activate selected", exact: true }).click();
    await page.getByRole("button", { name: "Yes, activate" }).click();
    await expect(main(page).getByRole("alert").filter({ hasText: "could not be changed" })).toContainText("1 of 2 vehicles activated. 1 could not be changed", { timeout: 30_000 });
    expect((await db.from("vehicles").select("active").eq("id", cars[0].id).single()).data!.active).toBe(true);
  } finally {
    await db.from("vehicles").delete().in("id", cars.map((c) => c.id));
  }
});

test("pages: the range, the total, the page numbers and the rows-per-page choice agree with the records", async ({ page }) => {
  const db = adminClient();
  const cars = [];
  for (let i = 0; i < 12; i++) cars.push(await makeVehicle("", {}, `QPG${100 + i}ZZ`));
  try {
    await openVehicles(page, "?q=QPG&size=10");
    await expect(page.getByTestId("vh-showing")).toHaveText("Showing 1–10 of 12 vehicles", { timeout: 60_000 });
    await expect(page.getByTestId("vh-count")).toHaveText("12");
    await expect(main(page).locator("li").filter({ hasText: /QPG/ })).toHaveCount(10);
    await main(page).getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Page 2" }).click();
    await expect(page).toHaveURL(/page=2/, { timeout: 60_000 });
    await expect(page.getByTestId("vh-showing")).toHaveText("Showing 11–12 of 12 vehicles");
    await expect(main(page).locator("li").filter({ hasText: /QPG/ })).toHaveCount(2);
    // A different size starts again at page 1 and keeps the search
    await main(page).getByRole("navigation", { name: "Rows per page" }).getByRole("link", { name: "50" }).click();
    await expect(page).toHaveURL(/size=50/, { timeout: 60_000 });
    await expect(page).toHaveURL(/q=QPG/);
    await expect(page.getByTestId("vh-showing")).toHaveText("Showing 1–12 of 12 vehicles");
    // A page number past the end falls back to the last page
    await page.goto("/admin/vehicles?q=QPG&size=10&page=99");
    await expect(page.getByTestId("vh-showing")).toHaveText("Showing 11–12 of 12 vehicles", { timeout: 60_000 });
  } finally {
    await db.from("vehicles").delete().in("id", cars.map((c) => c.id));
  }
});

test("only an administrator can see the register or a vehicle's page", async ({ browser }) => {
  const lead = await createStaff("coordinator");
  const car = await makeVehicle("VX");
  try {
    const page = await (await browser.newContext()).newPage();
    await staffSignIn(page, lead.phone, lead.password);
    for (const path of ["/admin/vehicles", `/admin/vehicles/${car.id}`, "/admin/vehicles?add=1"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/staff$/, { timeout: 60_000 });
    }
  } finally {
    await lead.remove();
    await adminClient().from("vehicles").delete().eq("id", car.id);
  }
});

test("an unknown vehicle page is not found; the register works at every screen width without sideways scrolling", async ({ page }) => {
  const car = await makeVehicle("VR", { make: "Toyota Hiace", colour: "White", vehicle_type: "van" });
  try {
    await openVehicles(page, `?q=${car.plate}`);
    await page.goto("/admin/vehicles/00000000-0000-0000-0000-000000000000");
    await expect(page.getByRole("heading", { name: "We cannot find that page" })).toBeVisible({ timeout: 60_000 });

    for (const [width, height] of [[320, 640], [375, 700], [390, 800], [768, 1000], [1024, 800], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`/admin/vehicles?q=${car.plate}`);
      await expect(page.getByTestId("vh-count")).toHaveText("1", { timeout: 60_000 });
      // A phone widens its view to fit wide content, so the view must still be exactly the screen's width
      expect(await page.evaluate(() => window.innerWidth), `the view is wider than the ${width}px screen`).toBe(width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `sideways scroll at ${width}px`).toBeLessThanOrEqual(1);
      if (width >= 1440) {
        await expect(main(page).getByRole("columnheader", { name: "Linked member / owner" })).toBeVisible();
        await expect(main(page).getByRole("link", { name: `Edit vehicle ${spaced(car.plate)}` })).toBeVisible();
      } else {
        await expect(row(page, car.plate)).toBeVisible();
      }
      // The panel fits the screen, and its buttons are reachable
      await page.goto(`/admin/vehicles?q=${car.plate}&add=1`);
      const panel = page.getByRole("dialog", { name: "Add vehicle" });
      await expect(panel).toBeVisible({ timeout: 60_000 });
      const box = (await panel.boundingBox())!;
      expect(box.width, `panel width at ${width}px`).toBeLessThanOrEqual(width);
      await expect(panel.getByRole("button", { name: "Save vehicle" })).toBeInViewport();
      await expect(panel.getByRole("button", { name: "Cancel" })).toBeInViewport();
    }
  } finally {
    await adminClient().from("vehicles").delete().eq("id", car.id);
  }
});
