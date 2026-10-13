import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, adminSignIn, guestCheckIn, live, randomPlate } from "./helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const main = (page: Page) => page.getByRole("main");
const VISITS = `/admin/visits?from=${today()}&to=${today()}`;

/** Every module's own page, to compare the shared pieces across them. */
const MODULES = [
  { name: "Dashboard", url: "/admin" },
  { name: "Live Parking", url: "/staff/dashboard" },
  { name: "Sweep", url: "/staff/sweep" },
  { name: "Analytics", url: "/admin/analytics" },
  { name: "Reports", url: "/admin/reports" },
  { name: "Visits", url: VISITS },
  { name: "Vehicles", url: "/admin/vehicles" },
  { name: "Users", url: "/admin/users" },
  { name: "Users (staff)", url: "/admin/users?tab=staff" },
  { name: "Settings", url: "/admin/settings" },
  { name: "Settings (services)", url: "/admin/settings/services" },
] as const;

async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await expect(main(page).locator("h1").first()).toBeVisible({ timeout: 60_000 });
}

test("every module's page title, summary cards, primary buttons and status chips use the same sizes and colours", async ({ page }) => {
  await adminSignIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const titles: Record<string, string> = {};
  const metrics: { module: string; padding: string; radius: string; minHeight: number; border: string }[] = [];
  const buttons: { module: string; label: string; height: number; radius: string }[] = [];
  const chips: { module: string; text: string; color: string }[] = [];

  for (const m of MODULES) {
    await gotoReady(page, m.url);
    const result = await page.evaluate(() => {
      const h1 = document.querySelector("main h1") as HTMLElement | null;
      const t = h1 ? getComputedStyle(h1) : null;
      const cards = [...document.querySelectorAll<HTMLElement>("main .metric")].map((el) => {
        const s = getComputedStyle(el);
        return { padding: `${s.paddingTop} ${s.paddingLeft}`, radius: s.borderTopLeftRadius, height: el.getBoundingClientRect().height, border: s.borderTopWidth + s.borderTopColor };
      });
      const primary = [...document.querySelectorAll<HTMLElement>("main .btn-primary")]
        .filter((el) => el.getClientRects().length > 0 && !el.closest("[role=dialog]"))
        .map((el) => ({ label: (el.textContent ?? "").trim(), height: Math.round(el.getBoundingClientRect().height), radius: getComputedStyle(el).borderTopLeftRadius }));
      const chipEls = [...document.querySelectorAll<HTMLElement>("main .chip")].filter((el) => el.getClientRects().length > 0).slice(0, 6).map((el) => ({ text: (el.textContent ?? "").trim(), color: getComputedStyle(el).color }));
      return { title: t ? `${t.fontSize}/${t.fontWeight}` : "", cards, primary, chipEls };
    });
    titles[m.name] = result.title;
    // The cards in one row are the same height
    if (result.cards.length > 1) expect(new Set(result.cards.map((c) => Math.round(c.height))).size, `${m.name}: summary cards are not the same height`).toBe(1);
    for (const c of result.cards) metrics.push({ module: m.name, padding: c.padding, radius: c.radius, minHeight: Math.round(c.height), border: c.border });
    for (const b of result.primary) buttons.push({ module: m.name, label: b.label, height: b.height, radius: b.radius });
    for (const c of result.chipEls) chips.push({ module: m.name, text: c.text, color: c.color });
  }

  // One page title size and weight everywhere
  const sizes = new Set(Object.values(titles).filter(Boolean));
  expect([...sizes], `page titles differ: ${JSON.stringify(titles)}`).toHaveLength(1);

  // Summary cards: one padding, one radius, one border, and never shorter than the minimum
  expect(new Set(metrics.map((m) => m.padding)).size, `card padding differs: ${JSON.stringify(metrics.map((m) => [m.module, m.padding]))}`).toBe(1);
  expect(new Set(metrics.map((m) => m.radius)).size).toBe(1);
  expect(new Set(metrics.map((m) => m.border)).size).toBe(1);
  for (const m of metrics) expect(m.minHeight, `${m.module} card is too short`).toBeGreaterThanOrEqual(104);

  // Primary buttons: one corner radius, and one height unless the label wraps
  expect(new Set(buttons.map((b) => b.radius)).size, `button radius differs: ${JSON.stringify(buttons)}`).toBe(1);
  for (const b of buttons) expect(b.height, `${b.module} "${b.label}" button height`).toBe(44);

  // Status chips use only the church's black, grey and red
  const allowed = new Set(["rgb(20, 20, 20)", "rgb(85, 80, 74)", "rgb(179, 18, 27)"]);
  for (const c of chips) expect(allowed.has(c.color), `${c.module} chip "${c.text}" uses ${c.color}`).toBe(true);
});

