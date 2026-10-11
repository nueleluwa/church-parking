import { describe, expect, it } from "vitest";
import {
  checkVehicleForm,
  describeVehicleBulk,
  firstError,
  parsePageSize,
  parseVehicleStatus,
  parseVehicleType,
  registerRange,
  typeLabel,
  vehicleChanges,
} from "./vehicle-register";

const MEMBER = "11111111-2222-3333-4444-555555555555";

describe("filters in the address", () => {
  it("accepts only known values", () => {
    expect(parseVehicleType("suv")).toBe("suv");
    expect(parseVehicleType("tank")).toBeNull();
    expect(parseVehicleStatus("inactive")).toBe("inactive");
    expect(parseVehicleStatus("")).toBeNull();
    expect(typeLabel(null)).toBe("Not recorded");
    expect(typeLabel("motorcycle")).toBe("Motorcycle");
  });

  it("allows only the offered page sizes", () => {
    expect(parsePageSize("50")).toBe(50);
    expect(parsePageSize("7")).toBe(20);
    expect(parsePageSize(undefined)).toBe(20);
  });

  it("states the range, with a clear zero", () => {
    expect(registerRange(1, 20, 20, 134)).toEqual({ first: 1, last: 20 });
    expect(registerRange(7, 20, 14, 134)).toEqual({ first: 121, last: 134 });
    expect(registerRange(1, 20, 0, 0)).toEqual({ first: 0, last: 0 });
  });
});

describe("checkVehicleForm", () => {
  const guest = { plate: "phc-234 ab", ownership: "guest" };

  it("normalises the plate and treats empty details as not given", () => {
    const r = checkVehicleForm({ ...guest, make: "  ", colour: "", type: "" }, "add");
    expect(r).toMatchObject({ ok: true, values: { plate: "PHC234AB", make: null, colour: null, type: null, ownership: "guest", memberId: null, active: true } });
  });

  it("reports each problem on its own field", () => {
    const r = checkVehicleForm({ plate: "", ownership: "", type: "tank", make: "x".repeat(41), colour: "y".repeat(21) }, "add");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["colour", "make", "ownership", "plate", "type"]);
      expect(firstError(r.errors)).toBe("Enter the plate number.");
    }
  });

  it("limits the plate length, but does not ask for it when editing", () => {
    expect(checkVehicleForm({ plate: "AB", ownership: "guest" }, "add").ok).toBe(false);
    expect(checkVehicleForm({ plate: "A".repeat(11), ownership: "guest" }, "add").ok).toBe(false);
    expect(checkVehicleForm({ ownership: "guest" }, "edit").ok).toBe(true);
  });

  it("needs a real member when the owner is a member, and drops the member for a guest", () => {
    expect(checkVehicleForm({ ...guest, ownership: "member" }, "add")).toMatchObject({ ok: false, errors: { memberId: "Choose the member who owns this vehicle." } });
    expect(checkVehicleForm({ ...guest, ownership: "member", memberId: "not-an-id" }, "add").ok).toBe(false);
    expect(checkVehicleForm({ ...guest, ownership: "member", memberId: MEMBER }, "add")).toMatchObject({ ok: true, values: { memberId: MEMBER } });
    expect(checkVehicleForm({ ...guest, memberId: MEMBER }, "add")).toMatchObject({ ok: true, values: { memberId: null } });
  });

  it("reads the status", () => {
    expect(checkVehicleForm({ ...guest, status: "inactive" }, "add")).toMatchObject({ ok: true, values: { active: false } });
  });
});

describe("vehicleChanges", () => {
  const base = { type: "car", make: "Toyota", colour: "Red", active: true, ownerId: null };
  it("lists only what changed", () => {
    expect(vehicleChanges(base, { ...base, colour: "Blue", active: false })).toEqual({ colour: ["Red", "Blue"], active: [true, false] });
    expect(vehicleChanges(base, base)).toEqual({});
  });
});

describe("describeVehicleBulk", () => {
  it("says what worked and what did not", () => {
    expect(describeVehicleBulk("deactivated", 3, { done: 3, failed: 0 }, "x")).toBe("3 vehicles deactivated.");
    expect(describeVehicleBulk("deactivated", 1, { done: 1, failed: 0 }, "x")).toBe("1 vehicle deactivated.");
    expect(describeVehicleBulk("activated", 3, { done: 2, failed: 1 }, "not found")).toBe("2 of 3 vehicles activated. 1 could not be changed (not found).");
    expect(describeVehicleBulk("activated", 2, { done: 0, failed: 2 }, "not found")).toBe("No vehicles activated. 2 vehicles could not be changed (not found).");
  });
});
