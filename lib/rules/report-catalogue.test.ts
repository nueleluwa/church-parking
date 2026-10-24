import { describe, expect, test } from "vitest";
import {
  CATEGORIES,
  CONTENTS_SHEET,
  REPORTS,
  buildReportTable,
  findReport,
  reportFilename,
  reportsIn,
  sheetName,
  tableToCsv,
  workbookFilename,
  workbookSheets,
  type ReportAlert,
  type ReportId,
  type ReportInput,
} from "./report-catalogue";
import type { ReportVisit } from "./reports";

// Times are UTC; Lagos is one hour ahead. 2026-10-11 is a Sunday.
const visit = (over: Partial<ReportVisit> = {}): ReportVisit => ({
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
  checkedInAt: "2026-10-11T08:00:00Z", // 09:00 Lagos
  releasedAt: "2026-10-11T09:30:00Z", // 10:30 Lagos
  releasedByName: "Grace",
  isGuest: true,
  ...over,
});
const alert = (over: Partial<ReportAlert> = {}): ReportAlert => ({
  id: 1,
  kind: "member_plate_claim",
  plate: "AAA111AA",
  createdAt: "2026-10-11T08:05:00Z",
  resolvedAt: null,
  areaName: "Car Park 1",
  serviceId: 1,
  serviceName: "Service 1",
  ...over,
});
const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  range: { from: "2026-10-11", to: "2026-10-12" },
  service: null,
  visits: [],
  alerts: [],
  parkedNow: [],
  areas: [
    { id: 1, name: "Car Park 1" },
    { id: 2, name: "Car Park 2" },
  ],
  generatedAt: new Date("2026-10-12T10:00:00Z"),
  ...over,
});

const rich = input({
  visits: [
    visit(),
    visit({ plate: "BBB222BB", isGuest: false, checkedInAt: "2026-10-11T08:20:00Z", releasedAt: "2026-10-11T08:50:00Z", releaseMethod: "search", reference: "PK-3456" }),
    visit({ plate: "CCC333CC", status: "missed", releasedAt: null, releasedByName: null, serviceId: 2, serviceName: "Service 2", areaId: 2, areaName: "Car Park 2", reference: "PK-4567" }),
    visit({ plate: "AAA111AA", serviceDate: "2026-10-12", checkedInAt: "2026-10-12T09:00:00Z", releasedAt: null, status: "parked", reference: "PK-5678" }),
  ],
  alerts: [alert(), alert({ id: 2, kind: "plate_conflict", resolvedAt: "2026-10-11T09:00:00Z" }), alert({ id: 3, kind: "no_match" })],
  parkedNow: [
    { areaId: 1, areaName: "Car Park 1", serviceId: 1, serviceName: "Service 1" },
    { areaId: 1, areaName: "Car Park 1", serviceId: 1, serviceName: "Service 1" },
    { areaId: 2, areaName: "Car Park 2", serviceId: 2, serviceName: "Service 2" },
  ],
});

describe("the catalogue", () => {
  test("every report has a unique id, a real category and CSV only", () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REPORTS) {
      expect(CATEGORIES.some((c) => c.id === r.category)).toBe(true);
      expect(r.formats).toEqual(["csv"]);
      expect(r.name.length).toBeGreaterThan(3);
      expect(r.description.length).toBeGreaterThan(10);
    }
  });
  test("the category counts are the real number of reports", () => {
    expect(CATEGORIES.map((c) => [c.id, reportsIn(c.id).length])).toEqual([
      ["activity", 5],
      ["vehicles", 3],
      ["members", 3],
      ["services", 3],
      ["areas", 3],
      ["alerts", 5],
    ]);
    expect(findReport("parking-summary")?.name).toBe("Parking summary");
    expect(findReport("nonsense")).toBeNull();
    expect(findReport(null)).toBeNull();
  });
  test("every report builds, with and without data, and each row is as wide as its headings", () => {
    for (const r of REPORTS) {
      for (const data of [input(), rich]) {
        const table = buildReportTable(r.id, data);
        expect(table.headers.length, r.id).toBeGreaterThan(1);
        for (const row of table.rows) expect(row.length, `${r.id} row`).toBe(table.headers.length);
      }
    }
  });
  test("no report has a name, phone or contact column", () => {
    for (const r of REPORTS) {
      const headers = buildReportTable(r.id, rich).headers.join("|").toLowerCase();
      expect(headers, r.id).not.toMatch(/\bphone\b|\bname\b|contact|email/);
    }
  });
});

