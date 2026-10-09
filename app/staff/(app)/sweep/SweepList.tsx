"use client";

import { useState, useTransition } from "react";
import { IconCheck } from "@/components/icons";
import { formatPlate } from "@/lib/rules/plates";
import type { SweepRow } from "@/lib/db";
import { sweepAction } from "../ops-actions";

type Mark = "gone" | "here";

/** Walk round the car parks and mark each car: still here, or gone (OP-2). */
export function SweepList({ rows, serviceId }: { rows: SweepRow[]; serviceId: number }) {
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function mark(row: SweepRow, gone: boolean) {
    start(async () => {
      const r = await sweepAction(row.visitId, gone, serviceId);
      if (r.ok) {
        setError(null);
        setMarks((m) => ({ ...m, [row.visitId]: gone ? "gone" : "here" }));
      } else {
        setError(r.message);
      }
    });
  }

  const left = rows.filter((r) => !marks[r.visitId]).length;
  const byArea = new Map<string, SweepRow[]>();
  for (const r of rows) byArea.set(r.areaName, [...(byArea.get(r.areaName) ?? []), r]);

  if (rows.length === 0) {
    return <p className="rounded-card bg-card p-5 font-medium shadow-sm">No cars left to check. All done.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-panel px-4 py-3 font-semibold">
        {left === 0 ? "All cars checked. Well done." : `${left} ${left === 1 ? "car" : "cars"} left to check`}
      </p>
      {error && (
        <p role="alert" className="rounded-2xl border-2 border-danger bg-white p-3 font-medium text-danger">
          {error}
        </p>
      )}

      {[...byArea.entries()].map(([area, list]) => (
        <section key={area}>
          <h2 className="mb-2 text-lg font-bold">{area}</h2>
          <ul className="space-y-2">
            {list.map((r) => {
              const m = marks[r.visitId];
              return (
                <li key={r.visitId} className={`rounded-2xl border-2 p-3 ${m ? "border-transparent bg-panel opacity-70" : "border-edge/30 bg-card"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xl font-extrabold tracking-wide">{formatPlate(r.plate)}</p>
                      <p className="text-sm text-ink-soft">
                        {r.firstName} · {r.isGuest ? "Guest" : "Member"} · {r.serviceName}
                      </p>
                    </div>
                    {m && (
                      <span className="flex items-center gap-1 font-bold">
                        <IconCheck className="h-5 w-5" />
                        {m === "gone" ? "Gone" : "Still here"}
                      </span>
                    )}
                  </div>
                  {!m && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => mark(r, false)}
                        disabled={pending}
                        className="rounded-full bg-action px-4 py-3 font-semibold text-white disabled:opacity-60"
                      >
                        Still here
                      </button>
                      <button
                        onClick={() => mark(r, true)}
                        disabled={pending}
                        className="rounded-full border-2 border-edge bg-white px-4 py-3 font-semibold disabled:opacity-60"
                      >
                        Gone
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
