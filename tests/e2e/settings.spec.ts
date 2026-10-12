import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, live, staffSignIn } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

/** Puts every setting back to its default, whatever a test changed. */
async function resetSettings() {
  await adminClient().from("app_settings").delete().neq("key", "");
}
test.beforeEach(resetSettings);
test.afterEach(resetSettings);

async function openSettings(page: Page, query = "") {
  await adminSignIn(page);
  await page.goto(`/admin/settings${query}`);
  await expect(page.getByRole("main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible({ timeout: 60_000 });
}

test("the page has its title, description and eight sections; four open the screens that already manage them", async ({ page }) => {
  await openSettings(page);
  await expect(page.getByText("Manage your church parking system and preferences.")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  const expected: [string, string][] = [
    ["General", "/admin/settings"],
    ["Services", "/admin/services"],
    ["Parking areas", "/admin/areas"],
    ["Vehicle rules", "/admin/settings?tab=rules"],
    ["QR signs", "/admin/signs"],
    ["Users & access", "/admin/users?tab=staff"],
    ["Notifications", "/admin/settings?tab=notifications"],
    ["System", "/admin/settings?tab=system"],
  ];
  for (const [label, href] of expected) await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  await expect(nav.getByRole("link", { name: "General" })).toHaveAttribute("aria-current", "page");

  // No dead links: every section opens a real screen
  for (const [label, href] of expected) {
    await page.goto(href);
    await expect(page.getByRole("main").getByRole("heading").first(), label).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "We cannot find that page" })).toHaveCount(0);
  }
  await page.goto("/admin/settings?tab=notifications");
  await expect(nav.getByRole("link", { name: "Notifications" })).toHaveAttribute("aria-current", "page");
  await page.goto("/admin/settings?tab=nonsense"); // an unknown section shows General
  await expect(page.getByRole("region", { name: "Church details" })).toBeVisible();
});

test("the form loads the saved values, the time zone is fixed, and no unsupported control is shown", async ({ page }) => {
  await openSettings(page);
  const church = page.getByRole("region", { name: "Church details" });
  await expect(church.locator('[name="churchName"]')).toHaveValue("Christ Church International");
  await expect(church.locator('[name="campus"]')).toHaveValue("");
  await expect(church.locator('[name="systemName"]')).toHaveValue("Church Parking");
  const zone = church.locator("select").first();
  await expect(zone).toBeDisabled();
  await expect(zone).toHaveValue("Africa/Lagos");

  const prefs = page.getByRole("region", { name: "System preferences" });
  await expect(prefs.locator('[name="defaultSearch"]')).toHaveValue("plate");
  await expect(prefs.locator('[name="staffSessionHours"]')).toHaveValue("12");
  await expect(prefs.locator('[name="staffSessionHours"] option')).toHaveText(["2 hours", "4 hours", "8 hours", "12 hours (standard)"]);

  // Nothing here that the system cannot do, and nothing destructive
  for (const tab of ["", "?tab=rules", "?tab=notifications", "?tab=system"]) {
    await page.goto(`/admin/settings${tab}`);
    await expect(page.locator("main")).not.toContainText(/two-factor|2FA|password expiry|Reset system data|Clear logs|Download latest backup|Automatic backups|Change logo|Require QR/i);
  }
});

