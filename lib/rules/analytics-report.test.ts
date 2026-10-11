import { describe, expect, test } from "vitest";
import {
  activitySeries,
  buildKpis,
  change,
  completedStay,
  describeRange,
  durationByWeekday,
  formatStay,
  peakHours,
  previousLabel,
  rangeDays,
  rankBy,
} from "./analytics-report";
import type { ReportVisit } from "./reports";

// Times are UTC; Lagos is one hour ahead, so 08:00Z is 09:00 in Lagos. 2026-10-11 is a Sunday.
const visit = (inUtc: string, over: Partial<ReportVisit> = {}): ReportVisit => ({
  id: "v",
  serviceDate: "2026-10-11",
  serviceId: 1,
  serviceName: "Service 1",
  areaId: 1,
  areaName: "Car Park 1",
  status: "released",
  releaseMethod: "scan",
  plate: "AAA111AA",
  reference: "PK-2345",
  checkedInAt: `2026-10-11T${inUtc}:00Z`,
  releasedAt: null,
  releasedByName: null,
  isGuest: true,
  ...over,
});
const out = (inUtc: string, outUtc: string, over: Partial<ReportVisit> = {}) =>
  visit(inUtc, { releasedAt: `2026-10-11T${outUtc}:00Z`, ...over });

describe("completedStay", () => {
  test("minutes from check-in to release, for released visits only", () => {
    expect(completedStay(out("08:00", "10:14"))).toBe(134);
    expect(completedStay(visit("08:00", { status: "parked" }))).toBeNull();
    expect(completedStay(visit("08:00", { status: "missed" }))).toBeNull();
  });
  test("a release with no time, before the check-in, or more than a day later is not a reliable stay", () => {
    expect(completedStay(visit("08:00"))).toBeNull();
    expect(completedStay(out("08:00", "07:00"))).toBeNull();
    expect(completedStay(visit("08:00", { releasedAt: "2026-10-13T08:00:00Z" }))).toBeNull();
  });
});

describe("buildKpis", () => {
  test("checked in, left, average stay and unique vehicles", () => {
    const k = buildKpis([
      out("08:00", "09:00", { plate: "AAA111AA" }), // 60
      out("08:00", "10:00", { plate: "BBB222BB" }), // 120
      visit("08:30", { plate: "AAA111AA", status: "parked" }), // the same car again
      visit("08:30", { plate: "CCC333CC", status: "missed" }),
    ]);
    expect(k).toEqual({ checkedIn: 4, left: 2, averageStay: 90, stays: 2, uniqueVehicles: 3 });
  });
  test("an empty period is all zeros and no average, never a divide by zero", () => {
    expect(buildKpis([])).toEqual({ checkedIn: 0, left: 0, averageStay: null, stays: 0, uniqueVehicles: 0 });
  });
  test("a released visit with an unreliable time is counted as left but not averaged", () => {
    const k = buildKpis([out("08:00", "09:00"), visit("08:00", { releasedAt: "2026-10-14T08:00:00Z" })]);
    expect(k.left).toBe(2);
    expect(k.stays).toBe(1);
    expect(k.averageStay).toBe(60);
  });
});

describe("change", () => {
  test("a percentage only when both periods have a figure and the earlier one is not zero", () => {
    expect(change(120, 100)).toBe(20);
    expect(change(80, 100)).toBe(-20);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 100)).toBeNull();
    expect(change(100, null)).toBeNull();
    expect(change(0, 0)).toBeNull();
  });
});

