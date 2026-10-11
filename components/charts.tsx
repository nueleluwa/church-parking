import { clock, type Bucket } from "@/lib/rules/analytics";

/**
 * Simple charts drawn as inline SVG, so no chart library is shipped to phones. Each one has a plain-words
 * description for screen readers and a hidden table with the same numbers.
 */

const W = 600;
const H = 200;
const PAD = { left: 36, right: 12, top: 14, bottom: 26 };

/** Check-ins through the day: a filled line with the busiest point marked. */
export function TimeChart({ buckets, label }: { buckets: Bucket[]; label: string }) {
  if (buckets.length === 0) return <p className="text-ink-soft">No check-ins in this period.</p>;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const niceMax = max <= 5 ? 5 : Math.ceil(max / 10) * 10;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (buckets.length === 1 ? innerW / 2 : (i / (buckets.length - 1)) * innerW);
  const y = (n: number) => PAD.top + innerH - (n / niceMax) * innerH;
  const line = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(buckets.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const peak = buckets.reduce((best, b, i) => (b.count > buckets[best].count ? i : best), 0);
  // About five time labels along the bottom
  const every = Math.max(1, Math.ceil(buckets.length / 6));
  const grid = [0, 0.5, 1].map((f) => Math.round(niceMax * f));

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}. The busiest time was ${buckets[peak].label} with ${buckets[peak].count} check-ins.`}
        className="h-auto w-full"
      >
        {grid.map((g) => (
          <g key={g}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={PAD.left - 6} y={y(g) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.7}>
              {g}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--color-accent)" fillOpacity={0.12} />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(peak)} cy={y(buckets[peak].count)} r={5} fill="var(--color-accent)" stroke="white" strokeWidth={2} />
        {buckets.map((b, i) =>
          i % every === 0 ? (
            <text key={b.start} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.7}>
              {clock(b.start)}
            </text>
          ) : null,
        )}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Time</th>
            <th>Check-ins</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.start}>
              <td>{b.label}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export type DonutPart = { label: string; value: number; color: string };

/** A ring split into parts, with the total in the middle. */
export function Donut({ parts, total, label }: { parts: DonutPart[]; total: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const summary = parts.map((p) => `${p.label} ${p.value}`).join(", ");
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${label}: ${summary}. Total ${total}.`} className="h-36 w-36 shrink-0">
        <circle cx={70} cy={70} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={16} />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * c;
            const el = (
              <circle
                key={p.label}
                cx={70}
                cy={70}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={16}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += len;
            return el;
          })}
        <text x={70} y={68} textAnchor="middle" fontSize={26} fontWeight={800} fill="currentColor">
          {total}
        </text>
        <text x={70} y={86} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.7}>
          Total
        </text>
      </svg>
      <ul className="space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="text-ink-soft">{p.label}</span>
            <span className="ml-auto pl-4 font-bold">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One horizontal bar per car park. */
export function Bars({ rows }: { rows: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{r.label}</span>
            <span className="font-bold">
              {r.value}
              {r.note && <span className="ml-1 text-sm font-normal text-ink-soft">{r.note}</span>}
            </span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-page" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Vehicle activity: bars for check-ins and check-outs, a line for cars not yet checked out ----------

export type ActivityPoint = { label: string; checkedIn: number; left: number; notOut: number };

const AW = 640;
const AH = 260;
const APAD = { left: 40, right: 12, top: 14, bottom: 30 };

export function ActivityChart({ points, label, notOutLabel }: { points: ActivityPoint[]; label: string; notOutLabel: string }) {
  const max = Math.max(...points.flatMap((p) => [p.checkedIn, p.left, Math.max(p.notOut, 0)]), 1);
  const niceMax = max <= 5 ? 5 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  const innerW = AW - APAD.left - APAD.right;
  const innerH = AH - APAD.top - APAD.bottom;
  const slot = innerW / points.length;
  const barW = Math.max(2, Math.min(18, slot / 2.6));
  const cx = (i: number) => APAD.left + slot * i + slot / 2;
  const y = (n: number) => APAD.top + innerH - (Math.max(n, 0) / niceMax) * innerH;
  const every = Math.max(1, Math.ceil(points.length / 8));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${y(p.notOut).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => Math.round(niceMax * f));

  return (
    <figure>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />
          Checked in
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-ink-soft/40" />
          Left
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-ink" />
          {notOutLabel}
        </li>
      </ul>
      <svg viewBox={`0 0 ${AW} ${AH}`} role="img" aria-label={label} className="h-auto w-full">
        {ticks.map((g) => (
          <g key={g}>
            <line x1={APAD.left} x2={AW - APAD.right} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={APAD.left - 6} y={y(g) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.7}>
              {g}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.label + i}>
            <rect x={cx(i) - barW - 1} y={y(p.checkedIn)} width={barW} height={Math.max(0, y(0) - y(p.checkedIn))} rx={2} fill="var(--color-accent)" />
            <rect x={cx(i) + 1} y={y(p.left)} width={barW} height={Math.max(0, y(0) - y(p.left))} rx={2} fill="currentColor" fillOpacity={0.28} />
            <rect x={APAD.left + slot * i} y={APAD.top} width={slot} height={innerH} fill="transparent">
              <title>{`${p.label}: ${p.checkedIn} checked in, ${p.left} left, ${p.notOut} ${notOutLabel.toLowerCase()}`}</title>
            </rect>
            {i % every === 0 && (
              <text x={cx(i)} y={AH - 8} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.7}>
                {p.label}
              </text>
            )}
          </g>
        ))}
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={`d${i}`} cx={cx(i)} cy={y(p.notOut)} r={3} fill="currentColor" stroke="white" strokeWidth={1.5} />
        ))}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Time</th>
            <th>Checked in</th>
            <th>Left</th>
            <th>{notOutLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={p.label + i}>
              <td>{p.label}</td>
              <td>{p.checkedIn}</td>
              <td>{p.left}</td>
              <td>{p.notOut}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ---------- Columns: one bar for each label, in minutes shown as hours and minutes ----------

export function DurationColumns({ rows, label }: { rows: { label: string; value: number | null; note: string }[]; label: string }) {
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1);
  const niceMax = Math.ceil(max / 60) * 60 || 60;
  const W = 360;
  const H = 150;
  const pad = { left: 34, right: 6, top: 8, bottom: 24 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = innerW / rows.length;
  const y = (n: number) => pad.top + innerH - (n / niceMax) * innerH;
  const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.left} x2={W - pad.right} y1={y(niceMax * f)} y2={y(niceMax * f)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={pad.left - 5} y={y(niceMax * f) + 4} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.7}>
              {hours(niceMax * f)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <g key={r.label}>
            {r.value !== null && (
              <rect x={pad.left + slot * i + slot * 0.2} y={y(r.value)} width={slot * 0.6} height={Math.max(0, y(0) - y(r.value))} rx={2} fill="var(--color-accent)">
                <title>{`${r.label}: ${r.note}`}</title>
              </rect>
            )}
            <text x={pad.left + slot * i + slot / 2} y={H - 7} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.7}>
              {r.label}
            </text>
          </g>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Average stay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
