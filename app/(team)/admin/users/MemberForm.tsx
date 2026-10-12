"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PasswordField } from "@/components/PasswordField";
import { Spinner } from "@/components/Spinner";
import { errorBox, field } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { createMemberAction, type MemberFormState } from "../member-actions";

const input = `${field} !mt-1 !py-2.5 !text-base`;
const note = "mt-1 text-sm font-medium text-accent";
const MAX_CARS = 4;

/**
 * The add member form in the right-hand panel. Each problem shows beside its own field, the button is off while saving, and
 * the answer comes from the server (a phone number already in use, a car already saved to someone else, and so on).
 */
export function MemberForm({ doneHref }: { doneHref: string }) {
  const router = useRouter();
  const [state, setState] = useState<MemberFormState>({});
  const [pending, start] = useTransition();
  const [cars, setCars] = useState<number[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [active, setActive] = useState(true);
  const errors = state.fieldErrors ?? {};

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const result = await createMemberAction(data);
      setState(result);
      if (result.ok) {
        const join = doneHref.includes("?") ? "&" : "?";
        router.push(`${doneHref}${join}notice=added`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <label className="block text-sm font-medium">
          Full name <span className="text-accent">*</span>
          <input name="name" autoComplete="off" maxLength={80} placeholder="e.g. John Okafor" aria-invalid={Boolean(errors.name)} className={input} />
          {errors.name && (
            <span role="alert" className={`block ${note}`}>
              {errors.name}
            </span>
          )}
        </label>

        <label className="block text-sm font-medium">
          Phone number <span className="text-accent">*</span>
          <input name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0803 123 4567" aria-invalid={Boolean(errors.phone)} className={input} />
          {errors.phone && (
            <span role="alert" className={`block ${note}`}>
              {errors.phone}
            </span>
          )}
        </label>

        <div className="text-sm">
          <PasswordField label="PIN (4 numbers) *" name="pin" inputMode="numeric" maxLength={4} autoComplete="new-password" />
          <span className="mt-1 block text-xs text-ink-soft">The member signs in with their phone number and this PIN. Tell it to them in person, after checking who they are.</span>
          {errors.pin && (
            <span role="alert" className={`block ${note}`}>
              {errors.pin}
            </span>
          )}
        </div>

        <fieldset className="text-sm">
          <legend className="font-medium">Vehicle registration (optional)</legend>
          <p className="text-xs text-ink-soft">Add at least one vehicle to enable quick check-in for this member. Up to {MAX_CARS}.</p>
          <div className="mt-2 space-y-3">
            {cars.map((key, i) => (
              <div key={key} className="rounded-xl border border-edge/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Vehicle {i + 1}</p>
                  <button type="button" onClick={() => setCars((c) => c.filter((k) => k !== key))} className="text-sm font-semibold text-accent underline">
                    Remove
                  </button>
                </div>
                <label className="mt-2 block font-medium">
                  Plate number
                  <input name="plate" autoComplete="off" autoCapitalize="characters" maxLength={14} aria-label={`Plate number of vehicle ${i + 1}`} className={`${input} uppercase`} />
                </label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="block min-w-0 font-medium">
                    Make and model
                    <input name="make" autoComplete="off" aria-label={`Make and model of vehicle ${i + 1}`} className={input} />
                  </label>
                  <label className="block min-w-0 font-medium">
                    Colour
                    <input name="colour" autoComplete="off" aria-label={`Colour of vehicle ${i + 1}`} className={input} />
                  </label>
                </div>
                {errors.vehicles?.[i] && (
                  <span role="alert" className={`block ${note}`}>
                    {errors.vehicles[i]}
                  </span>
                )}
              </div>
            ))}
          </div>
          {cars.length < MAX_CARS && (
            <button
              type="button"
              onClick={() => {
                setCars((c) => [...c, nextKey]);
                setNextKey((k) => k + 1);
              }}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/40 bg-blush/40 font-semibold text-accent hover:bg-blush"
            >
              <IconPlus aria-hidden="true" className="h-5 w-5" />
              Add vehicle
            </button>
          )}
        </fieldset>

        <div className="text-sm">
          <p className="font-medium">Status</p>
          <input type="hidden" name="status" value={active ? "active" : "inactive"} />
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-label="Account is active"
            onClick={() => setActive((a) => !a)}
            className="mt-1 flex items-center gap-3 rounded-full py-1 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-edge"
          >
            <span aria-hidden="true" className={`flex h-7 w-12 items-center rounded-full px-0.5 transition ${active ? "justify-end bg-accent" : "justify-start bg-panel-dark"}`}>
              <span className="h-6 w-6 rounded-full bg-white shadow" />
            </span>
            <span className="font-semibold">{active ? "Active" : "Inactive"}</span>
          </button>
          <p className="mt-1 text-xs text-ink-soft">An inactive member cannot sign in or be checked in. Their history is kept.</p>
        </div>

        {state.error && (
          <p role="alert" className={errorBox}>
            {state.error}
          </p>
        )}
      </div>

      <div className="flex gap-3 border-t border-edge/15 bg-white px-5 py-4">
        <button type="button" onClick={() => router.push(doneHref)} disabled={pending} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-edge/70 bg-white px-6 font-semibold hover:bg-page disabled:opacity-60">
          Cancel
        </button>
        <button disabled={pending} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-6 font-semibold text-white hover:bg-accent-dark disabled:opacity-60">
          {pending && <Spinner />}
          {pending ? "Saving..." : "Save member"}
        </button>
      </div>
    </form>
  );
}