test("form fields and row actions have the same height everywhere, and every table keeps its header and cell padding", async ({ page }) => {
  await adminSignIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const fields: { module: string; kind: string; height: number }[] = [];
  const cells = new Set<string>();
  for (const m of MODULES) {
    await gotoReady(page, m.url);
    const r = await page.evaluate(() => ({
      fields: [...document.querySelectorAll<HTMLElement>("main .input")]
        .filter((el) => el.getClientRects().length > 0 && !(el instanceof HTMLInputElement && el.type === "date" && false))
        .map((el) => ({ kind: el.tagName.toLowerCase() + ((el as HTMLInputElement).type ?? ""), height: Math.round(el.getBoundingClientRect().height) })),
      cells: [...document.querySelectorAll<HTMLElement>("main table.dt .dt-td, main table.dt .dt-th")].filter((el) => el.getClientRects().length > 0).slice(0, 12).map((el) => { const s = getComputedStyle(el); return `${s.paddingTop}|${s.paddingLeft}`; }),
    }));
    for (const f of r.fields) fields.push({ module: m.name, ...f });
    for (const c of r.cells) cells.add(c);
  }
  expect(fields.length).toBeGreaterThan(8);
  expect(new Set(fields.map((f) => f.height)), `field heights differ: ${JSON.stringify(fields)}`.slice(0, 600)).toEqual(new Set([44]));
  expect(cells.size, `table cell padding differs: ${[...cells].join(" ; ")}`).toBeLessThanOrEqual(1);
});

