"use client";

import { useActionState, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { formatPlate } from "@/lib/rules/plates";
import { registerCar, type RegisterState } from "../actions";

const field =
  "mt-1 w-full rounded-xl border-2 border-edge/40 bg-white px-4 py-3 text-lg focus:border-edge focus:outline-none";

export function RegisterForm({ areas }: { areas: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerCar, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [forMember, setForMember] = useState(false);

  /** Submit again for the member: the flag is set first so it goes with this submit only. */
  function registerForMember() {
    flushSync(() => setForMember(true));
    formRef.current?.requestSubmit();
    setForMember(false);
  }

  if (state.reference) {
    return (
      <div className="rounded-card bg-card p-6 text-center shadow-sm">
        <p className="text-5xl font-extrabold">{formatPlate(state.plate ?? "")}</p>
        <p className="mt-4 text-ink-soft">Tell the driver to remember this reference</p>
        <p className="text-4xl font-extrabold tracking-widest">{state.reference}</p>
        <a href="/staff/register" className="mt-5 block rounded-full bg-action px-6 py-4 text-lg font-semibold text-white">
          Add another car
        </a>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="forMember" value={forMember ? "yes" : ""} />
      <label className="block font-medium">
        Area
        <select name="area" defaultValue={state.values?.area} className={field}>
          {areas.map((a) => (
            <option key={a.slug} value={a.slug}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="block font-medium">
        Plate number
        <input name="plate" required defaultValue={state.values?.plate} autoCapitalize="characters" autoComplete="off" className={`${field} uppercase`} />
      </label>
      <label className="block font-medium">
        Phone number
        <input name="phone" type="tel" inputMode="tel" defaultValue={state.values?.phone} placeholder="0803 123 4567" className={field} />
      </label>
      <label className="block font-medium">
        Name (if they want to give it)
        <input name="name" maxLength={80} defaultValue={state.values?.name} className={field} />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl border-2 border-danger bg-white p-3 font-medium text-danger">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-full bg-action px-6 py-4 text-lg font-semibold text-white hover:bg-action-dark disabled:opacity-60"
      >
        {pending ? "Please wait..." : "Add car"}
      </button>
      {state.memberPlate && (
        <button
          type="button"
          onClick={registerForMember}
          disabled={pending}
          className="w-full rounded-full border-2 border-edge bg-white px-6 py-4 text-lg font-semibold disabled:opacity-60"
        >
          Register for the member
        </button>
      )}
    </form>
  );
}
