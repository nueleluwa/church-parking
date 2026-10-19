import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminClient, live, randomPhone, randomPlate } from "./helpers";
import { enterPhone, ensureQrArea, makeQrMember, QR_AREA, removeQrArea, removeQrMember, sha256, type QrMember } from "./qr-helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(240_000);

const SEE_STAFF = "We could not check you in with this number. Please see parking staff.";
const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

const made: QrMember[] = [];
test.beforeAll(async () => {
  await removeQrArea();
  await ensureQrArea();
});
test.afterEach(async () => {
  for (const m of made.splice(0)) await removeQrMember(m);
  await adminClient().from("rate_events").delete().gte("id", 0);
});
test.afterAll(async () => {
  await removeQrArea();
});

async function member(...args: Parameters<typeof makeQrMember>) {
  const m = await makeQrMember(...args);
  made.push(m);
  return m;
}

const visitsOf = async (m: QrMember) => (await adminClient().from("visits").select("*").eq("member_id", m.id)).data ?? [];

test("the QR car park asks for a phone number and offers no guest form or sign-up; other car parks are unchanged", async ({ page }) => {
  await page.goto(`/c/${QR_AREA}`);
  await expect(page.getByLabel("Your phone number")).toBeVisible();
  await expect(page.getByText("Not registered yet? Please see parking staff.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as guest" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /create an account|sign up/i })).toHaveCount(0);

  await page.goto("/c/cp1");
  await expect(page.getByRole("button", { name: "Continue as guest" })).toBeVisible();
  await expect(page.getByLabel("Your phone number")).toHaveCount(0);
});

test("the original guest check-in is refused for a phone check-in car park, even when its form is pointed there directly", async ({ page }) => {
  const db = adminClient();
  const plate = randomPlate("GX");
  const phone = randomPhone();
  await page.goto("/c/cp1");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await page.getByLabel("Your name").fill("Zqq Direct Guest");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Get my pass" }).click();
  const confirm = page.getByRole("button", { name: "Yes, get my pass" });
  await expect(confirm).toBeVisible();
  // Point the form at the phone check-in car park, as a hand-made request would. This has to be the last step before sending:
  // the form draws itself again between its two steps and puts its own car park back.
  const areaInput = page.locator("form", { has: page.locator('input[name="plate"]') }).locator('input[name="area"]');
  await expect(areaInput).toHaveValue("cp1");
  await areaInput.evaluate((el, slug) => {
    (el as HTMLInputElement).value = slug;
  }, QR_AREA);
  await confirm.click();
  await expect(page.getByText("This car park uses phone check-in.")).toBeVisible({ timeout: 30_000 });
  expect(page.url()).not.toContain("/p/");
  expect((await db.from("vehicles").select("id").eq("plate", plate)).data).toHaveLength(0);
  expect((await db.from("guests").select("id").eq("full_name", "Zqq Direct Guest")).data).toHaveLength(0);
});

test("a number that is not a registered member gets one answer and creates nothing", async ({ page }) => {
  const db = adminClient();
  const [members, guests] = await Promise.all([
    db.from("members").select("id", { count: "exact", head: true }),
    db.from("guests").select("id", { count: "exact", head: true }),
  ]);

  await enterPhone(page, "0803 000 0000");
  await expect(page.getByText(SEE_STAFF)).toBeVisible({ timeout: 30_000 });

  // A malformed number is a typing mistake, not a lookup
  await page.getByLabel("Your phone number").fill("12345");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Please enter your phone number, for example 0803 123 4567.")).toBeVisible({ timeout: 30_000 });

  const [members2, guests2] = await Promise.all([
    db.from("members").select("id", { count: "exact", head: true }),
    db.from("guests").select("id", { count: "exact", head: true }),
  ]);
  expect(members2.count).toBe(members.count);
  expect(guests2.count).toBe(guests.count);
});

test("an inactive member, and a member with no active vehicle, get the same answer as an unknown number", async ({ page }) => {
  const off = await member({ active: false });
  await enterPhone(page, off.local);
  await expect(page.getByText(SEE_STAFF)).toBeVisible({ timeout: 30_000 });

  const noCar = await member({ carActive: false });
  await enterPhone(page, noCar.local);
  await expect(page.getByText(SEE_STAFF)).toBeVisible({ timeout: 30_000 });

  expect(await visitsOf(off)).toHaveLength(0);
  expect(await visitsOf(noCar)).toHaveLength(0);
});

