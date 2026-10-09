import { expect, test, type Locator, type Page } from "@playwright/test";
import { adminSignIn, live, memberSignUp } from "./helpers";

/** The box starts hidden; the button shows what was typed, and hides it again. */
async function expectToggle(scope: Page | Locator, label: string | RegExp, value: string) {
  const box = scope.getByLabel(label, typeof label === "string" ? { exact: true } : undefined);
  await expect(box).toHaveAttribute("type", "password");
  await box.fill(value);
  const row = box.locator("xpath=..");
  await row.getByRole("button", { name: "Show what I typed" }).click();
  await expect(box).toHaveAttribute("type", "text");
  await expect(box).toHaveValue(value);
  await row.getByRole("button", { name: "Hide what I typed" }).click();
  await expect(box).toHaveAttribute("type", "password");
  await expect(box).toHaveValue(value);
}

test("sign-in and sign-up forms let people show and hide their PIN or password", async ({ page }) => {
  await page.goto("/account/signin");
  await expectToggle(page, "PIN (4 numbers)", "1234");

  await page.goto("/account/signup");
  await expectToggle(page, "Choose a PIN (4 numbers)", "4821");
  await expectToggle(page, "Type the PIN again", "4821");

  await page.goto("/staff/signin");
  await expectToggle(page, "Password", "not-a-real-password");
});

test("the toggle button is named in plain words, is a real button and can be used by keyboard", async ({ page }) => {
  await page.goto("/staff/signin");
  const button = page.getByRole("button", { name: "Show what I typed" });
  await expect(button).toHaveAttribute("type", "button");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  // Tab from the password box to the button, and press it
  await page.getByLabel("Password").focus();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide what I typed" })).toHaveAttribute("aria-pressed", "true");
  // Pressing the button never submits the form
  await expect(page).toHaveURL(/\/staff\/signin$/);
  const box = await page.getByLabel("Password").boundingBox();
  const btn = await page.getByRole("button", { name: "Hide what I typed" }).boundingBox();
  expect(btn!.width).toBeGreaterThanOrEqual(44);
  expect(btn!.x + btn!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
});

test.describe("signed-in forms", () => {
  test.skip(!live, "needs .env.local with the Supabase key and admin login");
  test.setTimeout(240_000);

  test("change PIN, delete account and the admin reset forms all have it", async ({ page, browser }) => {
    await memberSignUp(page, "4821");
    await expect(page).toHaveURL(/\/account\?welcome=1$/, { timeout: 60_000 });
    await page.goto("/account/more");
    await page.getByText("Change my PIN").click();
    await expectToggle(page, "Your PIN now", "4821");
    await expectToggle(page, "New PIN (4 numbers)", "9034");
    await expectToggle(page, "Type the new PIN again", "9034");
    await page.locator("summary", { hasText: "Delete my account" }).click();
    await expectToggle(page, "Your PIN", "4821");

    const admin = await (await browser.newContext()).newPage();
    await adminSignIn(admin);
    await admin.goto("/admin/staff");
    await expectToggle(admin, /^Password \(at least 10 characters\)/, "a-long-enough-password");
    await admin.goto("/admin/members?q=a");
    const first = admin.locator("li").filter({ hasText: "Set a new PIN" }).first();
    await first.getByText("Set a new PIN").click();
    await expectToggle(first, "New PIN (4 numbers)", "1357");
  });
});
