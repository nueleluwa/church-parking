import { describe, expect, it } from "vitest";
import {
  checkMemberForm,
  firstMemberError,
  initials,
  lagosMonthStart,
  memberState,
  parseMemberCars,
  parseMemberPageSize,
  parseMemberStatus,
} from "./member-admin";

describe("filters and status", () => {
  it("accepts only known values", () => {
    expect(parseMemberStatus("inactive")).toBe("inactive");
    expect(parseMemberStatus("locked")).toBeNull();
    expect(parseMemberCars("none")).toBe("none");
    expect(parseMemberCars("x")).toBeNull();
    expect(parseMemberPageSize("50")).toBe(50);
    expect(parseMemberPageSize("3")).toBe(20);
  });

  it("shows switched off before locked", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(memberState({ active: true, locked_until: null }, now)).toBe("active");
    expect(memberState({ active: true, locked_until: "2026-10-12T11:00:00Z" }, now)).toBe("locked");
    expect(memberState({ active: true, locked_until: "2026-10-12T09:00:00Z" }, now)).toBe("active");
    expect(memberState({ active: false, locked_until: "9999-12-31T00:00:00Z" }, now)).toBe("inactive");
  });

  it("starts the month at midnight in Lagos", () => {
    expect(lagosMonthStart(new Date("2026-10-12T10:00:00Z"))).toBe("2026-10-01T00:00:00+01:00");
    // 23:30 UTC on 30 Sept is already 1 Oct in Lagos
    expect(lagosMonthStart(new Date("2026-09-30T23:30:00Z"))).toBe("2026-10-01T00:00:00+01:00");
    expect(lagosMonthStart(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01T00:00:00+01:00");
  });

  it("makes initials", () => {
    expect(initials("John Okafor")).toBe("JO");
    expect(initials("Amaka")).toBe("A");
    expect(initials("  ")).toBe("?");
  });
});

describe("checkMemberForm", () => {
  const good = { name: "John Okafor", phone: "0803 123 4567", pin: "4821" };

  it("normalises the phone and plates and reads the status", () => {
    const r = checkMemberForm({ ...good, status: "inactive", vehicles: [{ plate: "phc-234 ab", make: " Toyota ", colour: "" }, { plate: "", make: "", colour: "" }] }, true);
    expect(r).toEqual({
      ok: true,
      values: { name: "John Okafor", phone: "+2348031234567", pin: "4821", active: false, vehicles: [{ plate: "PHC234AB", make: "Toyota", colour: null }] },
    });
  });

  it("explains each problem", () => {
    const r = checkMemberForm({ name: "J", phone: "12", pin: "12" }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toMatchObject({ name: "Enter the member's full name.", phone: "Check the phone number, for example 0803 123 4567.", pin: "The PIN must be 4 numbers." });
      expect(firstMemberError(r.errors)).toBe("Enter the member's full name.");
    }
    expect(checkMemberForm({ ...good, phone: "" }, true)).toMatchObject({ ok: false, errors: { phone: "Enter the phone number." } });
  });

  it("asks for the PIN only when adding, but checks one that is given", () => {
    expect(checkMemberForm({ name: good.name, phone: good.phone }, false).ok).toBe(true);
    expect(checkMemberForm({ name: good.name, phone: good.phone }, true).ok).toBe(false);
    expect(checkMemberForm({ name: good.name, phone: good.phone, pin: "12" }, false).ok).toBe(false);
  });

  it("can leave the PIN out: a member added for the QR check-in has none", () => {
    const r = checkMemberForm({ name: good.name, phone: good.phone, vehicles: [{ plate: "PHC234AB" }] }, false, true);
    expect(r).toMatchObject({ ok: true, values: { pin: "" } });
  });

  it("can require a vehicle when adding, because the check-in confirms the registered plate", () => {
    const r = checkMemberForm({ name: good.name, phone: good.phone, vehicles: [{ plate: "", make: "", colour: "" }] }, false, true);
    expect(r).toMatchObject({ ok: false, errors: { general: "Add the member's vehicle plate number." } });
    expect(checkMemberForm({ name: good.name, phone: good.phone }, false, true)).toMatchObject({ ok: false });
    // Editing a member does not ask for one
    expect(checkMemberForm({ name: good.name, phone: good.phone }, false).ok).toBe(true);
  });

  it("checks each vehicle row and rejects a plate typed twice", () => {
    const r = checkMemberForm({ ...good, vehicles: [{ plate: "AB" }, { plate: "PHC234AB" }, { plate: "phc 234 ab" }, { plate: "XYZ999QQ", colour: "x".repeat(25) }] }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.vehicles).toEqual(["A plate number has 3 to 10 letters or numbers.", "", "This plate is in the list twice.", "The colour is too long. Use 20 letters or fewer."]);
    }
  });

  it("allows at most four vehicles", () => {
    const vehicles = ["AAA111BB", "AAA112BB", "AAA113BB", "AAA114BB", "AAA115BB"].map((plate) => ({ plate }));
    expect(checkMemberForm({ ...good, vehicles }, true)).toMatchObject({ ok: false, errors: { general: "A member can have at most 4 vehicles." } });
  });
});
