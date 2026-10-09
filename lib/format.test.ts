import { describe, expect, test } from "vitest";
import { formatLagosDate, formatLagosTime, formatVisitTime } from "./format";

// Lagos is UTC+1 all year, so 08:12Z is 09:12 in Lagos.
describe("Lagos time formatting", () => {
  test("shows times in Lagos time, not UTC", () => {
    expect(formatLagosTime("2026-10-11T08:12:00Z")).toBe("09:12");
    expect(formatLagosTime("2026-10-11T23:30:00Z")).toBe("00:30");
  });

  test("shows the date in Lagos time", () => {
    expect(formatLagosDate("2026-10-11T08:12:00Z")).toBe("Sun 11 Oct 2026");
    // 23:30Z on Saturday is already Sunday in Lagos
    expect(formatLagosDate("2026-10-10T23:30:00Z")).toBe("Sun 11 Oct 2026");
  });
});

describe("formatVisitTime", () => {
  const now = new Date("2026-10-11T10:00:00Z");
  test("says Today and Yesterday", () => {
    expect(formatVisitTime("2026-10-11T08:12:00Z", now)).toBe("Today, 09:12");
    expect(formatVisitTime("2026-10-10T08:12:00Z", now)).toBe("Yesterday, 09:12");
  });
  test("uses the date for older visits", () => {
    expect(formatVisitTime("2026-10-04T09:04:00Z", now)).toBe("Sun 4 Oct, 10:04");
  });
  test("counts a day by Lagos time: 23:30Z on Saturday is Sunday morning", () => {
    expect(formatVisitTime("2026-10-10T23:30:00Z", now)).toBe("Today, 00:30");
  });
});
