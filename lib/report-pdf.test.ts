import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { buildReportPdf } from "./report-pdf";
import type { ReportInput } from "./rules/report-catalogue";
import type { ReportVisit } from "./rules/reports";

// Times are UTC; Lagos is one hour ahead. 2026-10-11 is a Sunday.
const visit = (n: number, over: Partial<ReportVisit> = {}): ReportVisit => ({
  id: `v${n}`,
  serviceDate: "2026-10-11",
  serviceId: 1,
  serviceName: "Service 1",
  areaId: 1,
  areaName: "Car Park 1",
  status: "released",
  releaseMethod: "scan",
  plate: `AAA${100 + n}AA`,
  reference: `PK-${1000 + n}`,
  checkedInAt: `2026-10-11T0${(n % 8) + 1}:00:00Z`,
  releasedAt: `2026-10-11T0${(n % 8) + 1}:40:00Z`,
  releasedByName: "Grace",
  isGuest: n % 2 === 0,
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

const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString() === "%PDF-";

describe("the PDF report", () => {
  test("a period with nothing in it still makes a real PDF", async () => {
    const { buffer, pages } = await buildReportPdf(input());
    expect(isPdf(buffer)).toBe(true);
    expect(pages).toBeGreaterThanOrEqual(1);
    expect((await PDFDocument.load(buffer)).getPageCount()).toBe(pages);
  });

  test("a busy period makes a PDF of a few pages whose page count is true", async () => {
    const visits = Array.from({ length: 120 }, (_, n) =>
      visit(n, n % 5 === 0 ? { status: "missed", releasedAt: null, releasedByName: null } : n % 7 === 0 ? { serviceId: 2, serviceName: "Service 2", areaId: 2, areaName: "Car Park 2" } : {}),
    );
    const { buffer, pages } = await buildReportPdf(
      input({ visits, parkedNow: [{ areaId: 1, areaName: "Car Park 1", serviceId: 1, serviceName: "Service 1" }] }),
    );
    expect(isPdf(buffer)).toBe(true);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(4);
    expect((await PDFDocument.load(buffer)).getPageCount()).toBe(pages);
  });

  test("a long period (grouped by week) and a chosen service both work", async () => {
    const { buffer } = await buildReportPdf(
      input({ range: { from: "2026-06-01", to: "2026-10-12" }, service: { id: 1, name: "Service 1" }, visits: [visit(1), visit(2)] }),
    );
    expect(isPdf(buffer)).toBe(true);
  });

  test("characters the PDF fonts cannot draw never break the file", async () => {
    const odd = visit(3, { serviceName: "Café — “Service 1” → ✓ Ж", areaName: "Parking … ₦" });
    const { buffer } = await buildReportPdf(input({ visits: [odd], service: { id: 1, name: "Café — “Service 1”" } }));
    expect(isPdf(buffer)).toBe(true);
  });

  test("it is a small file, not a heavy one", async () => {
    const { buffer } = await buildReportPdf(input({ visits: Array.from({ length: 300 }, (_, n) => visit(n)) }));
    expect(buffer.length).toBeLessThan(250_000);
  });
});
