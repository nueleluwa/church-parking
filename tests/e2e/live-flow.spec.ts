import { expect, test } from "@playwright/test";

// Runs against the real hosted dev project. Needs a service running today
// and the admin account from `pnpm db:seed-admin`.
const live = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ADMIN_PHONE);
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(180_000);

test("guest checks in, staff releases, second release is refused", async ({ page, context }) => {
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const plate = `${letters}${100 + Math.floor(Math.random() * 900)}ZZ`;
  const phone = `080${Math.floor(10000000 + Math.random() * 89999999)}`;

  // Guest check-in
  await page.goto("/c/cp1");
  await expect(page.getByRole("heading", { name: "Car Park 1" })).toBeVisible();
  await page.getByLabel("Your name").fill("Test Guest");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Get my pass" }).click();
  await page.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("svg").first()).toBeVisible();
  const passUrl = page.url();
  expect(passUrl).toMatch(/\/p\/[A-Za-z0-9_-]{22}$/);
  await expect(page.locator("body")).not.toContainText("Test Guest");
  await expect(page.locator("body")).not.toContainText(phone);

  // Same plate again: blocked, no pass shown
  const other = await context.browser()!.newContext();
  const guest2 = await other.newPage();
  await guest2.goto(new URL("/c/cp2", passUrl).toString());
  await guest2.getByLabel("Your name").fill("Someone Else");
  await guest2.getByLabel("Phone number").fill(`080${Math.floor(10000000 + Math.random() * 89999999)}`);
  await guest2.getByLabel("Plate number").fill(plate);
  await guest2.getByRole("button", { name: "Get my pass" }).click();
  await guest2.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(guest2.getByText("This car is already checked in. Please see an attendant.")).toBeVisible({ timeout: 30_000 });
  expect(guest2.url()).not.toContain("/p/");

  // Someone without the cookie sees only plate and status
  const stranger = await other.newPage();
  await stranger.goto(passUrl);
  await expect(stranger.getByText("VALID", { exact: true })).toBeVisible();
  await expect(stranger.locator("body")).not.toContainText("PK-");
  await other.close();

  // Staff sign-in and release
  await page.goto("/staff/signin");
  await page.getByLabel("Phone number").fill(process.env.ADMIN_PHONE!);
  await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff\/scan$/);

  await page.goto("/staff/search");
  await page.getByLabel("Plate number, phone number or reference").fill(plate);
  await page.getByRole("button", { name: "Find car" }).click();
  await expect(page.getByText("GUEST")).toBeVisible();
  await expect(page.getByText("Test", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Test Guest");
  await expect(page.locator("body")).not.toContainText(phone);
  await page.getByRole("button", { name: "Release car" }).click();
  await expect(page.getByText("Car released")).toBeVisible();

  // Searching again shows it was already released
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Plate number, phone number or reference").fill(plate);
  await page.getByRole("button", { name: "Find car" }).click();
  await expect(page.getByText(/ALREADY RELEASED/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Release car" })).toHaveCount(0);
});
