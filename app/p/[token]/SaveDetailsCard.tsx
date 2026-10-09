"use client";

import { useActionState } from "react";
import { errorBox, field, redButton } from "@/components/ui";
import { Spinner } from "@/components/Spinner";
import { saveGuestDetails, type SaveDetailsState } from "./actions";

/**
 * For a guest: turn the details they gave into a member account by choosing a PIN.
 * It is optional, and it is the only thing a guest is ever asked beyond name, phone and plate.
 */
export function SaveDetailsCard({ token }: { token: string }) {
  const [state, action, pending] = useActionState<SaveDetailsState, FormData>(saveGuestDetails, {});
  const pin = {
    type: "password",
    inputMode: "numeric" as const,
    maxLength: 4,
    autoComplete: "new-password",
    required: true,
    className: field,
  };
  return (
    <details className="rounded-card border-2 border-edge/30 bg-card p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-bold">Save your details</span>
          <span className="block text-sm text-ink-soft">
            Choose a PIN to make check-in faster next time. You do not have to.
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-2xl font-bold leading-none">
          ›
        </span>
      </summary>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="token" value={token} />
        <label className="block font-medium">
          Choose a PIN (4 numbers)
          <input name="pin" {...pin} />
        </label>
        <label className="block font-medium">
          Type the PIN again
          <input name="pin2" {...pin} />
        </label>
        {state.error && (
          <p role="alert" className={errorBox}>
            {state.error}
          </p>
        )}
        <button disabled={pending} className={redButton}>
          {pending && <Spinner />}
          {pending ? "Please wait..." : "Create my account"}
        </button>
      </form>
    </details>
  );
}
