"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { BlockedCard } from "@/components/BlockedCard";
import { FactRow } from "@/components/FactRow";
import { IconCheck, IconClock, IconLock, IconPin, IconPlus } from "@/components/icons";
import { Plate } from "@/components/Plate";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { Spinner } from "@/components/Spinner";
import { Stepper } from "@/components/Stepper";
import { TitleHeader } from "@/components/TitleHeader";
import { errorBox, field, redButton } from "@/components/ui";
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
 * A returning member's check-in in two taps: choose a car, then Check in. The service is
 * chosen for them (rule R-1) and the car park comes from the QR sign, so the second screen
 * only confirms. A car already checked in today shows its pass instead, because a pass is
 * good for all three services. This component draws the whole screen, header included,
 * because the header title changes with the step ("Check In", then "Confirm Check In").
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
  const confirming = free.length > 0 && hasService && step === "confirm" && Boolean(chosen);
  const manyCars = free.length > 1;

  return (
    <>
      <TitleHeader
        title={confirming ? "Confirm Check In" : "Check In"}
        onBack={confirming && manyCars ? () => setStep("choose") : undefined}
        backHref={confirming && manyCars ? undefined : "/account"}
      />
      <main className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-6">
        {free.length > 0 && hasService && (
          <Stepper steps={["Vehicle", "Confirm"]} current={confirming ? 2 : 1} />
        )}

        {vehicles
          .filter((v) => v.passToken)
          .map((v) => (
            <div key={v.id} className="rounded-card border-2 border-success bg-success-soft p-4">
              <p className="flex items-center gap-2 font-bold">
                <IconCheck className="h-5 w-5 shrink-0" />
                Already checked in. Your pass is good all day.
              </p>
              <VehicleRow plate={v.plate} make={v.make} colour={v.colour} className="mt-3" />
              <Link href={`/p/${v.passToken}`} className={`${redButton} mt-3`}>
                Show my pass
              </Link>
            </div>
          ))}

        {free.length > 0 && !hasService && <p className="font-medium">{noServiceMessage}</p>}

        {free.length > 0 && hasService && !confirming && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Select a vehicle</h2>
            <div role="group" aria-label="Your cars" className="space-y-3">
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
                      selected ? "border-accent bg-blush" : "border-edge/15 bg-card"
                    }`}
                  >
                    <VehicleRow plate={v.plate} make={v.make} colour={v.colour} className="flex-1" />
                    <span
                      aria-hidden="true"
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? "border-accent bg-accent text-white" : "border-edge/30 bg-white"
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
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-edge/30 bg-card px-4 py-3.5 font-semibold"
            >
              <IconPlus className="h-5 w-5" />
              Add a new vehicle
            </Link>
          </section>
        )}

        {confirming && chosen && state.blocked && dismissed !== state && (
          <BlockedCard message={state.error ?? ""} onBack={() => setDismissed(state)} />
        )}

        {confirming && chosen && !(state.blocked && dismissed !== state) && (
          <form action={action} className="space-y-5">
            <input type="hidden" name="area" value={areaSlug} />
            <input type="hidden" name="vehicleId" value={chosen.id} />
            <input type="hidden" name="serviceId" value={service?.id ?? ""} />

            <div className="flex flex-col items-center text-center">
              <VehicleImage size="xl" />
              <Plate plate={chosen.plate} size="xl" variant="plain" className="mt-1" />
              {describeVehicle(chosen) && (
                <p className="mt-1 text-lg font-medium text-ink-soft">{describeVehicle(chosen)}</p>
              )}
            </div>

            <dl className="divide-y divide-accent/15 rounded-card bg-blush px-4">
              <FactRow icon={<IconClock className="h-5 w-5" />} label="Service">
                <span className="block">{service?.name}</span>
                <span className="block whitespace-nowrap text-sm font-medium text-ink-soft">{service?.time}</span>
                {services.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setChangingService((v) => !v)}
                    className="mt-1 text-sm font-semibold text-accent underline"
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
                <span className="mt-0.5 flex items-start gap-1 text-sm font-medium text-ink-soft @[15rem]:justify-end">
                  <IconLock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Selected from the QR sign</span>
                </span>
              </FactRow>
            </dl>

            {state.error && !state.blocked && (
              <p role="alert" className={errorBox}>
                {state.error}
              </p>
            )}

            <button disabled={pending} className={redButton}>
              {pending ? <Spinner /> : <IconCheck />}
              {pending ? "Please wait..." : "Check in"}
            </button>
            {manyCars && (
              <button
                type="button"
                onClick={() => setStep("choose")}
                disabled={pending}
                className="w-full text-center font-semibold text-accent underline"
              >
                Choose a different car
              </button>
            )}
          </form>
        )}

        {free.length === 0 && vehicles.length > 0 && (
          <Link href={addVehicleHref} className="block text-center font-semibold text-accent underline">
            Add another vehicle
          </Link>
        )}

        <PrivacyNotice />
      </main>
    </>
  );
}
