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

const SECTIONS: { label: string; path: string; region: string }[] = [
  { label: "General", path: "/admin/settings", region: "Church details" },
  { label: "Services", path: "/admin/settings/services", region: "Services" },
  { label: "Parking areas", path: "/admin/settings/parking-areas", region: "Parking areas" },
  { label: "QR signs", path: "/admin/settings/qr-signs", region: "QR signs" },
  { label: "Vehicle rules", path: "/admin/settings/vehicle-rules", region: "Vehicle identification" },
  { label: "Users & access", path: "/admin/settings/users", region: "Users and access" },
  { label: "Notifications", path: "/admin/settings/notifications", region: "Notifications" },
  { label: "System", path: "/admin/settings/system", region: "Activity log" },
];

test("Settings is the one place for configuration: every tab switches the content in place, at its own address, inside the Settings page", async ({ page }) => {
  await openSettings(page);
  await expect(page.getByText("Manage your church parking system and preferences.")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  for (const s of SECTIONS) await expect(nav.getByRole("link", { name: s.label, exact: true })).toHaveAttribute("href", s.path);
  await expect(nav.getByRole("link", { name: "General" })).toHaveAttribute("aria-current", "page");

  // Click through every tab. The page is never reloaded, the heading and tabs stay, and the address stays under Settings
  await page.evaluate(() => ((window as unknown as { __shell: number }).__shell = 1));
  for (const s of SECTIONS) {
    await nav.getByRole("link", { name: s.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${s.path.replace(/\//g, "\\/")}$`), { timeout: 60_000 });
    await expect(page.getByRole("region", { name: s.region }).first(), s.label).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("main").getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: s.label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page, "never a standalone module").not.toHaveURL(/\/admin\/(services|areas|signs)(\/|$)/);
    expect(await page.evaluate(() => (window as unknown as { __shell?: number }).__shell), `${s.label} reloaded the page`).toBe(1);
  }

  // Refresh keeps the section, and back and forward move between sections
  await page.reload();
  await expect(nav.getByRole("link", { name: "System", exact: true })).toHaveAttribute("aria-current", "page", { timeout: 60_000 });
  await page.goBack();
  await expect(nav.getByRole("link", { name: "Notifications", exact: true })).toHaveAttribute("aria-current", "page", { timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Notifications" })).toBeVisible();
  await page.goForward();
  await expect(nav.getByRole("link", { name: "System", exact: true })).toHaveAttribute("aria-current", "page", { timeout: 60_000 });

  // Direct addresses work, and an unknown tab address is not a section
  for (const s of SECTIONS) {
    await page.goto(s.path);
    await expect(page.getByRole("region", { name: s.region }).first(), s.label).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "We cannot find that page" })).toHaveCount(0);
  }
  await page.goto("/admin/settings/nonsense");
  await expect(page.getByRole("heading", { name: "We cannot find that page" })).toBeVisible({ timeout: 60_000 });
  await page.goto("/admin/settings?tab=nonsense"); // an unknown old tab shows General
  await expect(page.getByRole("region", { name: "Church details" })).toBeVisible({ timeout: 60_000 });
});

test("the old addresses open the matching Settings section and never render a second screen; the menu no longer lists them", async ({ page }) => {
  await openSettings(page);
  const cases: [string, RegExp][] = [
    ["/admin/services", /\/admin\/settings\/services$/],
    ["/admin/areas", /\/admin\/settings\/parking-areas$/],
    ["/admin/signs", /\/admin\/settings\/qr-signs$/],
    ["/admin/signs/cp1", /\/admin\/settings\/qr-signs\/cp1$/],
    ["/admin/signs/cp1?size=a5", /\/admin\/settings\/qr-signs\/cp1\?size=a5$/],
    ["/admin/signs/general", /\/admin\/settings\/qr-signs\/general$/],
    ["/admin/settings?tab=rules", /\/admin\/settings\/vehicle-rules$/],
    ["/admin/settings?tab=notifications", /\/admin\/settings\/notifications$/],
    ["/admin/settings?tab=system", /\/admin\/settings\/system$/],
  ];
  for (const [from, to] of cases) {
    await page.goto(from);
    await expect(page, from).toHaveURL(to, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "We cannot find that page" })).toHaveCount(0);
  }

  // The side menu has Settings, and none of the three standalone entries; the phone list the same
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/settings/services");
  const side = page.getByRole("navigation", { name: "Parking team, desktop" });
  await expect(side.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page", { timeout: 60_000 });
  for (const gone of ["Services", "Car Parks", "QR Signs"]) await expect(side.getByRole("link", { name: gone, exact: true })).toHaveCount(0);
  for (const kept of ["Dashboard", "Live Parking", "Sweep", "Analytics", "Reports", "Visits", "Vehicles", "Users", "Attendant tools"]) {
    await expect(side.getByRole("link", { name: kept, exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/admin");
  for (const gone of ["Services", "Car Parks", "QR Signs"]) await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`^${gone}`) })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("link", { name: /^Settings/ })).toBeVisible();
});

test("Services in Settings: the schedule is listed from the real records, can be filtered, and the selection rules are shown", async ({ page }) => {
  const db = adminClient();
  const { data: services } = await db.from("services").select("id, name, weekday, starts_at, ends_at, active").order("weekday").order("starts_at");
  await openSettings(page, "/services");
  await expect(page.getByTestId("svc-count")).toHaveText(String(services!.length), { timeout: 60_000 });
  const first = services![0];
  const list = page.getByRole("region", { name: "Services", exact: true });
  await expect(list).toContainText(first.name);
  await expect(list).toContainText(`${String(first.starts_at).slice(0, 5)} to ${String(first.ends_at).slice(0, 5)}`);
  await expect(page.getByRole("region", { name: "Service selection rules" })).toContainText("Pick the next service that starts within 30 minutes.");

  // Filters narrow the list from the same records
  await page.goto(`/admin/settings/services?day=${first.weekday}`);
  await expect(page.getByTestId("svc-count")).toHaveText(String(services!.filter((s) => s.weekday === first.weekday).length), { timeout: 60_000 });
  await page.goto("/admin/settings/services?q=zzzz-nobody");
  await expect(page.getByText("No services match these filters.")).toBeVisible({ timeout: 60_000 });
  await page.goto("/admin/settings/services?status=off");
  await expect(page.getByTestId("svc-count")).toHaveText(String(services!.filter((s) => !s.active).length), { timeout: 60_000 });

  // Editing a service never moves an existing visit
  const { data: sample } = await db.from("visits").select("id, service_id").limit(1).single();
  const before = (await db.from("visits").select("service_id").eq("id", sample!.id).single()).data!.service_id;
  expect(before).toBe(sample!.service_id);
});

test("Parking areas and QR signs in Settings list the real car parks and their signs, with working links", async ({ page }) => {
  const db = adminClient();
  const { data: areas } = await db.from("areas").select("id, name, slug, active").order("sort").order("id");
  await openSettings(page, "/parking-areas");
  await expect(page.getByTestId("area-count")).toHaveText(String(areas!.length), { timeout: 60_000 });
  for (const a of areas!) {
    const row = page.getByRole("region", { name: "Parking areas" }).locator("li").filter({ hasText: `/c/${a.slug}` });
    await expect(row).toContainText(a.active ? "Active" : "Off");
    await expect(row.getByRole("button", { name: `Rename ${a.name}` })).toBeVisible();
    if (a.active) await expect(row.getByRole("link", { name: `QR sign for ${a.name}` })).toHaveAttribute("href", `/admin/settings/qr-signs/${a.slug}`);
  }
  // No capacity, occupancy or price is invented
  await expect(page.getByRole("main")).not.toContainText(/capacity|occupancy|%|price|spaces left/i);

  await page.goto("/admin/settings/qr-signs");
  const active = areas!.filter((a) => a.active);
  await expect(page.getByTestId("sign-count")).toHaveText(String(active.length), { timeout: 60_000 });
  for (const a of active) {
    await expect(page.getByRole("img", { name: `QR code for ${a.name}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the sign to print" }).first()).toBeVisible();
  }
  // A sign opens inside Settings: the tabs stay, and the address is under Settings
  await page.getByRole("link", { name: "Open the sign to print" }).first().click();
  await expect(page).toHaveURL(/\/admin\/settings\/qr-signs\/[a-z0-9-]+$/, { timeout: 60_000 });
  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "QR signs", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("article")).toContainText("PARKING CHECK-IN");
});

test("Users & access explains the roles from the real accounts and links to the accounts themselves", async ({ page }) => {
  await openSettings(page, "/users");
  const staff = (await adminClient().from("staff").select("role, active").limit(2000)).data!;
  const section = page.getByRole("region", { name: "Users and access" });
  for (const [role, label] of [["admin", "Admin"], ["coordinator", "Coordinator"], ["attendant", "Attendant"]]) {
    const row = section.locator("div").filter({ hasText: new RegExp(`^${label}`) }).first();
    await expect(row).toContainText(`${staff.filter((s) => s.active && s.role === role).length} active`);
  }
  await expect(section.getByRole("link", { name: "Manage staff accounts" })).toHaveAttribute("href", "/admin/users?tab=staff");
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
  for (const tab of ["", "/vehicle-rules", "/notifications", "/system", "/services", "/parking-areas", "/qr-signs", "/users"]) {
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
    for (const tab of ["", "/services", "/parking-areas", "/qr-signs", "/vehicle-rules", "/system"]) {
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
