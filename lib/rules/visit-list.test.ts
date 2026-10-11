import { describe, expect, test } from "vitest";
import {
  durationText,
  lagosParts,
  pageNumbers,
  parseVisitStatus,
  plateLikePattern,
  searchPlate,
  visitDuration,
  visitListToCsv,
  visitRange,
  type VisitListRow,
} from "./visit-list";

const row = (over: Partial<VisitListRow> = {}): VisitListRow => ({
  id: "v1",
  plate: "AAA111AA",
  make: null,
  colour: null,
  member: false,
  serviceId: 1,
  serviceName: "Service 1",
  areaId: 1,
  areaName: "Car Park 1",
  areaSlug: "cp1",
  status: "released",
  checkedInAt: "2026-10-11T08:00:00Z", // 09:00 Lagos
  releasedAt: "2026-10-11T08:14:00Z", // 09:14 Lagos
  releaseMethod: "scan",
  releasedBy: "Grace",
  reference: "PK-2345",
  held: false,
  ...over,
});

describe("visitRange", () => {
  test("today when nothing is chosen, a chosen range, and the older single date", () => {
    expect(visitRange(undefined, undefined, undefined, "2026-10-11")).toEqual({ from: "2026-10-11", to: "2026-10-11", error: null });
    expect(visitRange("2026-10-01", "2026-10-07", undefined, "2026-10-11")).toEqual({ from: "2026-10-01", to: "2026-10-07", error: null });
    expect(visitRange(undefined, undefined, "2026-10-05", "2026-10-11")).toEqual({ from: "2026-10-05", to: "2026-10-05", error: null });
  });
  test("one date given means that day", () => {
    expect(visitRange("2026-10-03", undefined, undefined, "2026-10-11")).toEqual({ from: "2026-10-03", to: "2026-10-03", error: null });
  });
  test("a reversed, invalid or too-long range falls back to today and says why", () => {
    expect(visitRange("2026-10-09", "2026-10-01", undefined, "2026-10-11").error).toMatch(/start date must not be after/);
    expect(visitRange("nonsense", "also-bad", undefined, "2026-10-11")).toMatchObject({ from: "2026-10-11", to: "2026-10-11" });
    expect(visitRange("nonsense", "also-bad", undefined, "2026-10-11").error).toMatch(/not valid/);
    const long = visitRange("2000-01-01", "2026-10-01", undefined, "2026-10-11");
    expect(long.error).toMatch(/up to 366 days/);
    expect(long.from).toBe("2026-10-11");
  });
});

describe("search", () => {
  test("a plate is normalised the way plates are stored, and look-alikes match", () => {
    expect(searchPlate("  phc 234-ab ")).toBe("PHC234AB");
    expect(searchPlate(undefined)).toBe("");
    expect(plateLikePattern("A0B1C")).toBe("%A_B_C%");
    expect(plateLikePattern("AOB")).toBe("%A_B%");
  });
  test("only the three real statuses are accepted", () => {
    expect(parseVisitStatus("parked")).toBe("parked");
    expect(parseVisitStatus("released")).toBe("released");
    expect(parseVisitStatus("missed")).toBe("missed");
    expect(parseVisitStatus("bogus")).toBeNull();
    expect(parseVisitStatus("")).toBeNull();
    expect(parseVisitStatus(undefined)).toBeNull();
  });
});

describe("pageNumbers", () => {
  test("a short list shows every page; a long one shows the ends and the neighbours with a gap", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(1, 31)).toEqual([1, 2, "gap", 31]);
    expect(pageNumbers(15, 31)).toEqual([1, "gap", 14, 15, 16, "gap", 31]);
    expect(pageNumbers(31, 31)).toEqual([1, "gap", 30, 31]);
  });
});

describe("describing a visit", () => {
  test("times are Lagos time", () => {
    expect(lagosParts("2026-10-11T08:00:00Z")).toEqual({ date: "11 Oct 2026", time: "09:00" });
    expect(lagosParts("2026-10-11T23:30:00Z")).toEqual({ date: "12 Oct 2026", time: "00:30" });
  });
  test("duration is for a released visit with a reliable release time only", () => {
    expect(visitDuration(row())).toBe(14);
    expect(visitDuration(row({ status: "parked", releasedAt: null }))).toBeNull();
    expect(visitDuration(row({ status: "missed", releasedAt: null }))).toBeNull();
    expect(visitDuration(row({ releasedAt: "2026-10-11T07:00:00Z" }))).toBeNull(); // before the check-in
    expect(durationText(0)).toBe("Under 1m");
    expect(durationText(14)).toBe("14m");
    expect(durationText(134)).toBe("2h 14m");
  });
});

describe("the export", () => {
  test("uses the same status, times and duration as the table, and never a name or phone", () => {
    const csv = visitListToCsv([
      row(),
      row({ id: "v2", plate: "BBB222BB", status: "parked", releasedAt: null, releasedBy: null, releaseMethod: null, member: true, reference: "PK-3456" }),
      row({ id: "v3", plate: "CCC333CC", status: "missed", releasedAt: null, releasedBy: null, releaseMethod: "midnight", reference: "PK-4567" }),
    ]).replace(/^﻿/, "");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Service date,Plate,Type,Service,Parking area,Entry (Lagos),Exit (Lagos),Duration (minutes),Status,How it ended,Released by,Reference");
    expect(lines[1]).toBe("2026-10-11,AAA111AA,Guest,Service 1,Car Park 1,2026-10-11 09:00,2026-10-11 09:14,14,Released,Pass scanned,Grace,PK-2345");
    expect(lines[2]).toBe("2026-10-11,BBB222BB,Member,Service 1,Car Park 1,2026-10-11 09:00,,,Checked in,,,PK-3456");
    expect(lines[3]).toContain("Missed,Closed at midnight");
    expect(lines[0].toLowerCase()).not.toMatch(/phone|\bname\b|email/);
  });
  test("no visits is a file with just the headings", () => {
    expect(visitListToCsv([]).trim().split("\r\n")).toHaveLength(1);
  });
});
