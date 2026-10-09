"use client";

import { useActionState, useState } from "react";
import { errorBox, field, primaryButton } from "@/components/ui";
import { formatPlate } from "@/lib/rules/plates";
import { checkInMember, type CheckInState } from "./actions";

type Props = {
  areaSlug: string;
  vehicles: { id: string; plate: string }[];
  services: { id: number; name: string; time: string }[];
  defaultServiceId: number;
};

/** Two taps: pick a car, then Check in (CI-4). With one car it is already picked. */
export function MemberCheckIn({ areaSlug, vehicles, services, defaultServiceId }: Props) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInMember, {});
  const [vehicleId, setVehicleId] = useState(vehicles.length === 1 ? vehicles[0].id : "");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="area" value={areaSlug} />
      <input type="hidden" name="vehicleId" value={vehicleId} />

      <fieldset>
        <legend className="mb-2 font-medium">Which car?</legend>
        <div className="space-y-2">
          {vehicles.map((v) => {
            const selected = v.id === vehicleId;
            return (
              <button
                type="button"
                key={v.id}
                aria-pressed={selected}
                onClick={() => setVehicleId(v.id)}
                className={`w-full rounded-xl border-2 px-4 py-4 text-left text-2xl font-extrabold ${
                  selected ? "border-edge bg-select text-ink" : "border-transparent bg-page text-ink"
                }`}
              >
                {formatPlate(v.plate)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <details>
        <summary className="cursor-pointer font-medium text-brand underline">Change service</summary>
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
        {pending ? "Please wait..." : "Check in"}
      </button>
    </form>
  );
}
