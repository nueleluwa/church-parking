import { expect, test } from "@playwright/test";
import { createStaff, live } from "./helpers";

// Runs against the real hosted dev project.
test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(400_000);

test("signing in often never locks a staff member out, but repeated wrong passwords do", async ({ browser }) => {
  const staff = await createStaff("attendant");
  try {
    // 12 good sign-ins in a row (more than the wrong-password limit of 10): every one works
    for (let i = 0; i < 12; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto("/staff/signin");
      await page.getByLabel("Phone number").fill(staff.phone);
      await page.getByLabel("Password").fill(staff.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/staff$/, { timeout: 60_000 });
      await ctx.close();
    }

    // 10 wrong passwords, then even the right password is refused for a while
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (let i = 0; i < 10; i++) {
      await page.goto("/staff/signin");
      await page.getByLabel("Phone number").fill(staff.phone);
      await page.getByLabel("Password").fill(`wrong-password-${i}`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Phone number or password is wrong.")).toBeVisible({ timeout: 60_000 });
    }
    await page.goto("/staff/signin");
    await page.getByLabel("Phone number").fill(staff.phone);
    await page.getByLabel("Password").fill(staff.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Too many tries. Please wait 15 minutes")).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/staff\/signin$/);
    await ctx.close();
  } finally {
    await staff.remove();
  }
});