test("the vehicle illustration is the same picture, size and distance from the number in every module", async ({ page, browser }) => {
  const db = adminClient();
  const plate = randomPlate("DS");
  await guestCheckIn(browser, plate);
  const visit = (await db.from("visits").select("id, service_id, vehicles!inner(plate)").eq("vehicles.plate", plate).single()).data!;
  try {
    await adminSignIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const where = [
      { name: "Dashboard", url: "/admin", scope: "table.dt" },
      { name: "Visits", url: VISITS, scope: "table.dt" },
      { name: "Vehicles", url: `/admin/vehicles?q=${plate}`, scope: "table.dt" },
      { name: "Sweep", url: `/staff/sweep?q=${plate}`, scope: "table.dt" },
    ];
    const seen: { name: string; width: number; height: number; gap: number; src: string; natural: number }[] = [];
    for (const w of where) {
      await gotoReady(page, w.url);
      const r = await page.evaluate(
        ({ scope, plate }) => {
          const rows = [...document.querySelectorAll<HTMLElement>(`main ${scope} tbody tr`)];
          const row = rows.find((tr) => (tr.textContent ?? "").replace(/\s/g, "").includes(plate)) ?? rows[0];
          const img = row?.querySelector("img") as HTMLImageElement | null;
          const number = row?.querySelector("[data-plate]") as HTMLElement | null;
          if (!img || !number) return null;
          const a = img.getBoundingClientRect();
          const b = number.getBoundingClientRect();
          return { width: Math.round(a.width), height: Math.round(a.height), gap: Math.round(b.left - a.right), src: img.getAttribute("src") ?? "", natural: img.naturalWidth / img.naturalHeight, rowHeight: row.getBoundingClientRect().height };
        },
        { scope: w.scope, plate },
      );
      expect(r, `${w.name}: no vehicle with its picture`).not.toBeNull();
      seen.push({ name: w.name, ...r! });
      // The picture never makes a row tall
      expect((r as { rowHeight: number }).rowHeight, `${w.name} row height`).toBeLessThanOrEqual(110);
    }
    expect(new Set(seen.map((s) => s.src)), "one picture").toEqual(new Set(["/vehicle-illustration.png"]));
    expect(new Set(seen.map((s) => s.width)), JSON.stringify(seen)).toHaveProperty("size", 1);
    expect(new Set(seen.map((s) => s.gap)).size, `distance to the number: ${JSON.stringify(seen)}`).toBe(1);
    for (const s of seen) expect(Math.abs(s.width / s.height - s.natural) / s.natural, `${s.name} picture is stretched`).toBeLessThan(0.03);

    // The same on a phone: cards, with the same picture next to the number
    await page.setViewportSize({ width: 390, height: 844 });
    for (const w of where.slice(1)) {
      await gotoReady(page, w.url);
      const card = main(page).locator("li").filter({ hasText: new RegExp(`${plate.slice(0, 3)}\\s?${plate.slice(3, 6)}`) }).first();
      await expect(card.locator('img[src="/vehicle-illustration.png"]'), w.name).toBeVisible({ timeout: 60_000 });
    }
  } finally {
    await db.rpc("release_visit", { p_visit: visit.id, p_staff: (await db.from("staff").select("id").eq("phone", process.env.ADMIN_PHONE!).single()).data!.id, p_method: "scan", p_today: today() });
  }
});

