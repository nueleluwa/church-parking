"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ds/Toast";
import { doesNotMatch, releaseCar } from "../../../staff/actions";
import { outlineButton, redButton } from "@/components/ui";

/**
 * Release the car, or mark it as not matching (which holds it and alerts the coordinator), straight from the
 * visit. Each one asks once, in the page, before it does anything. Both are recorded with the person's name.
 */
export function VisitActions({ visitId, plate }: { visitId: string; plate: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState<"release" | "mismatch" | null>(null);
  const toast = useToast();
  const [pending, start] = useTransition();

  function confirm() {
    const action = ask;
    start(async () => {
      const result = action === "release" ? await releaseCar(visitId, "search") : await doesNotMatch(visitId, plate);
      if (result.ok) {
        setAsk(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  if (ask) {
    return (
      <div role="alertdialog" aria-label="Please confirm" className="space-y-3 rounded-card border-2 border-edge bg-white p-4">
        <p className="font-semibold">
          {ask === "release" ? "Release this car now? It will be recorded as a release by hand." : "Hold this car and alert the coordinator?"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={confirm} disabled={pending} className={redButton}>
            {pending ? "Please wait…" : "Yes, continue"}
          </button>
          <button type="button" onClick={() => setAsk(null)} disabled={pending} className={outlineButton}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => setAsk("release")} className={redButton}>
        Release car
      </button>
      <button type="button" onClick={() => setAsk("mismatch")} className={outlineButton}>
        Mark as mismatch
      </button>
    </div>
  );
}
