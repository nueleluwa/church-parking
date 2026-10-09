import { beforeEach, describe, expect, test } from "vitest";
import {
  claimGuestVisit,
  claimMemberVisit,
  claimVisitForMemberByStaff,
  RATE_LIMITS,
  type ClaimStore,
  type GuestClaimAnswer,
  type GuestClaimArgs,
  type GuestClaimInput,
  type MemberClaimAnswer,
  type MemberClaimArgs,
} from "./claim";

// The rules themselves (one open visit per plate, first claim wins, member plates locked, stale
// visits closed, races, reference retries) are applied by the database in one call and are tested
// against the real database in tests/e2e/claim-functions.spec.ts. These tests cover the layer in
// front of it: what is asked of the database, and how its answer is passed on.

class FakeStore implements ClaimStore {
  guestCalls: GuestClaimArgs[] = [];
  memberCalls: MemberClaimArgs[] = [];
  guestAnswer: GuestClaimAnswer = { status: "ok", token: "T", reference: "PK-AAAA" };
  memberAnswer: MemberClaimAnswer = { status: "ok", token: "T", reference: "PK-AAAA", existing: false };
  memberOfVehicle: Record<string, string> = {};
  vehicles: Record<string, string> = {};

  async countAttempts() {
    return 0;
  }
  async recordAttempt() {}
  async findVehicleId(plate: string) {
    return this.vehicles[plate] ?? null;
  }
  async memberIdForVehicle(vehicleId: string) {
    return this.memberOfVehicle[vehicleId] ?? null;
  }
  async claimGuest(args: GuestClaimArgs) {
    this.guestCalls.push(args);
    return this.guestAnswer;
  }
  async claimMember(args: MemberClaimArgs) {
    this.memberCalls.push(args);
    return this.memberAnswer;
  }
}

const guest: GuestClaimInput = {
  name: "Ada",
  phone: "+2348031234567",
  plate: "ABC123DE",
  serviceId: 1,
  areaId: 1,
  serviceDate: "2026-10-11",
  ipKey: "ip:abc",
  phoneKey: "phone:abc",
};

let store: FakeStore;
beforeEach(() => {
  store = new FakeStore();
});

