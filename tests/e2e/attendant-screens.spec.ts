import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, guestCheckIn, live, randomPhone, randomPlate, staffSignIn } from "./helpers";
import { TEST_SERVICE_NAME } from "./test-service";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const spaced = (plate: string) => `${plate.slice(0, 3)} ${plate.slice(3, 6)} ${plate.slice(6)}`;

async function lookUp(page: Page, tab: "By plate" | "By phone" | "By reference", value: string, label: string) {
  await page.goto("/staff/search");
  await page.getByRole("tab", { name: tab }).click();
  await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Search" }).click();
}

test("the attendant home shows the service now, the two main jobs and quick links; coordinators and admins get more", async ({
  page,
  browser,
}) => {
  const attendant = await createStaff("attendant");
  const coordinator = await createStaff("coordinator");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);

    // The header is the logo header with the person's initials
    await expect(page.locator("header img[alt='CCI']")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("[data-header-right]")).toHaveText(/^TA$/);

    // The service now (rule R-1 data), and the two jobs
    await expect(page.getByText("Active service")).toBeVisible();
    await expect(page.getByText(TEST_SERVICE_NAME).first()).toBeVisible();
    await expect(page.getByText("00:00 – 23:59").first()).toBeVisible();
    await expect(page.locator("main a[href='/staff/scan']")).toBeVisible();
    await expect(page.getByRole("link", { name: /Add car/ })).toHaveAttribute("href", "/staff/register");

    // The links, and the connection
    for (const row of ["Manual Lookup", "Recent Scans", "Service Info"]) {
      await expect(page.getByRole("link", { name: new RegExp(row) })).toBeVisible();
    }
    await expect(page.getByText("Sync Status")).toBeVisible();
    await expect(page.getByText("Online")).toBeVisible();

    // An attendant has three tabs and none of the coordinator's screens
    await expect(page.getByRole("navigation", { name: "Parking team" }).getByRole("link")).toHaveCount(3);
    await expect(page.getByRole("link", { name: /Live Board/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Sweep/ })).toHaveCount(0);

    // A coordinator has five, and the Live Board and Sweep shortcuts
    const other = await (await browser.newContext()).newPage();
    await staffSignIn(other, coordinator.phone, coordinator.password);
    await expect(other.getByRole("navigation", { name: "Parking team" }).getByRole("link")).toHaveCount(5);
    await expect(other.getByRole("link", { name: /Live Board/ })).toBeVisible();
    await expect(other.getByRole("link", { name: /Sweep/ }).first()).toBeVisible();

    // An admin has six, including Admin
    const boss = await (await browser.newContext()).newPage();
    await adminSignIn(boss);
    await expect(boss.getByRole("navigation", { name: "Parking team" }).getByRole("link")).toHaveCount(6);
    await expect(boss.getByRole("navigation", { name: "Parking team" }).getByRole("link", { name: "Admin" })).toBeVisible();
  } finally {
    await attendant.remove();
    await coordinator.remove();
  }
});

test("the scan screen has a title header with a back arrow, a camera frame, and a way to type the plate instead", async ({
  page,
}) => {
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await page.locator("main a[href='/staff/scan']").click();
    await expect(page).toHaveURL(/\/staff\/scan$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Scan Pass" })).toBeVisible();
    await expect(page.getByText("Position the QR code within the frame")).toBeVisible();

    await page.getByRole("link", { name: "Enter plate number manually" }).click();
    await expect(page).toHaveURL(/\/staff\/search$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Manual Lookup" })).toBeVisible();

    // The back arrow goes to the home screen
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/staff$/, { timeout: 60_000 });
  } finally {
    await attendant.remove();
  }
});

