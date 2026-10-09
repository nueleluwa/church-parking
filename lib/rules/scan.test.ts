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
