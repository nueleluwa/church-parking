import { beforeEach, describe, expect, test } from "vitest";
import {
  claimGuestVisit,
  claimMemberVisit,
  claimVisitForMemberByStaff,
  RATE_LIMITS,
  type AlertKind,
  type ClaimStore,
  type GuestClaimInput,
  type NewVisit,
  type OpenVisit,
} from "./claim";

type StoredVisit = NewVisit & { open: boolean };

class FakeStore implements ClaimStore {
  attempts = new Map<string, number>();
  vehicles = new Map<string, string>(); // plate -> id
  memberVehicles = new Map<string, string>(); // vehicleId -> memberId
  visits: StoredVisit[] = [];
  alerts: { kind: AlertKind; plate: string }[] = [];
  referenceCollisions = 0;
  hideOpenVisit = false;
  closed: string[] = [];

  async countAttempts(key: string) {
    return this.attempts.get(key) ?? 0;
  }
  async recordAttempt(key: string) {
    this.attempts.set(key, (this.attempts.get(key) ?? 0) + 1);
  }
  async findVehicleId(plate: string) {
    return this.vehicles.get(plate) ?? null;
  }
  async createVehicle(plate: string) {
    const id = `v-${plate}`;
    this.vehicles.set(plate, id);
    return id;
  }
  async isMemberPlate(id: string) {
    return this.memberVehicles.has(id);
  }
  async memberOwnsVehicle(memberId: string, vehicleId: string) {
    return this.memberVehicles.get(vehicleId) === memberId;
  }
  async memberIdForVehicle(vehicleId: string) {
    return this.memberVehicles.get(vehicleId) ?? null;
  }
  async closeStaleOpenVisits(vehicleId: string, today: string) {
    for (const v of this.visits) {
      if (v.vehicle_id === vehicleId && v.open && v.service_date < today) {
        v.open = false;
        this.closed.push(v.reference);
      }
    }
  }
  async findOpenVisit(vehicleId: string): Promise<OpenVisit | null> {
    if (this.hideOpenVisit) return null;
    const v = this.visits.find((x) => x.vehicle_id === vehicleId && x.open);
    return v
      ? { member_id: v.member_id ?? null, pass_token: v.pass_token, reference: v.reference, service_date: v.service_date }
      : null;
  }
  async createGuest() {
    return "guest-1";
  }
  async insertVisit(v: NewVisit) {
    if (this.referenceCollisions > 0) {
      this.referenceCollisions--;
      return "reference_taken" as const;
    }
    if (this.visits.some((x) => x.vehicle_id === v.vehicle_id && x.open)) {
      return "open_visit_exists" as const;
    }
    this.visits.push({ ...v, open: true });
    return "ok" as const;
  }
  async raiseAlert(kind: AlertKind, plate: string) {
    this.alerts.push({ kind, plate });
  }
}

const input = (over: Partial<GuestClaimInput> = {}): GuestClaimInput => ({
  name: "Ada",
  phone: "+2348031234567",
  plate: "PHC234AB",
  serviceId: 1,
  areaId: 1,
  serviceDate: "2026-10-11",
  ipKey: "ip:a",
  phoneKey: "phone:a",
  ...over,
});

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
});

