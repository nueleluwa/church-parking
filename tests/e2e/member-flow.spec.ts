import { expect, test, type Page } from "@playwright/test";

// Runs against the real hosted dev project. Needs a service running today.
const live = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
test.skip(!live, "needs .env.local with the Supabase key");
test.setTimeout(240_000);

const randomPhone = () => `080${Math.floor(10000000 + Math.random() * 89999999)}`;
const randomPlate = () =>
  `${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}${
    100 + Math.floor(Math.random() * 900)
  }MM`;

async function signUp(page: Page, phone: string, pin: string, next = "") {
  await page.goto(`/account/signup${next}`);
  await page.getByLabel("Your name").fill("Member Tester");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Choose a PIN (4 numbers)").fill(pin);
  await page.getByLabel("Type the PIN again").fill(pin);
  await page.getByRole("button", { name: "Create my account" }).click();
}

test("member saves a car, checks in with two taps, guest cannot take the plate, PIN locks after 5 failures", async ({
  page,
  browser,
}) => {
  const phone = randomPhone();
  const plate = randomPlate();

  await signUp(page, phone, "4821", "?next=/c/cp1");
  await expect(page).toHaveURL(/\/c\/cp1$/, { timeout: 60_000 });
  await expect(page.getByText("You have no saved cars yet")).toBeVisible();

  await page.goto("/account");
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Save car" }).click();
  await expect(page.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });

  // A guest cannot claim a member's plate (R-5)
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto("/c/cp2");
  await guest.getByRole("button", { name: "Continue as guest" }).click();
  await guest.getByLabel("Your name").fill("Guest Person");
  await guest.getByLabel("Phone number").fill(randomPhone());
  await guest.getByLabel("Plate number").fill(plate);
  await guest.getByRole("button", { name: "Get my pass" }).click();
  await guest.getByRole("button", { name: "Yes, get my pass" }).click();
  await expect(guest.getByText("We can't check in this car here. Please see an attendant.")).toBeVisible({
    timeout: 45_000,
  });
  expect(guest.url()).not.toContain("/p/");
  await guestCtx.close();

  // Two taps: pick the car (already picked when there is one), then Check in
  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/^PK-/)).toBeVisible();

  // Staying for the second and third service: the pass is good all day, with no second check-in
  await page.goto("/c/cp1");
  await expect(page.getByText("Already checked in. Your pass is good all day.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);
  await page.getByRole("link", { name: "Show my pass" }).click();
  await expect(page.getByText("VALID", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.goto("/account");
  await expect(page.getByRole("link", { name: "Show my pass" })).toBeVisible();

  // Sign out, then 5 wrong PINs pause sign-in, even for the right PIN
  await page.getByRole("button", { name: "Sign out" }).click();
  for (let i = 0; i < 5; i++) {
    await page.goto("/account/signin");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByLabel("PIN (4 numbers)").fill("0000");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Phone number or PIN is wrong.")).toBeVisible({ timeout: 30_000 });
  }
  await page.goto("/account/signin");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("PIN (4 numbers)").fill("4821");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Too many tries. Please wait 15 minutes")).toBeVisible({ timeout: 30_000 });
});

test("a member can delete their account", async ({ page }) => {
  const phone = randomPhone();
  await signUp(page, phone, "7391");
  await expect(page).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
  await expect(page.getByText("Keep this app on your phone")).toBeVisible();

  await page.locator("summary", { hasText: "Delete my account" }).click();
  await page.getByLabel("Your PIN", { exact: true }).fill("7391");
  await page.getByLabel("Yes, delete my account").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/, { timeout: 45_000 });

  await page.goto("/account/signin");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("PIN (4 numbers)").fill("7391");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Phone number or PIN is wrong.")).toBeVisible({ timeout: 30_000 });
});
