"use client";

import { useActionState } from "react";
import { signInStaff, type SignInState } from "./actions";

const field =
  "mt-1 w-full rounded-xl border-2 border-edge/40 bg-white px-4 py-3 text-lg focus:border-edge focus:outline-none";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInStaff, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block font-medium">
        Phone number
        <input name="phone" type="tel" inputMode="tel" autoComplete="username" required className={field} />
      </label>
      <label className="block font-medium">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={field} />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl border-2 border-danger bg-white p-3 font-medium text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-action px-6 py-4 text-lg font-semibold text-white hover:bg-action-dark disabled:opacity-60"
      >
        {pending ? "Please wait..." : "Sign in"}
      </button>
    </form>
  );
}
