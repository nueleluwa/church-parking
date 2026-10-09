import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { adminClient, createStaff, live, staffSignIn } from "../e2e/helpers";

// 300 real guest check-ins, as fast as 15 phones at a time can make them, against a production build.
// The spec needs 300 in 20 minutes (one every 4 seconds); this squeezes them into a few minutes, so
// it is a much harder test. Each phone has its own address and phone number, as real drivers do.
// A coordinator watches the live board all the while: it must show every car within 5 seconds.
test.skip(!live, "needs .env.local with the Supabase key and admin login");

const TOTAL = Number(process.env.LOAD_TOTAL ?? 300);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 15);

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))];

test(`${TOTAL} check-ins in a burst: none fail, each is quick, and the live board keeps up`, async ({ browser, baseURL }) => {
  const db = adminClient();
  const { data: service } = await db.from("services").select("id").eq("name", "Automated test service").single();
  const serviceId = service!.id as number;
  const lead = await createStaff("coordinator");

  const plates = Array.from({ length: TOTAL }, (_, i) => `LDT${String(i).padStart(3, "0")}ZZ`);
  const submitMs: number[] = [];
  const journeyMs: number[] = [];
  const failures: string[] = [];

  try {
    const board = await (await browser.newContext()).newPage();
    await staffSignIn(board, lead.phone, lead.password);
    const countOnBoard = async () => {
      const r = await board.request.get(`/staff/dashboard/data?service=${serviceId}`);
      const j = (await r.json()) as { summary: { totals: { checkedIn: number } } | null };
      return j.summary?.totals.checkedIn ?? 0;
    };
    const baseline = await countOnBoard();

    async function oneCheckIn(i: number) {
      const ctx = await browser.newContext({
        baseURL,
        extraHTTPHeaders: { "x-real-ip": `10.${(i >> 8) & 255}.${i & 255}.9` },
      });
      const page = await ctx.newPage();
      try {
        const t0 = Date.now();
        await page.goto("/c/cp1");
        await page.getByRole("button", { name: "Continue as guest" }).click();
        await page.getByLabel("Your name").fill(`Load Tester ${i}`);
        await page.getByLabel("Phone number").fill(`0${70 + (i % 10)}${String(10_000_000 + i * 7).slice(0, 8)}`);
        await page.getByLabel("Plate number").fill(plates[i]);
        await page.getByRole("button", { name: "Get my pass" }).click();
        const t1 = Date.now();
        await page.getByRole("button", { name: "Yes, get my pass" }).click();
        await page.getByText("VALID", { exact: true }).waitFor({ timeout: 60_000 });
        const t2 = Date.now();
        submitMs.push(t2 - t1);
        journeyMs.push(t2 - t0);
      } catch (e) {
        failures.push(`${plates[i]}: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await ctx.close();
      }
    }

    // A pool of CONCURRENCY phones working through the list
    let next = 0;
    const startedAt = Date.now();
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (next < TOTAL) await oneCheckIn(next++);
      }),
    );
    const burstSeconds = (Date.now() - startedAt) / 1000;

    // The live board must show every car that checked in, within 5 seconds of the last pass
    const made = TOTAL - failures.length;
    const lastPassAt = Date.now();
    let seenAfterMs = -1;
    while (Date.now() - lastPassAt < 30_000) {
      if ((await countOnBoard()) - baseline >= made) {
        seenAfterMs = Date.now() - lastPassAt;
        break;
      }
      await board.waitForTimeout(500);
    }

    const { count: inDb } = await db
      .from("visits")
      .select("id, vehicles!inner(plate)", { count: "exact", head: true })
      .like("vehicles.plate", "LDT%ZZ");

    const summary = {
      check_ins_attempted: TOTAL,
      concurrent_phones: CONCURRENCY,
      failed: failures.length,
      burst_seconds: Math.round(burstSeconds),
      equivalent_per_20_minutes: Math.round((made / burstSeconds) * 1200),
      "tap Get my pass → pass shown (ms) median / p95 / max": `${pct(submitMs, 50)} / ${pct(submitMs, 95)} / ${Math.max(...submitMs)}`,
      "whole journey from scanning (ms) median / p95": `${pct(journeyMs, 50)} / ${pct(journeyMs, 95)}`,
      board_caught_up_after_ms: seenAfterMs,
      rows_in_database: inDb,
    };
    console.table(summary);
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync("test-results/load.json", JSON.stringify({ summary, failures: failures.slice(0, 20) }, null, 2));

    expect(failures, "failed check-ins").toEqual([]);
    expect(inDb, "visits in the database").toBe(TOTAL);
    expect(seenAfterMs, "the live board showed every car").toBeGreaterThanOrEqual(0);
    expect(seenAfterMs, "the live board caught up within 5 s").toBeLessThanOrEqual(5000);
  } finally {
    // Remove the load-test cars, people and visits
    const { data: vehicles } = await db.from("vehicles").select("id").like("plate", "LDT%ZZ");
    const vehicleIds = (vehicles ?? []).map((v) => v.id as string);
    for (let i = 0; i < vehicleIds.length; i += 100) {
      const part = vehicleIds.slice(i, i + 100);
      const { data: visits } = await db.from("visits").select("id, guest_id").in("vehicle_id", part);
      const visitIds = (visits ?? []).map((v) => v.id as string);
      const guestIds = [...new Set((visits ?? []).map((v) => v.guest_id as string).filter(Boolean))];
      await db.from("audit_events").update({ visit_id: null }).in("visit_id", visitIds);
      await db.from("alerts").delete().in("visit_id", visitIds);
      await db.from("visits").delete().in("id", visitIds);
      await db.from("guests").delete().in("id", guestIds);
      await db.from("vehicles").delete().in("id", part);
    }
    await lead.remove();
  }
});
