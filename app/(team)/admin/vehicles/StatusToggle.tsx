"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Spinner } from "@/components/Spinner";
import { setVehiclesActiveAction } from "../vehicle-actions";

/** Activate or deactivate one vehicle, asking first. An open visit is left alone. */
export function StatusToggle({ id, active, hasOpenVisit }: { id: string; active: boolean; hasOpenVisit: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await setVehiclesActiveAction([id], !active);
      setMessage({ ok: r.ok, text: r.message });
      setAsking(false);
      router.refresh();
    });
  }

  return (
    <div>
      <button type="button" onClick={() => setAsking(true)} disabled={pending} className="inline-flex min-h-11 items-center rounded-full border-2 border-edge/70 bg-white px-5 font-semibold hover:bg-page disabled:opacity-60">
        {active ? "Deactivate" : "Activate"}
      </button>
      {asking && (
        <div role="alertdialog" aria-label={active ? "Deactivate this vehicle" : "Activate this vehicle"} className="mt-3 rounded-xl border-2 border-edge bg-white p-3">
          <p className="font-medium">
            {active
              ? `Deactivate this vehicle? It cannot be checked in until it is activated again. ${hasOpenVisit ? "Its visit that is open now stays open, and the car can still be released at the exit." : "Its history stays."}`
              : "Activate this vehicle? It can be checked in again."}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAsking(false)} disabled={pending} className="min-h-10 flex-1 rounded-full border-2 border-edge/70 bg-white px-4 font-semibold hover:bg-page">
              Cancel
            </button>
            <button type="button" onClick={run} disabled={pending} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 font-semibold text-white hover:bg-accent-dark disabled:opacity-60">
              {pending && <Spinner />}
              Yes, {active ? "deactivate" : "activate"}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-3 rounded-xl border-2 p-3 font-medium ${message.ok ? "border-success bg-success-soft" : "border-danger bg-white text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