test("saving church details persists, is audited, and shows up on the side menu, the signs and the home page", async ({ page, browser }) => {
  const db = adminClient();
  await openSettings(page);
  const church = page.getByRole("region", { name: "Church details" });
  await church.locator('[name="churchName"]').fill("Grace Chapel International");
  await church.locator('[name="campus"]').fill("Port Harcourt");
  await church.locator('[name="systemName"]').fill("Grace Parking");
  await church.getByRole("button", { name: "Save changes" }).click();
  await expect(church.getByRole("status")).toContainText("Church details saved", { timeout: 30_000 });

  // It is stored, and survives a reload
  const rows = Object.fromEntries(((await db.from("app_settings").select("key, value")).data ?? []).map((r) => [r.key, r.value]));
  expect(rows).toMatchObject({ church_name: "Grace Chapel International", campus: "Port Harcourt", system_name: "Grace Parking" });
  await page.reload();
  await expect(page.getByRole("region", { name: "Church details" }).locator('[name="churchName"]')).toHaveValue("Grace Chapel International");
  await expect(page.getByRole("region", { name: "Church details" }).locator('[name="campus"]')).toHaveValue("Port Harcourt");

  // The audit log says who changed what
  const { data: audit } = await db.from("audit_events").select("action, after").eq("action", "settings_update").order("id", { ascending: false }).limit(1).single();
  expect(audit!.after).toMatchObject({ group: "church", churchName: "Grace Chapel International", campus: "Port Harcourt", systemName: "Grace Parking" });
  expect((audit!.after as { before: { churchName: string } }).before.churchName).toBe("Christ Church International");

  // Where the settings are used
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin");
  await expect(page.getByRole("complementary", { name: "Menu" })).toContainText("Grace Parking");
  const { data: area } = await db.from("areas").select("slug").eq("active", true).order("sort").limit(1).single();
  await page.goto(`/admin/signs/${area!.slug}`);
  const sign = page.getByRole("article");
  await expect(sign).toContainText("Grace Chapel International", { timeout: 60_000 });
  await expect(sign).toContainText("Port Harcourt");
  await page.goto("/admin/signs/general");
  await expect(page.getByRole("article")).toContainText("Grace Chapel International");
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/");
  await expect(visitor.getByRole("heading", { name: "Welcome to Grace Parking" })).toBeVisible({ timeout: 60_000 });
});

test("church details are checked before saving, and nothing is saved when they are wrong", async ({ page }) => {
  const db = adminClient();
  await openSettings(page);
  const church = page.getByRole("region", { name: "Church details" });
  // Take away the browser's own checks so the server's are what answers
  await church.locator("form").evaluate((f) => f.setAttribute("novalidate", ""));
  await church.locator("input").evaluateAll((els) => els.forEach((e) => e.removeAttribute("required")));

  await church.locator('[name="churchName"]').fill("G");
  await church.getByRole("button", { name: "Save changes" }).click();
  await expect(church.getByRole("alert")).toContainText("church name", { timeout: 30_000 });
  await church.locator('[name="churchName"]').fill("<b>Grace</b>");
  await church.getByRole("button", { name: "Save changes" }).click();
  await expect(church.getByRole("alert")).toContainText("cannot contain", { timeout: 30_000 });
  await church.locator('[name="churchName"]').fill("Grace Chapel");
  await church.locator('[name="systemName"]').fill("");
  await church.getByRole("button", { name: "Save changes" }).click();
  await expect(church.getByRole("alert")).toContainText("system name", { timeout: 30_000 });
  await expect(church.getByRole("status")).toHaveCount(0);
  expect((await db.from("app_settings").select("key")).data).toEqual([]);
});

test("preferences: the default search tab and the staff session length are used", async ({ page, browser }) => {
  const db = adminClient();
  await openSettings(page);
  const prefs = page.getByRole("region", { name: "System preferences" });
  await prefs.locator('[name="defaultSearch"]').selectOption("phone");
  await prefs.locator('[name="staffSessionHours"]').selectOption("4");
  await prefs.getByRole("button", { name: "Save changes" }).click();
  await expect(prefs.getByRole("status")).toContainText("Preferences saved", { timeout: 30_000 });
  expect((await db.from("app_settings").select("key, value").in("key", ["default_search", "staff_session_hours"])).data).toEqual(
    expect.arrayContaining([
      { key: "default_search", value: "phone" },
      { key: "staff_session_hours", value: 4 },
    ]),
  );

  // A new sign-in lasts 4 hours, and Manual Lookup opens on By phone
  const attendant = await createStaff("attendant");
  try {
    const context = await browser.newContext();
    const a = await context.newPage();
    await staffSignIn(a, attendant.phone, attendant.password);
    const cookie = (await context.cookies()).find((c) => c.name === "cp_staff");
    const lasts = cookie!.expires - Date.now() / 1000;
    expect(lasts).toBeGreaterThan(4 * 3600 - 300);
    expect(lasts).toBeLessThan(4 * 3600 + 300);
    await a.goto("/staff/search");
    await expect(a.getByRole("tab", { name: "By phone" })).toHaveAttribute("aria-selected", "true", { timeout: 60_000 });
    await a.getByRole("tab", { name: "By plate" }).click(); // they can still switch
    await expect(a.getByRole("tab", { name: "By plate" })).toHaveAttribute("aria-selected", "true");
  } finally {
    await attendant.remove();
  }

  // Back to the standard 12 hours
  await page.reload();
  await prefs.locator('[name="staffSessionHours"]').selectOption("12");
  await prefs.locator('[name="defaultSearch"]').selectOption("plate");
  await prefs.getByRole("button", { name: "Save changes" }).click();
  await expect(prefs.getByRole("status")).toContainText("Preferences saved", { timeout: 30_000 });
});

