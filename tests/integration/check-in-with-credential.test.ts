import { afterEach, beforeAll, describe, expect, test } from "vitest";
import {
  anyService,
  areaId,
  checkIn,
  devDb,
  inHours,
  lagosToday,
  makeFixture,
  randomHash,
  removeFixture,
  type Fixture,
} from "./db";

const db = devDb();
const live = db !== null;

describe.skipIf(!live)("check_in_with_credential (development database)", () => {
  let service: number;
  let cp1: number;
  let cp2: number;
  const made: { f: Fixture; guestIds?: string[]; rateKeys?: string[] }[] = [];

  beforeAll(async () => {
    service = await anyService(db!);
    cp1 = await areaId(db!, "cp1");
    cp2 = await areaId(db!, "cp2");
  });

  afterEach(async () => {
    for (const m of made.splice(0)) await removeFixture(db!, m.f, m);
  });

  async function fixture(over?: Parameters<typeof makeFixture>[1]) {
    const f = await makeFixture(db!, over);
    const entry: (typeof made)[number] = { f };
    made.push(entry);
    return { f, entry };
  }

  const visitsOf = async (f: Fixture) => (await db!.from("visits").select("*").eq("member_id", f.memberId)).data ?? [];
  const auditOf = async (visitId: string, action: string) =>
    (await db!.from("audit_events").select("id").eq("visit_id", visitId).eq("action", action)).data ?? [];

  test("a registered member checks in: one open visit with the credential's hash, never the credential", async () => {
    const { f } = await fixture();
    const hash = randomHash();
    const r = await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash });
    expect(r).toMatchObject({ status: "ok", reissued: false, plate: f.plate });
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const visits = await visitsOf(f);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ status: "parked", area_id: cp1, vehicle_id: f.vehicleId, guest_id: null, credential_hash: hash, credential_reissues: 0 });
    expect(new Date(visits[0].credential_expires_at).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(await auditOf(visits[0].id, "member_check_in")).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain(hash);
  });

  test("two check-ins for the same member at the same moment make ONE visit; the rest are reissues", async () => {
    const { f } = await fixture();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1 })),
    );
    expect(results.every((r) => r.status === "ok")).toBe(true);
    expect(results.filter((r) => !r.reissued)).toHaveLength(1);
    expect(results.filter((r) => r.reissued)).toHaveLength(7);
    expect(new Set(results.map((r) => r.token)).size).toBe(1);

    const visits = await visitsOf(f);
    expect(visits).toHaveLength(1);
    expect(visits[0].credential_reissues).toBe(7);
    expect(await auditOf(visits[0].id, "member_check_in")).toHaveLength(1);
    expect(await auditOf(visits[0].id, "credential_reissue")).toHaveLength(7);
  });

  test("a repeat check-in at the same car park keeps the visit and its time, replaces the credential, and is audited", async () => {
    const { f } = await fixture();
    const first = randomHash();
    const second = randomHash();
    await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash: first });
    const before = (await visitsOf(f))[0];

    const r = await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash: second });
    expect(r).toMatchObject({ status: "ok", reissued: true });

    const visits = await visitsOf(f);
    expect(visits).toHaveLength(1);
    expect(visits[0].id).toBe(before.id);
    expect(visits[0].checked_in_at).toBe(before.checked_in_at);
    expect(visits[0].credential_hash).toBe(second);
    expect(visits[0].credential_hash).not.toBe(first);
    expect(visits[0].credential_reissues).toBe(1);
    const audit = (await db!.from("audit_events").select("after").eq("visit_id", before.id).eq("action", "credential_reissue")).data!;
    expect(audit).toHaveLength(1);
    expect(audit[0].after).toMatchObject({ reissues: 1, had_credential: true });
    expect(JSON.stringify(audit)).not.toContain(second);
  });

  test("a member whose visit is at another car park is refused and nothing changes", async () => {
    const { f } = await fixture();
    const hash = randomHash();
    await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash });
    const r = await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp2 });
    expect(r.status).toBe("other_area");
    const visits = await visitsOf(f);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ area_id: cp1, credential_hash: hash, credential_reissues: 0 });
  });

  test("a legacy visit with no credential is given one by a repeat check-in", async () => {
    const { f } = await fixture();
    const { data: v } = await db!
      .from("visits")
      .insert({ reference: "PK-ZIT1", pass_token: "zit-legacy-token-0000001", vehicle_id: f.vehicleId, member_id: f.memberId, service_id: service, area_id: cp1, service_date: lagosToday() })
      .select("id")
      .single();
    const hash = randomHash();
    const r = await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash });
    expect(r).toMatchObject({ status: "ok", reissued: true, reference: "PK-ZIT1" });
    const visits = await visitsOf(f);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ id: v!.id, credential_hash: hash });
    const audit = (await db!.from("audit_events").select("after").eq("visit_id", v!.id).eq("action", "credential_reissue")).data!;
    expect(audit[0].after).toMatchObject({ had_credential: false });
  });

  test("an unknown number gets the same answer as any other number that cannot check in, and makes nothing", async () => {
    const { f } = await fixture();
    const r = await checkIn(db!, { local: "08000000000", vehicleId: f.vehicleId, serviceId: service, areaId: cp1 });
    expect(r.status).toBe("unavailable");
    expect(await visitsOf(f)).toHaveLength(0);
  });

  test("an inactive member, an inactive vehicle and someone else's vehicle cannot check in", async () => {
    const off = await fixture({ memberActive: false });
    expect((await checkIn(db!, { local: off.f.local, vehicleId: off.f.vehicleId, serviceId: service, areaId: cp1 })).status).toBe("unavailable");
    expect(await visitsOf(off.f)).toHaveLength(0);

    const parked = await fixture({ vehicleActive: false });
    expect((await checkIn(db!, { local: parked.f.local, vehicleId: parked.f.vehicleId, serviceId: service, areaId: cp1 })).status).toBe("unavailable");
    expect(await visitsOf(parked.f)).toHaveLength(0);

    const mine = await fixture();
    const other = await fixture();
    const r = await checkIn(db!, { local: mine.f.local, vehicleId: other.f.vehicleId, serviceId: service, areaId: cp1 });
    expect(r).toMatchObject({ status: "unavailable", reason: "vehicle" });
    expect(await visitsOf(mine.f)).toHaveLength(0);
    expect(await visitsOf(other.f)).toHaveLength(0);
  });

  test("a car already checked in by someone else is refused, with an alert and no pass", async () => {
    const { f, entry } = await fixture();
    const guest = await db!.from("guests").insert({ full_name: "Zit Guest", phone: "+2348000000001" }).select("id").single();
    entry.guestIds = [guest.data!.id as string];
    await db!.from("visits").insert({ reference: "PK-ZIT2", pass_token: "zit-guest-token-00000002", vehicle_id: f.vehicleId, guest_id: guest.data!.id, service_id: service, area_id: cp1, service_date: lagosToday() });

    const r = await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1 });
    expect(r).toMatchObject({ status: "blocked", reason: "plate_conflict" });
    expect(r.token).toBeUndefined();
    expect(await visitsOf(f)).toHaveLength(0);
    expect((await db!.from("alerts").select("id").eq("plate", f.plate).eq("kind", "plate_conflict")).data).toHaveLength(1);
  });

  test("a visit left open from an earlier day is closed as missed and a new one starts", async () => {
    const { f } = await fixture();
    await db!.from("visits").insert({ reference: "PK-ZIT3", pass_token: "zit-stale-token-00000003", vehicle_id: f.vehicleId, member_id: f.memberId, service_id: service, area_id: cp2, service_date: "2020-01-05" });
    const r = await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1 });
    expect(r).toMatchObject({ status: "ok", reissued: false });
    const visits = await visitsOf(f);
    expect(visits.map((v) => v.status).sort()).toEqual(["missed", "parked"]);
    expect(visits.find((v) => v.status === "missed")).toMatchObject({ release_method: "midnight" });
  });

  test("phone and address limits refuse once reached, and the limit for repeat check-ins is separate", async () => {
    const { f, entry } = await fixture();
    const phoneKey = `zit-phone:${randomHash()}`;
    const reissueKey = `zit-reissue:${randomHash()}`;
    entry.rateKeys = [phoneKey, reissueKey];
    const base = { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1 };

    // reissue limit 1: the first check-in is a new visit, the second a reissue (allowed), the third is over the limit
    const limits = { reissueKey, reissueMax: 1 };
    expect((await checkIn(db!, { ...base, limits })).reissued).toBe(false);
    expect((await checkIn(db!, { ...base, limits })).reissued).toBe(true);
    expect((await checkIn(db!, { ...base, limits })).status).toBe("rate_limited");
    expect((await visitsOf(f))[0].credential_reissues).toBe(1);

    // phone limit 2: the third attempt is refused, even though the member exists
    const phoneLimits = { phoneKey, phoneMax: 2 };
    expect((await checkIn(db!, { ...base, limits: phoneLimits })).status).toBe("ok");
    expect((await checkIn(db!, { ...base, limits: phoneLimits })).status).toBe("ok");
    expect((await checkIn(db!, { ...base, limits: phoneLimits })).status).toBe("rate_limited");
  });

  test("the credential's expiry is stored as given", async () => {
    const { f } = await fixture();
    const expires = inHours(2);
    await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, expires });
    const v = (await visitsOf(f))[0];
    expect(new Date(v.credential_expires_at).getTime()).toBe(new Date(expires).getTime());
  });
});