describe("parking activity", () => {
  test("the summary counts check-ins, check-outs, cars with no check-out, unique vehicles and the live count", () => {
    const rows = Object.fromEntries(buildReportTable("parking-summary", rich).rows.map((r) => [r[0], r[1]]));
    expect(rows["Cars checked in"]).toBe(4);
    expect(rows["Cars left"]).toBe(2);
    expect(rows["Not checked out"]).toBe(2);
    expect(rows["Unique vehicles"]).toBe(3);
    expect(rows["Average stay (minutes)"]).toBe(60); // 90 and 30
    expect(rows["Cars parked right now (live)"]).toBe(3);
    expect(rows["Service"]).toBe("All services");
    expect(rows["Period (Lagos dates)"]).toBe("2026-10-11 to 2026-10-12");
  });
  test("an empty period gives zeros and no average, never NaN", () => {
    const rows = Object.fromEntries(buildReportTable("parking-summary", input()).rows.map((r) => [r[0], r[1]]));
    expect(rows["Cars checked in"]).toBe(0);
    expect(rows["Average stay (minutes)"]).toBe("");
    expect(tableToCsv(buildReportTable("parking-summary", input()))).not.toMatch(/NaN|undefined|Infinity/);
  });
  test("by day lists every day of the range, with check-outs on the day they happened", () => {
    expect(buildReportTable("activity-by-day", rich).rows).toEqual([
      ["2026-10-11", 3, 2, 1],
      ["2026-10-12", 1, 0, 1],
    ]);
    expect(buildReportTable("activity-by-day", input({ range: { from: "2026-10-01", to: "2026-10-03" } })).rows).toEqual([
      ["2026-10-01", 0, 0, 0],
      ["2026-10-02", 0, 0, 0],
      ["2026-10-03", 0, 0, 0],
    ]);
  });
  test("hourly has all 24 hours in Lagos time", () => {
    const rows = buildReportTable("hourly-activity", rich).rows;
    expect(rows).toHaveLength(24);
    expect(rows[9]).toEqual(["09:00 – 10:00", 3, 1]); // 08:00Z is 09:00 Lagos: three check-ins, one release at 09:50
    expect(rows[10]).toEqual(["10:00 – 11:00", 1, 1]); // one check-in on the 12th, one release at 10:30
  });
  test("by area includes an area with no activity and the live count", () => {
    expect(buildReportTable("area-activity", rich).rows).toEqual([
      ["Car Park 1", 3, 2, 1, 2],
      ["Car Park 2", 1, 0, 1, 1],
    ]);
    const empty = buildReportTable("area-activity", input()).rows;
    expect(empty.map((r) => r[0])).toEqual(["Car Park 1", "Car Park 2"]);
  });
  test("by service lists the busiest hour", () => {
    const rows = buildReportTable("service-activity", rich).rows;
    expect(rows[0]).toEqual(["Service 1", 3, 2, 1, 2, "09:00 – 10:00", 2]);
    expect(rows[1][0]).toBe("Service 2");
  });
});

