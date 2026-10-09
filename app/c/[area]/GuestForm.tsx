"use client";

import { useActionState } from "react";
import { checkInAsGuest, type CheckInState } from "./actions";

type Props = {
  areaSlug: string;
  services: { id: number; name: string; time: string }[];
  defaultServiceId: number;
};

const field =
  "mt-1 w-full rounded-xl border-2 border-edge/40 bg-white px-4 py-3 text-lg focus:border-edge focus:outline-none";

export function GuestForm({ areaSlug, services, defaultServiceId }: Props) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInAsGuest, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="area" value={areaSlug} />

      <label className="block font-medium">
        Service
        <select name="serviceId" defaultValue={defaultServiceId} className={field}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.time})
            </option>
          ))}
        </select>
      </label>

      <label className="block font-medium">
        Your name
        <input name="name" autoComplete="name" required maxLength={80} className={field} />
      </label>

      <label className="block font-medium">
        Phone number
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="0803 123 4567"
          className={field}
        />
      </label>

      <label className="block font-medium">
        Plate number
        <input
          name="plate"
          autoCapitalize="characters"
          autoComplete="off"
          required
          placeholder="PHC 234 AB"
          className={`${field} uppercase`}
        />
      </label>

      {state.error && (
        <p role="alert" className="rounded-xl border-2 border-danger bg-white p-3 font-medium text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-brand px-6 py-4 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Please wait..." : "Get my pass"}
      </button>
    </form>
  );
}
