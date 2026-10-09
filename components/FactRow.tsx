import type { ReactNode } from "react";

/**
 * The list that holds the fact rows. It is the "container" the rows measure themselves against, so
 * each row can switch between a table-like row and a stacked one depending on the room it has.
 */
export function FactList({ className = "", children }: { className?: string; children: ReactNode }) {
  return <dl className={`@container ${className}`}>{children}</dl>;
}

/**
 * One labelled fact (service, parking area, check-in time) for the confirmation and the
 * pass. With room it reads like a table row: label on the left, value on the right. On
 * the narrowest phones the label sits above the value, so neither is squeezed or cut off.
 * Put these inside a FactList.
 *
 * The row is a single <div> holding the term and its value directly: that is the only
 * structure screen readers accept inside a description list.
 */
export function FactRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 @[15rem]:flex-row @[15rem]:items-start @[15rem]:justify-between @[15rem]:gap-3">
      <dt className="flex shrink-0 items-center gap-2 text-ink-soft">
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 break-words pl-7 font-semibold @[15rem]:pl-0 @[15rem]:text-right">{children}</dd>
    </div>
  );
}
