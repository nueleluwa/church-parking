"use client";

import { useActionState, useRef, useState } from "react";
import { Plate } from "@/components/Plate";
import { Spinner } from "@/components/Spinner";
import { errorBox, field, primaryButton, secondaryButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import { checkInAsGuest, type CheckInState } from "./actions";

type Props = {
  areaSlug: string;
  services: { id: number; name: string; time: string }[];
  defaultServiceId: number;
};

export function GuestForm({ areaSlug, services, defaultServiceId }: Props) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInAsGuest, {});
  const formRef = useRef<HTMLFormElement>(null);
  const { values, bind } = useFields({
    serviceId: String(defaultServiceId),
    name: "",
    phone: "",
    plate: "",
  });
  // Confirming belongs to one result of the action, so a new result (such as an
  // error) brings the form back for editing, with everything still filled in.
  const [confirmedAt, setConfirmedAt] = useState<CheckInState | null>(null);
  const showConfirm = confirmedAt === state;

  function review() {
    if (formRef.current?.reportValidity()) setConfirmedAt(state);
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="area" value={areaSlug} />

      <div className={showConfirm ? "hidden" : "space-y-4"}>
        <label className="block font-medium">
          Service
          <select {...bind("serviceId")} className={field}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.time})
              </option>
            ))}
          </select>
        </label>

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
            autoComplete="tel"
            required
            placeholder="0803 123 4567"
            className={field}
          />
        </label>

        <label className="block font-medium">
          Plate number
          <input
            {...bind("plate")}
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

      {showConfirm && (
        <div className="space-y-4">
          <p className="text-lg font-semibold">Please check your details</p>
          <div className="rounded-2xl border-2 border-edge bg-page p-4 text-center">
            <p className="text-sm text-ink-soft">Plate number</p>
            <Plate plate={values.plate} size="lg" className="mt-1" />
            <p className="mt-3 text-sm text-ink-soft">Phone number</p>
            <p className="text-2xl font-bold">{values.phone}</p>
          </div>
          <p className="text-sm text-ink-soft">
            The attendant will check these when you leave. A wrong plate or number can hold up your car.
          </p>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending && <Spinner />}
            {pending ? "Please wait..." : "Yes, get my pass"}
          </button>
          <button type="button" onClick={() => setConfirmedAt(null)} disabled={pending} className={secondaryButton}>
            Change something
          </button>
        </div>
      )}
    </form>
  );
}
