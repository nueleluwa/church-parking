import { describe, expect, test } from "vitest";
import { checkVehicleDetails, COLOUR_MAX, describeVehicle, MAKE_MAX } from "./vehicle";

describe("checkVehicleDetails", () => {
  test("keeps tidy details, and treats empty as not given", () => {
    expect(checkVehicleDetails({ make: "  Toyota   Corolla ", colour: " Silver " })).toEqual({
      ok: true,
      details: { make: "Toyota Corolla", colour: "Silver" },
    });
    expect(checkVehicleDetails({ make: "", colour: "   " })).toEqual({
      ok: true,
      details: { make: null, colour: null },
    });
    expect(checkVehicleDetails({})).toEqual({ ok: true, details: { make: null, colour: null } });
  });

  test("allows one of the two on its own", () => {
    expect(checkVehicleDetails({ colour: "Black" })).toEqual({ ok: true, details: { make: null, colour: "Black" } });
  });

  test("refuses text that is too long", () => {
    expect(checkVehicleDetails({ make: "x".repeat(MAKE_MAX + 1) }).ok).toBe(false);
    expect(checkVehicleDetails({ colour: "x".repeat(COLOUR_MAX + 1) }).ok).toBe(false);
    expect(checkVehicleDetails({ make: "x".repeat(MAKE_MAX), colour: "y".repeat(COLOUR_MAX) }).ok).toBe(true);
  });

  test("removes control characters", () => {
    expect(checkVehicleDetails({ make: "Honda\u0000\nCivic" })).toEqual({
      ok: true,
      details: { make: "Honda Civic", colour: null },
    });
  });
});

describe("describeVehicle", () => {
  test("joins what is known", () => {
    expect(describeVehicle({ make: "Honda Civic", colour: "Black" })).toBe("Honda Civic · Black");
    expect(describeVehicle({ make: "Honda Civic", colour: null })).toBe("Honda Civic");
    expect(describeVehicle({ make: null, colour: "Black" })).toBe("Black");
  });
  test("returns nothing when nothing is known", () => {
    expect(describeVehicle({ make: null, colour: null })).toBeNull();
    expect(describeVehicle({})).toBeNull();
    expect(describeVehicle({ make: "  ", colour: "" })).toBeNull();
  });
});
