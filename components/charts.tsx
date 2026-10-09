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
