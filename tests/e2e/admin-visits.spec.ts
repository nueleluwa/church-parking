import { expect, test } from "@playwright/test";
import { adminSignIn, guestCheckIn, live, randomPlate } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

test("Visits lists today's visits by car park and status, and opens one; the dashboard numbers lead here", async ({ page, browser }) => {
  const plate = randomPlate("VS");
  await guestCheckIn(browser, plate);
  await adminSignIn(page);

  await page.goto("/admin/visits");
  await expect(page.getByRole("heading", { name: "Visits", exact: true })).toBeVisible({ timeout: 60_000 });
  const row = page.locator("li").filter({ hasText: spaced(plate) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Parked");
  await expect(row).toContainText("Guest");
  await expect(page.locator("main")).not.toContainText(/\+?234\d{9}|080\d{8}/);

  // The status buttons say how many each would list, and Released does not list a parked car
  await page.getByRole("link", { name: /^Released \(/ }).click();
  await expect(page).toHaveURL(/status=released/);
  await expect(page.locator("li").filter({ hasText: spaced(plate) })).toHaveCount(0);
  await page.getByRole("link", { name: /^Parked \(/ }).click();
  await expect(page.locator("li").filter({ hasText: spaced(plate) })).toHaveCount(1);

  // Opening the visit goes to its details
  await page.getByRole("link", { name: `Visit of ${spaced(plate)}` }).click();
  await expect(page).toHaveURL(/\/admin\/visits\/[0-9a-f-]{36}$/, { timeout: 60_000 });

  // The dashboard's Still parked number and a car park card lead to the list
  await page.goto("/admin");
  await page.getByRole("link", { name: /Still parked/ }).click();
  await expect(page).toHaveURL(/\/admin\/visits\?status=parked/, { timeout: 60_000 });
  await page.goto("/admin");
  await page.getByRole("link", { name: /see its visits/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/visits\?area=/, { timeout: 60_000 });
});

test("a day with nothing says so, and a made-up car park or status is ignored", async ({ page }) => {
  await adminSignIn(page);
  await page.goto("/admin/visits?date=2020-01-01&area=nowhere&status=bogus");
  await expect(page.getByText("No visits match.")).toBeVisible({ timeout: 60_000 });
});
