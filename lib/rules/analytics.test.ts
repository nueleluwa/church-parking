import { describe, expect, test } from "vitest";
import { buildAnalytics, clock, lagosMinutes, percentChange, previousRange } from "./analytics";
import type { ReportVisit } from "./reports";

// Times are given in UTC; Lagos is one hour ahead. 08:15Z is 09:15 in Lagos.
const visit = (utc: string, over: Partial<ReportVisit> = {}): ReportVisit => ({
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
  checkedInAt: `2026-10-04T${utc}:00Z`,
  releasedAt: null,
  releasedByName: null,
  isGuest: true,
  ...over,
});

describe("lagosMinutes", () => {
  test("adds the hour between UTC and Lagos", () => {
    expect(lagosMinutes("2026-10-04T08:15:00Z")).toBe(9 * 60 + 15);
    expect(clock(lagosMinutes("2026-10-04T08:15:00Z"))).toBe("09:15");
  });
  test("wraps past midnight", () => {
    expect(lagosMinutes("2026-10-04T23:30:00Z")).toBe(30);
  });
});

describe("buildAnalytics", () => {
  test("counts the outcomes", () => {
    const a = buildAnalytics([
      visit("08:00"),
      visit("08:10", { status: "missed" }),
      visit("08:20", { status: "parked" }),
      visit("08:25", { status: "parked" }),
    ]);
    expect(a).toMatchObject({ checkedIn: 4, released: 1, missed: 1, stillParked: 2 });
  });

  test("check-ins by time of day fill every half hour between the first and last arrival", () => {
    const a = buildAnalytics([visit("07:50"), visit("08:05"), visit("08:10"), visit("09:40")]);
    expect(a.byTime.map((b) => [b.label, b.count])).toEqual([
      ["08:30 – 09:00", 1],
      ["09:00 – 09:30", 2],
      ["09:30 – 10:00", 0],
      ["10:00 – 10:30", 0],
      ["10:30 – 11:00", 1],
    ]);
    expect(a.byTime.reduce((n, b) => n + b.count, 0)).toBe(4);
  });

  test("the peaks are the busiest half hours, busiest first", () => {
    const a = buildAnalytics([visit("08:05"), visit("08:10"), visit("08:20"), visit("08:40"), visit("08:50"), visit("09:10")]);
    expect(a.peaks.map((p) => [p.label, p.count])).toEqual([
      ["09:00 – 09:30", 3],
      ["09:30 – 10:00", 2],
      ["10:00 – 10:30", 1],
    ]);
  });

  test("car park usage with shares, and which car park filled first", () => {
    const a = buildAnalytics([
      visit("08:00", { areaId: 2, areaName: "Car Park 2" }),
      visit("08:05", { areaId: 2, areaName: "Car Park 2" }),
      visit("08:10", { areaId: 2, areaName: "Car Park 2" }),
      visit("07:40"),
      visit("08:45"),
      visit("09:30"),
    ]);
    expect(a.areaUsage.map((x) => [x.areaName, x.count, x.percent])).toEqual([
      ["Car Park 1", 3, 50],
      ["Car Park 2", 3, 50],
    ]);
    // Car Park 2 had half its cars (2 of 3) by 09:05; Car Park 1 only by 09:45 (2 of 3 cars)
    expect(a.areaTiming.map((x) => [x.areaName, x.first, x.half])).toEqual([
      ["Car Park 2", "09:00", "09:05"],
      ["Car Park 1", "08:40", "09:45"],
    ]);
  });

  test("no visits gives empty lists, not errors", () => {
    const a = buildAnalytics([]);
    expect(a).toMatchObject({ checkedIn: 0, byTime: [], peaks: [], areaUsage: [], areaTiming: [] });
  });
});

describe("period comparison", () => {
  test("percent change, and nothing to compare with", () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(5, 0)).toBeNull();
  });
  test("the previous period has the same length and ends the day before", () => {
    expect(previousRange("2026-10-04", "2026-10-04")).toEqual({ from: "2026-10-03", to: "2026-10-03" });
    expect(previousRange("2026-10-01", "2026-10-07")).toEqual({ from: "2026-09-24", to: "2026-09-30" });
  });
});
