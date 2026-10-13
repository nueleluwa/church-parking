"use client";

import { useActionState } from "react";
import { errorBox, field, primaryButton } from "@/components/ui";
import { PasswordField } from "@/components/PasswordField";
import { useFields } from "@/components/useFields";
import { signInStaff, type SignInState } from "./actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInStaff, {});
  // The phone number is kept after a wrong password. The password is cleared on purpose.
  const { bind } = useFields({ phone: "" });
  return (
    <form noValidate action={action} className="space-y-4">
      <label className="block font-medium">
        Phone number
        <input {...bind("phone")} type="tel" inputMode="tel" autoComplete="username" required className={field} />
      </label>
      <PasswordField label="Password" name="password" autoComplete="current-password" required />
      {state.error && (
        <p role="alert" className={errorBox}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Please wait..." : "Sign in"}
      </button>
    </form>
  );
}
