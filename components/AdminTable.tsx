import type { ReactNode } from "react";

/**
 * A real table for wide screens, used by the admin lists. On a phone the same rows are shown as cards by
 * the page itself (put the cards in `<div className="lg:hidden">` and this table beside it), so nobody
 * scrolls sideways and desktop users get proper columns they can scan and compare.
 */
export function AdminTable({ label, columns, children }: { label: string; columns: string[]; children: ReactNode }) {
  return (
    <div className="hidden overflow-x-auto rounded-card bg-card shadow-sm lg:block">
      <table className="w-full text-left">
        <caption className="sr-only">{label}</caption>
        <thead className="border-b border-edge/20 text-sm text-ink-soft">
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-edge/15">{children}</tbody>
      </table>
    </div>
  );
}

export const cell = "px-4 py-3 align-middle";
