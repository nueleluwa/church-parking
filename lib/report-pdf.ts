import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { LOGO_PNG_BASE64, LOGO_SIZE } from "@/lib/report-logo";
import { REPORTS, buildReportTable, describeRange, type ReportInput, type Table } from "@/lib/rules";

/**
 * The parking report as a designed PDF (AD-4): the church's logo and colours, the key figures, charts drawn from the same tables
 * as the CSV and Excel downloads, the service and parking area comparisons, and a count of every alert and exception. Plain
 * vector drawing on A4, no browser involved, so it looks the same everywhere. No drivers' names or phone numbers.
 */
export type ReportPdf = { buffer: Buffer; pages: number };

// The church palette (decision D-10), as 0 to 1 colours
const INK = rgb(0.078, 0.078, 0.078);
const SOFT = rgb(0.333, 0.314, 0.29);
const RED = rgb(0.702, 0.071, 0.106);
const NIGHT = rgb(0.078, 0.078, 0.078);
const WARM = rgb(0.961, 0.949, 0.933);
const EDGE = rgb(0.86, 0.84, 0.82);
const GREY = rgb(0.6, 0.58, 0.56);
const WHITE = rgb(1, 1, 1);

const W = 595.28;
const H = 841.89;
const M = 40;
const CW = W - 2 * M;

/** The standard PDF fonts speak Latin-1: anything else becomes a safe stand-in, so a stray character can never break the file. */
const clean = (value: unknown): string =>
  String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const num = (cell: unknown) => {
  const n = Number(cell);
  return Number.isFinite(n) ? n : 0;
};

