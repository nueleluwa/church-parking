import writeExcelFile from "write-excel-file/node";
import { CATEGORIES, CONTENTS_SHEET, workbookSheets, type ReportInput, type Table } from "@/lib/rules";

/**
 * Every report in one Excel file (AD-4): a Contents sheet that says what the file is for and lists the others, then one sheet for
 * each report, in the order of the catalogue. The figures come from the same tables as the single-report CSV downloads, so the two
 * always agree. Like the CSVs it contains no drivers' names or phone numbers.
 */
export type Workbook = { buffer: Buffer; sheets: number; rows: number };

const bold = (value: string) => ({ value, fontWeight: "bold" as const });

/** Wide enough for the longest value in a column, but never absurd. */
function widths(table: Table) {
  return table.headers.map((header, i) => {
    const longest = Math.max(header.length, ...table.rows.map((row) => String(row[i] ?? "").length));
    return { width: Math.min(Math.max(longest + 2, 10), 48) };
  });
}

const lagosStamp = (at: Date) =>
  `${at.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", year: "numeric" })}, ${at.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })} Lagos time`;

export async function buildWorkbook(input: ReportInput): Promise<Workbook> {
  const reports = workbookSheets(input);
  const total = reports.reduce((sum, r) => sum + r.table.rows.length, 0);
  const group = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? "";

  const contents: (string | number | ReturnType<typeof bold> | null)[][] = [
    [bold("Parking reports")],
    ["From", input.range.from],
    ["To", input.range.to],
    ["Service", input.service ? input.service.name : "All services"],
    ["Made", lagosStamp(input.generatedAt)],
    [],
    [bold("Sheet"), bold("Group"), bold("Report"), bold("What it shows"), bold("Rows")],
    ...reports.map((r): (string | number)[] => [r.sheet, group(r.report.category), r.report.name, r.report.description, r.table.rows.length]),
    [],
    ["Figures marked \"right now\" or \"live\" are taken when this file is made and are not limited to the dates. Times are Lagos time. No names or phone numbers."],
  ];

  const file = writeExcelFile([
    { data: contents, sheet: CONTENTS_SHEET, columns: [{ width: 30 }, { width: 22 }, { width: 38 }, { width: 70 }, { width: 8 }] },
    ...reports.map((r) => ({
      data: [r.table.headers.map(bold), ...r.table.rows],
      sheet: r.sheet,
      columns: widths(r.table),
      stickyRowsCount: 1,
    })),
  ]);
  return { buffer: Buffer.from(await file.toBuffer()), sheets: reports.length + 1, rows: total };
}