describe("activitySeries", () => {
  test("one day: by the hour, with cars not yet checked out running through the day", () => {
    const a = activitySeries(
      [out("08:05", "09:30"), visit("08:20", { status: "parked" }), out("09:10", "09:40")],
      { from: "2026-10-11", to: "2026-10-11" },
    );
    expect(a.grain).toBe("hour");
    expect(a.buckets.map((b) => [b.label, b.checkedIn, b.left, b.notOut])).toEqual([
      ["09:00", 2, 0, 2], // two in, none out yet
      ["10:00", 1, 2, 1], // one more in, two out: one car left on site
    ]);
  });
  test("a quiet hour between two busy ones is still shown", () => {
    const a = activitySeries([visit("08:00"), visit("10:00")], { from: "2026-10-11", to: "2026-10-11" });
    expect(a.buckets.map((b) => b.label)).toEqual(["09:00", "10:00", "11:00"]);
  });
  test("no visits gives no buckets", () => {
    expect(activitySeries([], { from: "2026-10-11", to: "2026-10-11" }).buckets).toEqual([]);
  });
  test("several days: one bar a day, every day of the range, and cars with no check-out counted that day", () => {
    const a = activitySeries(
      [out("08:00", "09:00"), visit("08:00", { status: "missed" }), visit("08:00", { serviceDate: "2026-10-12" })],
      { from: "2026-10-11", to: "2026-10-13" },
    );
    expect(a.grain).toBe("day");
    expect(a.buckets.map((b) => [b.label, b.checkedIn, b.left, b.notOut])).toEqual([
      ["11 Oct", 2, 1, 1],
      ["12 Oct", 1, 0, 1],
      ["13 Oct", 0, 0, 0],
    ]);
  });
  test("a long range is grouped by week, starting on Monday", () => {
    const a = activitySeries([visit("08:00")], { from: "2026-08-01", to: "2026-10-31" });
    expect(a.grain).toBe("week");
    expect(a.buckets[0].label).toBe("Week of 27 Jul");
    expect(a.buckets.reduce((n, b) => n + b.checkedIn, 0)).toBe(1);
  });
});

describe("rankBy", () => {
  const visits = [visit("08:00"), visit("08:10"), visit("08:20", { areaId: 2, areaName: "AA", serviceId: 2, serviceName: "Service 2" })];
  test("most check-ins first", () => {
    expect(rankBy(visits, "area").map((r) => [r.name, r.count])).toEqual([
      ["Car Park 1", 2],
      ["AA", 1],
    ]);
    expect(rankBy(visits, "service").map((r) => [r.name, r.count])).toEqual([
      ["Service 1", 2],
      ["Service 2", 1],
    ]);
  });
  test("configured names with no check-ins are listed at the bottom, ties by name", () => {
    const ranked = rankBy(visits, "area", [
      { id: 1, name: "Car Park 1" },
      { id: 2, name: "AA" },
      { id: 3, name: "Roadside" },
      { id: 4, name: "Annex" },
    ]);
    expect(ranked.map((r) => [r.name, r.count])).toEqual([
      ["Car Park 1", 2],
      ["AA", 1],
      ["Annex", 0],
      ["Roadside", 0],
    ]);
  });
});

describe("durationByWeekday", () => {
  test("averages by the day the car checked in, Monday first, and leaves a day without data empty", () => {
    const sunday = out("08:00", "10:00"); // 120 min, Sunday 11 Oct
    const sunday2 = out("08:00", "09:00"); // 60 min
    const monday = visit("08:00", { serviceDate: "2026-10-12", checkedInAt: "2026-10-12T08:00:00Z", releasedAt: "2026-10-12T08:30:00Z" }); // 30 min
    const rows = durationByWeekday([sunday, sunday2, monday, visit("08:00", { status: "parked" })]);
    expect(rows.map((r) => r.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(rows[0]).toEqual({ label: "Mon", average: 30, count: 1 });
    expect(rows[1].average).toBeNull();
    expect(rows[6]).toEqual({ label: "Sun", average: 90, count: 2 });
  });
});

describe("peakHours", () => {
  test("the busiest hours by check-ins in Lagos time, ties broken by the earlier hour", () => {
    const peaks = peakHours([visit("08:05"), visit("08:50"), visit("09:10"), visit("09:20"), visit("10:00")]);
    expect(peaks.map((p) => [p.label, p.count])).toEqual([
      ["09:00 – 10:00", 2],
      ["10:00 – 11:00", 2],
      ["11:00 – 12:00", 1],
    ]);
  });
  test("nothing to report for no visits", () => {
    expect(peakHours([])).toEqual([]);
  });
});

describe("formatStay", () => {
  test("short, readable stays", () => {
    expect(formatStay(0)).toBe("Under 1m");
    expect(formatStay(45)).toBe("45m");
    expect(formatStay(60)).toBe("1h 0m");
    expect(formatStay(134)).toBe("2h 14m");
  });
});

describe("labels", () => {
  test("range and comparison wording", () => {
    expect(describeRange("2026-10-01", "2026-10-07")).toBe("1 Oct 2026 – 7 Oct 2026");
    expect(describeRange("2026-10-11", "2026-10-11")).toBe("11 Oct 2026");
    expect(rangeDays("2026-10-01", "2026-10-07")).toBe(7);
    expect(previousLabel(1)).toBe("vs the day before");
    expect(previousLabel(7)).toBe("vs previous week");
    expect(previousLabel(28)).toBe("vs previous 28 days");
  });
});
