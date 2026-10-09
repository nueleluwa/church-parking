import { expect, test } from "@playwright/test";

test("staff pages send signed-out visitors to sign-in", async ({ page }) => {
  for (const path of ["/staff/scan", "/staff/search", "/staff/register"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/staff\/signin$/);
    await expect(page.getByRole("heading", { name: "Team sign-in" })).toBeVisible();
  }
});