describe("claimGuestVisit", () => {
  test("a whole check-in is one call to the database, with the rate limits in it", async () => {
    const r = await claimGuestVisit(store, guest);
    expect(r).toEqual({ status: "ok", token: "T", reference: "PK-AAAA" });
    expect(store.guestCalls).toHaveLength(1);
    expect(store.guestCalls[0].limits).toEqual({
      phoneKey: "phone:abc",
      phoneMax: RATE_LIMITS.phone.max,
      phoneMinutes: RATE_LIMITS.phone.windowMinutes,
      ipKey: "ip:abc",
      ipMax: RATE_LIMITS.ip.max,
      ipMinutes: RATE_LIMITS.ip.windowMinutes,
    });
  });

  test("the retry key goes to the database, so a repeat of the same attempt gets the same pass", async () => {
    await claimGuestVisit(store, { ...guest, checkInKey: "6f1c0e52-2d52-4a53-9a39-6f6a1c0b8c11" });
    expect(store.guestCalls[0].checkInKey).toBe("6f1c0e52-2d52-4a53-9a39-6f6a1c0b8c11");
    await claimGuestVisit(store, guest);
    expect(store.guestCalls[1].checkInKey).toBeNull();
  });

  test("an answer for a retry is passed on as the same pass", async () => {
    store.guestAnswer = { status: "ok", token: "T", reference: "PK-AAAA", existing: true };
    expect(await claimGuestVisit(store, guest)).toMatchObject({ status: "ok", token: "T", existing: true });
  });

  test("an unknown IP address is not counted at all", async () => {
    await claimGuestVisit(store, { ...guest, ipKey: "" });
    expect(store.guestCalls[0].limits?.ipKey).toBeNull();
    expect(store.guestCalls[0].limits?.phoneKey).toBe("phone:abc");
  });

  test("an attendant registering by hand skips the public rate limits and is recorded", async () => {
    await claimGuestVisit(store, { ...guest, staffId: "s1" });
    expect(store.guestCalls[0].limits).toBeNull();
    expect(store.guestCalls[0].staffId).toBe("s1");
  });

  test("the limits are the agreed ones: 5 an hour per phone, a large number per address", () => {
    expect(RATE_LIMITS.phone).toEqual({ max: 5, windowMinutes: 60 });
    expect(RATE_LIMITS.ip.max).toBeGreaterThanOrEqual(150);
  });

  test("it offers several fresh references and pass tokens in case one is taken", async () => {
    await claimGuestVisit(store, guest);
    const list = store.guestCalls[0].candidates;
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(new Set(list.map((c) => c.reference)).size).toBe(list.length);
    expect(new Set(list.map((c) => c.token)).size).toBe(list.length);
    expect(list[0].reference).toMatch(/^PK-[2-9A-HJ-NP-Z]{4}$/);
    expect(list[0].token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  test("a refusal from the database is passed on with no pass token", async () => {
    store.guestAnswer = { status: "blocked", reason: "plate_conflict" };
    const r = await claimGuestVisit(store, guest);
    expect(r).toEqual({ status: "blocked", reason: "plate_conflict" });
    expect(JSON.stringify(r)).not.toContain("token");
  });

  test("a rate-limited answer is passed on", async () => {
    store.guestAnswer = { status: "rate_limited" };
    expect(await claimGuestVisit(store, guest)).toEqual({ status: "rate_limited" });
  });

  test("when no reference can be made, it is an error and not a made-up pass", async () => {
    store.guestAnswer = { status: "error" };
    await expect(claimGuestVisit(store, guest)).rejects.toThrow();
  });
});

describe("claimMemberVisit", () => {
  const member = { memberId: "m1", vehicleId: "v1", plate: "ABC123DE", serviceId: 1, areaId: 1, serviceDate: "2026-10-11" };

  test("one call to the database, with the member and vehicle from the session", async () => {
    const r = await claimMemberVisit(store, member);
    expect(r).toMatchObject({ status: "ok", existing: false });
    expect(store.memberCalls).toHaveLength(1);
    expect(store.memberCalls[0]).toMatchObject({ memberId: "m1", vehicleId: "v1", staffId: null });
    expect(store.memberCalls[0].candidates.length).toBeGreaterThanOrEqual(3);
  });

  test("the retry key is passed to the database for members too", async () => {
    await claimMemberVisit(store, { ...member, checkInKey: "6f1c0e52-2d52-4a53-9a39-6f6a1c0b8c11" });
    expect(store.memberCalls[0].checkInKey).toBe("6f1c0e52-2d52-4a53-9a39-6f6a1c0b8c11");
  });

  test("the member's own earlier pass is passed back as existing", async () => {
    store.memberAnswer = { status: "ok", token: "OLD", reference: "PK-BBBB", existing: true };
    expect(await claimMemberVisit(store, member)).toMatchObject({ token: "OLD", existing: true });
  });

  test("a refusal is passed on", async () => {
    store.memberAnswer = { status: "blocked", reason: "not_your_vehicle" };
    expect(await claimMemberVisit(store, member)).toEqual({ status: "blocked", reason: "not_your_vehicle" });
  });
});

describe("claimVisitForMemberByStaff", () => {
  const input = { plate: "ABC123DE", serviceId: 1, areaId: 1, serviceDate: "2026-10-11", staffId: "s1" };

  test("an attendant registers a member's car, recorded against the member and the attendant", async () => {
    store.vehicles["ABC123DE"] = "v1";
    store.memberOfVehicle["v1"] = "m1";
    const r = await claimVisitForMemberByStaff(store, input);
    expect(r).toMatchObject({ status: "ok" });
    expect(store.memberCalls[0]).toMatchObject({ memberId: "m1", vehicleId: "v1", staffId: "s1" });
  });

  test("a plate that is not a member's is refused so the guest path is used", async () => {
    expect(await claimVisitForMemberByStaff(store, input)).toEqual({ status: "not_member" });
    store.vehicles["ABC123DE"] = "v1";
    expect(await claimVisitForMemberByStaff(store, input)).toEqual({ status: "not_member" });
    expect(store.memberCalls).toHaveLength(0);
  });

  test("a car already checked in for someone else is blocked", async () => {
    store.vehicles["ABC123DE"] = "v1";
    store.memberOfVehicle["v1"] = "m1";
    store.memberAnswer = { status: "blocked", reason: "plate_conflict" };
    expect(await claimVisitForMemberByStaff(store, input)).toEqual({ status: "blocked" });
  });
});