test("a car is found by plate, phone or reference, and its card shows everything to check before releasing", async ({
  page,
  browser,
}) => {
  const db = adminClient();
  const plate = randomPlate("AT");
  const phone = randomPhone();
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto("/c/cp1");
  await guest.getByRole("button", { name: "Continue as guest" }).click();
  await guest.getByLabel("Your name").fill("Grace Adeyemi");
  await guest.getByLabel("Phone number").fill(phone);
  await guest.getByLabel("Plate number").fill(plate);
  await guest.getByRole("button", { name: "Get my pass" }).click();
  await guest.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(guest.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  const reference = (await guest.getByText(/^PK-/).innerText()).trim();
  await guestCtx.close();

  const { data: area } = await db.from("areas").select("name").eq("slug", "cp1").single();
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);

    // By plate
    await lookUp(page, "By plate", plate, "Vehicle plate number");
    await expect(page.getByRole("heading", { name: "Ready for exit" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("status").getByText("VALID PASS")).toBeVisible();
    await expect(page.locator("img[src='/vehicle-illustration.png']")).toHaveCount(1);
    await expect(page.locator("[data-plate]")).toHaveText(spaced(plate));

    // Only the first name and the last four digits are shown
    await expect(page.getByText("Grace", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Adeyemi");
    await expect(page.locator("body")).not.toContainText(phone);
    await expect(page.getByText(`•••• ${phone.slice(-4)}`)).toBeVisible();
    await expect(page.getByText("GUEST", { exact: true })).toBeVisible();

    // The facts the attendant checks
    await expect(page.getByText("Service", { exact: true })).toBeVisible();
    await expect(page.getByText(TEST_SERVICE_NAME).first()).toBeVisible();
    await expect(page.locator("[data-area]")).toHaveText(area!.name as string);
    await expect(page.getByText("Checked in", { exact: true })).toBeVisible();
    await expect(page.getByText(/^\d{2}:\d{2}$/).first()).toBeVisible();
    await expect(page.getByText("Duration")).toBeVisible();
    await expect(page.getByText(reference)).toBeVisible();
    await expect(page.getByText(/Ask the driver for their name and phone number/)).toBeVisible();

    // Release is the black button, the hold is the red one
    const colour = (name: string) =>
      page.getByRole("button", { name }).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await colour("Release car")).toBe("rgb(20, 20, 20)");
    expect(await colour("Does not match")).toBe("rgb(179, 18, 27)");

    // By phone and by reference find the same car
    await lookUp(page, "By phone", phone, "Phone number");
    await expect(page.locator("[data-plate]")).toHaveText(spaced(plate), { timeout: 60_000 });
    await lookUp(page, "By reference", reference, "Pass reference");
    await expect(page.locator("[data-plate]")).toHaveText(spaced(plate), { timeout: 60_000 });
    // The "PK-" can be left off
    await lookUp(page, "By reference", reference.replace("PK-", ""), "Pass reference");
    await expect(page.locator("[data-plate]")).toHaveText(spaced(plate), { timeout: 60_000 });

    // A number that is not there says so
    await lookUp(page, "By plate", "ZZZ999ZZ", "Vehicle plate number");
    await expect(page.getByText("No car found today.")).toBeVisible({ timeout: 60_000 });

    // Release: the card turns into "Car released" with the status Released
    await lookUp(page, "By plate", plate, "Vehicle plate number");
    await page.getByRole("button", { name: "Release car" }).click();
    await expect(page.getByRole("heading", { name: "Car released" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Vehicle has been released.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Release car" })).toHaveCount(0);
  } finally {
    await attendant.remove();
  }
});

test("Does not match holds the car, tells the coordinator, and never releases it", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("HD");
  await guestCheckIn(browser, plate);
  const since = new Date().toISOString();
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await lookUp(page, "By plate", plate, "Vehicle plate number");
    await page.getByRole("button", { name: "Does not match" }).click();
    await expect(page.getByRole("heading", { name: "Car held" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Do not release this vehicle.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Release car" })).toHaveCount(0);

    const { data: alerts } = await db.from("alerts").select("kind").eq("plate", plate).eq("kind", "no_match").gte("created_at", since);
    expect((alerts ?? []).length).toBeGreaterThanOrEqual(1);
    const { data: visit } = await db
      .from("visits")
      .select("status, vehicles!inner(plate)")
      .eq("vehicles.plate", plate)
      .single();
    expect(visit?.status).toBe("parked");

    // The hold sticks: another attendant sees On hold and cannot release it
    const other = await (await browser.newContext()).newPage();
    const second = await createStaff("attendant");
    const lead = await createStaff("coordinator");
    try {
      await staffSignIn(other, second.phone, second.password);
      await lookUp(other, "By plate", plate, "Vehicle plate number");
      await expect(other.getByRole("heading", { name: "On hold" })).toBeVisible({ timeout: 60_000 });
      await expect(other.getByRole("button", { name: "Release car" })).toHaveCount(0);
      await expect(other.getByText("Only a coordinator can clear a hold.")).toBeVisible();

      // A coordinator clears it with a reason, then the car can be released
      const boss = await (await browser.newContext()).newPage();
      await staffSignIn(boss, lead.phone, lead.password);
      await lookUp(boss, "By plate", plate, "Vehicle plate number");
      await expect(boss.getByRole("heading", { name: "On hold" })).toBeVisible({ timeout: 60_000 });
      await boss.getByRole("button", { name: "Clear hold" }).click();
      await expect(boss.getByText("Please write a reason")).toBeVisible({ timeout: 30_000 });
      await boss.getByLabel("Why is the hold being cleared?").fill("Driver proved the car is theirs");
      await boss.getByRole("button", { name: "Clear hold" }).click();
      await expect(boss.getByText("Hold cleared.")).toBeVisible({ timeout: 30_000 });
      await lookUp(other, "By plate", plate, "Vehicle plate number");
      await expect(other.getByRole("heading", { name: "Ready for exit" })).toBeVisible({ timeout: 60_000 });
      await other.getByRole("button", { name: "Release car" }).click();
      await expect(other.getByRole("heading", { name: "Car released" })).toBeVisible({ timeout: 60_000 });

      const { data: audit } = await db.from("audit_events").select("action, reason").eq("action", "clear_hold").order("id", { ascending: false }).limit(1).single();
      expect(audit?.reason).toBe("Driver proved the car is theirs");
    } finally {
      await second.remove();
      await lead.remove();
    }
  } finally {
    await attendant.remove();
  }
});

test("two releases of one visit at the same moment, against the real database: exactly one wins", async ({ browser }) => {
  const db = adminClient();
  const plate = randomPlate("PR");
  await guestCheckIn(browser, plate);
  const a = await createStaff("attendant");
  const b = await createStaff("attendant");
  try {
    const { data: visit } = await db.from("visits").select("id, service_date, vehicles!inner(plate)").eq("vehicles.plate", plate).single();
    const call = (staff: string) =>
      db.rpc("release_visit", { p_visit: visit!.id, p_staff: staff, p_method: "scan", p_today: visit!.service_date });
    const results = await Promise.all([call(a.id), call(b.id), call(a.id), call(b.id)]);
    const winners = results.filter((r) => r.data !== null);
    expect(winners).toHaveLength(1);
    const { count } = await db.from("audit_events").select("id", { count: "exact", head: true }).eq("visit_id", visit!.id).eq("action", "release");
    expect(count).toBe(1);

    // A pass from another day cannot be released even by calling the function directly
    const other = randomPlate("PS");
    await guestCheckIn(browser, other);
    const { data: v2 } = await db.from("visits").select("id, vehicles!inner(plate)").eq("vehicles.plate", other).single();
    const old = await db.rpc("release_visit", { p_visit: v2!.id, p_staff: a.id, p_method: "scan", p_today: "2020-01-01" });
    expect(old.data).toBeNull();
  } finally {
    await a.remove();
    await b.remove();
  }
});

test("Recent Scans lists today's entries and exits for real, newest first, and opens a car", async ({ page, browser }) => {
  const plate = randomPlate("RS");
  await guestCheckIn(browser, plate);
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await lookUp(page, "By plate", plate, "Vehicle plate number");
    await page.getByRole("button", { name: "Release car" }).click();
    await expect(page.getByRole("heading", { name: "Car released" })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("link", { name: "Recent scans" }).click();
    await expect(page).toHaveURL(/\/staff\/history$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Recent Scans" })).toBeVisible();

    const rows = page.locator("main li").filter({ hasText: spaced(plate) });
    await expect(rows).toHaveCount(2, { timeout: 60_000 });
    // The release is newer than the check-in, so it comes first
    await expect(rows.nth(0)).toContainText("Exit");
    await expect(rows.nth(0)).toContainText("Released");
    await expect(rows.nth(1)).toContainText("Entry");
    await expect(rows.nth(1)).toContainText("Checked in");
    await expect(rows.nth(0)).toContainText(/\d{2}:\d{2}/);
    await expect(rows.nth(0).locator("[data-area]")).toHaveText(/\w/);

    // Tapping a row opens that car's staff view
    await rows.nth(1).getByRole("link").click();
    await expect(page).toHaveURL(/\/p\//, { timeout: 60_000 });
    await expect(page.locator("[data-plate]")).toHaveText(spaced(plate));
  } finally {
    await attendant.remove();
  }
});

test("Service Information shows today's services with their standing, and the car parks", async ({ page }) => {
  const db = adminClient();
  const { data: areas } = await db.from("areas").select("name").eq("active", true);
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await page.getByRole("link", { name: /Service Info/ }).click();
    await expect(page.getByRole("heading", { name: "Service Information" })).toBeVisible({ timeout: 60_000 });

    const card = page.locator("section").filter({ hasText: TEST_SERVICE_NAME });
    await expect(card.getByText("Active", { exact: true })).toBeVisible();
    await expect(card.getByText("00:00").first()).toBeVisible();
    await expect(card.getByText("23:59").first()).toBeVisible();

    for (const a of areas ?? []) await expect(page.locator("[data-area]", { hasText: a.name as string })).toBeVisible();
    await expect(page.getByText(/selected automatically for member and guest check-ins/)).toBeVisible();
  } finally {
    await attendant.remove();
  }
});

test("More has the shortcuts, the connection and the account, and Sign Out works", async ({ page }) => {
  const attendant = await createStaff("attendant");
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await page.getByRole("link", { name: "More", exact: true }).click();
    await expect(page).toHaveURL(/\/staff\/more$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "More" })).toBeVisible();

    for (const row of ["Recent Scans", "Manual Lookup", "Add Car", "Service Information"]) {
      await expect(page.locator("main").getByRole("link", { name: row })).toBeVisible();
    }
    await expect(page.getByText("Online")).toBeVisible();
    await expect(page.getByText("ACCOUNT")).toBeVisible();
    await expect(page.getByText("Test attendant")).toBeVisible();
    await expect(page.getByText("Attendant", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/staff\/signin$/, { timeout: 60_000 });
    // Signed out: the staff screens send you to sign in
    await page.goto("/staff/history");
    await expect(page).toHaveURL(/\/staff\/signin$/);
  } finally {
    await attendant.remove();
  }
});
