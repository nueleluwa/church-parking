import { describe, expect, it } from "vitest";
import { addDays, dayText, lagosDayStart, parseDashboardPeriod } from "./dashboard-overview";

const TODAY = "2026-10-12";

describe("parseDashboardPeriod", () => {
  it("defaults to today", () => {
    expect(parseDashboardPeriod({}, TODAY)).toMatchObject({ range: "today", from: TODAY, to: TODAY, includesToday: true, label: "Today", words: "today", dates: "Mon, 12 Oct 2026" });
    expect(parseDashboardPeriod({ range: "nonsense" }, TODAY).range).toBe("today");
  });

  it("knows yesterday, the last 7 days and the last 30 days", () => {
    expect(parseDashboardPeriod({ range: "yesterday" }, TODAY)).toMatchObject({ from: "2026-10-11", to: "2026-10-11", includesToday: false, words: "yesterday" });
    expect(parseDashboardPeriod({ range: "7d" }, TODAY)).toMatchObject({ from: "2026-10-06", to: TODAY, includesToday: true, words: "in the last 7 days", dates: "6 Oct to 12 Oct 2026" });
    expect(parseDashboardPeriod({ range: "30d" }, TODAY)).toMatchObject({ from: "2026-09-13", to: TODAY });
  });

  it("takes one chosen day, and never a day that has not happened or is not a real date", () => {
    expect(parseDashboardPeriod({ range: "date", date: "2026-10-05" }, TODAY)).toMatchObject({ range: "date", from: "2026-10-05", to: "2026-10-05", date: "2026-10-05", includesToday: false, label: "5 Oct 2026", words: "on 5 Oct 2026" });
    for (const bad of ["2026-10-13", "2026-02-31", "not-a-date", undefined]) {
      expect(parseDashboardPeriod({ range: "date", date: bad }, TODAY)).toMatchObject({ range: "date", from: TODAY, to: TODAY, date: TODAY, includesToday: true });
    }
  });
});

describe("dates", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayText("2026-10-01")).toBe("Thu, 1 Oct 2026");
  });

  it("starts a Lagos day at midnight Lagos time", () => {
    expect(lagosDayStart("2026-10-12")).toBe("2026-10-12T00:00:00+01:00");
    expect(new Date(lagosDayStart("2026-10-12")).toISOString()).toBe("2026-10-11T23:00:00.000Z");
  });
});
