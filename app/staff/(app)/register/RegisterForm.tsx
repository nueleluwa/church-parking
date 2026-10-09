"use client";

import { useActionState } from "react";
import { formatPlate } from "@/lib/rules/plates";
import { registerCar, type RegisterState } from "../actions";

const field =
  "mt-1 w-full rounded-xl border-2 border-edge/40 bg-white px-4 py-3 text-lg focus:border-edge focus:outline-none";

export function RegisterForm({ areas }: { areas: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerCar, {});

  if (state.reference) {
    return (
      <div className="rounded-card bg-card p-6 text-center shadow-sm">
        <p className="text-5xl font-extrabold">{formatPlate(state.plate ?? "")}</p>
        <p className="mt-4 text-ink-soft">Tell the driver to remember this reference</p>
        <p className="text-4xl font-extrabold tracking-widest">{state.reference}</p>
        <a href="/staff/register" className="mt-5 block rounded-full bg-brand px-6 py-4 text-lg font-semibold text-white">
          Add another car
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block font-medium">
        Area
        <select name="area" className={field}>
          {areas.map((a) => (
            <option key={a.slug} value={a.slug}>{a.name}</option>
          ))}
        </select>
      </label>
      <label className="block font-medium">
        Plate number
        <input name="plate" required autoCapitalize="characters" autoComplete="off" className={`${field} uppercase`} />
      </label>
      <label className="block font-medium">
        Phone number
        <input name="phone" type="tel" inputMode="tel" required placeholder="0803 123 4567" className={field} />
      </label>
      <label className="block font-medium">
        Name (if they want to give it)
        <input name="name" maxLength={80} className={field} />
      </label>
      {state.error && (
        <p role="alert" className="rounded-xl border-2 border-danger bg-white p-3 font-medium text-danger">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-full bg-brand px-6 py-4 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Please wait..." : "Add car"}
      </button>
    </form>
  );
}
