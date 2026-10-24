import Link from "next/link";
import { IconChevronRight } from "@/components/icons";

/**
 * A summary number: icon, label, value and one line of what it counts. Every module uses this one card, so the Dashboard, Visits,
 * Vehicles, Users, Sweep and Live Parking numbers have the same padding, height and type. It is a link to the list it counts.
 * `alert` makes the value and note red (only for something that needs attention); `tint` puts a pale red circle behind the icon.
 */
export function MetricCard({
  label,
  value,
  note,
  icon,
  href,
  id,
  alert = false,
  tint = false,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon: React.ReactNode;
  href?: string;
  id?: string;
  alert?: boolean;
  tint?: boolean;
}) {
  const body = (
    <>
      <span aria-hidden="true" className={`metric-icon ${tint || alert ? "!bg-blush !text-accent" : ""}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-ink-soft">{label}</span>
        <span
          data-testid={id}
          className={`mt-1 block ${typeof value === "string" && value.length > 6 ? "text-xl leading-tight font-extrabold" : "t-metric"} ${alert ? "text-accent" : ""}`}
        >
          {value}
        </span>
        {note && <span className={`mt-1.5 block text-xs leading-snug ${alert ? "font-semibold text-accent" : "text-ink-soft"}`}>{note}</span>}
      </span>
      {href && <IconChevronRight aria-hidden="true" className="mt-0.5 hidden h-5 w-5 shrink-0 text-ink-soft sm:block" />}
    </>
  );
  return href ? (
    <Link href={href} className="metric transition hover:bg-page">
      {body}
    </Link>
  ) : (
    <div className="metric">{body}</div>
  );
}

/** The row of summary cards: two across on a phone, four across on a wide screen. */
export function MetricRow({ label = "Summary", children }: { label?: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {children}
    </section>
  );
}
