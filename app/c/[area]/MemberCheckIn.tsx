"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { BlockedCard } from "@/components/BlockedCard";
import { FactRow } from "@/components/FactRow";
import { IconCheck, IconClock, IconPin, IconPlus } from "@/components/icons";
import { Plate } from "@/components/Plate";
import { Spinner } from "@/components/Spinner";
import { errorBox, field, primaryButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import { VehicleImage } from "@/components/VehicleImage";
import { VehicleRow } from "@/components/VehicleRow";
import { describeVehicle } from "@/lib/rules/vehicle";
import { checkInMember, type CheckInState } from "./actions";

type Vehicle = { id: string; plate: string; make: string | null; colour: string | null; passToken?: string };

type Props = {
  areaSlug: string;
  areaName: string;
  /** passToken is set when the car is already checked in today. */
  vehicles: Vehicle[];
  services: { id: number; name: string; time: string }[];
  defaultServiceId: number;
  noServiceMessage: string;
  addVehicleHref: string;
};

/**
 * A returning member's check-in in two taps: choose a car, then Check in. The service
 * is chosen for them (rule R-1) and the car park comes from the QR sign, so the second
 * screen only confirms. A car already checked in today shows its pass instead, because
 * a pass is good for all three services.
 */
export function MemberCheckIn({
  areaSlug,
  areaName,
  vehicles,
  services,
  defaultServiceId,
  noServiceMessage,
  addVehicleHref,
}: Props) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInMember, {});
  const free = vehicles.filter((v) => !v.passToken);
  const [vehicleId, setVehicleId] = useState(free.length === 1 ? free[0].id : "");
  const [step, setStep] = useState<"choose" | "confirm">(free.length === 1 ? "confirm" : "choose");
  const [changingService, setChangingService] = useState(false);
  const [dismissed, setDismissed] = useState<CheckInState | null>(null);
  const { values, bind } = useFields({ serviceId: String(defaultServiceId) });

  const chosen = free.find((v) => v.id === vehicleId);
  const service = services.find((s) => String(s.id) === values.serviceId) ?? services[0];
  const hasService = services.length > 0;

  return (
    <div className="space-y-4">
      {vehicles
        .filter((v) => v.passToken)
        .map((v) => (
          <div key={v.id} className="rounded-2xl border-2 border-success bg-success-soft p-4">
            <p className="flex items-center gap-2 font-bold">
              <IconCheck className="h-5 w-5 shrink-0" />
              Already checked in. Your pass is good all day.
            </p>
            <VehicleRow plate={v.plate} make={v.make} colour={v.colour} className="mt-3" />
            <Link href={`/p/${v.passToken}`} className={`${primaryButton} mt-3`}>
              Show my pass
            </Link>
          </div>
        ))}

      {free.length > 0 &&
        (!hasService ? (
          <p className="font-medium">{noServiceMessage}</p>
        ) : step === "choose" || !chosen ? (
          <div className="space-y-3">
            <p className="font-medium">Which car are you checking in?</p>
            <div role="group" aria-label="Your cars" className="space-y-2">
              {free.map((v) => {
                const selected = v.id === vehicleId;
                return (
                  <button
                    type="button"
                    key={v.id}
                    aria-pressed={selected}
                    onClick={() => {
                      setVehicleId(v.id);
                      setStep("confirm");
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left ${
                      selected ? "border-edge bg-blush" : "border-edge/25 bg-card"
                    }`}
                  >
                    <VehicleRow plate={v.plate} make={v.make} colour={v.colour} className="flex-1" />
                    <span
                      aria-hidden="true"
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? "border-edge bg-action text-white" : "border-edge/40 bg-white"
                      }`}
                    >
                      {selected && <IconCheck className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <Link
              href={addVehicleHref}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-edge/50 px-4 py-3 font-semibold"
            >
              <IconPlus className="h-5 w-5" />
              Add a new vehicle
            </Link>
          </div>
        ) : state.blocked && dismissed !== state ? (
          <BlockedCard message={state.error ?? ""} onBack={() => setDismissed(state)} />
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="area" value={areaSlug} />
            <input type="hidden" name="vehicleId" value={chosen.id} />
            <input type="hidden" name="serviceId" value={service?.id ?? ""} />

            <div className="rounded-2xl border-2 border-edge/25 bg-card p-4 text-center">
              <div className="flex flex-col items-center">
                <VehicleImage size="lg" />
                <Plate plate={chosen.plate} size="lg" className="mt-2" />
                {describeVehicle(chosen) && (
                  <p className="mt-2 text-base font-medium text-ink-soft">{describeVehicle(chosen)}</p>
                )}
              </div>
            </div>

            <dl className="divide-y divide-edge/15 rounded-2xl border-2 border-edge/25 bg-card px-4">
              <FactRow icon={<IconClock className="h-5 w-5" />} label="Service">
                <span className="block">{service?.name}</span>
                <span className="block whitespace-nowrap text-sm font-medium text-ink-soft">{service?.time}</span>
                {services.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setChangingService((v) => !v)}
                    className="mt-1 text-sm font-medium text-accent underline"
                  >
                    {changingService ? "Done" : "Change service"}
                  </button>
                )}
              </FactRow>
              {changingService && (
                <div className="py-3">
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
                </div>
              )}
              <FactRow icon={<IconPin className="h-5 w-5" />} label="Parking area">
                <span data-area>{areaName}</span>
                <span className="block text-sm font-medium text-ink-soft">From the QR sign</span>
              </FactRow>
            </dl>

            {state.error && !state.blocked && (
              <p role="alert" className={errorBox}>
                {state.error}
              </p>
            )}

            <button disabled={pending} className={primaryButton}>
              {pending ? <Spinner /> : <IconCheck />}
              {pending ? "Please wait..." : "Check in"}
            </button>
            {free.length > 1 && (
              <button
                type="button"
                onClick={() => setStep("choose")}
                disabled={pending}
                className="w-full text-center font-medium text-accent underline"
              >
                Choose a different car
              </button>
            )}
          </form>
        ))}

      {free.length === 0 && vehicles.length > 0 && (
        <Link href={addVehicleHref} className="block text-center font-medium text-accent underline">
          Add another vehicle
        </Link>
      )}
    </div>
  );
}
