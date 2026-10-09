import { expect, test } from "@playwright/test";

// Runs against the real hosted dev project. Needs a service running today
// and the admin account from `pnpm db:seed-admin`.
const live = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ADMIN_PHONE);
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(240_000);

const randomPhone = () => `080${Math.floor(10000000 + Math.random() * 89999999)}`;
const randomPlate = () =>
  `${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}${
    100 + Math.floor(Math.random() * 900)
  }SM`;

test("an attendant registers a locked-out member's car, and the scanner flags it as a new car", async ({
  page,
  browser,
}) => {
  const phone = randomPhone();
  const plate = randomPlate();

  // A member saves a car
  const member = await (await browser.newContext()).newPage();
  await member.goto("/account/signup");
  await member.getByLabel("Your name").fill("Newcar Member");
  await member.getByLabel("Phone number").fill(phone);
  await member.getByLabel("Choose a PIN (4 numbers)").fill("5276");
  await member.getByLabel("Type the PIN again").fill("5276");
  await member.getByRole("button", { name: "Create my account" }).click();
  await expect(member).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
  await member.getByLabel("Plate number").fill(plate);
  await member.getByRole("button", { name: "Save car" }).click();
  await expect(member.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });

  // The attendant signs in
  await page.goto("/staff/signin");
  await page.getByLabel("Phone number").fill(process.env.ADMIN_PHONE!);
  await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/staff$/, { timeout: 60_000 });

  // Adding it as a guest is refused, and offers Register for the member
  await page.goto("/staff/register");
  await page.getByLabel("Plate number").fill(plate);
  await page.getByLabel("Phone number").fill("08031112225");
  await page.getByRole("button", { name: "Add car", exact: true }).click();
  await expect(page.getByText("This car belongs to a member.")).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Register for the member" }).click();
  await expect(page.getByText(/^PK-/)).toBeVisible({ timeout: 45_000 });

  // The scanner card shows MEMBER, the last 4 digits and the NEW CAR flag
  await page.goto("/staff/search");
  await page.getByLabel("Vehicle plate number").fill(plate);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("MEMBER", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("NEW CAR", { exact: true })).toBeVisible();
  await expect(page.getByText(/Ask the driver for their name and phone number/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(phone);

  // Searching with look-alike characters still finds it (0/O and 1/I)
  const lookAlike = plate.replace(/[0-9]/, (d) => (d === "0" ? "O" : d === "1" ? "I" : d));
  await page.getByLabel("Vehicle plate number").fill(lookAlike);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("MEMBER", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Release
  await page.getByRole("button", { name: "Release car" }).click();
  await expect(page.getByText("Car released")).toBeVisible({ timeout: 30_000 });
});

test("a member can save at most 4 cars", async ({ page }) => {
  await page.goto("/account/signup");
  await page.getByLabel("Your name").fill("Many Cars");
  await page.getByLabel("Phone number").fill(randomPhone());
  await page.getByLabel("Choose a PIN (4 numbers)").fill("8143");
  await page.getByLabel("Type the PIN again").fill("8143");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });

  for (let i = 0; i < 4; i++) {
    await page.getByLabel("Plate number").fill(randomPlate());
    await page.getByRole("button", { name: "Save car" }).click();
    await expect(page.getByText("Car saved.")).toBeVisible({ timeout: 30_000 });
    await page.reload();
  }
  await page.getByLabel("Plate number").fill(randomPlate());
  await page.getByRole("button", { name: "Save car" }).click();
  await expect(page.getByText("You can save up to 4 cars.")).toBeVisible({ timeout: 30_000 });
});
