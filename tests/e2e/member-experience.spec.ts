import { expect, test, type Browser, type Page } from "@playwright/test";
import { servicesForCheckIn } from "../../lib/rules/service";
import { adminClient, createStaff, live, memberSignUp, randomPhone, randomPlate, staffSignIn } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const ILLUSTRATION = 'img[src="/vehicle-illustration.png"]';

async function areaName(slug: string): Promise<string> {
  const { data } = await adminClient().from("areas").select("name").eq("slug", slug).single();
  return data!.name as string;
}

async function addCar(page: Page, plate: string, make = "", colour = "") {
  const plateField = page.getByLabel("Plate number");
  if (!(await plateField.isVisible())) await page.getByRole("button", { name: "Add vehicle" }).click();
  await plateField.fill(plate);
  if (make) await page.getByLabel(/Make and model/).fill(make);
  if (colour) await page.getByLabel(/^Colour/).fill(colour);
  await page.getByRole("button", { name: "Save car" }).click();
  // Wait for the car to be in the list, not just for a message: an earlier "Car saved." may still be showing
  const spaced = `${plate.slice(0, 3)} ${plate.slice(3, 6)} ${plate.slice(6)}`;
  await expect(page.locator("[data-plate]").filter({ hasText: spaced })).toBeVisible({ timeout: 30_000 });
}

async function releaseCar(browser: Browser, plate: string) {
  const attendant = await createStaff("attendant");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await staffSignIn(page, attendant.phone, attendant.password);
    await page.goto("/staff/search");
    await page.getByLabel("Vehicle plate number").fill(plate);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: "Release car" }).click();
    await expect(page.getByText("Car released")).toBeVisible({ timeout: 60_000 });
  } finally {
    await attendant.remove();
    await ctx.close();
  }
}

