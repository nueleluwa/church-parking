"use client";

import { useState, useTransition } from "react";
import { revealPhone } from "../../../staff/actions";

/** "Show number": the full phone number appears only when this is tapped, and every tap is written to the audit log (R-9). */
export function RevealPhone({ visitId, last4 }: { visitId: string; last4: string }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span>
      <span className="block">{phone ?? `•••• ${last4}`}</span>
      {!phone && (
        <button
          onClick={() =>
            start(async () => {
              const r = await revealPhone(visitId);
              if ("phone" in r) setPhone(r.phone);
              else setError(r.error);
            })
          }
          disabled={pending}
          className="text-sm font-semibold text-accent underline"
        >
          Show number
        </button>
      )}
      {error && <span className="block text-sm text-danger">{error}</span>}
    </span>
  );
}
