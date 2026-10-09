"use client";

import { useActionState, useRef, useState } from "react";
import { BlockedCard } from "@/components/BlockedCard";
import { Plate } from "@/components/Plate";
import { Spinner } from "@/components/Spinner";
import { errorBox, field, outlineButton, redButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import { keyForAttempt } from "@/lib/check-in-key";
import { normalisePlate } from "@/lib/rules/plates";
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
  const [dismissed, setDismissed] = useState<CheckInState | null>(null);
  const [changingService, setChangingService] = useState(false);
  // A one-time key for this attempt, filled in the moment the form is sent, so a retry after a dropped signal
  // gets the same pass back instead of an error
  const keyRef = useRef<HTMLInputElement>(null);
  function stampKey() {
    const plate = normalisePlate(values.plate);
    if (keyRef.current) keyRef.current.value = plate.length >= 4 ? keyForAttempt(`guest:${areaSlug}`, plate) : "";
  }
  const showBlocked = Boolean(state.blocked) && dismissed !== state;

  function review() {
    if (formRef.current?.reportValidity()) setConfirmedAt(state);
  }

  return (
    <form ref={formRef} action={action} onSubmitCapture={stampKey} className="space-y-4">
      <input type="hidden" name="area" value={areaSlug} />
      <input type="hidden" name="key" defaultValue="" ref={keyRef} />

      {showBlocked && <BlockedCard message={state.error ?? ""} onBack={() => setDismissed(state)} />}

      <div className={showConfirm || showBlocked ? "hidden" : "space-y-4"}>
        {changingService ? (
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
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-blush px-4 py-3">
            <input type="hidden" name="serviceId" value={values.serviceId} />
            <p className="min-w-0">
              <span className="block text-sm text-ink-soft">Service</span>
              <span className="block font-bold">
                {services.find((s) => String(s.id) === values.serviceId)?.name} (
                {services.find((s) => String(s.id) === values.serviceId)?.time})
              </span>
            </p>
            {services.length > 1 && (
              <button type="button" onClick={() => setChangingService(true)} className="shrink-0 font-semibold text-accent underline">
                Change
              </button>
            )}
          </div>
        )}

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

        {state.error && !state.blocked && (
          <p role="alert" className={errorBox}>
            {state.error}
          </p>
        )}

        <button type="button" onClick={review} className={redButton}>
          Get my pass
        </button>
      </div>

      {showConfirm && !showBlocked && (
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
          <button type="submit" disabled={pending} className={redButton}>
            {pending && <Spinner />}
            {pending ? "Please wait..." : "Yes, get my pass"}
          </button>
          <button type="button" onClick={() => setConfirmedAt(null)} disabled={pending} className={outlineButton}>
            Change something
          </button>
        </div>
      )}
    </form>
  );
}