describe("claimGuestVisit", () => {
  test("a new plate gets a pass", async () => {
    const r = await claimGuestVisit(store, input());
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(r.reference).toMatch(/^PK-/);
    }
    expect(store.visits).toHaveLength(1);
  });

  test("a second claim on the same plate is rejected and the response has no pass token", async () => {
    await claimGuestVisit(store, input());
    const second = await claimGuestVisit(
      store,
      input({ name: "Thief", phone: "+2348039999999", phoneKey: "phone:b" }),
    );
    expect(second).toEqual({ status: "blocked", reason: "plate_conflict" });
    expect(JSON.stringify(second)).not.toMatch(/token|PK-/);
    expect(store.visits).toHaveLength(1);
    expect(store.alerts).toEqual([{ kind: "plate_conflict", plate: "PHC234AB" }]);
  });

  test("a guest claim on a member's plate is rejected", async () => {
    store.vehicles.set("PHC234AB", "v-member");
    store.memberVehicles.set("v-member", "m1");
    const r = await claimGuestVisit(store, input());
    expect(r).toEqual({ status: "blocked", reason: "member_plate" });
    expect(store.visits).toHaveLength(0);
    expect(store.alerts).toEqual([{ kind: "member_plate_claim", plate: "PHC234AB" }]);
  });

  test("losing a race for the plate is treated as a conflict", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    store.visits.push({ ...visitFor("v-1"), open: true });
    store.hideOpenVisit = true; // looked free when checked, then someone else won
    const r = await claimGuestVisit(store, input());
    expect(r).toEqual({ status: "blocked", reason: "plate_conflict" });
    expect(store.visits).toHaveLength(1);
  });

  test("retries when a reference is already taken", async () => {
    store.referenceCollisions = 2;
    expect((await claimGuestVisit(store, input())).status).toBe("ok");
  });

  test("a known plate with no open visit can check in again", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    expect((await claimGuestVisit(store, input())).status).toBe("ok");
  });

  test("a visit left open from an earlier day is closed so the plate can check in", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    store.visits.push({ ...visitFor("v-1", { service_date: "2026-10-04" }), open: true });
    const r = await claimGuestVisit(store, input());
    expect(r.status).toBe("ok");
    expect(store.closed).toEqual(["PK-OLD1"]);
  });

  test("a visit from earlier today still blocks the plate", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    store.visits.push({ ...visitFor("v-1"), open: true });
    expect((await claimGuestVisit(store, input())).status).toBe("blocked");
  });
});

function visitFor(vehicleId: string, over: Partial<NewVisit> = {}): NewVisit {
  return {
    reference: "PK-OLD1",
    pass_token: "tokenoldtokenoldtokeno",
    vehicle_id: vehicleId,
    guest_id: "g-old",
    service_id: 1,
    area_id: 1,
    service_date: "2026-10-11",
    ...over,
  };
}

describe("rate limits (T-7)", () => {
  test("a phone number is limited after too many tries", async () => {
    for (let i = 0; i < RATE_LIMITS.phone.max; i++) {
      await claimGuestVisit(store, input({ plate: `AAA${100 + i}AA`, ipKey: `ip:${i}` }));
    }
    const r = await claimGuestVisit(store, input({ plate: "ZZZ999ZZ", ipKey: "ip:fresh" }));
    expect(r).toEqual({ status: "rate_limited" });
  });

  test("an IP address is limited only after a very large number of tries", async () => {
    for (let i = 0; i < RATE_LIMITS.ip.max; i++) {
      await claimGuestVisit(store, input({ plate: `BBB${100 + i}BB`, phoneKey: `phone:${i}` }));
    }
    const r = await claimGuestVisit(store, input({ plate: "ZZZ999ZZ", phoneKey: "phone:fresh" }));
    expect(r).toEqual({ status: "rate_limited" });
  });

  test("a whole congregation on one wifi can check in (300 people, 300 phones)", async () => {
    expect(RATE_LIMITS.ip.max).toBeGreaterThanOrEqual(100);
    for (let i = 0; i < 100; i++) {
      const r = await claimGuestVisit(
        store,
        input({ plate: `CCC${100 + i}CC`, phoneKey: `phone:c${i}`, ipKey: "ip:church-wifi" }),
      );
      expect(r.status).toBe("ok");
    }
  });

  test("an unknown IP address is not counted at all", async () => {
    for (let i = 0; i < RATE_LIMITS.ip.max + 20; i++) {
      const r = await claimGuestVisit(
        store,
        input({ plate: `DDD${100 + i}DD`, phoneKey: `phone:d${i}`, ipKey: "" }),
      );
      expect(r.status).toBe("ok");
    }
    expect(store.attempts.has("")).toBe(false);
  });
});

