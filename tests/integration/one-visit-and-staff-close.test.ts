import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { addVehicle, anyService, areaId, checkIn, checkOut, devDb, lagosToday, legacyMemberClaim, makeFixture, randomHash, removeFixture, type Fixture } from "./db";

const db = devDb();
const live = db !== null;

describe.skipIf(!live)("one open visit per member, and staff closure (development database)", () => {
  let service: number;
  let cp1: number;
  const made: Fixture[] = [];
  const staffIds: string[] = [];

  beforeAll(async () => {
    service = await anyService(db!);
    cp1 = await areaId(db!, "cp1");
  });

  afterEach(async () => {
    for (const f of made.splice(0)) await removeFixture(db!, f);
    for (const id of staffIds.splice(0)) await db!.from("staff").delete().eq("id", id);
  });

  async function fixture() {
    const f = await makeFixture(db!);
    made.push(f);
    return f;
  }
  async function attendant() {
    const s = await db!
      .from("staff")
      .insert({ full_name: "Zit Staff", phone: `+2348${Math.floor(100000000 + Math.random() * 899999999)}`, password_hash: "x", role: "attendant" })
      .select("id")
      .single();
    staffIds.push(s.data!.id as string);
    return s.data!.id as string;
  }
  const visitsOf = async (f: Fixture) => (await db!.from("visits").select("*").eq("member_id", f.memberId)).data ?? [];

  describe("one open visit per member", () => {
    test("the database refuses a second open visit for the same member, even for another car", async () => {
      const f = await fixture();
      const second = await addVehicle(db!, f);
      const base = { service_id: service, area_id: cp1, service_date: lagosToday(), member_id: f.memberId };
      const a = await db!.from("visits").insert({ ...base, reference: "PK-ZIT4", pass_token: "zit-one-token-00000004", vehicle_id: f.vehicleId });
      expect(a.error).toBeNull();
      const b = await db!.from("visits").insert({ ...base, reference: "PK-ZIT5", pass_token: "zit-one-token-00000005", vehicle_id: second.id });
      expect(b.error?.code).toBe("23505");
      expect(b.error?.message).toContain("one_open_visit_per_member");
      expect(await visitsOf(f)).toHaveLength(1);
    });

    test("the original check-in answers politely for the other car, and still gives back the member's own pass", async () => {
      const f = await fixture();
      const second = await addVehicle(db!, f);
      const first = await legacyMemberClaim(db!, { memberId: f.memberId, vehicleId: f.vehicleId, plate: f.plate, serviceId: service, areaId: cp1 });
      expect(first).toMatchObject({ status: "ok", existing: false });

      const other = await legacyMemberClaim(db!, { memberId: f.memberId, vehicleId: second.id, plate: second.plate, serviceId: service, areaId: cp1 });
      expect(other).toMatchObject({ status: "blocked", reason: "member_has_open_visit" });
      expect(other.token).toBeUndefined();

      const again = await legacyMemberClaim(db!, { memberId: f.memberId, vehicleId: f.vehicleId, plate: f.plate, serviceId: service, areaId: cp1 });
      expect(again).toMatchObject({ status: "ok", existing: true, token: first.token });
      expect(await visitsOf(f)).toHaveLength(1);
    });

    test("a visit left open from an earlier day does not block the member's other car", async () => {
      const f = await fixture();
      const second = await addVehicle(db!, f);
      await db!.from("visits").insert({ reference: "PK-ZIT6", pass_token: "zit-one-token-00000006", vehicle_id: f.vehicleId, member_id: f.memberId, service_id: service, area_id: cp1, service_date: "2020-01-05" });
      const r = await legacyMemberClaim(db!, { memberId: f.memberId, vehicleId: second.id, plate: second.plate, serviceId: service, areaId: cp1 });
      expect(r).toMatchObject({ status: "ok", existing: false });
      expect((await visitsOf(f)).map((v) => v.status).sort()).toEqual(["missed", "parked"]);
    });

    test("two simultaneous check-ins for a member's two cars leave exactly one open visit", async () => {
      const f = await fixture();
      const second = await addVehicle(db!, f);
      const results = await Promise.all([
        legacyMemberClaim(db!, { memberId: f.memberId, vehicleId: f.vehicleId, plate: f.plate, serviceId: service, areaId: cp1 }),
        legacyMemberClaim(db!, { memberId: f.memberId, vehicleId: second.id, plate: second.plate, serviceId: service, areaId: cp1 }),
      ]);
      expect(results.filter((r) => r.status === "ok")).toHaveLength(1);
      expect(results.filter((r) => r.status === "blocked" && r.reason === "member_has_open_visit")).toHaveLength(1);
      expect((await visitsOf(f)).filter((v) => v.status === "parked")).toHaveLength(1);
    });

    test("the phone check-in treats a second car as the same open visit", async () => {
      const f = await fixture();
      const second = await addVehicle(db!, f);
      const one = await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1 });
      const two = await checkIn(db!, { local: f.local, vehicleId: second.id, serviceId: service, areaId: cp1 });
      expect(one.reissued).toBe(false);
      expect(two).toMatchObject({ status: "ok", reissued: true, plate: f.plate });
      expect(await visitsOf(f)).toHaveLength(1);
    });
  });

  describe("staff_close_visit", () => {
    async function open(f: Fixture) {
      await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash: randomHash() });
      return (await visitsOf(f))[0];
    }
    const close = async (visitId: string, staffId: string, reason: string) =>
      (await db!.rpc("staff_close_visit", { p_visit: visitId, p_staff: staffId, p_reason: reason })).data as string;

    test("closes with the staff member and the reason, and audits both", async () => {
      const f = await fixture();
      const staff = await attendant();
      const v = await open(f);
      expect(await close(v.id, staff, "  Member had no signal at the exit  ")).toBe("ok");
      const after = (await visitsOf(f))[0];
      expect(after).toMatchObject({ status: "released", release_method: "staff_close", released_by: staff });
      const audit = (await db!.from("audit_events").select("staff_id, reason, after").eq("visit_id", v.id).eq("action", "staff_close")).data!;
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ staff_id: staff, reason: "Member had no signal at the exit" });
    });

    test("needs a real reason, and changes nothing without one", async () => {
      const f = await fixture();
      const staff = await attendant();
      const v = await open(f);
      for (const reason of ["", "   ", "ok", "no"]) expect(await close(v.id, staff, reason)).toBe("bad_input");
      expect((await db!.rpc("staff_close_visit", { p_visit: v.id, p_staff: staff, p_reason: null })).data).toBe("bad_input");
      expect((await visitsOf(f))[0].status).toBe("parked");
    });

    test("refuses an unknown visit, a visit already closed, and a visit on hold", async () => {
      const f = await fixture();
      const staff = await attendant();
      expect(await close("00000000-0000-0000-0000-000000000000", staff, "a good reason")).toBe("not_found");

      const v = await open(f);
      await db!.from("visits").update({ held_at: new Date().toISOString() }).eq("id", v.id);
      expect(await close(v.id, staff, "a good reason")).toBe("held");
      expect((await visitsOf(f))[0].status).toBe("parked");

      await db!.from("visits").update({ held_at: null }).eq("id", v.id);
      expect(await close(v.id, staff, "a good reason")).toBe("ok");
      expect(await close(v.id, staff, "a good reason")).toBe("bad_state");
      expect((await db!.from("audit_events").select("id").eq("visit_id", v.id).eq("action", "staff_close")).data).toHaveLength(1);
    });

    test("can close a visit left open from an earlier day, which a release refuses", async () => {
      const f = await fixture();
      const staff = await attendant();
      const v = await open(f);
      await db!.from("visits").update({ service_date: "2020-01-05" }).eq("id", v.id);
      const rel = await db!.rpc("release_visit", { p_visit: v.id, p_staff: staff, p_method: "scan", p_today: lagosToday() });
      expect(rel.data).toBeNull();
      expect(await close(v.id, staff, "Left open from last week")).toBe("ok");
    });

    test("a member's exit afterwards says already closed, and a staff closure racing the member has exactly one winner", async () => {
      const f = await fixture();
      const staff = await attendant();
      const hash = randomHash();
      await checkIn(db!, { local: f.local, vehicleId: f.vehicleId, serviceId: service, areaId: cp1, hash });
      const v = (await visitsOf(f))[0];
      const [mine, theirs] = await Promise.all([checkOut(db!, { hash, areaId: cp1 }), close(v.id, staff, "Closing for the member")]);
      expect((mine.status === "ok") !== (theirs === "ok")).toBe(true);
      expect((await checkOut(db!, { hash, areaId: cp1 })).status).toBe("already_closed");
      const after = (await visitsOf(f))[0];
      expect(after.release_method).toBe(mine.status === "ok" ? "self" : "staff_close");
    });
  });
});
