import { describe, expect, test } from "vitest";
import { atOtherCarPark, buildScanCard, tokenFromScan, type ScanDetail } from "./scan";

const base: ScanDetail = {
  visitId: "v1",
  status: "parked",
  reference: "PK-7Q4M",
  serviceDate: "2026-10-11",
  plate: "PHC234AB",
  areaName: "Car Park 1",
  areaId: 1,
  areaSlug: "cp1",
  serviceName: "Service 1",
  isGuest: true,
  isNewCar: false,
  fullName: "Ada Obi",
  phone: "+2348031234567",
  releasedAt: null,
  releasedByName: null,
};
const today = "2026-10-11";

describe("buildScanCard", () => {
  test("a parked pass from today is ready, showing first name and last 4 digits only", () => {
    const card = buildScanCard(base, today);
    expect(card.state).toBe("ready");
    expect(card.firstName).toBe("Ada");
    expect(card.phoneLast4).toBe("4567");
    expect(JSON.stringify(card)).not.toMatch(/Obi|\+234|8031234567/);
  });

  test("a pass from yesterday is rejected as expired", () => {
    expect(buildScanCard({ ...base, serviceDate: "2026-10-10" }, today).state).toBe("expired");
  });

  test("a released pass shows who released it and when", () => {
    const card = buildScanCard(
      { ...base, status: "released", releasedAt: "2026-10-11T08:30:00Z", releasedByName: "Chidi" },
      today,
    );
    expect(card).toMatchObject({ state: "already_released", releasedByName: "Chidi" });
  });

  test("a visit the member closed with the exit sign says so, so the attendant does not release it again", () => {
    const self = buildScanCard({ ...base, status: "released", releasedAt: "2026-10-11T08:30:00Z", releaseMethod: "self" }, today);
    expect(self).toMatchObject({ state: "already_released", releasedBySelf: true, releasedByName: null });
    expect(buildScanCard({ ...base, status: "released", releasedAt: "2026-10-11T08:30:00Z", releaseMethod: "scan", releasedByName: "Chidi" }, today).releasedBySelf).toBe(false);
  });

  test("a closed visit is flagged", () => {
    expect(buildScanCard({ ...base, status: "missed" }, today).state).toBe("closed");
  });
});

describe("how long a car has been parked", () => {
  const withTime = { ...base, checkedInAt: "2026-10-11T07:00:00Z" };
  test("counts from check-in to now while the car is still here", () => {
    expect(buildScanCard(withTime, today, new Date("2026-10-11T09:14:00Z")).minutesParked).toBe(134);
  });
  test("stops at the release once the car has left", () => {
    const left = { ...withTime, status: "released" as const, releasedAt: "2026-10-11T08:30:00Z" };
    expect(buildScanCard(left, today, new Date("2026-10-11T12:00:00Z")).minutesParked).toBe(90);
  });
  test("is unknown without a check-in time, and carries the car's make and colour", () => {
    expect(buildScanCard(base, today).minutesParked).toBeNull();
    const card = buildScanCard({ ...base, make: "Toyota Corolla", colour: "Silver" }, today);
    expect(card).toMatchObject({ make: "Toyota Corolla", colour: "Silver" });
  });
});

describe("who the attendant checks", () => {
  test("a guest is checked", () => {
    expect(buildScanCard(base, today).askForDetails).toBe(true);
  });

  test("an established member's car is not, but the last 4 digits are still there", () => {
    const card = buildScanCard({ ...base, isGuest: false }, today);
    expect(card.askForDetails).toBe(false);
    expect(card.phoneLast4).toBe("4567");
  });

  test("a member's newly saved car is checked like a guest's", () => {
    const card = buildScanCard({ ...base, isGuest: false, isNewCar: true }, today);
    expect(card).toMatchObject({ isNewCar: true, askForDetails: true });
  });
});

describe("tokenFromScan", () => {
  const token = "abcdefghijklmnopqrstuv";
  test("reads a pass URL or a bare token", () => {
    expect(tokenFromScan(`https://parking.example.org/p/${token}`)).toBe(token);
    expect(tokenFromScan(token)).toBe(token);
  });
  test("ignores anything else", () => {
    expect(tokenFromScan("hello")).toBeNull();
    expect(tokenFromScan("")).toBeNull();
  });
  test("a car on hold shows as held, not ready", () => {
    expect(buildScanCard({ ...base, held: true }, "2026-10-11").state).toBe("held");
  });
});

describe("atOtherCarPark", () => {
  test("a car from the car park the attendant stands at is fine", () => {
    expect(atOtherCarPark("cp1", "cp1")).toBe(false);
  });
  test("a car from another car park is flagged", () => {
    expect(atOtherCarPark("cp1", "cp2")).toBe(true);
  });
  test("when the attendant has not said where they stand, nothing is flagged", () => {
    expect(atOtherCarPark("cp1", null)).toBe(false);
  });
  test("the scan card carries the car park's id and address", () => {
    const card = buildScanCard(base, "2026-10-11");
    expect(card.areaId).toBe(1);
    expect(card.areaSlug).toBe("cp1");
  });
});
