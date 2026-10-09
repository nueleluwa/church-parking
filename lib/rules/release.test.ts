import { describe, expect, test } from "vitest";
import { releaseVisit, type ReleaseStore } from "./release";
import { hasRole } from "./roles";

const staff = { id: "s1", role: "attendant" as const };
const today = "2026-10-11";

/** Mimics the database: release() only succeeds for the first caller. */
function fakeStore(over: { status?: "parked" | "released"; service_date?: string; held?: boolean } = {}) {
  let status = over.status ?? "parked";
  const releases: string[] = [];
  const store: ReleaseStore = {
    async getVisitState() {
      return { status, service_date: over.service_date ?? today, held: over.held ?? false };
    },
    async release(_visitId, staffId) {
      await Promise.resolve(); // let a second caller interleave
      if (status !== "parked") return false;
      status = "released";
      releases.push(staffId);
      return true;
    },
  };
  return { store, releases };
}

describe("releaseVisit", () => {
  test("a car on hold (Does not match) cannot be released", async () => {
    const { store, releases } = fakeStore({ held: true });
    const r = await releaseVisit(store, staff, { visitId: "v1", method: "scan", today });
    expect(r).toEqual({ ok: false, reason: "held" });
    expect(releases).toEqual([]);
  });

  test("a signed-in attendant releases a parked car", async () => {
    const { store, releases } = fakeStore();
    expect(await releaseVisit(store, staff, { visitId: "v1", method: "scan", today })).toEqual({ ok: true });
    expect(releases).toEqual(["s1"]);
  });

  test("nobody can release without a staff session", async () => {
    const { store, releases } = fakeStore();
    const r = await releaseVisit(store, null, { visitId: "v1", method: "scan", today });
    expect(r).toEqual({ ok: false, reason: "not_signed_in" });
    expect(releases).toEqual([]);
  });

  test("two releases at the same moment: exactly one succeeds", async () => {
    const { store, releases } = fakeStore();
    const [a, b] = await Promise.all([
      releaseVisit(store, staff, { visitId: "v1", method: "scan", today }),
      releaseVisit(store, { id: "s2", role: "attendant" }, { visitId: "v1", method: "scan", today }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(releases).toHaveLength(1);
  });

  test("a pass from yesterday is rejected", async () => {
    const { store, releases } = fakeStore({ service_date: "2026-10-10" });
    const r = await releaseVisit(store, staff, { visitId: "v1", method: "scan", today });
    expect(r).toEqual({ ok: false, reason: "expired" });
    expect(releases).toEqual([]);
  });

  test("a released visit can't be released again", async () => {
    const { store } = fakeStore({ status: "released" });
    const r = await releaseVisit(store, staff, { visitId: "v1", method: "scan", today });
    expect(r).toEqual({ ok: false, reason: "already_released" });
  });
});

describe("hasRole", () => {
  test("higher roles include lower ones", () => {
    expect(hasRole("admin", "attendant")).toBe(true);
    expect(hasRole("coordinator", "attendant")).toBe(true);
    expect(hasRole("attendant", "coordinator")).toBe(false);
  });
});