test("a registered member confirms their car and gets a pass; the credential is an HttpOnly cookie and only its hash is stored", async ({ page, context }) => {
  const m = await member();
  const typed = `+234 ${m.local.slice(1, 4)} ${m.local.slice(4, 7)} ${m.local.slice(7)}`; // +234 spelling of the same number

  await enterPhone(page, typed);
  await expect(page.getByRole("heading", { name: "Confirm Check In" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(spaced(m.plates[0]))).toBeVisible();
  // Nothing is created until the member confirms
  expect(await visitsOf(m)).toHaveLength(0);

  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page).toHaveURL(/\/p\/[A-Za-z0-9_-]{22}$/, { timeout: 60_000 });
  await expect(page.getByText("VALID", { exact: true })).toBeVisible();

  const visits = await visitsOf(m);
  expect(visits).toHaveLength(1);
  expect(visits[0]).toMatchObject({ status: "parked", credential_reissues: 0 });

  const cookie = (await context.cookies()).find((c) => c.name === "cp_exit");
  expect(cookie, "the credential cookie").toBeDefined();
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/c" });
  // 24 hours by default
  expect(cookie!.expires * 1000 - Date.now()).toBeGreaterThan(23 * 3_600_000);
  expect(cookie!.expires * 1000 - Date.now()).toBeLessThan(25 * 3_600_000);
  expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // Only the hash is stored; the credential is nowhere the page's own script, the address or the page can see it
  expect(visits[0].credential_hash).toBe(sha256(cookie!.value));
  expect(visits[0].credential_hash).not.toBe(cookie!.value);
  expect(await page.evaluate(() => document.cookie)).not.toContain("cp_exit");
  expect(await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))).not.toContain(cookie!.value);
  expect(page.url()).not.toContain(cookie!.value);
  expect(await page.content()).not.toContain(cookie!.value);

  // The check-in is audited, and the audit row carries no credential
  const audit = (await adminClient().from("audit_events").select("action, after").eq("visit_id", visits[0].id)).data!;
  expect(audit.map((a) => a.action)).toEqual(["member_check_in"]);
  expect(JSON.stringify(audit)).not.toContain(cookie!.value);
  expect(JSON.stringify(audit)).not.toContain(visits[0].credential_hash);
});

test("checking in again keeps the visit and its time and replaces the credential, here and on another browser", async ({ page, context, browser }) => {
  const m = await member();
  await enterPhone(page, m.local);
  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page).toHaveURL(/\/p\//, { timeout: 60_000 });
  const first = (await visitsOf(m))[0];
  const firstCookie = (await context.cookies()).find((c) => c.name === "cp_exit")!.value;

  // Same browser again
  await enterPhone(page, m.local);
  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page).toHaveURL(/\/p\//, { timeout: 60_000 });
  const secondCookie = (await context.cookies()).find((c) => c.name === "cp_exit")!.value;
  expect(secondCookie).not.toBe(firstCookie);

  // A different browser (a new phone, say)
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await enterPhone(otherPage, m.local);
  await otherPage.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(otherPage).toHaveURL(/\/p\//, { timeout: 60_000 });
  const thirdCookie = (await other.cookies()).find((c) => c.name === "cp_exit")!.value;

  const visits = await visitsOf(m);
  expect(visits).toHaveLength(1);
  expect(visits[0]).toMatchObject({ id: first.id, checked_in_at: first.checked_in_at, credential_reissues: 2 });
  // Only the newest credential matches; the earlier two no longer do
  expect(visits[0].credential_hash).toBe(sha256(thirdCookie));
  expect(visits[0].credential_hash).not.toBe(sha256(firstCookie));
  expect(visits[0].credential_hash).not.toBe(sha256(secondCookie));
  const audit = (await adminClient().from("audit_events").select("action").eq("visit_id", first.id)).data!.map((a) => a.action).sort();
  expect(audit).toEqual(["credential_reissue", "credential_reissue", "member_check_in"]);
  await other.close();
});

test("a member with several cars must choose one, and the choice is the car on the visit", async ({ page }) => {
  const m = await member({ cars: 2 });
  await enterPhone(page, m.local);
  await expect(page.getByText("Which car are you parking?")).toBeVisible({ timeout: 30_000 });
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.first()).not.toBeChecked();
  await expect(radios.nth(1)).not.toBeChecked();

  // Confirming without choosing a car creates nothing
  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  expect(await visitsOf(m)).toHaveLength(0);

  const chosen = [...m.plates].sort()[1]; // the second in the list (plates are listed alphabetically)
  await page.getByText(spaced(chosen)).click();
  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page).toHaveURL(/\/p\//, { timeout: 60_000 });
  const visits = await visitsOf(m);
  expect(visits).toHaveLength(1);
  const plate = (await adminClient().from("vehicles").select("plate").eq("id", visits[0].vehicle_id).single()).data!.plate;
  expect(plate).toBe(chosen);
});