/** "2026-10-11" as "11 Oct". */
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** A round step for the scale of a chart, so the lines are at 0, 5, 10... and never at 0, 3.7, 7.4. */
function niceStep(x: number): number {
  if (x <= 1) return 1;
  const exp = 10 ** Math.floor(Math.log10(x));
  const f = x / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

const lagosStamp = (at: Date) =>
  `${at.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", year: "numeric" })}, ${at.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" })} Lagos time`;

export async function buildReportPdf(input: ReportInput): Promise<ReportPdf> {
  const doc = await PDFDocument.create();
  doc.setTitle("Parking report");
  doc.setAuthor("Celebration Church Parking");
  doc.setCreator("Church Parking");
  doc.setCreationDate(input.generatedAt);
  const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
  const bold: PDFFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo: PDFImage = await doc.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));

  const scope = `${describeRange(input.range.from, input.range.to)}  |  ${input.service ? input.service.name : "All services"}`;
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  // ---------- Drawing helpers ----------

  const width = (s: string, size: number, f: PDFFont = font) => f.widthOfTextAtSize(clean(s), size);
  const text = (s: string, x: number, baseline: number, size: number, opts: { f?: PDFFont; color?: RGB; align?: "left" | "right" | "center" } = {}) => {
    const f = opts.f ?? font;
    const t = clean(s);
    const w = f.widthOfTextAtSize(t, size);
    const left = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
    page.drawText(t, { x: left, y: baseline, size, font: f, color: opts.color ?? INK });
  };
  /** Cut a value to a width, with "..." when it does not fit. */
  const fit = (s: string, size: number, maxW: number, f: PDFFont = font) => {
    let t = clean(s);
    if (f.widthOfTextAtSize(t, size) <= maxW) return t;
    while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > maxW) t = t.slice(0, -1);
    return `${t}...`;
  };
  const wrap = (s: string, size: number, maxW: number, f: PDFFont = font) => {
    const lines: string[] = [];
    let line = "";
    for (const word of clean(s).split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > maxW && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const rect = (x: number, yy: number, w: number, h: number, color: RGB) => page.drawRectangle({ x, y: yy, width: w, height: h, color });
  const line = (x1: number, y1: number, x2: number, y2: number, color: RGB = EDGE, thickness = 0.6) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });

  const newPage = (first = false) => {
    page = doc.addPage([W, H]);
    pages.push(page);
    if (first) {
      // The cover band: near-black with the logo, the red edge, and the title
      rect(0, H - 104, W, 104, NIGHT);
      rect(0, H - 108, W, 4, RED);
      const lh = 38;
      page.drawImage(logo, { x: M, y: H - 104 + (104 - lh) / 2, width: (lh * LOGO_SIZE.width) / LOGO_SIZE.height, height: lh });
      text("Parking report", W - M, H - 58, 24, { f: bold, color: WHITE, align: "right" });
      text("Church Parking", W - M, H - 78, 10.5, { color: rgb(0.8, 0.78, 0.76), align: "right" });
      y = H - 108 - 26;
    } else {
      rect(0, H - 6, W, 6, RED);
      text("Parking report", M, H - 28, 9, { f: bold, color: SOFT });
      text(scope, W - M, H - 28, 9, { color: SOFT, align: "right" });
      y = H - 56;
    }
  };
  const ensure = (h: number) => {
    if (y - h < M + 30) newPage();
  };

  const heading = (title: string, note?: string) => {
    ensure(46);
    rect(M, y - 13, 3.5, 15, RED);
    text(title, M + 11, y - 10, 13.5, { f: bold });
    y -= 24;
    if (note) {
      for (const l of wrap(note, 9, CW)) {
        text(l, M, y - 7, 9, { color: SOFT });
        y -= 12.5;
      }
      y -= 4;
    }
  };
  const empty = (message: string) => {
    ensure(40);
    rect(M, y - 36, CW, 36, WARM);
    text(message, M + 14, y - 22, 10, { color: SOFT });
    y -= 52;
  };

  // ---------- Charts ----------

  type Series = { name: string; color: RGB; values: number[] };

  /** Bars side by side for each label (a day, an hour), with a scale, light grid lines and a legend. */
  const barChart = (title: string, note: string, labels: string[], series: Series[], plotH = 140) => {
    ensure(plotH + 100); // the heading, its note and the whole chart go on the same page
    heading(title, note);
    const total = series.reduce((sum, s) => sum + s.values.reduce((a, b) => a + b, 0), 0);
    if (labels.length === 0 || total === 0) return empty("Nothing was recorded in these dates.");
    ensure(plotH + 52);
    const x0 = M + 28;
    const x1 = M + CW;
    const top = y - 6;
    const bottom = top - plotH;
    const max = Math.max(...series.flatMap((s) => s.values), 1);
    const step = niceStep(max / 4);
    const scaleMax = Math.max(step * 4, step);
    for (let i = 0; i <= 4; i++) {
      const gy = bottom + (plotH * i) / 4;
      line(x0, gy, x1, gy, i === 0 ? GREY : EDGE, i === 0 ? 0.8 : 0.5);
      text(String(Math.round(step * i)), x0 - 5, gy - 2.6, 7.5, { color: SOFT, align: "right" });
    }
    const groupW = (x1 - x0) / labels.length;
    const barW = Math.min((groupW * 0.72) / series.length, 24);
    const every = Math.ceil(labels.length / 14);
    labels.forEach((label, i) => {
      const gx = x0 + groupW * i + (groupW - barW * series.length) / 2;
      series.forEach((s, k) => {
        const v = s.values[i] ?? 0;
        const h = (v / scaleMax) * plotH;
        if (h > 0) rect(gx + barW * k, bottom, barW - 1, h, s.color);
        if (labels.length <= 8 && v > 0) text(String(v), gx + barW * k + (barW - 1) / 2, bottom + h + 3, 7.5, { color: INK, align: "center" });
      });
      if (i % every === 0) text(label, x0 + groupW * i + groupW / 2, bottom - 11, 7.5, { color: SOFT, align: "center" });
    });
    // Legend, under the chart on the right
    let lx = x1;
    for (const s of [...series].reverse()) {
      const w = width(s.name, 8.5);
      lx -= w;
      text(s.name, lx, bottom - 28, 8.5, { color: SOFT });
      lx -= 14;
      rect(lx, bottom - 29, 9, 9, s.color);
      lx -= 16;
    }
    y = bottom - 44;
  };

  /** One bar for each row: a label, a bar sized to its share of the largest, and the number. */
  const rowChart = (title: string, note: string, rows: { label: string; value: number }[], color: RGB) => {
    ensure(Math.min(rows.length * 21 + 80, 380));
    heading(title, note);
    if (rows.length === 0 || rows.every((r) => r.value === 0)) return empty("Nothing was recorded in these dates.");
    const rowH = 21;
    ensure(rows.length * rowH + 12);
    const labelW = 150;
    const x0 = M + labelW + 8;
    const barMax = CW - labelW - 8 - 40;
    const max = Math.max(...rows.map((r) => r.value), 1);
    for (const r of rows) {
      text(fit(r.label, 9.5, labelW), M, y - 13, 9.5);
      rect(x0, y - 16, barMax, 13, WARM);
      const w = (r.value / max) * barMax;
      if (w > 0) rect(x0, y - 16, Math.max(w, 2), 13, color);
      text(String(r.value), x0 + Math.max(w, 2) + 6, y - 13, 9.5, { f: bold });
      y -= rowH;
    }
    y -= 10;
  };

  // ---------- Tables and tiles ----------

  const tiles = (items: { label: string; value: string; note?: string }[]) => {
    const gap = 10;
    const w = (CW - gap * 2) / 3;
    const h = 62;
    for (let i = 0; i < items.length; i += 3) {
      ensure(h + 10);
      items.slice(i, i + 3).forEach((it, k) => {
        const x = M + k * (w + gap);
        rect(x, y - h, w, h, WARM);
        rect(x, y - h, 3.5, h, RED);
        text(it.label, x + 14, y - 19, 9, { color: SOFT });
        text(it.value, x + 14, y - 44, 22, { f: bold });
        if (it.note) text(it.note, x + w - 10, y - 44, 8.5, { color: SOFT, align: "right" });
      });
      y -= h + gap;
    }
    y -= 4;
  };

  /** A table: bold headings on a warm band, numbers right-aligned, a hairline between rows, and the headings repeat on a new page. */
  const table = (t: Table, widths: number[], numeric: boolean[]) => {
    const total = widths.reduce((a, b) => a + b, 0);
    const cols = widths.map((x) => (x / total) * CW);
    const rowH = 19;
    const head = () => {
      ensure(rowH * 2);
      rect(M, y - rowH, CW, rowH, WARM);
      let x = M;
      t.headers.forEach((h, i) => {
        const pad = 6;
        const label = fit(h, 8.5, cols[i] - pad * 2, bold);
        if (numeric[i]) text(label, x + cols[i] - pad, y - 13, 8.5, { f: bold, color: SOFT, align: "right" });
        else text(label, x + pad, y - 13, 8.5, { f: bold, color: SOFT });
        x += cols[i];
      });
      y -= rowH;
    };
    head();
    for (const row of t.rows) {
      if (y - rowH < M + 30) {
        newPage();
        head();
      }
      let x = M;
      row.forEach((cell, i) => {
        const pad = 6;
        const label = fit(String(cell ?? ""), 9, cols[i] - pad * 2);
        if (numeric[i]) text(label, x + cols[i] - pad, y - 13, 9, { align: "right" });
        else text(label, x + pad, y - 13, 9);
        x += cols[i];
      });
      line(M, y - rowH, M + CW, y - rowH);
      y -= rowH;
    }
    y -= 16;
  };

  // ---------- The report ----------

  const summary = new Map(buildReportTable("parking-summary", input).rows.map((r) => [String(r[0]), r[1]]));
  const byDay = buildReportTable("activity-by-day", input);
  const hourly = buildReportTable("hourly-activity", input);
  const services = buildReportTable("service-comparison", input);
  const areas = buildReportTable("area-comparison", input);

  newPage(true);
  text(describeRange(input.range.from, input.range.to), M, y - 4, 15, { f: bold });
  text(`${input.service ? input.service.name : "All services"}  |  Made ${lagosStamp(input.generatedAt)}`, M, y - 22, 9.5, { color: SOFT });
  y -= 42;

  const stay = summary.get("Average stay (minutes)");
  tiles([
    { label: "Cars checked in", value: String(summary.get("Cars checked in") ?? 0) },
    { label: "Cars left", value: String(summary.get("Cars left") ?? 0) },
    { label: "Not checked out", value: String(summary.get("Not checked out") ?? 0) },
    { label: "Different vehicles", value: String(summary.get("Unique vehicles") ?? 0) },
    { label: "Average stay", value: stay === "" || stay === undefined ? "-" : String(stay), note: stay === "" || stay === undefined ? "" : Number(stay) === 1 ? "minute" : "minutes" },
    { label: "Parked right now", value: String(summary.get("Cars parked right now (live)") ?? 0), note: "live" },
  ]);

  // By day (a week at a time when the period is long, so the bars stay readable)
  let dayLabels = byDay.rows.map((r) => shortDay(String(r[0])));
  let dayIn = byDay.rows.map((r) => num(r[1]));
  let dayLeft = byDay.rows.map((r) => num(r[2]));
  if (byDay.rows.length > 31) {
    const weeks = Math.ceil(byDay.rows.length / 7);
    const sum = (arr: number[], w: number) => arr.slice(w * 7, w * 7 + 7).reduce((a, b) => a + b, 0);
    dayLabels = Array.from({ length: weeks }, (_, w) => shortDay(String(byDay.rows[w * 7]![0])));
    dayIn = Array.from({ length: weeks }, (_, w) => sum(dayIn, w));
    dayLeft = Array.from({ length: weeks }, (_, w) => sum(dayLeft, w));
  }
  const weekly = byDay.rows.length > 31;
  barChart(
    weekly ? "Check-ins and check-outs by week" : "Check-ins and check-outs by day",
    weekly ? "Each bar is a week, starting on the day shown." : "Cars checked in and cars released at the exit, for each day.",
    dayLabels,
    [
      { name: "Cars checked in", color: RED, values: dayIn },
      { name: "Cars left", color: GREY, values: dayLeft },
    ],
  );

  barChart(
    "Busy times of day",
    "Check-ins and check-outs for each hour, Lagos time, over the whole period.",
    hourly.rows.map((r) => String(num(String(r[0]).slice(0, 2)))),
    [
      { name: "Cars checked in", color: RED, values: hourly.rows.map((r) => num(r[1])) },
      { name: "Cars left", color: GREY, values: hourly.rows.map((r) => num(r[2])) },
    ],
    108,
  );

  rowChart("Check-ins by service", "How the services compare.", services.rows.map((r) => ({ label: String(r[0]), value: num(r[1]) })), RED);
  if (services.rows.length > 0) {
    table(
      { headers: ["Service", "Checked in", "Share %", "Left", "Not checked out", "Avg stay (min)", "Busiest hour"], rows: services.rows },
      [2.6, 1.6, 1.3, 1.1, 2.2, 1.9, 1.8],
      [false, true, true, true, true, true, true],
    );
  }

  rowChart("Check-ins by parking area", "How the parking areas compare.", areas.rows.map((r) => ({ label: String(r[0]), value: num(r[1]) })), RED);
  if (areas.rows.length > 0) {
    table(
      { headers: ["Parking area", "Checked in", "Share %", "Left", "Missed check-outs", "Avg stay (min)"], rows: areas.rows },
      [2.8, 1.6, 1.3, 1.1, 2.4, 1.9],
      [false, true, true, true, true, true],
    );
  }

  heading("Alerts and exceptions", "Everything raised in the period, resolved or not. Repeats are never merged.");
  const alertRows = REPORTS.filter((r) => r.category === "alerts").map((r): (string | number)[] => [r.name, buildReportTable(r.id, input).rows.length]);
  table({ headers: ["What happened", "Records"], rows: alertRows }, [6, 1.4], [false, true]);

  heading("How to read this report");
  for (const para of [
    "A visit belongs to the service date it was checked in on, and to the service it was checked in for. Cars checked in counts visits, so a car that came twice counts twice.",
    "Cars left counts visits released at the exit. Not checked out counts visits with no recorded check-out: closed as missed, or still parked. Average stay uses only completed visits.",
    "Parked right now is taken when this report is made and is not limited to the dates. Times are Lagos time. This report contains plates and counts, never drivers' names or phone numbers.",
  ]) {
    const lines = wrap(para, 9, CW);
    ensure(lines.length * 12.5 + 8);
    for (const l of lines) {
      text(l, M, y - 8, 9, { color: SOFT });
      y -= 12.5;
    }
    y -= 6;
  }

  // Footers, now that the number of pages is known
  pages.forEach((p, i) => {
    page = p;
    line(M, 34, W - M, 34);
    text("Celebration Church | Church Parking", M, 21, 8, { color: SOFT });
    text(`Page ${i + 1} of ${pages.length}`, W - M, 21, 8, { color: SOFT, align: "right" });
  });

  return { buffer: Buffer.from(await doc.save()), pages: pages.length };
}
