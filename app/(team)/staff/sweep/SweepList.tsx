"use client";

import { useState, useTransition } from "react";
import { IconCheck } from "@/components/icons";
import { Plate } from "@/components/Plate";
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

  const [confirmingAll, setConfirmingAll] = useState(false);

  /** Mark every car that is still unchecked as Still here, one audited decision each. "Gone" is never done in bulk. */
  function markRestHere() {
    setConfirmingAll(false);
    start(async () => {
      for (const row of rows) {
        if (marks[row.visitId]) continue;
        const r = await sweepAction(row.visitId, false, serviceId);
        if (!r.ok) {
          setError(r.message);
          return;
        }
        setError(null);
        setMarks((m) => ({ ...m, [row.visitId]: "here" }));
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
      {left > 1 &&
        (confirmingAll ? (
          <div role="group" aria-label="Confirm" className="space-y-2 rounded-2xl border-2 border-edge/30 bg-card p-3">
            <p className="font-semibold">
              Mark all {left} remaining cars as Still here? Walk the car parks first. Cars that have gone must be marked Gone
              one by one.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={markRestHere} disabled={pending} className="rounded-full bg-action px-4 py-3 font-semibold text-white">
                Yes, they are all here
              </button>
              <button onClick={() => setConfirmingAll(false)} className="rounded-full border-2 border-edge bg-white px-4 py-3 font-semibold">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingAll(true)}
            disabled={pending}
            className="w-full rounded-full border-2 border-edge bg-white px-4 py-3 font-semibold disabled:opacity-60"
          >
            Mark the rest Still here
          </button>
        ))}
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Plate plate={r.plate} size="md" align="start" />
                      <p className="mt-1 flex flex-nowrap items-center gap-1.5 whitespace-nowrap text-sm text-ink-soft">
                        <span className="truncate">{r.firstName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{r.isGuest ? "Guest" : "Member"}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{r.serviceName}</span>
                      </p>
                    </div>
                    {m && (
                      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-bold">
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