test("the QR sign opens the right car park with a clear welcome, a way in for members and guests, and the privacy notice", async ({
  page,
}) => {
  const name = await areaName("road");
  await page.goto("/c/road");

  // The church logo, and the car park from the QR sign: nothing to choose
  await expect(page.locator("header img[alt='CCI']")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("Scan, register and get your digital parking pass in seconds.")).toBeVisible();

  // Members sign in (and come straight back here), or continue as a guest
  const signIn = page.getByRole("link", { name: "Sign in to my account" });
  await expect(signIn).toHaveAttribute("href", "/account/signin?next=%2Fc%2Froad");
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as guest" })).toBeVisible();

  // The privacy notice states how long guest records are kept, and that a member's visits are kept
  await expect(page.getByText(/Guest details are deleted\s+after 24 months/)).toBeVisible();
  await expect(page.getByText(/A member's visits are kept/)).toBeVisible();

  // The guest form asks for exactly three things, and never for a car park, a space, a price or a map
  await page.getByRole("button", { name: "Continue as guest" }).click();
  for (const label of ["Your name", "Phone number", "Plate number"]) {
    await expect(page.getByLabel(label)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Get my pass" })).toBeVisible();
  const options = await page.locator("select option").allInnerTexts();
  expect(options.some((o) => /car park|roadside/i.test(o)), "the form must not ask for the car park").toBe(false);
  await expect(page.getByText(/price|payment|parking space|vehicle type|map/i)).toHaveCount(0);
});

test("a guest registers without an account, gets a working pass, and can then save their details with a PIN", async ({
  page,
  browser,
}) => {
  const db = adminClient();
  const phone = randomPhone();
  const plate = randomPlate("GP");
  const messy = `${plate.slice(0, 3).toLowerCase()} ${plate.slice(3, 6)}-${plate.slice(6).toLowerCase()}`;
  const cp1 = await areaName("cp1");

  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await page.getByLabel("Your name").fill("Grace Guest");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Plate number").fill(messy);
  await page.getByRole("button", { name: "Get my pass" }).click();
  // The plate is shown back tidily before it is saved
  await expect(page.getByText(`${plate.slice(0, 3)} ${plate.slice(3, 6)} ${plate.slice(6)}`)).toBeVisible();
  await page.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });

  // The plate is saved normalised
  const { data: vehicle } = await db.from("vehicles").select("plate").eq("plate", plate).maybeSingle();
  expect(vehicle?.plate).toBe(plate);

  // The pass: illustration, plate, a real QR code, service, area, check-in time and status
  await expect(page.locator(ILLUSTRATION)).toHaveCount(1);
  await expect(page.locator("[data-plate]")).toHaveText(`${plate.slice(0, 3)} ${plate.slice(3, 6)} ${plate.slice(6)}`);
  await expect(page.getByRole("img", { name: "Your pass QR code" }).locator("svg")).toBeVisible();
  await expect(page.locator("[data-area]")).toHaveText(cp1);
  await expect(page.getByText("Service", { exact: true })).toBeVisible();
  await expect(page.getByText("Checked in", { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d{2}:\d{2}$/)).toBeVisible();
  const token = page.url().split("/p/")[1].split("?")[0];

  // Someone else opening the link sees only the plate and the status
  const other = await (await browser.newContext()).newPage();
  await other.goto(`/p/${token}`);
  await expect(other.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(other.locator(ILLUSTRATION)).toHaveCount(0);
  await expect(other.getByRole("img", { name: "Your pass QR code" })).toHaveCount(0);
  await expect(other.locator("body")).not.toContainText(/Grace|PK-|Checked in/);

  // Optional: save the details as a member account by choosing a PIN
  await page.getByText("Save your details").click();
  await page.getByLabel("Choose a PIN (4 numbers)").fill("2468");
  await page.getByLabel("Type the PIN again").fill("2468");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/\/p\/.+\?saved=1$/, { timeout: 60_000 });
  await expect(page.getByText("Your account is ready.")).toBeVisible();
  await expect(page.getByText("Save your details")).toHaveCount(0);

  // The visit now belongs to the new member, and the car is saved to them
  const { data: member } = await db.from("members").select("id, full_name").eq("phone", `+234${phone.slice(1)}`).single();
  expect(member?.full_name).toBe("Grace Guest");
  const { data: visit } = await db.from("visits").select("member_id, guest_id").eq("pass_token", token).single();
  expect(visit).toEqual({ member_id: member!.id, guest_id: null });

  // ...and the PIN works for signing in later
  const again = await (await browser.newContext()).newPage();
  await again.goto("/account/signin");
  await again.getByLabel("Phone number").fill(phone);
  await again.getByLabel("PIN (4 numbers)").fill("2468");
  await again.getByRole("button", { name: "Sign in" }).click();
  await expect(again).toHaveURL(/\/account$/, { timeout: 60_000 });
  await expect(again.locator("[data-plate]").first()).toHaveText(`${plate.slice(0, 3)} ${plate.slice(3, 6)} ${plate.slice(6)}`);
});

test("a member picks a car and checks in in two taps, with the car's picture and details on every screen", async ({
  page,
  browser,
}) => {
  const cp1 = await areaName("cp1");
  await memberSignUp(page);
  await expect(page).toHaveURL(/welcome=1/, { timeout: 60_000 });
  const first = randomPlate("MA");
  const second = randomPlate("MB");
  await addCar(page, first, "Toyota Corolla", "Silver");
  await addCar(page, second, "Honda Civic", "Black");

  // My vehicles: each car has the picture, the plate, and its details
  await page.goto("/account");
  await expect(page.locator(ILLUSTRATION)).toHaveCount(2);
  await expect(page.getByText("Toyota Corolla · Silver")).toBeVisible();
  await expect(page.getByText("Honda Civic · Black")).toBeVisible();

  // Choosing a car: the same picture and details, in a list
  await page.goto("/c/cp1");
  const cars = page.getByRole("group", { name: "Your cars" });
  await expect(cars.locator(ILLUSTRATION)).toHaveCount(2);
  await expect(cars.getByText("Toyota Corolla · Silver")).toBeVisible();

  // TAP 1: choose a car. The confirmation shows the car, the service (picked for them) and the car park from the QR sign
  await cars.getByRole("button").filter({ hasText: "Toyota Corolla" }).click();
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible();
  await expect(page.locator(ILLUSTRATION)).toHaveCount(1);
  await expect(page.locator("[data-plate]")).toHaveText(`${first.slice(0, 3)} ${first.slice(3, 6)} ${first.slice(6)}`);
  await expect(page.getByText("Toyota Corolla · Silver")).toBeVisible();
  await expect(page.locator("[data-area]")).toHaveText(cp1);
  await expect(page.getByText("Selected from the QR sign")).toBeVisible();
  await expect(page.getByText("Service", { exact: true })).toBeVisible();
  // No service step is in the way. The service can still be changed whenever there is more than one to choose from.
  const { data: services } = await adminClient().from("services").select("id, weekday, starts_at, ends_at").eq("active", true);
  const choices = servicesForCheckIn(new Date(), services ?? []).length;
  await expect(page.getByRole("button", { name: "Change service" })).toHaveCount(choices > 1 ? 1 : 0);

  // TAP 2: Check in. The pass appears only after the check-in worked
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(ILLUSTRATION)).toHaveCount(1);
  await expect(page.getByText("Toyota Corolla · Silver")).toBeVisible();
  await expect(page.locator("[data-area]")).toHaveText(cp1);
  await expect(page.getByRole("img", { name: "Your pass QR code" }).locator("svg")).toBeVisible();
  await expect(page.getByText(/^\d{2}:\d{2}$/)).toBeVisible();
  const passUrl = page.url();

  // The pass stays available from the member's account until the car is released
  await page.goto("/account");
  await page.getByRole("link", { name: "Show my pass" }).click();
  await expect(page).toHaveURL(passUrl);
  await expect(page.getByText("VALID", { exact: true })).toBeVisible();

  // The other car is still free to check in, and this one is marked as already checked in
  await page.goto("/c/cp1");
  await expect(page.getByText("Already checked in. Your pass is good all day.")).toBeVisible();
  await expect(page.getByRole("group", { name: "Your cars" }).getByRole("button")).toHaveCount(0);
  void browser;
});

test("a member with one car goes straight to the confirmation: one tap to check in", async ({ page }) => {
  await memberSignUp(page);
  await expect(page).toHaveURL(/welcome=1/, { timeout: 60_000 });
  await addCar(page, randomPlate("ON"));
  await page.goto("/c/cp2");
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("group", { name: "Your cars" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
});

test("a car that is already checked in, or belongs to a member, is refused and the coordinator is alerted", async ({
  browser,
}) => {
  const db = adminClient();
  const since = new Date().toISOString();

  // 1. A guest has an open visit
  const plate = randomPlate("DU");
  const owner = await (await browser.newContext()).newPage();
  await owner.goto("/c/cp1");
  await owner.getByRole("button", { name: "Continue as guest" }).click();
  await owner.getByLabel("Your name").fill("First Driver");
  await owner.getByLabel("Phone number").fill(randomPhone());
  await owner.getByLabel("Plate number").fill(plate);
  await owner.getByRole("button", { name: "Get my pass" }).click();
  await owner.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(owner.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  const reference = (await owner.getByText(/^PK-/).innerText()).trim();

  // A second person tries the same plate
  const second = await (await browser.newContext()).newPage();
  await second.goto("/c/cp2");
  await second.getByRole("button", { name: "Continue as guest" }).click();
  await second.getByLabel("Your name").fill("Second Driver");
  await second.getByLabel("Phone number").fill(randomPhone());
  await second.getByLabel("Plate number").fill(plate);
  await second.getByRole("button", { name: "Get my pass" }).click();
  await second.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(second.getByText("This car is already checked in. Please see an attendant.")).toBeVisible({
    timeout: 60_000,
  });
  // No pass, no reference, no link to the first driver's pass
  expect(second.url()).not.toContain("/p/");
  await expect(second.locator("body")).not.toContainText(reference);
  await expect(second.locator("body")).not.toContainText("First Driver");

  // The coordinator is alerted
  const { data: conflict } = await db
    .from("alerts")
    .select("kind, plate")
    .eq("plate", plate)
    .eq("kind", "plate_conflict")
    .gte("created_at", since);
  expect((conflict ?? []).length).toBeGreaterThanOrEqual(1);

  // 2. A member has saved a plate: a guest cannot claim it
  const member = await (await browser.newContext()).newPage();
  await memberSignUp(member);
  await expect(member).toHaveURL(/welcome=1/, { timeout: 60_000 });
  const memberPlate = randomPlate("MP");
  await addCar(member, memberPlate);

  const thief = await (await browser.newContext()).newPage();
  await thief.goto("/c/cp1");
  await thief.getByRole("button", { name: "Continue as guest" }).click();
  await thief.getByLabel("Your name").fill("Plate Thief");
  await thief.getByLabel("Phone number").fill(randomPhone());
  await thief.getByLabel("Plate number").fill(memberPlate);
  await thief.getByRole("button", { name: "Get my pass" }).click();
  await thief.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(thief.getByText("We can't check in this car here. Please see an attendant.")).toBeVisible({
    timeout: 60_000,
  });
  expect(thief.url()).not.toContain("/p/");
  await expect(thief.locator("body")).not.toContainText("Stability Member"); // the member's name is never shown

  const { data: claim } = await db
    .from("alerts")
    .select("kind")
    .eq("plate", memberPlate)
    .eq("kind", "member_plate_claim")
    .gte("created_at", since);
  expect((claim ?? []).length).toBeGreaterThanOrEqual(1);

  // The alerts appear on the coordinator's live board in plain words
  const coordinator = await createStaff("coordinator");
  const board = await (await browser.newContext()).newPage();
  try {
    await staffSignIn(board, coordinator.phone, coordinator.password);
    await board.goto("/staff/dashboard");
    await expect(board.getByText("Second check-in for a car already checked in").first()).toBeVisible({ timeout: 60_000 });
    await expect(board.getByText("A guest tried to check in a member's car").first()).toBeVisible();
  } finally {
    await coordinator.remove();
  }
});

test("My vehicles can edit and remove a car, and Parking history lists real visits, newest first", async ({
  page,
  browser,
}) => {
  await memberSignUp(page);
  await expect(page).toHaveURL(/welcome=1/, { timeout: 60_000 });
  const plate = randomPlate("HI");
  await addCar(page, plate, "Lexus RX", "White");
  const spaced = `${plate.slice(0, 3)} ${plate.slice(3, 6)} ${plate.slice(6)}`;

  // Two visits for the same car: check in, get released, check in again
  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  await releaseCar(browser, plate);
  await page.goto("/c/cp2");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });

  // History: newest first, with time, plate, service, car park and status
  await page.goto("/account?tab=history");
  await expect(page.getByRole("heading", { name: "Parking history" })).toBeVisible({ timeout: 60_000 });
  const rows = page.locator("main li").filter({ hasText: spaced });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Parked");
  await expect(rows.nth(1)).toContainText("Released");
  await expect(rows.nth(0)).toContainText(await areaName("cp2"));
  await expect(rows.nth(1)).toContainText(await areaName("cp1"));
  await expect(rows.nth(0)).toContainText(/Today, \d{2}:\d{2}/);
  await expect(rows.nth(0)).toContainText(/Automated test service|Service \d/);
  // The car that is still parked opens its pass; a finished visit has no link
  await expect(rows.nth(0).getByRole("link")).toHaveCount(1);
  await expect(rows.nth(1).getByRole("link")).toHaveCount(0);
  await rows.nth(0).getByRole("link").click();
  await expect(page).toHaveURL(/\/p\//);
  await expect(page.getByText("VALID", { exact: true })).toBeVisible();

  // Edit the car's details from its menu, and the change is saved
  await page.goto("/account");
  await page.getByRole("button", { name: `Options for ${plate}` }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  await page.getByLabel("Colour").fill("Blue");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Lexus RX · Blue")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText("Lexus RX · Blue")).toBeVisible();

  // Remove it, after a confirmation
  await page.getByRole("button", { name: `Options for ${plate}` }).click();
  await page.getByRole("menuitem", { name: "Remove car" }).click();
  await expect(page.getByText("Remove this car from your account?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByText("You have no saved cars yet.")).toBeVisible({ timeout: 30_000 });
});
