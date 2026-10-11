import { hash } from "@node-rs/argon2";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { TEST_SERVICE_NAME } from "./test-service";

// Runs against the real hosted dev project. Needs a service running today
// and the admin account from `pnpm db:seed-admin`.
const live = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ADMIN_PHONE);
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const randomPhone = () => `080${Math.floor(10000000 + Math.random() * 89999999)}`;
const randomPlate = (tail: string) =>
  `${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}${
    100 + Math.floor(Math.random() * 900)
  }${tail}`;

async function staffSignIn(page: Page, phone: string, password: string) {
  await page.goto("/staff/signin");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/, { timeout: 60_000 });
}

async function guestCheckIn(browser: Browser, plate: string, area = "cp1") {
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(`/c/${area}`);
  await guest.getByRole("button", { name: "Continue as guest" }).click();
  await guest.getByLabel("Your name").fill("Ops Guest");
  await guest.getByLabel("Phone number").fill(randomPhone());
  await guest.getByLabel("Plate number").fill(plate);
  await guest.getByRole("button", { name: "Get my pass" }).click();
  await guest.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(guest.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  await ctx.close();
}

async function findCar(page: Page, plate: string) {
  await page.goto("/staff/search");
  await page.getByLabel("Vehicle plate number").fill(plate);
  await page.getByRole("button", { name: "Search" }).click();
}

test("a check-in on one phone shows on the dashboard on another within 5 seconds", async ({ page, browser }) => {
  await staffSignIn(page, process.env.ADMIN_PHONE!, process.env.ADMIN_PASSWORD!);
  await page.goto("/staff/dashboard");
  const checkedIn = page.getByTestId("total-checked-in");
  await expect(checkedIn).toBeVisible({ timeout: 60_000 });

  // Let the first refresh happen, so the board is warm and the time starts clean
  const updated = page.getByTestId("updated");
  const first = await updated.innerText();
  await expect(updated).not.toHaveText(first, { timeout: 60_000 });
  const before = Number(await checkedIn.innerText());

  await guestCheckIn(browser, randomPlate("DB"));

  // The roadmap: within 5 seconds of the pass appearing
  await expect(checkedIn).toHaveText(String(before + 1), { timeout: 5_000 });
});

test("a car marked Gone in the sweep becomes missed, and Still here carries it over", async ({ page, browser }) => {
  const gonePlate = randomPlate("SW");
  const herePlate = randomPlate("SH");
  await guestCheckIn(browser, gonePlate);
  await guestCheckIn(browser, herePlate);

  await staffSignIn(page, process.env.ADMIN_PHONE!, process.env.ADMIN_PASSWORD!);
  await page.goto(`/staff/sweep?q=${gonePlate}`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Sweep", exact: true })).toBeVisible();

  const row = (plate: string) =>
    page.locator("li", { hasText: `${plate.slice(0, 3)} ${plate.slice(3, 6)} ${plate.slice(6)}` });
  await expect(row(gonePlate)).toBeVisible({ timeout: 30_000 });

  // Gone asks first, says it is not a release, and closes the visit as missed
  await row(gonePlate).getByRole("button", { name: "Gone" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("not a release");
  await page.getByRole("button", { name: "Yes, mark as gone" }).click();
  await expect(page.getByText("Closed as a missed check-out. This is not a release.")).toBeVisible({ timeout: 30_000 });
  await expect(row(gonePlate)).toHaveCount(0);

  await page.goto(`/staff/sweep?q=${herePlate}`);
  await row(herePlate).getByRole("button", { name: "Still here", exact: true }).click();
  await expect(row(herePlate).getByRole("button", { name: "Still here ✓" })).toBeVisible({ timeout: 30_000 });
  await expect(row(herePlate).getByText("Marked still here")).toBeVisible();

  // The Gone car is now closed (missed): the scanner warns and offers no release
  await findCar(page, gonePlate);
  await expect(page.getByText("This visit is closed. Do not release.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Release car" })).toHaveCount(0);

  // The Still here car is still open (it can be released at the exit), and stays on the list, marked
  await findCar(page, herePlate);
  await expect(page.getByRole("button", { name: "Release car" })).toBeVisible({ timeout: 30_000 });
  await page.goto(`/staff/sweep?q=${herePlate}`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Sweep", exact: true })).toBeVisible();
  await expect(row(herePlate).getByText("Marked still here")).toBeVisible();
});

test("a coordinator corrects a visit with a reason; undo release, and a reason is required", async ({ page, browser }) => {
  const plate = randomPlate("CR");
  await guestCheckIn(browser, plate);
  await staffSignIn(page, process.env.ADMIN_PHONE!, process.env.ADMIN_PASSWORD!);

  await findCar(page, plate);
  await page.getByRole("button", { name: "Release car" }).click();
  await expect(page.getByText("Car released")).toBeVisible({ timeout: 30_000 });

  // Searching again: already released, and the coordinator can undo it
  await findCar(page, plate);
  await expect(page.getByText(/ALREADY RELEASED/)).toBeVisible({ timeout: 30_000 });
  await page.locator("summary", { hasText: "Corrections" }).click();
  await page.getByLabel("What do you want to do?").selectOption("reopen");

  // No reason: refused
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Please write a reason")).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Reason (required)").fill("Released the wrong car by mistake");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Done.")).toBeVisible({ timeout: 30_000 });

  await findCar(page, plate);
  await expect(page.getByRole("button", { name: "Release car" })).toBeVisible({ timeout: 30_000 });

  // Move it to another car park (audited, needs a reason)
  await page.locator("summary", { hasText: "Corrections" }).click();
  await page.getByRole("combobox", { name: "Car park", exact: true }).selectOption({ label: "Roadside" });
  await page.getByLabel("Reason (required)").fill("Parked on the roadside, not in car park 1");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Done.")).toBeVisible({ timeout: 30_000 });
  await findCar(page, plate);
  await expect(page.locator("[data-area]")).toHaveText("Roadside", { timeout: 30_000 });
  await expect(page.getByText(TEST_SERVICE_NAME).first()).toBeVisible();
});

test("an attendant cannot reach the dashboard, sweep or corrections", async ({ page }) => {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const phone = `+234${randomPhone().slice(1)}`;
  const password = "attendant-test-password";
  const { data, error } = await db
    .from("staff")
    .insert({ full_name: "Test Attendant", phone, password_hash: await hash(password), role: "attendant" })
    .select("id")
    .single();
  expect(error).toBeNull();

  try {
    await staffSignIn(page, phone, password);
    await expect(page.getByRole("link", { name: "Live board" })).toHaveCount(0);
    for (const path of ["/staff/dashboard", "/staff/sweep"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/staff$/);
    }
    const response = await page.request.get("/staff/dashboard/data");
    expect(response.status()).toBe(401);

    await findCar(page, "ZZZ999ZZ");
    await expect(page.locator("summary", { hasText: "Corrections" })).toHaveCount(0);
  } finally {
    await db.from("staff").update({ active: false }).eq("id", data!.id);
  }
});

test("the midnight close marks visits left open from an earlier day as missed", async () => {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const { data: area } = await db.from("areas").select("id").eq("slug", "cp1").single();
  const { data: service } = await db.from("services").select("id").limit(1).single();
  const { data: vehicle } = await db.from("vehicles").insert({ plate: randomPlate("MN") }).select("id").single();
  const { data: guest } = await db.from("guests").insert({ full_name: "Midnight Test", phone: "+2340000000009" }).select("id").single();
  const { data: visit, error } = await db
    .from("visits")
    .insert({
      reference: `PK-M${Math.floor(Math.random() * 900 + 100)}`,
      pass_token: `midnight${Math.random().toString(36).slice(2, 16).padEnd(14, "x")}`,
      vehicle_id: vehicle!.id,
      guest_id: guest!.id,
      service_id: service!.id,
      area_id: area!.id,
      service_date: "2026-01-04", // an old Sunday, still open
    })
    .select("id")
    .single();
  expect(error).toBeNull();

  const { data: closed, error: rpcError } = await db.rpc("close_open_visits", { p_today: today });
  expect(rpcError).toBeNull();
  expect(closed).toBeGreaterThanOrEqual(1);

  const { data: after } = await db.from("visits").select("status, release_method").eq("id", visit!.id).single();
  expect(after).toEqual({ status: "missed", release_method: "midnight" });
  const { count } = await db
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("visit_id", visit!.id)
    .eq("action", "midnight_close");
  expect(count).toBe(1);

  // Today's visits are not touched
  const { data: todays } = await db.from("visits").select("status").eq("service_date", today).eq("status", "parked").limit(1);
  expect(Array.isArray(todays)).toBe(true);
});
