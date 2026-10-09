"use client";

import { useActionState } from "react";
import { errorBox, field, primaryButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import { signIn, type FormState } from "../actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  // The phone number is kept after a wrong PIN. The PIN is cleared on purpose.
  const { bind } = useFields({ phone: "" });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block font-medium">
        Phone number
        <input {...bind("phone")} type="tel" inputMode="tel" autoComplete="username" required className={field} />
      </label>
      <label className="block font-medium">
        PIN (4 numbers)
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          autoComplete="current-password"
          required
          className={field}
        />
      </label>
      {state.error && (
        <p role="alert" className={errorBox}>
          {state.error}
        </p>
      )}
      <button disabled={pending} className={primaryButton}>
        {pending ? "Please wait..." : "Sign in"}
      </button>
    </form>
  );
}
