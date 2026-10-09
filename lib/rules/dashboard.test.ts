import { describe, expect, test } from "vitest";
import { summariseVisits, type VisitRow } from "./dashboard";

const areas = [
  { id: 1, name: "Car Park 1" },
  { id: 2, name: "Car Park 2" },
];
const services = [
  { id: 1, starts_at: "07:30:00" },
  { id: 2, starts_at: "09:30:00" },
  { id: 3, starts_at: "11:30:00" },
];
const row = (service_id: number, area_id: number, status: VisitRow["status"]): VisitRow => ({
  service_id,
  area_id,
  status,
});

describe("summariseVisits", () => {
  test("counts checked in, released and still parked per area for the selected service", () => {
    const s = summariseVisits(
      [row(2, 1, "parked"), row(2, 1, "parked"), row(2, 1, "released"), row(2, 2, "parked"), row(2, 2, "missed")],
      areas,
      services,
      2,
    );
    expect(s.areas[0]).toMatchObject({ checkedIn: 3, parked: 2, released: 1 });
    expect(s.areas[1]).toMatchObject({ checkedIn: 2, parked: 1, missed: 1 });
    expect(s.totals).toMatchObject({ checkedIn: 5, parked: 3, released: 1, missed: 1 });
  });

  test("a car still parked from an earlier service shows as carried over, not as checked in", () => {
    const s = summariseVisits([row(1, 1, "parked"), row(1, 1, "released")], areas, services, 2);
    expect(s.areas[0]).toMatchObject({ checkedIn: 0, carriedOver: 1 });
    expect(s.totals.carriedOver).toBe(1);
  });

  test("a car that stays for all three services is carried over into services 2 and 3", () => {
    const rows = [row(1, 2, "parked")];
    expect(summariseVisits(rows, areas, services, 2).totals.carriedOver).toBe(1);
    expect(summariseVisits(rows, areas, services, 3).totals.carriedOver).toBe(1);
    expect(summariseVisits(rows, areas, services, 1).totals.carriedOver).toBe(0);
  });

  test("a later service's cars are not carried over into an earlier one", () => {
    expect(summariseVisits([row(3, 1, "parked")], areas, services, 2).totals.carriedOver).toBe(0);
  });

  test("shows car counts only: no capacity or spaces left (D-05)", () => {
    const s = summariseVisits([], areas, services, 1);
    expect(JSON.stringify(s)).not.toMatch(/capacity|spaces|free/i);
    expect(s.totals).toEqual({ checkedIn: 0, released: 0, parked: 0, missed: 0, carriedOver: 0 });
  });

  test("rows for an unknown area are ignored", () => {
    expect(summariseVisits([row(1, 99, "parked")], areas, services, 1).totals.checkedIn).toBe(0);
  });
});
