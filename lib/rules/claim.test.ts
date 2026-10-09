import { beforeEach, describe, expect, test } from "vitest";
import {
  claimGuestVisit,
  RATE_LIMITS,
  type AlertKind,
  type ClaimStore,
  type GuestClaimInput,
  type NewVisit,
} from "./claim";

class FakeStore implements ClaimStore {
  attempts = new Map<string, number>();
  vehicles = new Map<string, string>(); // plate -> id
  memberVehicles = new Set<string>();
  openVehicles = new Set<string>();
  visits: NewVisit[] = [];
  alerts: { kind: AlertKind; plate: string }[] = [];
  referenceCollisions = 0;
  hideOpenVisit = false;

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
  async hasOpenVisit(id: string) {
    return !this.hideOpenVisit && this.openVehicles.has(id);
  }
  async createGuest() {
    return "guest-1";
  }
  async insertVisit(v: NewVisit) {
    if (this.referenceCollisions > 0) {
      this.referenceCollisions--;
      return "reference_taken" as const;
    }
    if (this.openVehicles.has(v.vehicle_id)) return "open_visit_exists" as const;
    this.openVehicles.add(v.vehicle_id);
    this.visits.push(v);
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
    store.memberVehicles.add("v-member");
    const r = await claimGuestVisit(store, input());
    expect(r).toEqual({ status: "blocked", reason: "member_plate" });
    expect(store.visits).toHaveLength(0);
    expect(store.alerts).toEqual([{ kind: "member_plate_claim", plate: "PHC234AB" }]);
  });

  test("losing a race for the plate is treated as a conflict", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    store.openVehicles.add("v-1");
    store.hideOpenVisit = true; // looked free when checked, then someone else won
    const r = await claimGuestVisit(store, input());
    expect(r).toEqual({ status: "blocked", reason: "plate_conflict" });
    expect(store.visits).toHaveLength(0);
  });

  test("retries when a reference is already taken", async () => {
    store.referenceCollisions = 2;
    expect((await claimGuestVisit(store, input())).status).toBe("ok");
  });

  test("a known plate with no open visit can check in again", async () => {
    store.vehicles.set("PHC234AB", "v-1");
    expect((await claimGuestVisit(store, input())).status).toBe("ok");
  });
});

describe("rate limits (T-7)", () => {
  test("a phone number is limited after too many tries", async () => {
    for (let i = 0; i < RATE_LIMITS.phone.max; i++) {
      await claimGuestVisit(store, input({ plate: `AAA${100 + i}AA`, ipKey: `ip:${i}` }));
    }
    const r = await claimGuestVisit(store, input({ plate: "ZZZ999ZZ", ipKey: "ip:fresh" }));
    expect(r).toEqual({ status: "rate_limited" });
  });

  test("an IP address is limited after too many tries", async () => {
    for (let i = 0; i < RATE_LIMITS.ip.max; i++) {
      await claimGuestVisit(store, input({ plate: `BBB${100 + i}BB`, phoneKey: `phone:${i}` }));
    }
    const r = await claimGuestVisit(store, input({ plate: "ZZZ999ZZ", phoneKey: "phone:fresh" }));
    expect(r).toEqual({ status: "rate_limited" });
  });
});
