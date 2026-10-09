import { expect, test, type Page } from "@playwright/test";
import { adminClient, live, randomPhone, randomPlate } from "./helpers";

// Runs against the real hosted dev project (and the test service that global setup switches on).
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

async function fillAndSubmit(page: Page, plate: string, phone: string) {
  await page.getByLabel("Your name").fill("Retry Guest");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Get my pass" }).click();
  await page.getByRole("button", { name: "Yes, get my pass" }).click();
}

test("the signal drops after the server made the pass: trying again gives the same pass, one visit, and no alert", async ({ page }) => {
  const db = adminClient();
  const plate = randomPlate("RT");
  const since = new Date().toISOString();

  // The first request reaches the server and does its work, but its answer never gets back to the phone
  let dropped = false;
  await page.route("**/c/cp1", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await fillAndSubmit(page, plate, randomPhone());
  await expect.poll(() => dropped).toBe(true);

  // The server did make the visit
  await expect
    .poll(async () => (await db.from("visits").select("id, vehicles!inner(plate)", { count: "exact", head: true }).eq("vehicles.plate", plate)).count)
    .toBe(1);

  // The phone saw a failure. Whether it shows the page's error screen or the form again, trying again must work.
  const errorScreen = page.getByRole("heading", { name: "Something went wrong" });
  const form = page.getByLabel("Your name");
  await expect(errorScreen.or(form).or(page.getByRole("button", { name: "Continue as guest" }))).toBeVisible({ timeout: 30_000 });
  if (await errorScreen.isVisible()) await page.getByRole("button", { name: "Try again" }).click();
  if (await page.getByRole("button", { name: "Continue as guest" }).isVisible({ timeout: 10_000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Continue as guest" }).click();
  }
  await fillAndSubmit(page, plate, randomPhone());

  // The same pass comes back: a valid pass, not "already checked in"
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: "Your pass QR code" })).toBeVisible();
  await expect(page.getByText("This car is already checked in")).toHaveCount(0);

  // Exactly one visit, and the coordinator was not alerted
  const { count } = await db.from("visits").select("id, vehicles!inner(plate)", { count: "exact", head: true }).eq("vehicles.plate", plate);
  expect(count).toBe(1);
  const { count: alerts } = await db.from("alerts").select("id", { count: "exact", head: true }).eq("plate", plate).gte("created_at", since);
  expect(alerts).toBe(0);
});

test("a different car is not mistaken for a retry", async ({ page }) => {
  const db = adminClient();
  const plateA = randomPlate("RA");
  const plateB = randomPlate("RB");
  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await fillAndSubmit(page, plateA, randomPhone());
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });

  // Same tab, a different car: it must get its own, new pass
  await page.goto("/c/cp1");
  await page.getByText("Check in a different car").click();
  await fillAndSubmit(page, plateB, randomPhone());
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
  const { count } = await db.from("visits").select("id, vehicles!inner(plate)", { count: "exact", head: true }).in("vehicles.plate", [plateA, plateB]);
  expect(count).toBe(2);
});

test("a member whose sign-in ends before they tap Check in gets a link back to the same check-in", async ({ page }) => {
  const { memberSignUp } = await import("./helpers");
  const plate = randomPlate("SE");
  const phone = await memberSignUp(page, "4821");
  await expect(page).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Save car" }).click();
  await expect(page.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });

  // At the car park sign, ready to check in...
  await page.goto("/c/cp1");
  await expect(page.getByRole("button", { name: "Check in" })).toBeVisible({ timeout: 60_000 });

  // ...but the sign-in has ended (here: the cookie is gone) before the button is tapped
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Check in" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Your sign-in has ended" });
  await expect(alert).toBeVisible({ timeout: 30_000 });

  // The link signs them in again and brings them back to the same car park's check-in, with their car ready
  await alert.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account\/signin\?next=%2Fc%2Fcp1$/, { timeout: 60_000 });
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("PIN (4 numbers)", { exact: true }).fill("4821");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/c\/cp1$/, { timeout: 60_000 });
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 60_000 });
});
