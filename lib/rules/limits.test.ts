import { describe, expect, test } from "vitest";
import { canAddVehicle, isNewCar, MAX_MEMBER_VEHICLES } from "./limits";

test("a member can save up to 4 cars", () => {
  expect(MAX_MEMBER_VEHICLES).toBe(4);
  expect(canAddVehicle(0)).toBe(true);
  expect(canAddVehicle(3)).toBe(true);
  expect(canAddVehicle(4)).toBe(false);
});

describe("isNewCar", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  test("a car saved this week is new", () => {
    expect(isNewCar("2026-10-15T10:00:00Z", now)).toBe(true);
  });
  test("a car saved over a week ago is not", () => {
    expect(isNewCar("2026-10-10T09:00:00Z", now)).toBe(false);
  });
  test("no date means not new", () => {
    expect(isNewCar(null, now)).toBe(false);
  });
});
