import { expect, test } from "@playwright/test";
import { adminClient, adminSignIn, createStaff, live, staffSignIn } from "./helpers";
import { checkInVia, credentialOf, ensureQrArea, makeQrMember, QR_AREA, removeQrArea, removeQrMember, type QrMember } from "./qr-helpers";

test.skip(!live, "needs .env.local with the Supabase key and admin login");
test.setTimeout(300_000);

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
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

test.describe("staff close a visit for a member", () => {
  test("an attendant closes it with a reason; it is audited with their name; the member's exit then says already checked out", async ({ page, browser }) => {
    const m = await member();
    const memberPage = await (await browser.newContext()).newPage();
    const passUrl = await checkInVia(memberPage, m.local);
    const attendant = await createStaff("attendant");
    try {
      await staffSignIn(page, attendant.phone, attendant.password);
      await page.goto(passUrl);
      const close = page.getByText("The member cannot check out? Close their visit");
      await close.click();

      // A reason is required
      await page.getByRole("button", { name: "Close visit" }).click();
      await expect(page.getByText("Please write why you are closing it")).toBeVisible({ timeout: 30_000 });
      expect(await visitOf(m)).toMatchObject({ status: "parked" });

      await page.getByLabel("Why are you closing it?").fill("The member had no signal at the exit");
      await page.getByRole("button", { name: "Close visit" }).click();
      await expect(page.getByRole("heading", { name: "Visit closed" })).toBeVisible({ timeout: 30_000 });

      const v = await visitOf(m);
      expect(v).toMatchObject({ status: "released", release_method: "staff_close", released_by: attendant.id });
      const audit = (await adminClient().from("audit_events").select("staff_id, reason").eq("visit_id", v.id).eq("action", "staff_close")).data!;
      expect(audit).toEqual([{ staff_id: attendant.id, reason: "The member had no signal at the exit" }]);

      // The member's own exit afterwards: nothing left to do
      await memberPage.goto(`/c/${QR_AREA}/out`);
      await expect(memberPage.getByRole("heading", { name: "You are already checked out" })).toBeVisible({ timeout: 30_000 });
      expect(await credentialOf(memberPage.context())).toBeUndefined();

      // Scanning the pass again shows who closed it
      await page.goto(passUrl);
      await expect(page.getByRole("heading", { name: "Already released" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Released by Test attendant/)).toBeVisible();
    } finally {
      await attendant.remove();
    }
  });

  test("a car on hold cannot be closed this way, and nobody can do it without signing in", async ({ page, browser }) => {
    const m = await member();
    const memberPage = await (await browser.newContext()).newPage();
    const passUrl = await checkInVia(memberPage, m.local);
    const v = await visitOf(m);
    await adminClient().from("visits").update({ held_at: new Date().toISOString() }).eq("id", v.id);

    // The on-hold card offers no way to close it
    const attendant = await createStaff("attendant");
    try {
      await staffSignIn(page, attendant.phone, attendant.password);
      await page.goto(passUrl);
      await expect(page.getByRole("heading", { name: "On hold" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("The member cannot check out? Close their visit")).toHaveCount(0);
      expect(await visitOf(m)).toMatchObject({ status: "parked" });
    } finally {
      await attendant.remove();
    }

    // Not signed in: the pass page is the driver's view, with no way to close anything
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto(passUrl);
    await expect(stranger.getByText("The member cannot check out? Close their visit")).toHaveCount(0);
  });

  test("a visit left open from an earlier day shows as an old pass and can still be closed, with a reason", async ({ page, browser }) => {
    const m = await member();
    const memberPage = await (await browser.newContext()).newPage();
    const passUrl = await checkInVia(memberPage, m.local);
    const v = await visitOf(m);
    await adminClient().from("visits").update({ service_date: "2020-01-05" }).eq("id", v.id);

    const attendant = await createStaff("attendant");
    try {
      await staffSignIn(page, attendant.phone, attendant.password);
      await page.goto(passUrl);
      await expect(page.getByRole("heading", { name: "Old pass" })).toBeVisible({ timeout: 30_000 });
      await page.getByText("The member cannot check out? Close their visit").click();
      await page.getByLabel("Why are you closing it?").fill("Left open since last week");
      await page.getByRole("button", { name: "Close visit" }).click();
      await expect(page.getByRole("heading", { name: "Visit closed" })).toBeVisible({ timeout: 30_000 });
      expect(await visitOf(m)).toMatchObject({ status: "released", release_method: "staff_close" });
    } finally {
      await attendant.remove();
    }
  });
});

test.describe("visits open for a long time are flagged, not closed", () => {
  test("flagged on the Visits list, the visit page and the sweep; a fresh visit and a closed one are not", async ({ page, browser }) => {
    const long = await member();
    const fresh = await member();
    const finished = await member();
    for (const m of [long, fresh, finished]) await checkInVia(await (await browser.newContext()).newPage(), m.local);
    const db = adminClient();
    await db.from("visits").update({ checked_in_at: hoursAgo(13) }).eq("member_id", long.id);
    await db.from("visits").update({ checked_in_at: hoursAgo(14), status: "released", released_at: hoursAgo(1), release_method: "staff_close" }).eq("member_id", finished.id);

    await adminSignIn(page);
    for (const [m, flagged] of [[long, true], [fresh, false], [finished, false]] as const) {
      await page.goto(`/admin/visits?q=${m.plates[0]}`);
      const row = page.getByRole("main").getByRole("link", { name: /Visit of/ }).first();
      await expect(row).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("main").getByText("Open 12h+").filter({ visible: true })).toHaveCount(flagged ? 1 : 0);
    }

    // The visit page says so too
    const v = await visitOf(long);
    await page.goto(`/admin/visits/${v.id}`);
    await expect(page.getByText("OPEN 12H+")).toBeVisible({ timeout: 60_000 });
    // ...and nothing was closed because of it
    expect(await visitOf(long)).toMatchObject({ status: "parked" });

    // The sweep (staff view) flags it, filtered to this car
    await page.goto(`/staff/sweep?q=${long.plates[0]}`);
    await expect(page.getByText("Open 12h+").first()).toBeVisible({ timeout: 60_000 });
  });

  test("the 'open longer than' filter shows only open visits over the limit, and the export follows it", async ({ page, browser }) => {
    const long = await member();
    const fresh = await member();
    for (const m of [long, fresh]) await checkInVia(await (await browser.newContext()).newPage(), m.local);
    await adminClient().from("visits").update({ checked_in_at: hoursAgo(13) }).eq("member_id", long.id);

    await adminSignIn(page);
    await page.goto(`/admin/visits?from=${today()}&to=${today()}&long=1&area=${QR_AREA}`);
    await expect(page.getByTestId("v-count")).toHaveText("1", { timeout: 60_000 });
    await expect(page.getByRole("main").getByRole("link", { name: /Visit of/ })).toHaveCount(1);
    await expect(page.getByRole("checkbox", { name: /Only visits open longer than 12 hours/ })).toBeChecked();

    const csv = await (await page.request.get(`/admin/reports/export?report=visit-list&from=${today()}&to=${today()}&long=1&area=${QR_AREA}`)).text();
    expect(csv).toContain(long.plates[0]);
    expect(csv).not.toContain(fresh.plates[0]);
  });
});

test.describe("search the history by a member's phone number (administrators)", () => {
  test("finds that member's visits only, in the list and in the export; the number is not written down anywhere", async ({ page, browser }) => {
    const a = await member();
    const b = await member();
    for (const m of [a, b]) await checkInVia(await (await browser.newContext()).newPage(), m.local);

    await adminSignIn(page);
    await page.goto(`/admin/visits?from=${today()}&to=${today()}&phone=${encodeURIComponent(a.local)}`);
    await expect(page.getByTestId("v-count")).toHaveText("1", { timeout: 60_000 });
    await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`Visit of ${a.plates[0].slice(0, 3)}`) })).toBeVisible();
    // The number is not printed back in the results
    await expect(page.getByRole("main")).not.toContainText(a.local);

    const csv = await (await page.request.get(`/admin/reports/export?report=visit-list&from=${today()}&to=${today()}&phone=${encodeURIComponent(a.local)}`)).text();
    expect(csv).toContain(a.plates[0]);
    expect(csv).not.toContain(b.plates[0]);
    expect(csv).not.toContain(a.local);

    // A number nobody has finds nothing; a number that is not Nigerian is a message
    await page.goto(`/admin/visits?from=${today()}&to=${today()}&phone=08000000001`);
    await expect(page.getByTestId("v-count")).toHaveText("0", { timeout: 60_000 });
    await page.goto(`/admin/visits?from=${today()}&to=${today()}&phone=12345`);
    await expect(page.getByText("Type a Nigerian phone number")).toBeVisible({ timeout: 60_000 });
    const bad = await page.request.get(`/admin/reports/export?report=visit-list&from=${today()}&to=${today()}&phone=12345`);
    expect(bad.status()).toBe(400);

    // The audit row for the export says a member search was used, not which number
    const audit = (await adminClient().from("audit_events").select("after").eq("action", "export_report").order("id", { ascending: false }).limit(5)).data!;
    expect(JSON.stringify(audit)).not.toContain(a.local);
    expect(JSON.stringify(audit)).toContain("member_search");
  });

  test("coordinators do not get the phone search, and it is ignored if they ask for it", async ({ page, browser }) => {
    const a = await member();
    const b = await member();
    for (const m of [a, b]) await checkInVia(await (await browser.newContext()).newPage(), m.local);
    const coordinator = await createStaff("coordinator");
    try {
      await staffSignIn(page, coordinator.phone, coordinator.password);
      await page.goto(`/admin/visits?from=${today()}&to=${today()}&area=${QR_AREA}&phone=${encodeURIComponent(a.local)}`);
      await expect(page.getByRole("main").getByRole("link", { name: /Visit of/ }).first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByLabel(/Member.s phone number/)).toHaveCount(0);
      // Both members' visits are listed: the number filtered nothing
      await expect(page.getByTestId("v-count")).toHaveText("2");
    } finally {
      await coordinator.remove();
    }
  });
});

test.describe("repeated replacements of the check-out code", () => {
  test("the report lists visits replaced twice or more, with plates and no people", async ({ page, browser }) => {
    const many = await member();
    const once = await member();
    for (const m of [many, once]) await checkInVia(await (await browser.newContext()).newPage(), m.local);
    const db = adminClient();
    await db.from("visits").update({ credential_reissues: 3 }).eq("member_id", many.id);
    await db.from("visits").update({ credential_reissues: 1 }).eq("member_id", once.id);

    await adminSignIn(page);
    const res = await page.request.get(`/admin/reports/export?report=credential-replacements&from=${today()}&to=${today()}`);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).toContain(many.plates[0]);
    expect(csv).not.toContain(once.plates[0]);
    expect(csv).not.toMatch(/\+?234\d{9}|\b0[789][01]\d{8}\b/);
    expect(csv.split("\r\n")[0]).toContain("Times the code was replaced");

    await page.goto("/admin/reports?category=alerts");
    await expect(page.locator('li[data-report="credential-replacements"]')).toBeVisible({ timeout: 60_000 });
  });
});
