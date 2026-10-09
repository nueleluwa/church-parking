"use client";

import { useActionState } from "react";
import { errorBox, field, redButton } from "@/components/ui";
import { PasswordField } from "@/components/PasswordField";
import { useFields } from "@/components/useFields";
import { signUp, type FormState } from "../actions";

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  // Name and phone are kept after an error. The PINs are cleared on purpose.
  const { bind } = useFields({ name: "", phone: "" });
  const pinProps = { inputMode: "numeric" as const, maxLength: 4, autoComplete: "new-password", required: true };
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block font-medium">
        Your name
        <input {...bind("name")} autoComplete="name" required maxLength={80} className={field} />
      </label>
      <label className="block font-medium">
        Phone number
        <input
          {...bind("phone")}
          type="tel"
          inputMode="tel"
          autoComplete="username"
          required
          placeholder="0803 123 4567"
          className={field}
        />
      </label>
      <PasswordField label="Choose a PIN (4 numbers)" name="pin" {...pinProps} />
      <PasswordField label="Type the PIN again" name="pin2" {...pinProps} />
      {state.error && (
        <p role="alert" className={errorBox}>
          {state.error}
        </p>
      )}
      <button disabled={pending} className={redButton}>
        {pending ? "Please wait..." : "Create my account"}
      </button>
    </form>
  );
}