describe("claimMemberVisit (CI-4, R-3)", () => {
  const member = {
    memberId: "m1",
    vehicleId: "v-1",
    plate: "PHC234AB",
    serviceId: 1,
    areaId: 1,
    serviceDate: "2026-10-11",
  };
  beforeEach(() => {
    store.memberVehicles.set("v-1", "m1");
  });

  test("a member checks in a saved vehicle", async () => {
    const r = await claimMemberVisit(store, member);
    expect(r).toMatchObject({ status: "ok", existing: false });
    expect(store.visits[0]).toMatchObject({ member_id: "m1", vehicle_id: "v-1" });
    expect(store.visits[0].guest_id).toBeUndefined();
  });

  test("a member can't check in a vehicle that isn't theirs", async () => {
    const r = await claimMemberVisit(store, { ...member, memberId: "m2" });
    expect(r).toEqual({ status: "blocked", reason: "not_your_vehicle" });
    expect(store.visits).toHaveLength(0);
  });

  test("staying for the second and third service returns the same pass, with no alert", async () => {
    const first = await claimMemberVisit(store, member);
    const second = await claimMemberVisit(store, { ...member, serviceId: 2 });
    const third = await claimMemberVisit(store, { ...member, serviceId: 3 });
    expect(first.status === "ok" && second.status === "ok" && third.status === "ok").toBe(true);
    if (first.status === "ok" && second.status === "ok" && third.status === "ok") {
      expect(second.token).toBe(first.token);
      expect(third.token).toBe(first.token);
      expect(second.existing && third.existing).toBe(true);
    }
    expect(store.visits).toHaveLength(1);
    expect(store.alerts).toEqual([]);
  });

  test("someone else's open visit on the member's plate is blocked, alerts and shows no pass", async () => {
    store.visits.push({ ...visitFor("v-1", { guest_id: "g-x" }), open: true });
    const r = await claimMemberVisit(store, member);
    expect(r).toEqual({ status: "blocked", reason: "plate_conflict" });
    expect(JSON.stringify(r)).not.toMatch(/token|PK-/);
    expect(store.alerts).toEqual([{ kind: "plate_conflict", plate: "PHC234AB" }]);
  });

  test("a visit left open from an earlier Sunday is closed and the member can check in", async () => {
    store.visits.push({ ...visitFor("v-1", { member_id: "m1", guest_id: undefined, service_date: "2026-10-04" }), open: true });
    const r = await claimMemberVisit(store, member);
    expect(r).toMatchObject({ status: "ok", existing: false });
    expect(store.closed).toEqual(["PK-OLD1"]);
  });
});

describe("claimVisitForMemberByStaff", () => {
  const base = { plate: "PHC234AB", serviceId: 1, areaId: 1, serviceDate: "2026-10-11", staffId: "s1" };

  test("an attendant registers a member's car, recorded against the member and the attendant", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    store.memberVehicles.set("v-1", "m1");
    const r = await claimVisitForMemberByStaff(store, base);
    expect(r.status).toBe("ok");
    expect(store.visits[0]).toMatchObject({ member_id: "m1", checked_in_by: "s1" });
  });

  test("a plate that is not a member's is refused so the guest path is used", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    expect(await claimVisitForMemberByStaff(store, base)).toEqual({ status: "not_member" });
    expect(await claimVisitForMemberByStaff(store, { ...base, plate: "NEW111AA" })).toEqual({ status: "not_member" });
  });

  test("a car that is already checked in for someone else is blocked", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    store.memberVehicles.set("v-1", "m1");
    store.visits.push({ ...visitFor("v-1", { guest_id: "g-x" }), open: true });
    expect(await claimVisitForMemberByStaff(store, base)).toEqual({ status: "blocked" });
  });
});
