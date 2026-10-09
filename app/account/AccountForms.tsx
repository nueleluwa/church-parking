"use client";

import { useActionState, useState } from "react";
import { errorBox, field, okBox, primaryButton, secondaryButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import { addVehicle, changePin, deleteAccount, type FormState } from "./actions";

export function Messages({ state }: { state: FormState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className={errorBox}>
          {state.error}
        </p>
      )}
      {state.ok && <p role="status" className={okBox}>{state.ok}</p>}
    </>
  );
}

export function AddVehicleForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addVehicle, {});
  const { bind, set } = useFields({ plate: "", make: "", colour: "" });

  // After a successful save the plate box is emptied; after an error it keeps what was typed.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) {
      set("plate", "");
      set("make", "");
      set("colour", "");
    }
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block font-medium">
        Plate number
        <input
          {...bind("plate")}
          required
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="PHC 234 AB"
          className={`${field} uppercase`}
        />
      </label>
      <label className="block font-medium">
        Make and model <span className="font-normal text-ink-soft">(optional)</span>
        <input {...bind("make")} maxLength={40} autoComplete="off" placeholder="Toyota Corolla" className={field} />
      </label>
      <label className="block font-medium">
        Colour <span className="font-normal text-ink-soft">(optional)</span>
        <input {...bind("colour")} maxLength={20} autoComplete="off" placeholder="Silver" className={field} />
      </label>
      <Messages state={state} />
      <button disabled={pending} className={primaryButton}>
        {pending ? "Please wait..." : "Save car"}
      </button>
    </form>
  );
}

export function ChangePinForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePin, {});
  const pin = {
    type: "password",
    inputMode: "numeric" as const,
    maxLength: 4,
    required: true,
    className: field,
  };
  return (
    <form action={action} className="space-y-3">
      <label className="block font-medium">
        Your PIN now
        <input name="current" autoComplete="current-password" {...pin} />
      </label>
      <label className="block font-medium">
        New PIN (4 numbers)
        <input name="pin" autoComplete="new-password" {...pin} />
      </label>
      <label className="block font-medium">
        Type the new PIN again
        <input name="pin2" autoComplete="new-password" {...pin} />
      </label>
      <Messages state={state} />
      <button disabled={pending} className={secondaryButton}>
        {pending ? "Please wait..." : "Change PIN"}
      </button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, {});
  return (
    <form action={action} className="space-y-3">
      <p>
        This removes your name, phone number and saved cars. Your past visits stay in the church
        records, with no name on them.
      </p>
      <label className="block font-medium">
        Your PIN
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          required
          autoComplete="current-password"
          className={field}
        />
      </label>
      <label className="flex items-center gap-3 font-medium">
        <input type="checkbox" name="confirm" value="yes" className="h-6 w-6" />
        Yes, delete my account
      </label>
      <Messages state={state} />
      <button disabled={pending} className="w-full rounded-full border-2 border-danger bg-white px-6 py-4 text-lg font-semibold text-danger disabled:opacity-60">
        {pending ? "Please wait..." : "Delete my account"}
      </button>
    </form>
  );
}