describe("vehicle and member reports", () => {
  test("visit history is by plate and shows the stay in minutes", () => {
    const rows = buildReportTable("vehicle-visit-history", rich).rows;
    expect(rows.map((r) => r[1])).toEqual(["AAA111AA", "AAA111AA", "BBB222BB", "CCC333CC"]);
    expect(rows[0]).toEqual(["2026-10-11", "AAA111AA", "Guest", "Service 1", "Car Park 1", "Released", "2026-10-11 09:00", "2026-10-11 10:30", 90, "PK-2345"]);
    expect(rows[3][8]).toBe("");
  });
  test("check-in and check-out records say how each car was released", () => {
    const rows = buildReportTable("checkin-checkout-records", rich).rows;
    expect(rows.find((r) => r[0] === "PK-2345")?.[4]).toBe("Pass scanned");
    expect(rows.find((r) => r[0] === "PK-3456")?.[4]).toBe("Looked up, no pass scanned");
  });
  test("a visit the member closed with the exit sign, or staff closed, is labelled as such and not as a pass scan", () => {
    const withMethods = { ...rich, visits: [...rich.visits, visit({ reference: "PK-8001", releaseMethod: "self", releasedByName: null }), visit({ reference: "PK-8002", releaseMethod: "staff_close" })] };
    const rows = buildReportTable("checkin-checkout-records", withMethods).rows;
    expect(rows.find((r) => r[0] === "PK-8001")?.[4]).toBe("Member checked out (exit sign)");
    expect(rows.find((r) => r[0] === "PK-8002")?.[4]).toBe("Closed by staff");
    expect(rows.find((r) => r[0] === "PK-4567")?.[4]).toBe("");
  });
  test("vehicle activity is one row per vehicle", () => {
    const rows = buildReportTable("vehicle-activity", rich).rows;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(["AAA111AA", 2, 1, 1, "2026-10-11 09:00", "2026-10-12 10:00", "Car Park 1", "Guest"]);
  });
  test("member reports only include members' cars, and the exceptions only member claims", () => {
    expect(buildReportTable("member-vehicle-activity", rich).rows.map((r) => r[0])).toEqual(["BBB222BB"]);
    expect(buildReportTable("member-visits", rich).rows.map((r) => r[1])).toEqual(["BBB222BB"]);
    expect(buildReportTable("member-exceptions", rich).rows).toHaveLength(1);
  });
});

describe("services and areas", () => {
  test("service comparison shares add up to 100 and an empty period has no share", () => {
    const rows = buildReportTable("service-comparison", rich).rows;
    expect(rows.map((r) => r[2])).toEqual([75, 25]);
    expect(buildReportTable("service-comparison", input()).rows).toEqual([]);
  });
  test("by day and by hour leave out rows with no activity", () => {
    expect(buildReportTable("service-by-day", rich).rows.every((r) => (r[2] as number) + (r[3] as number) + (r[4] as number) > 0)).toBe(true);
    expect(buildReportTable("service-by-hour", rich).rows.length).toBeGreaterThan(0);
    expect(buildReportTable("area-by-day", rich).rows.map((r) => r[0])).toContain("2026-10-12");
  });
  test("area comparison counts missed check-outs", () => {
    const rows = buildReportTable("area-comparison", rich).rows;
    expect(rows.find((r) => r[0] === "Car Park 2")?.[4]).toBe(1);
  });
  test("cars parked now is a live snapshot by area and service", () => {
    expect(buildReportTable("current-by-area", rich).rows).toEqual([
      ["Car Park 1", "Service 1", 2, "2026-10-12 11:00"],
      ["Car Park 2", "Service 2", 1, "2026-10-12 11:00"],
    ]);
    expect(buildReportTable("current-by-area", input()).rows).toEqual([]);
  });
});

describe("alerts and exceptions", () => {
  test("missed check-outs, releases without a scan and held cars each list their own records", () => {
    expect(buildReportTable("missed-checkouts", rich).rows.map((r) => r[1])).toEqual(["CCC333CC"]);
    expect(buildReportTable("released-without-scan", rich).rows.map((r) => r[1])).toEqual(["BBB222BB"]);
    expect(buildReportTable("held-cars", rich).rows).toHaveLength(1);
  });
  test("conflicts list every alert, resolved or open, and never merge repeats", () => {
    const twice = input({ alerts: [alert({ id: 1 }), alert({ id: 2 }), alert({ id: 3, kind: "plate_conflict", resolvedAt: "2026-10-11T10:00:00Z" })] });
    const rows = buildReportTable("conflicts", twice).rows;
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r[5])).toEqual(["Open", "Open", "Resolved"]);
    expect(rows[2][6]).toBe("2026-10-11 11:00");
    expect(rows[0][1]).toBe("A guest tried to check in a member's car");
  });
});