test("the other sections explain what is built in, what is not offered, and keep the activity log", async ({ page }) => {
  await openSettings(page, "?tab=rules");
  await expect(page.getByRole("heading", { name: "Service selection rules" })).toBeVisible();
  await expect(page.getByText("Pick the next service that starts within 30 minutes.")).toBeVisible();
  await expect(page.getByText("5 an hour")).toBeVisible();
  await expect(page.getByText("180 days")).toBeVisible();
  await expect(page.getByText("Only one at a time")).toBeVisible();
  await expect(page.locator("main select, main input")).toHaveCount(0); // nothing here can be switched

  await page.goto("/admin/settings?tab=notifications");
  await expect(page.getByText(/does not send emails, text messages or push notifications/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Live Parking" })).toHaveAttribute("href", "/staff/dashboard");
  await expect(page.locator("main input, main select, main [role='switch']")).toHaveCount(0);

  await page.goto("/admin/settings?tab=system");
  await expect(page.getByText("Africa/Lagos (no clock changes)")).toBeVisible();
  await expect(page.getByText(/Backups, restores and resets/)).toBeVisible();
  const log = page.getByRole("region", { name: "Activity log table, scroll sideways on a small screen" });
  await expect(log.locator("tbody tr").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/\+?234\d{9}/);
});

test("changes appear in the activity log, and only an admin can open settings", async ({ page, browser }) => {
  await openSettings(page);
  const church = page.getByRole("region", { name: "Church details" });
  await church.locator('[name="campus"]').fill("Main campus");
  await church.getByRole("button", { name: "Save changes" }).click();
  await expect(church.getByRole("status")).toBeVisible({ timeout: 30_000 });
  await page.goto("/admin/settings?tab=system");
  await expect(page.getByRole("region", { name: "Activity log table, scroll sideways on a small screen" })).toContainText("Settings changed", { timeout: 60_000 });

  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/admin/settings");
  await expect(anon).toHaveURL(/signin/, { timeout: 60_000 });
  const lead = await createStaff("coordinator");
  try {
    const c = await (await browser.newContext()).newPage();
    await staffSignIn(c, lead.phone, lead.password);
    await c.goto("/admin/settings");
    await expect(c).toHaveURL(/\/staff$/, { timeout: 60_000 });
  } finally {
    await lead.remove();
  }
});

test("the settings page fits every width from 320 to 1440 and keeps its buttons readable", async ({ page }) => {
  await adminSignIn(page);
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ["", "?tab=rules", "?tab=system"]) {
      await page.goto(`/admin/settings${tab}`);
      await expect(page.getByRole("main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible({ timeout: 60_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `settings${tab} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.goto("/admin/settings");
    const save = page.getByRole("button", { name: "Save changes" }).first();
    await expect(save).toBeVisible();
    const box = await save.boundingBox();
    expect(box!.height, `save button height at ${width}px`).toBeGreaterThanOrEqual(40);
    expect(box!.x + box!.width, `save button inside the screen at ${width}px`).toBeLessThanOrEqual(width);
  }
});
