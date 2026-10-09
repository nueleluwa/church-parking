"use client";

import { useState, useTransition } from "react";
import { errorBox, field, okBox, secondaryButton } from "@/components/ui";
import type { CorrectionContext } from "@/lib/correction-context";
import type { CorrectionAction } from "@/lib/rules";
import { correctAction } from "./ops-actions";

const OPTIONS: { value: CorrectionAction; label: string }[] = [
  { value: "change_area", label: "Move to another car park" },
  { value: "change_service", label: "Change the service" },
  { value: "reopen", label: "Undo: the car is still here" },
  { value: "close", label: "Close: the car has gone" },
];

/** Coordinator corrections (OP-3). Every one needs a reason and is written to the audit log. */
export function CorrectionPanel({ visitId, context }: { visitId: string; context: CorrectionContext }) {
  const [action, setAction] = useState<CorrectionAction>("change_area");
  const [areaId, setAreaId] = useState(context.areas[0]?.id);
  const [serviceId, setServiceId] = useState(context.services[0]?.id);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await correctAction({
        visitId,
        action,
        reason,
        areaId: action === "change_area" ? areaId : undefined,
        serviceId: action === "change_service" ? serviceId : undefined,
      });
      setMessage({ ok: r.ok, text: r.message ?? "Done." });
      if (r.ok) setReason("");
    });
  }

  return (
    <details className="mt-4 rounded-2xl border-2 border-edge/30 bg-page p-3 text-left">
      <summary className="cursor-pointer font-semibold">Corrections (coordinator)</summary>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <label className="block font-medium">
          What do you want to do?
          <select value={action} onChange={(e) => setAction(e.target.value as CorrectionAction)} className={field}>
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {action === "change_area" && (
          <label className="block font-medium">
            Car park
            <select value={areaId} onChange={(e) => setAreaId(Number(e.target.value))} className={field}>
              {context.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {action === "change_service" && (
          <label className="block font-medium">
            Service
            <select value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))} className={field}>
              {context.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block font-medium">
          Reason (required)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="For example: parked in the wrong car park"
            className={field}
          />
        </label>

        {message && (
          <p role={message.ok ? "status" : "alert"} className={message.ok ? okBox : errorBox}>
            {message.text}
          </p>
        )}

        <button disabled={pending} className={secondaryButton}>
          {pending ? "Please wait..." : "Save correction"}
        </button>
      </form>
    </details>
  );
}
