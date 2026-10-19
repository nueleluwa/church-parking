import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { anyService, areaId, checkIn, checkOut, devDb, lagosToday, makeFixture, randomHash, removeFixture, type Fixture } from "./db";

const db = devDb();
const live = db !== null;

describe.skipIf(!live)("checkout_with_credential (development database)", () => {
  let service: number;
  let cp1: number;
  let cp2: number;
  const made: Fixture[] = [];
  const staffIds: string[] = [];

  beforeAll(async () => {
    service = await anyService(db!);
    cp1 = await areaId(db!, "cp1");
    cp2 = await areaId(db!, "cp2");
  });

  afterEach(async () => {
    for (const f of made.splice(0)) await removeFixture(db!, f);
    for (const id of staffIds.splice(0)) await db!.from("staff").delete().eq("id", id);
  });

  /** A member checked in at cp1 with a known credential hash. */
  async function checkedIn(over?: Parameters<typeof makeFixture>[1]) {
    const f = await makeFixture(db!, over);
    made.push(f);
    const hash = randomHash();
    const r = await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash });
    expect(r.status).toBe("ok");
    return { f, hash, token: r.token! };
  }
  const visitOf = async (f: Fixture) => (await db!.from("visits").select("*").eq("member_id", f.memberId).single()).data!;
  const auditActions = async (visitId: string) => (await db!.from("audit_events").select("action").eq("visit_id", visitId)).data!.map((a) => a.action).sort();

  test("the credential closes the visit at its own car park, once, and is audited", async () => {
    const { f, hash } = await checkedIn();
    const r = await checkOut(db!, { hash, areaId: cp1 });
    expect(r).toMatchObject({ status: "ok", plate: f.plate });
    const v = await visitOf(f);
    expect(v).toMatchObject({ status: "released", release_method: "self", released_by: null, credential_hash: hash });
    expect(v.released_at).not.toBeNull();
    expect(await auditActions(v.id)).toEqual(["member_check_in", "self_checkout"]);
    const audit = (await db!.from("audit_events").select("before, after").eq("visit_id", v.id).eq("action", "self_checkout").single()).data!;
    expect(JSON.stringify(audit)).not.toContain(hash);
  });

  test("a repeat is safe: it says already closed, keeps the first time, and adds no second audit row", async () => {
    const { f, hash } = await checkedIn();
    await checkOut(db!, { hash, areaId: cp1 });
    const first = await visitOf(f);
    const again = await checkOut(db!, { hash, areaId: cp1 });
    expect(again.status).toBe("already_closed");
    expect(again.plate).toBeUndefined();
    const v = await visitOf(f);
    expect(v.released_at).toBe(first.released_at);
    expect((await auditActions(v.id)).filter((a) => a === "self_checkout")).toHaveLength(1);
  });

  test("simultaneous requests close it exactly once", async () => {
    const { f, hash } = await checkedIn();
    const results = await Promise.all(Array.from({ length: 8 }, () => checkOut(db!, { hash, areaId: cp1 })));
    expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
    expect(results.filter((r) => r.status === "already_closed")).toHaveLength(7);
    expect((await auditActions((await visitOf(f)).id)).filter((a) => a === "self_checkout")).toHaveLength(1);
  });

  test("the exit sign of another car park closes nothing", async () => {
    const { f, hash } = await checkedIn();
    expect((await checkOut(db!, { hash, areaId: cp2 })).status).toBe("wrong_area");
    expect(await visitOf(f)).toMatchObject({ status: "parked", release_method: null });
  });

  test("an unknown or replaced credential closes nothing, and never asks for a phone number", async () => {
    const { f, hash } = await checkedIn();
    expect((await checkOut(db!, { hash: randomHash(), areaId: cp1 })).status).toBe("no_credential");
    // a repeat check-in replaces the credential: the old one stops working
    const newer = randomHash();
    await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash: newer });
    expect((await checkOut(db!, { hash, areaId: cp1 })).status).toBe("no_credential");
    expect(await visitOf(f)).toMatchObject({ status: "parked" });
    expect((await checkOut(db!, { hash: newer, areaId: cp1 })).status).toBe("ok");
  });

  test("an expired credential closes nothing", async () => {
    const { f, hash } = await checkedIn();
    await db!.from("visits").update({ credential_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("member_id", f.memberId);
    expect((await checkOut(db!, { hash, areaId: cp1 })).status).toBe("expired");
    expect(await visitOf(f)).toMatchObject({ status: "parked" });
  });

  test("a visit from an earlier day, or one on hold, closes nothing", async () => {
    const stale = await checkedIn();
    await db!.from("visits").update({ service_date: "2020-01-05" }).eq("member_id", stale.f.memberId);
    expect((await checkOut(db!, { hash: stale.hash, areaId: cp1 })).status).toBe("expired");

    const held = await checkedIn();
    await db!.from("visits").update({ held_at: new Date().toISOString() }).eq("member_id", held.f.memberId);
    expect((await checkOut(db!, { hash: held.hash, areaId: cp1 })).status).toBe("held");
    expect(await visitOf(held.f)).toMatchObject({ status: "parked" });
  });

  test("a visit the attendant already released, or that was closed as missed, says so and is not changed", async () => {
    const released = await checkedIn();
    const staff = await db!
      .from("staff")
      .insert({ full_name: "Zit Staff", phone: `+2348${Math.floor(100000000 + Math.random() * 899999999)}`, password_hash: "x", role: "attendant" })
      .select("id")
      .single();
    staffIds.push(staff.data!.id as string);
    const v = await visitOf(released.f);
    const rel = await db!.rpc("release_visit", { p_visit: v.id, p_staff: staff.data!.id, p_method: "scan", p_today: lagosToday() });
    expect(rel.data).toBe(v.id);
    expect((await checkOut(db!, { hash: released.hash, areaId: cp1 })).status).toBe("already_closed");
    expect(await visitOf(released.f)).toMatchObject({ release_method: "scan", released_by: staff.data!.id });
    expect((await auditActions(v.id)).includes("self_checkout")).toBe(false);

    const missed = await checkedIn();
    await db!.from("visits").update({ status: "missed", released_at: new Date().toISOString(), release_method: "midnight" }).eq("member_id", missed.f.memberId);
    expect((await checkOut(db!, { hash: missed.hash, areaId: cp1 })).status).toBe("closed_missed");
  });

  test("a member and an attendant releasing at the same moment: exactly one wins", async () => {
    const { f, hash } = await checkedIn();
    const staff = await db!
      .from("staff")
      .insert({ full_name: "Zit Staff", phone: `+2348${Math.floor(100000000 + Math.random() * 899999999)}`, password_hash: "x", role: "attendant" })
      .select("id")
      .single();
    staffIds.push(staff.data!.id as string);
    const v = await visitOf(f);
    const [mine, theirs] = await Promise.all([
      checkOut(db!, { hash, areaId: cp1 }),
      db!.rpc("release_visit", { p_visit: v.id, p_staff: staff.data!.id, p_method: "scan", p_today: lagosToday() }),
    ]);
    const memberWon = mine.status === "ok";
    const staffWon = theirs.data === v.id;
    expect(memberWon !== staffWon).toBe(true);
    if (!memberWon) expect(mine.status).toBe("already_closed");
    const after = await visitOf(f);
    expect(after.status).toBe("released");
    expect(after.release_method).toBe(memberWon ? "self" : "scan");
  });
});
