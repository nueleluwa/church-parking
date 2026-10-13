"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useToast } from "@/components/ds/Toast";
import { Spinner } from "@/components/Spinner";
import { errorBox, okBox, primaryButton, redButton, secondaryButton } from "@/components/ui";
import type { AdminState } from "./admin-actions";

/**
 * A form for the admin screens. It sends the fields to a server action, shows the answer
 * (an error or a saved message) and keeps what was typed when something is wrong.
 */
export function AdminForm({
  action,
  children,
  submitLabel,
  busyLabel = "Saving...",
  clearOnSuccess = false,
  variant = "primary",
  savedMessage = "Changes saved successfully.",
}: {
  action: (formData: FormData) => Promise<AdminState>;
  children: ReactNode;
  submitLabel: string;
  busyLabel?: string;
  /** Empty the fields after a good save (for "add" forms). */
  clearOnSuccess?: boolean;
  variant?: "primary" | "secondary" | "red";
  /** What the toast says after the server confirms. The form still shows its own, more specific, message beside the button. */
  savedMessage?: string;
}) {
  const toast = useToast();
  const [state, setState] = useState<AdminState>({});
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      let result: AdminState;
      try {
        result = await action(data);
      } catch {
        // The request itself failed (no signal, or the server could not answer). What was typed stays, so it can be sent again.
        result = { error: "We could not reach the server. Check your connection and try again." };
        toast.error("The change was not saved. Check your connection and try again.");
      }
      setState(result);
      if (result.ok) {
        toast.success(savedMessage);
        if (clearOnSuccess) formRef.current?.reset();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3">
      {children}
      {state.error && (
        <p role="alert" className={errorBox}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className={okBox}>
          {state.message ?? "Saved."}
        </p>
      )}
      <button disabled={pending} className={variant === "primary" ? primaryButton : variant === "red" ? redButton : secondaryButton}>
        {pending && <Spinner />}
        {pending ? busyLabel : submitLabel}
      </button>
    </form>
  );
}