describe("files", () => {
  test("CSV has a BOM, CRLF lines, quoted commas and neutralised formulas", () => {
    const csv = tableToCsv({ headers: ["A", "B"], rows: [["x, y", "=SUM(1)"], ['say "hi"', 3]] });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"x, y"');
    expect(csv).toContain("'=SUM(1)");
    expect(csv).toContain('"say ""hi"""');
    expect(csv.split("\r\n")).toHaveLength(4);
  });
  test("file names are safe and say which report, dates and service", () => {
    expect(reportFilename({ id: "parking-summary" }, { from: "2026-10-01", to: "2026-10-07" }, null)).toBe("parking-summary_2026-10-01_to_2026-10-07.csv");
    expect(reportFilename({ id: "missed-checkouts" }, { from: "2026-10-11", to: "2026-10-11" }, { name: "Service 2 / <Late>../" })).toBe("missed-checkouts_2026-10-11_service-2-late.csv");
  });
  test("the replaced-check-out-code report lists only visits replaced twice or more, most first, with plates and no people", () => {
    const withCodes = {
      ...rich,
      visits: [
        visit({ reference: "PK-9001", plate: "AAA111AA", credentialReissues: 1 }),
        visit({ reference: "PK-9002", plate: "BBB222BB", credentialReissues: 2 }),
        visit({ reference: "PK-9003", plate: "CCC333CC", credentialReissues: 5 }),
        visit({ reference: "PK-9004", plate: "DDD444DD" }),
      ],
    };
    const t = buildReportTable("credential-replacements", withCodes);
    expect(t.rows.map((r) => [r[1], r[5]])).toEqual([["CCC333CC", 5], ["BBB222BB", 2]]);
    expect(t.headers.join(" ")).not.toMatch(/name|phone|member/i);
  });
  test("the id type matches the catalogue", () => {
    const ids: ReportId[] = REPORTS.map((r) => r.id);
    expect(ids).toHaveLength(22);
  });
});

describe("every report in one workbook", () => {
  test("there is a sheet for every report, in the order of the catalogue, each the same table as its CSV", () => {
    const sheets = workbookSheets(rich);
    expect(sheets.map((x) => x.report.id)).toEqual(REPORTS.map((r) => r.id));
    for (const x of sheets) expect(x.table).toEqual(buildReportTable(x.report.id, rich));
  });
  test("every sheet name is one Excel accepts and no two are alike", () => {
    const names = workbookSheets(rich).map((x) => x.sheet);
    for (const n of names) {
      expect(n.length, n).toBeGreaterThan(0);
      expect(n.length, n).toBeLessThanOrEqual(31);
      expect(n, n).not.toMatch(/[\\/?*[\]:]/);
      expect(n.toLowerCase(), n).not.toBe(CONTENTS_SHEET.toLowerCase());
    }
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });
  test("sheetName strips what Excel refuses, shortens, and numbers a repeat", () => {
    const taken = new Set<string>();
    expect(sheetName("Cars: in/out [today]?", taken)).toBe("Cars in out today");
    expect(sheetName("cars in out today", taken)).toBe("cars in out today (2)");
    expect(sheetName("A".repeat(60), taken)).toHaveLength(31);
    const long = "B".repeat(31);
    expect(sheetName(long, taken)).toBe(long);
    expect(sheetName(long, taken)).toHaveLength(31);
    expect(sheetName(long, taken)).not.toBe(long);
    expect(sheetName("???", taken)).toBe("Report");
  });
  test("the file name has the dates and the service, in plain characters", () => {
    expect(workbookFilename({ from: "2026-10-11", to: "2026-10-11" }, null)).toBe("parking-reports_2026-10-11.xlsx");
    expect(workbookFilename({ from: "2026-10-05", to: "2026-10-11" }, { name: "Service 1 / 09:30!" })).toBe("parking-reports_2026-10-05_to_2026-10-11_service-1-09-30.xlsx");
  });
  test("the PDF's file name follows the same rules", () => {
    expect(workbookFilename({ from: "2026-10-11", to: "2026-10-11" }, null, "pdf")).toBe("parking-report_2026-10-11.pdf");
    expect(workbookFilename({ from: "2026-10-05", to: "2026-10-11" }, { name: "Service 1" }, "pdf")).toBe("parking-report_2026-10-05_to_2026-10-11_service-1.pdf");
  });
  test("the workbook has no name, phone or contact column anywhere", () => {
    for (const x of workbookSheets(rich)) expect(x.table.headers.join("|").toLowerCase(), x.sheet).not.toMatch(/\bphone\b|\bname\b|contact|email/);
  });
});
