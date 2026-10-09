"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { IconCheck } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { errorBox, field, primaryButton } from "@/components/ui";
import { formatPlate } from "@/lib/rules/plates";
import { checkInMember, type CheckInState } from "./actions";

type Props = {
  areaSlug: string;
  /** passToken is set when the car is already checked in today. */
  vehicles: { id: string; plate: string; passToken?: string }[];
  services: { id: number; name: string; time: string }[];
  defaultServiceId: number;
  noServiceMessage: string;
};

/**
 * Two taps: pick a car, then Check in (CI-4). With one car it is already
 * picked. A car already checked in today shows its pass instead, because a
 * pass is good for all three services.
 */
export function MemberCheckIn({ areaSlug, vehicles, services, defaultServiceId, noServiceMessage }: Props) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInMember, {});
  const free = vehicles.filter((v) => !v.passToken);
  const [vehicleId, setVehicleId] = useState(free.length === 1 ? free[0].id : "");
  const hasService = services.length > 0;

  return (
    <div className="space-y-4">
      {vehicles
        .filter((v) => v.passToken)
        .map((v) => (
          <div key={v.id} className="rounded-2xl border-2 border-edge bg-blush p-4">
            <p className="flex items-center gap-2 text-xl font-extrabold">
              <IconCheck className="h-6 w-6" />
              {formatPlate(v.plate)}
            </p>
            <p className="mt-1 font-medium">Already checked in. Your pass is good all day.</p>
            <Link href={`/p/${v.passToken}`} className={`${primaryButton} mt-3`}>
              Show my pass
            </Link>
          </div>
        ))}

      {free.length > 0 &&
        (hasService ? (
          <form action={action} className="space-y-4">
            <input type="hidden" name="area" value={areaSlug} />
            <input type="hidden" name="vehicleId" value={vehicleId} />

            <fieldset>
              <legend className="mb-2 font-medium">Which car?</legend>
              <div className="space-y-2">
                {free.map((v) => {
                  const selected = v.id === vehicleId;
                  return (
                    <button
                      type="button"
                      key={v.id}
                      aria-pressed={selected}
                      onClick={() => setVehicleId(v.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-4 text-left text-2xl font-extrabold ${
                        selected ? "border-edge bg-blush text-ink" : "border-transparent bg-page text-ink"
                      }`}
                    >
                      {formatPlate(v.plate)}
                      {selected && <IconCheck className="h-7 w-7" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <details>
              <summary className="cursor-pointer font-medium text-accent underline">Change service</summary>
              <select name="serviceId" defaultValue={defaultServiceId} className={field}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.time})
                  </option>
                ))}
              </select>
            </details>

            {state.error && (
              <p role="alert" className={errorBox}>
                {state.error}
              </p>
            )}

            <button disabled={pending || !vehicleId} className={primaryButton}>
              {pending && <Spinner />}
              {pending ? "Please wait..." : "Check in"}
            </button>
          </form>
        ) : (
          <p className="font-medium">{noServiceMessage}</p>
        ))}
    </div>
  );
}
