"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { useToast } from "@/components/ds/Toast";
import { firstProblem } from "@/components/validate";
import { Spinner } from "@/components/Spinner";
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
  savedMessage,
}: {
  action: (formData: FormData) => Promise<AdminState>;
  children: ReactNode;
  submitLabel: string;
  busyLabel?: string;
  /** Empty the fields after a good save (for "add" forms). */
  clearOnSuccess?: boolean;
  variant?: "primary" | "secondary" | "red";
  /** What the toast says after the server confirms. Without it, the server's own message is used. */
  savedMessage?: string;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Our own required-field message, instead of the browser's speech bubble (which looks different on every device)
    const problem = firstProblem(e.currentTarget, true);
    if (problem) {
      toast.error(problem.message);
      problem.el.focus();
      return;
    }
    const data = new FormData(e.currentTarget);
    start(async () => {
      let result: AdminState;
      try {
        result = await action(data);
      } catch {
        // The request itself failed (no signal, or the server could not answer). What was typed stays, so it can be sent again.
        result = { error: "The change was not saved. Check your connection and try again." };
      }
      if (result.error) toast.error(result.error);
      if (result.ok) {
        // The form's own saved message if it has one; else the server's words (a plain "Saved." does not count); else a standard line
        toast.success(savedMessage ?? (result.message && result.message !== "Saved." ? result.message : "Changes saved successfully."));
        if (clearOnSuccess) formRef.current?.reset();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-3">
      {children}
      <div className="pt-1 sm:flex sm:justify-end">
        <button disabled={pending} className={`btn w-full sm:w-auto sm:min-w-44 ${variant === "primary" ? "btn-dark" : variant === "red" ? "btn-primary" : "btn-outline"}`}>
          {pending && <Spinner />}
          {pending ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
