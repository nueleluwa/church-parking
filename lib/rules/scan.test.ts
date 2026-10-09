import { describe, expect, test } from "vitest";
import { buildScanCard, tokenFromScan, type ScanDetail } from "./scan";

const base: ScanDetail = {
  visitId: "v1",
  status: "parked",
  reference: "PK-7Q4M",
  serviceDate: "2026-10-11",
  plate: "PHC234AB",
  areaName: "Car Park 1",
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
});
