"use client";

import { useActionState, useRef, useState } from "react";
import { errorBox, field, primaryButton, secondaryButton } from "@/components/ui";
import { Spinner } from "@/components/Spinner";
import { formatPlate } from "@/lib/rules/plates";
import { checkInAsGuest, type CheckInState } from "./actions";

type Props = {
  areaSlug: string;
  services: { id: number; name: string; time: string }[];
  defaultServiceId: number;
};

export function GuestForm({ areaSlug, services, defaultServiceId }: Props) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInAsGuest, {});
  const formRef = useRef<HTMLFormElement>(null);
  // The details being confirmed. It belongs to one result of the action, so a new
  // result (such as an error) brings the form back for editing.
  const [confirming, setConfirming] = useState<{ plate: string; phone: string; at: CheckInState } | null>(null);
  const showConfirm = confirming !== null && confirming.at === state;

  function review() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    setConfirming({ plate: String(data.get("plate") ?? ""), phone: String(data.get("phone") ?? ""), at: state });
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="area" value={areaSlug} />

      <div className={showConfirm ? "hidden" : "space-y-4"}>
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
          <p role="alert" className={errorBox}>
            {state.error}
          </p>
        )}

        <button type="button" onClick={review} className={primaryButton}>
          Get my pass
        </button>
      </div>

      {showConfirm && confirming && (
        <div className="space-y-4">
          <p className="text-lg font-semibold">Please check your details</p>
          <div className="rounded-2xl border-2 border-edge bg-page p-4 text-center">
            <p className="text-sm text-ink-soft">Plate number</p>
            <p className="text-3xl font-extrabold tracking-wider">{formatPlate(confirming.plate)}</p>
            <p className="mt-3 text-sm text-ink-soft">Phone number</p>
            <p className="text-2xl font-bold">{confirming.phone}</p>
          </div>
          <p className="text-sm text-ink-soft">
            The attendant will check these when you leave. A wrong plate or number can hold up your car.
          </p>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending && <Spinner />}
            {pending ? "Please wait..." : "Yes, get my pass"}
          </button>
          <button type="button" onClick={() => setConfirming(null)} disabled={pending} className={secondaryButton}>
            Change something
          </button>
        </div>
      )}
    </form>
  );
}