test("a member already checked in at another car park is told so, and nothing changes", async ({ page }) => {
  const m = await member();
  await enterPhone(page, m.local);
  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page).toHaveURL(/\/p\//, { timeout: 60_000 });
  const before = (await visitsOf(m))[0];

  // Put the visit in another car park, then check in at the QR one again
  const db = adminClient();
  const cp1 = (await db.from("areas").select("id").eq("slug", "cp1").single()).data!.id;
  await db.from("visits").update({ area_id: cp1 }).eq("id", before.id);
  await enterPhone(page, m.local);
  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page.getByText("You are already checked in at another car park.")).toBeVisible({ timeout: 30_000 });
  const after = await visitsOf(m);
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ area_id: cp1, credential_hash: before.credential_hash, credential_reissues: 0 });
});

test("too many tries for one phone number, or from one address, are refused", async ({ page, browser }) => {
  // One phone number: the sixth lookup in ten minutes is refused
  for (let i = 0; i < 5; i++) {
    await enterPhone(page, "0803 111 2222");
    await expect(page.getByText(SEE_STAFF)).toBeVisible({ timeout: 30_000 });
  }
  await enterPhone(page, "0803 111 2222");
  await expect(page.getByText("Too many tries.")).toBeVisible({ timeout: 30_000 });

  // One address (the proxy tells the app the address in x-real-ip): the eleventh lookup in a minute is refused
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": "203.0.113.77" } });
  const p = await ctx.newPage();
  await p.goto(`/c/${QR_AREA}`);
  for (let i = 0; i < 10; i++) {
    await p.getByLabel("Your phone number").fill(`0803 33${i} 4444`);
    await p.getByRole("button", { name: "Continue" }).click();
    await expect(p.getByText(SEE_STAFF)).toBeVisible({ timeout: 30_000 });
  }
  await p.getByLabel("Your phone number").fill("0803 339 5555");
  await p.getByRole("button", { name: "Continue" }).click();
  await expect(p.getByText("Too many tries.")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("both steps have no automatically detectable accessibility problems and fit narrow phones", async ({ page }) => {
  const m = await member({ cars: 2 });
  const scan = async (label: string) => {
    // A button that is still working is dimmed on purpose; scan the settled screen
    for (const b of await page.getByRole("button").all()) await expect(b).toBeEnabled();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`), label).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: sideways scroll`).toBeLessThanOrEqual(0);
  };
  for (const width of [320, 360, 412]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/c/${QR_AREA}`);
    await expect(page.getByLabel("Your phone number")).toBeVisible();
    await scan(`phone step at ${width}px`);
    await page.getByLabel("Your phone number").fill("12345");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
    await scan(`phone step with a message at ${width}px`);
    await page.getByLabel("Your phone number").fill(m.local);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Which car are you parking?")).toBeVisible({ timeout: 30_000 });
    await scan(`confirm step at ${width}px`);
  }
});

test("the credential cookie is not sent to pages outside the parking pages", async ({ page, context }) => {
  const m = await member();
  await enterPhone(page, m.local);
  await page.getByRole("button", { name: "Yes, check me in" }).click();
  await expect(page).toHaveURL(/\/p\//, { timeout: 60_000 });
  const origin = new URL(page.url()).origin;
  const sentTo = async (path: string) => (await context.cookies(`${origin}${path}`)).some((c) => c.name === "cp_exit");
  // Sent to the parking pages (the check-in page and the exit page), and to nothing else, including the pass page we are on
  expect(await sentTo(`/c/${QR_AREA}`)).toBe(true);
  expect(await sentTo(`/c/${QR_AREA}/out`)).toBe(true);
  expect(await sentTo(new URL(page.url()).pathname)).toBe(false);
  for (const path of ["/", "/account", "/staff", "/admin", "/scan"]) expect(await sentTo(path), path).toBe(false);
});
