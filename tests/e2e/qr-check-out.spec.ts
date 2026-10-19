import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, live, staffSignIn } from "./helpers";
import { checkInVia, credentialOf, ensureQrArea, makeQrMember, QR_AREA, removeQrArea, removeQrMember, setCredential, sha256, type QrMember } from "./qr-helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(240_000);

const EXIT = `/c/${QR_AREA}/out`;
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
const visitOf = async (m: QrMember) => (await adminClient().from("visits").select("*").eq("member_id", m.id).single()).data!;
const spaced = (p: string) => `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;

test("scanning the exit sign checks the member out with no input; the credential is cleared and the audit row carries none", async ({ page, context }) => {
  const m = await member();
  const passUrl = await checkInVia(page, m.local);
  const credential = (await credentialOf(context))!;
  expect(credential).toBeTruthy();

  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "You are checked out" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(spaced(m.plates[0]))).toBeVisible();

  const v = await visitOf(m);
  expect(v).toMatchObject({ status: "released", release_method: "self", released_by: null, credential_hash: sha256(credential) });
  expect(v.released_at).not.toBeNull();
  expect(await credentialOf(context)).toBeUndefined();
  const audit = (await adminClient().from("audit_events").select("action, before, after").eq("visit_id", v.id)).data!;
  expect(audit.map((a) => a.action).sort()).toEqual(["member_check_in", "self_checkout"]);
  expect(JSON.stringify(audit)).not.toContain(credential);
  expect(JSON.stringify(audit)).not.toContain(sha256(credential));

  // The pass now says the car has left
  await page.goto(passUrl);
  await expect(page.getByText("CAR RELEASED")).toBeVisible();
});

test("an attendant who scans the pass afterwards is told the member checked out themselves", async ({ page, browser }) => {
  const m = await member();
  const passUrl = await checkInVia(page, m.local);
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "You are checked out" })).toBeVisible({ timeout: 30_000 });

  const attendant = await createStaff("attendant");
  try {
    const staffPage = await (await browser.newContext()).newPage();
    await staffSignIn(staffPage, attendant.phone, attendant.password);
    await staffPage.goto(passUrl);
    await expect(staffPage.getByText("The member checked out with the exit sign")).toBeVisible({ timeout: 30_000 });
    await expect(staffPage.getByText("Do not release again")).toBeVisible();
  } finally {
    await attendant.remove();
  }
});

test("a repeat scan is safe: with the credential still there it says already checked out; without it, it closes nothing", async ({ page, context }) => {
  const m = await member();
  await checkInVia(page, m.local);
  const credential = (await credentialOf(context))!;
  const origin = new URL(page.url()).origin;

  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "You are checked out" })).toBeVisible({ timeout: 30_000 });
  const closed = await visitOf(m);

  // The same credential again (a second tab, a retried request): already checked out, and nothing changes
  await setCredential(context, credential, origin);
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "You are already checked out" })).toBeVisible({ timeout: 30_000 });
  expect((await visitOf(m)).released_at).toBe(closed.released_at);
  expect(await credentialOf(context)).toBeUndefined();
  expect((await adminClient().from("audit_events").select("id").eq("visit_id", closed.id).eq("action", "self_checkout")).data).toHaveLength(1);

  // No credential at all: it says so, offers the way back, and changes nothing
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "We could not find your check-in on this phone" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("scan the check-in sign at this car park again")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to check-in" })).toHaveAttribute("href", `/c/${QR_AREA}`);
  expect((await visitOf(m)).released_at).toBe(closed.released_at);
});

test("without the credential nothing is closed, and a GET (a link preview or prefetch) never closes anything", async ({ page, context, browser }) => {
  const m = await member();
  await checkInVia(page, m.local);
  const credential = (await credentialOf(context))!;

  // Another phone/browser has no credential
  const other = await (await browser.newContext()).newPage();
  await other.goto(EXIT);
  await expect(other.getByRole("heading", { name: "We could not find your check-in on this phone" })).toBeVisible({ timeout: 30_000 });
  expect(await visitOf(m)).toMatchObject({ status: "parked", release_method: null });

  // A plain GET WITH the real credential (what a link scanner could do) closes nothing
  const get = await context.request.get(EXIT);
  expect(get.status()).toBe(200);
  expect(await visitOf(m)).toMatchObject({ status: "parked", release_method: null });
  expect(await credentialOf(context)).toBe(credential);
});

test("the exit sign of another car park closes nothing and keeps the credential", async ({ page, context }) => {
  const m = await member();
  await checkInVia(page, m.local);
  const credential = (await credentialOf(context))!;
  const cookieFor = await context.cookies();
  // The cookie is only sent to /c/..., so /c/cp1/out gets it; the visit is at the QR test car park
  expect(cookieFor.some((c) => c.name === "cp_exit")).toBe(true);

  await page.goto("/c/cp1/out");
  await expect(page.getByRole("heading", { name: "This is not your car park" })).toBeVisible({ timeout: 30_000 });
  expect(await visitOf(m)).toMatchObject({ status: "parked", release_method: null });
  expect(await credentialOf(context)).toBe(credential);

  // The right sign still works afterwards
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "You are checked out" })).toBeVisible({ timeout: 30_000 });
});

test("a replaced credential stops working and the newest one works", async ({ page, context }) => {
  const m = await member();
  await checkInVia(page, m.local);
  const origin = new URL(page.url()).origin;
  const first = (await credentialOf(context))!;
  await checkInVia(page, m.local); // a repeat check-in replaces it
  const second = (await credentialOf(context))!;
  expect(second).not.toBe(first);

  await setCredential(context, first, origin);
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "We could not find your check-in on this phone" })).toBeVisible({ timeout: 30_000 });
  expect(await visitOf(m)).toMatchObject({ status: "parked" });

  await setCredential(context, second, origin);
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "You are checked out" })).toBeVisible({ timeout: 30_000 });
});

test("an expired credential, and a car on hold, close nothing and say what to do", async ({ page, context }) => {
  const m = await member();
  const db = adminClient();
  await checkInVia(page, m.local);
  const credential = (await credentialOf(context))!;
  const origin = new URL(page.url()).origin;
  const v = await visitOf(m);

  await db.from("visits").update({ credential_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", v.id);
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "Your check-in has expired" })).toBeVisible({ timeout: 30_000 });
  expect(await visitOf(m)).toMatchObject({ status: "parked" });

  await db.from("visits").update({ credential_expires_at: new Date(Date.now() + 3_600_000).toISOString(), held_at: new Date().toISOString() }).eq("id", v.id);
  await setCredential(context, credential, origin);
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "Please see an attendant" })).toBeVisible({ timeout: 30_000 });
  expect(await visitOf(m)).toMatchObject({ status: "parked" });
});

test("two exit pages opened at the same moment: one closes it, the other says it is already closed", async ({ page, context }) => {
  const m = await member();
  await checkInVia(page, m.local);
  const second = await context.newPage();
  await Promise.all([page.goto(EXIT), second.goto(EXIT)]);
  const headings = await Promise.all(
    [page, second].map(async (p) => {
      const h = p.getByRole("heading").filter({ hasText: /You are (already )?checked out/ });
      await expect(h).toBeVisible({ timeout: 30_000 });
      return h.innerText();
    }),
  );
  expect(headings.filter((h) => h === "You are checked out")).toHaveLength(1);
  expect(headings.filter((h) => h === "You are already checked out")).toHaveLength(1);
  const v = await visitOf(m);
  expect((await adminClient().from("audit_events").select("id").eq("visit_id", v.id).eq("action", "self_checkout")).data).toHaveLength(1);
});

test("a failed request is shown as a failure, nothing is closed, and trying again works", async ({ page }) => {
  const m = await member();
  await checkInVia(page, m.local);
  let block = true;
  await page.route(`**${EXIT}`, (route) => (route.request().method() === "POST" && block ? route.abort("connectionfailed") : route.continue()));

  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "We could not check you out" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("You are not checked out yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "You are checked out" })).toHaveCount(0);
  expect(await visitOf(m)).toMatchObject({ status: "parked" });

  block = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "You are checked out" })).toBeVisible({ timeout: 30_000 });
});

test("a check-out request from another website, or with no Origin header, is refused and closes nothing", async ({ page, browser, context }) => {
  // Watch a real check-out to learn what the page sends, using a member who is then done
  const first = await member();
  await checkInVia(page, first.local);
  let sent: { headers: Record<string, string>; body: string } | null = null;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith(EXIT)) sent = { headers: r.headers(), body: r.postData() ?? "" };
  });
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "You are checked out" })).toBeVisible({ timeout: 30_000 });
  expect(sent).not.toBeNull();
  const real = sent as unknown as { headers: Record<string, string>; body: string };
  const replayHeaders = Object.fromEntries(
    Object.entries(real.headers).filter(([k]) => !["host", "content-length", "cookie", "origin", "referer", "connection"].includes(k.toLowerCase())),
  );
  const url = new URL(EXIT, page.url()).toString();
  const host = new URL(url).origin;

  // A second member, with their own browser, whose credential a hostile page would be trying to use
  const victim = await member();
  const victimCtx = await browser.newContext();
  const victimPage = await victimCtx.newPage();
  await checkInVia(victimPage, victim.local);
  const credential = (await credentialOf(victimCtx))!;
  const post = (origin: string | null) =>
    victimCtx.request.post(url, { headers: { ...replayHeaders, ...(origin ? { origin } : {}) }, data: real.body });

  // Another website, a "null" origin (a sandboxed page), and no Origin header at all (which Next's own check lets through)
  for (const origin of ["https://evil.example", "null", null]) {
    const res = await post(origin);
    const text = await res.text();
    expect(text, `origin ${origin}`).not.toContain('"status":"ok"');
    if (origin === null) expect(text).toContain("bad_origin");
    expect(await visitOf(victim), `origin ${origin}`).toMatchObject({ status: "parked", release_method: null });
  }
  expect(await credentialOf(victimCtx)).toBe(credential);

  // The same request from our own origin does close it, so the replay is a fair test
  const ok = await (await post(host)).text();
  expect(ok).toContain('"status":"ok"');
  expect(await visitOf(victim)).toMatchObject({ status: "released", release_method: "self" });
  expect(context).toBeDefined();
});
test("an exit sign for a car park that does not exist says the sign is not working and closes nothing", async ({ page, context }) => {
  const m = await member();
  await checkInVia(page, m.local);
  await page.goto("/c/no-such-park/out");
  await expect(page.getByRole("heading", { name: "This sign is not working" })).toBeVisible({ timeout: 30_000 });
  expect(await visitOf(m)).toMatchObject({ status: "parked" });
  expect(await credentialOf(context)).toBeTruthy();
});

test("the exit screens have no automatically detectable accessibility problems and fit narrow phones", async ({ page, browser }) => {
  const m = await member();
  await checkInVia(page, m.local);
  const scan = async (label: string) => {
    for (const b of await page.getByRole("button").all()) await expect(b).toBeEnabled();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`), label).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${label}: sideways scroll`).toBeLessThanOrEqual(0);
  };
  // Another browser first: no credential. Then the member's own: checked out, then already checked out is the same layout.
  const other = await (await browser.newContext()).newPage();
  for (const width of [320, 360, 412]) {
    await other.setViewportSize({ width, height: 800 });
    await other.goto(EXIT);
    await expect(other.getByRole("heading", { name: "We could not find your check-in on this phone" })).toBeVisible({ timeout: 30_000 });
    const results = await new AxeBuilder({ page: other }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => v.id), `no credential at ${width}px`).toEqual([]);
    expect(await other.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
  for (const width of [320, 412]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/c/cp1/out");
    await expect(page.getByRole("heading", { name: "This is not your car park" })).toBeVisible({ timeout: 30_000 });
    await scan(`wrong car park at ${width}px`);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(EXIT);
  await expect(page.getByRole("heading", { name: "You are checked out" })).toBeVisible({ timeout: 30_000 });
  await scan("checked out at 360px");
});

test("the admin can print an exit sign for a car park, separate from the check-in sign", async ({ page }) => {
  await adminSignIn(page);
  await page.goto(`/admin/settings/qr-signs/${QR_AREA}?kind=exit`);
  await expect(page.getByRole("heading", { name: "PARKING CHECK-OUT" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: "Exit QR code for QR Test Park" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit sign" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("link", { name: "A5 (portrait)" })).toHaveAttribute("href", /kind=exit.*size=a5/);

  await page.goto(`/admin/settings/qr-signs/${QR_AREA}`);
  await expect(page.getByRole("heading", { name: "PARKING CHECK-IN" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Check-in sign" })).toHaveAttribute("aria-current", "true");
  // The exit sign's code is a different address from the check-in sign's
  const checkInCode = await page.getByRole("img", { name: "QR code for QR Test Park" }).innerHTML();
  await page.goto(`/admin/settings/qr-signs/${QR_AREA}?kind=exit`);
  expect(await page.getByRole("img", { name: "Exit QR code for QR Test Park" }).innerHTML()).not.toBe(checkInCode);

  await page.goto("/admin/settings/qr-signs");
  await expect(page.getByRole("link", { name: "Exit sign (phone check-out)" }).first()).toBeVisible();
});
