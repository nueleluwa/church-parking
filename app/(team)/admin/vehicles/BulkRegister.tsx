"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useToast } from "@/components/ds/Toast";
import { Spinner } from "@/components/Spinner";
import { setVehiclesActiveAction, type BulkVehicleState } from "../vehicle-actions";

/**
 * Wraps the register so rows can be ticked. The only bulk actions are Activate and Deactivate: both are reversible, neither
 * touches a visit, and each vehicle is its own audited change. There is no bulk delete. The answer says exactly how many worked.
 * Ticks apply to this page only.
 */
export function BulkRegister({ children }: { children: ReactNode }) {
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [ask, setAsk] = useState<"deactivate" | "activate" | null>(null);
  const [result, setResult] = useState<BulkVehicleState | null>(null);
  const [pending, start] = useTransition();

  const boxes = () => Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? []);
  const chosen = () => [...new Set(boxes().filter((b) => b.checked).map((b) => b.value))];

  function changed(e: React.ChangeEvent<HTMLDivElement>) {
    const t = e.target as HTMLInputElement;
    if (t.dataset.selectAll !== undefined) {
      const table = t.closest("table");
      table?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((b) => (b.checked = t.checked));
    } else if (t.name !== "ids") return;
    setResult(null);
    setAsk(null);
    setCount(chosen().length);
  }

  function clear() {
    boxes().forEach((b) => (b.checked = false));
    root.current?.querySelectorAll<HTMLInputElement>("input[data-select-all]").forEach((b) => (b.checked = false));
    setCount(0);
    setAsk(null);
  }

  function run(active: boolean) {
    const ids = chosen();
    start(async () => {
      const answer = await setVehiclesActiveAction(ids, active);
      setResult(answer);
      if (answer.ok) toast.success("Vehicle status updated.");
      setAsk(null);
      clear();
    });
  }

  const word = ask === "activate" ? "Activate" : "Deactivate";
  return (
    <div ref={root} onChange={changed}>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`mb-3 rounded-xl border-2 p-3 font-medium ${result.ok ? "border-success bg-success-soft" : "border-danger bg-white text-danger"}`}>
          {result.message}
        </p>
      )}
      {count > 0 && (
        <div className="mb-3 rounded-xl border border-edge/20 bg-page p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p data-testid="selected-count" aria-live="polite" className="mr-auto font-semibold">
              {count} {count === 1 ? "vehicle" : "vehicles"} selected
            </p>
            <button type="button" onClick={() => setAsk("deactivate")} disabled={pending} className="min-h-10 rounded-full border-2 border-edge/70 bg-white px-4 text-sm font-semibold hover:bg-page disabled:opacity-60">
              Deactivate selected
            </button>
            <button type="button" onClick={() => setAsk("activate")} disabled={pending} className="min-h-10 rounded-full border-2 border-edge/70 bg-white px-4 text-sm font-semibold hover:bg-page disabled:opacity-60">
              Activate selected
            </button>
            <button type="button" onClick={clear} disabled={pending} className="min-h-10 px-2 text-sm font-semibold text-accent underline">
              Clear
            </button>
          </div>
          {ask && (
            <div role="alertdialog" aria-label={`${word} ${count} vehicles`} className="mt-3 rounded-xl border-2 border-edge bg-white p-3">
              <p className="font-medium">
                {word} {count} {count === 1 ? "vehicle" : "vehicles"}?{" "}
                {ask === "deactivate"
                  ? "They cannot be checked in until they are activated again. Their history stays, and a visit that is open now is not closed."
                  : "They can be checked in again."}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setAsk(null)} disabled={pending} className="btn btn-outline btn-sm flex-1 !rounded-full">
                  Cancel
                </button>
                <button type="button" onClick={() => run(ask === "activate")} disabled={pending} className="btn btn-primary btn-sm flex-1 !rounded-full">
                  {pending && <Spinner />}
                  Yes, {word.toLowerCase()}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
