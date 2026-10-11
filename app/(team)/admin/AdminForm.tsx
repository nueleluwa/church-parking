"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
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
}: {
  action: (formData: FormData) => Promise<AdminState>;
  children: ReactNode;
  submitLabel: string;
  busyLabel?: string;
  /** Empty the fields after a good save (for "add" forms). */
  clearOnSuccess?: boolean;
  variant?: "primary" | "secondary" | "red";
}) {
  const [state, setState] = useState<AdminState>({});
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const result = await action(data);
      setState(result);
      if (result.ok && clearOnSuccess) formRef.current?.reset();
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
