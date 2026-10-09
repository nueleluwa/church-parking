import { describe, expect, test } from "vitest";
import { buildReport, csvCell, parseRange, visitsToCsv, type ReportVisit } from "./reports";

const visit = (over: Partial<ReportVisit> = {}): ReportVisit => ({
  id: "v1",
  serviceDate: "2026-10-04",
  serviceId: 1,
  serviceName: "Service 1",
  areaId: 1,
  areaName: "Car Park 1",
  status: "released",
  releaseMethod: "scan",
  plate: "ABC123DE",
  reference: "PK-2345",
  checkedInAt: "2026-10-04T07:40:00Z",
  releasedAt: "2026-10-04T09:20:00Z",
  releasedByName: "Ada",
  isGuest: true,
  ...over,
});

describe("buildReport", () => {
  test("counts checked in, released, still parked and missed per day, service and car park", () => {
    const r = buildReport([
      visit(),
      visit({ status: "missed", releaseMethod: "sweep" }),
      visit({ status: "parked", releaseMethod: null, areaId: 2, areaName: "Car Park 2" }),
      visit({ serviceId: 2, serviceName: "Service 2" }),
    ]);
    expect(r.totals).toMatchObject({ checkedIn: 4, released: 2, missed: 1, stillParked: 1 });
    expect(r.days).toHaveLength(1);
    const s1 = r.days[0].services[0];
    expect(s1).toMatchObject({ serviceName: "Service 1", checkedIn: 3, released: 1, missed: 1, stillParked: 1 });
    expect(s1.areas.map((a) => [a.areaName, a.checkedIn])).toEqual([["Car Park 1", 2], ["Car Park 2", 1]]);
  });

  test("a visit counts once, under the service it was checked in for", () => {
    const r = buildReport([visit({ status: "parked", releaseMethod: null })]);
    expect(r.totals.checkedIn).toBe(1);
    expect(r.days[0].services).toHaveLength(1);
  });

  test("missed percentage and releases without a pass", () => {
    const r = buildReport([
      visit(),
      visit({ releaseMethod: "search" }),
      visit({ status: "missed", releaseMethod: "midnight" }),
      visit(),
    ]);
    expect(r.totals.missedPercent).toBe(25);
    expect(r.totals.releasedWithoutPass).toBe(1);
  });

  test("an empty range gives zeros, not errors", () => {
    const r = buildReport([]);
    expect(r.days).toEqual([]);
    expect(r.totals).toMatchObject({ checkedIn: 0, missedPercent: 0, releasedWithoutPass: 0 });
  });

  test("newest day first, and alerts are counted by kind", () => {
    const r = buildReport(
      [visit({ serviceDate: "2026-09-27" }), visit({ serviceDate: "2026-10-04" })],
      ["plate_conflict", "plate_conflict", "no_match", "member_plate_claim"],
    );
    expect(r.days.map((d) => d.date)).toEqual(["2026-10-04", "2026-09-27"]);
    expect(r.alerts).toEqual({ plateConflicts: 2, memberPlateClaims: 1, noMatch: 1 });
  });
});

describe("csv", () => {
  test("quotes cells with commas, quotes and new lines", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
  });

  test("a cell that could run as a formula is made safe", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-5")).toBe("'-5");
  });

  test("the file has a header, one line per visit, and no names or phone numbers", () => {
    const text = visitsToCsv([visit(), visit({ plate: "XYZ999AB", releasedByName: null, status: "missed", releaseMethod: "sweep" })]);
    const lines = text.replace("﻿", "").trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Plate");
    expect(lines[0]).not.toMatch(/phone|name/i);
    expect(lines[2]).toContain("XYZ999AB");
  });
});

describe("parseRange", () => {
  test("accepts two real dates in order", () => {
    expect(parseRange("2026-10-01", "2026-10-31")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  test("refuses missing, malformed and reversed dates", () => {
    expect(parseRange(null, "2026-10-31")).toBeNull();
    expect(parseRange("2026-10-31", "2026-10-01")).toBeNull();
    expect(parseRange("yesterday", "2026-10-01")).toBeNull();
  });
});