test("no table needs sideways scrolling at the widths where tables are shown, and phones show cards instead", async ({ page }) => {
  await adminSignIn(page);
  const pages = ["/admin/vehicles", VISITS, "/admin/users", "/admin/users?tab=staff", "/staff/sweep", "/admin/settings/services", "/admin"];
  for (const width of [1440, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of pages) {
      await gotoReady(page, url);
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("main table.dt")]
          .filter((t) => t.getClientRects().length > 0)
          .map((t) => { const wrap = t.parentElement as HTMLElement; return { caption: t.querySelector("caption")?.textContent ?? "", over: wrap.scrollWidth - wrap.clientWidth }; })
          .filter((x) => x.over > 1),
      );
      expect(clipped, `${url} at ${width}px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${url} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
  // Below the wide breakpoint a list is cards, not a squeezed table
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoReady(page, "/admin/vehicles");
  await expect(main(page).locator("table.dt:visible")).toHaveCount(0);
});

test("a saved change shows one dismissible toast; a failed request shows an error toast and keeps what was typed", async ({ page }) => {
  await adminSignIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const db = adminClient();
  await db.from("app_settings").delete().neq("key", "");
  try {
    await gotoReady(page, "/admin/settings");
    const church = page.getByRole("region", { name: "Church details" });
    await church.getByLabel("Campus / location").fill("Port Harcourt");
    await church.getByRole("button", { name: "Save changes" }).click();
    const toast = page.locator('[data-toast="success"]');
    await expect(toast).toHaveCount(1, { timeout: 30_000 });
    await expect(toast).toContainText("Settings saved successfully.");
    // It is announced politely, sits outside the page content, and can be dismissed
    await expect(page.getByLabel("Confirmations")).toHaveAttribute("aria-live", "polite");
    await toast.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(page.locator("[data-toast]")).toHaveCount(0);

    // The same save when the server cannot be reached: an error, the typed value stays, and nothing is shown as saved
    await page.route("**/*", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await church.getByLabel("Campus / location").fill("Lagos Island");
    await church.getByRole("button", { name: "Save changes" }).click();
    await expect(church.getByRole("alert")).toContainText("We could not reach the server", { timeout: 30_000 });
    await expect(page.locator('[data-toast="error"]')).toHaveCount(1);
    await expect(page.locator('[data-toast="success"]')).toHaveCount(0);
    await expect(church.getByLabel("Campus / location")).toHaveValue("Lagos Island");
    await expect(church.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await page.unroute("**/*");
    expect((await db.from("app_settings").select("value").eq("key", "campus")).data![0].value).toBe("Port Harcourt");
  } finally {
    await db.from("app_settings").delete().neq("key", "");
  }
});

test("a panel takes focus, keeps Tab inside, closes with Escape and gives focus back; a loading page shows a skeleton", async ({ page }) => {
  await adminSignIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoReady(page, "/admin/vehicles");
  const add = main(page).getByRole("link", { name: "Add vehicle" });
  await add.click();
  const panel = page.getByRole("dialog", { name: "Add vehicle" });
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), { timeout: 10_000 }).toBe(true);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), `Tab left the panel at press ${i + 1}`).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/add=1/, { timeout: 30_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A slow page: the skeleton (one polite "Loading" for a screen reader) shows in the page area while the header and menu stay
  await gotoReady(page, "/admin");
  await page.route("**/admin/visits**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.getByRole("complementary", { name: "Menu" }).getByRole("link", { name: "Visits", exact: true }).click();
  await expect(main(page).getByRole("status").filter({ hasText: "Loading" })).toBeVisible({ timeout: 10_000 });
  expect(await main(page).locator(".skeleton").count()).toBeGreaterThan(3);
  await expect(page.getByRole("complementary", { name: "Menu" })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "Visits", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(main(page).locator(".skeleton")).toHaveCount(0);
  await page.unroute("**/admin/visits**");
});

test("every data screen has a skeleton: each page folder has a loading screen of its own or inherits one", async () => {
  const root = path.join(process.cwd(), "app", "(team)");
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") pages.push(dir);
    }
  };
  walk(root);
  expect(pages.length).toBeGreaterThan(20);
  const hasLoading = (dir: string): boolean => {
    for (let d = dir; d.startsWith(root); d = path.dirname(d)) if (fs.existsSync(path.join(d, "loading.tsx"))) return true;
    return false;
  };
  for (const dir of pages) expect(hasLoading(dir), `${path.relative(root, dir)} has no loading screen`).toBe(true);
  // The main data screens have their own, shaped like the page
  for (const own of ["admin", "admin/visits", "admin/vehicles", "admin/users", "admin/analytics", "admin/reports", "admin/settings", "admin/settings/services", "staff/dashboard", "staff/sweep"]) {
    expect(fs.existsSync(path.join(root, own, "loading.tsx")), `${own} needs its own loading screen`).toBe(true);
  }
});

test("dropdowns, checkboxes, radio buttons, dates and the disclosure arrow use our own styling, and phone dark mode does not repaint them", async ({ page }) => {
  await adminSignIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  // Even when the device asks for dark mode, controls stay in our light, church style
  await page.emulateMedia({ colorScheme: "dark" });

  await gotoReady(page, VISITS);
  const selects = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLSelectElement>("main select")].filter((el) => el.getClientRects().length > 0).map((el) => {
      const s = getComputedStyle(el);
      return { name: el.name, appearance: s.appearance, background: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius), paddingRight: parseFloat(s.paddingRight), colorScheme: getComputedStyle(document.documentElement).colorScheme };
    }),
  );
  expect(selects.length).toBeGreaterThan(2);
  for (const s of selects) {
    expect(["none", "base-select"], `select ${s.name} is drawn by the browser (${s.appearance})`).toContain(s.appearance);
    expect(s.background, `select ${s.name} background`).toBe("rgb(255, 255, 255)");
    expect(s.radius, `select ${s.name} corners`).toBeGreaterThanOrEqual(12);
    expect(s.paddingRight, `select ${s.name} leaves room for our arrow`).toBeGreaterThanOrEqual(36);
    expect(s.colorScheme).toBe("light");
  }

  // Dates: our field and our icon
  const dates = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('main input[type="date"]')].map((el) => { const s = getComputedStyle(el); return { appearance: s.appearance, image: s.backgroundImage.slice(0, 30), radius: parseFloat(s.borderTopLeftRadius) }; }),
  );
  expect(dates.length).toBeGreaterThan(1);
  for (const d of dates) {
    expect(d.appearance).toBe("none");
    expect(d.image).toContain("url(");
    expect(d.radius).toBeGreaterThanOrEqual(12);
  }

  // Checkboxes and radio buttons: a drawn box with a red tick or dot, not the browser's blue one
  await gotoReady(page, "/admin/vehicles");
  const box = main(page).locator('table.dt tbody input[type="checkbox"]').first();
  await expect(box).toBeVisible({ timeout: 60_000 });
  const unchecked = await box.evaluate((el) => { const s = getComputedStyle(el); return { appearance: s.appearance, radius: s.borderTopLeftRadius, border: s.borderTopColor }; });
  expect(unchecked.appearance).toBe("none");
  expect(unchecked.radius).toBe("6px");
  await box.check();
  // The colour eases in over a moment, so wait for it to settle
  await expect.poll(() => box.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(179, 18, 27)");
  expect(await box.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("url(");
  await box.uncheck();

  await page.goto("/admin/vehicles?add=1");
  const panel = page.getByRole("dialog", { name: "Add vehicle" });
  const member = panel.getByRole("radio", { name: "Member" });
  await member.check();
  await expect.poll(() => member.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(179, 18, 27)");
  const radio = await member.evaluate((el) => { const s = getComputedStyle(el); return { appearance: s.appearance, radius: s.borderTopLeftRadius }; });
  expect(radio.appearance).toBe("none");
  expect(parseFloat(radio.radius)).toBeGreaterThanOrEqual(10);

  // The disclosure arrow on a <details> is ours (no triangle marker)
  await page.goto("/admin/settings/parking-areas");
  const summary = main(page).locator("summary").first();
  await expect(summary).toBeVisible({ timeout: 60_000 });
  const arrow = await summary.evaluate((el) => ({ list: getComputedStyle(el).listStyleType, after: getComputedStyle(el, "::after").content }));
  expect(arrow.list).toBe("none");
  expect(arrow.after).not.toBe("none");
});

test("no form on a team screen uses the browser's own validation bubble: a missing value is explained in the page's own words", async ({ page }) => {
  await adminSignIn(page);
  for (const url of [...MODULES.map((m) => m.url), "/admin/vehicles?add=1", "/admin/users?add=1", "/admin/settings/services?add=1", "/admin/settings/parking-areas?add=1", "/admin/users?tab=staff&add=1"]) {
    await page.goto(url);
    await expect(main(page).locator("h1").first()).toBeVisible({ timeout: 60_000 });
    const loose = await page.evaluate(() => [...document.querySelectorAll<HTMLFormElement>("form")].filter((f) => !f.noValidate).map((f) => f.getAttribute("aria-label") ?? f.action));
    expect(loose, `${url} has forms that would show the browser's bubble`).toEqual([]);
  }

  // An empty required field: our message, and the field is focused
  await page.goto("/admin/settings/services?add=1");
  const panel = page.getByRole("dialog", { name: "Add service" });
  await panel.getByLabel("Name").fill("");
  await panel.getByRole("button", { name: "Add service" }).click();
  await expect(panel.getByRole("alert")).toContainText("Please check “Name”.");
  await expect(panel.getByLabel("Name")).toBeFocused();
});
