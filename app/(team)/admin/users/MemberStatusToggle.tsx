"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ds/Toast";
import { Spinner } from "@/components/Spinner";
import { setMemberActiveAction } from "../member-actions";

/** Switch one member's account off or on, asking first. Nothing is deleted. */
export function MemberStatusToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await setMemberActiveAction(id, !active);
      setMessage({ ok: Boolean(r.ok), text: r.message ?? r.error ?? "" });
      if (r.ok) toast.success("Member account updated.");
      setAsking(false);
      router.refresh();
    });
  }

  return (
    <div>
      <button type="button" onClick={() => setAsking(true)} disabled={pending} className="btn btn-outline">
        {active ? "Switch account off" : "Switch account on"}
      </button>
      {asking && (
        <div role="alertdialog" aria-label={active ? `Switch off ${name}` : `Switch on ${name}`} className="mt-3 rounded-xl border-2 border-edge bg-white p-3">
          <p className="font-medium">
            {active
              ? `Switch off ${name}? They cannot sign in or be checked in until you switch them on again. Their visits and saved cars are kept.`
              : `Switch on ${name}? They can sign in and be checked in again.`}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setAsking(false)} disabled={pending} className="btn btn-outline btn-sm flex-1 !rounded-full">
              Cancel
            </button>
            <button type="button" onClick={run} disabled={pending} className="btn btn-primary btn-sm flex-1 !rounded-full">
              {pending && <Spinner />}
              {active ? "Yes, switch off" : "Yes, switch on"}
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
