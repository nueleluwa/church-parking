"use client";

import { useActionState, useState } from "react";
import { IconPlus } from "@/components/icons";
import { field, primaryButton, secondaryButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import { VehicleRow } from "@/components/VehicleRow";
import { Spinner } from "@/components/Spinner";
import { Messages } from "./AccountForms";
import { removeVehicle, updateVehicleDetails, type FormState } from "./actions";

type Vehicle = { id: string; plate: string; make: string | null; colour: string | null };

/**
 * One saved car on My vehicles: the illustration, plate and details, and a menu (the three
 * dots) with the two things a member can do to a car: edit its details, or remove it.
 */
export function VehicleItem({ vehicle }: { vehicle: Vehicle }) {
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const [menu, setMenu] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(updateVehicleDetails, {});
  const { bind } = useFields({ make: vehicle.make ?? "", colour: vehicle.colour ?? "" });

  // Close the form after a successful save
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setMode("view");
  }

  return (
    <li className="rounded-2xl border-2 border-edge/20 bg-card p-3">
      <VehicleRow
        plate={vehicle.plate}
        make={vehicle.make}
        colour={vehicle.colour}
        trailing={
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label={`Options for ${vehicle.plate}`}
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-2xl font-bold leading-none hover:bg-page"
            >
              ⋮
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-2xl border-2 border-edge bg-card shadow-lg">
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMode("edit");
                    setMenu(false);
                  }}
                  className="block w-full px-4 py-3 text-left font-semibold hover:bg-page"
                >
                  Edit details
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMode("remove");
                    setMenu(false);
                  }}
                  className="block w-full border-t border-edge/15 px-4 py-3 text-left font-semibold text-danger hover:bg-page"
                >
                  Remove car
                </button>
              </div>
            )}
          </div>
        }
      />

      {mode === "edit" && (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="vehicleId" value={vehicle.id} />
          <label className="block font-medium">
            Make and model
            <input {...bind("make")} maxLength={40} autoComplete="off" placeholder="Toyota Corolla" className={field} />
          </label>
          <label className="block font-medium">
            Colour
            <input {...bind("colour")} maxLength={20} autoComplete="off" placeholder="Silver" className={field} />
          </label>
          <Messages state={state} />
          <div className="grid grid-cols-2 gap-3">
            <button disabled={pending} className={primaryButton}>
              {pending && <Spinner />}
              {pending ? "Saving..." : "Save details"}
            </button>
            <button type="button" disabled={pending} onClick={() => setMode("view")} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "remove" && (
        <form action={removeVehicle} className="mt-3 space-y-3 rounded-2xl border-2 border-danger p-3">
          <input type="hidden" name="vehicleId" value={vehicle.id} />
          <p className="font-semibold">Remove this car from your account? You can add it again later.</p>
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-full bg-danger px-4 py-3 font-semibold text-white">Yes, remove</button>
            <button type="button" onClick={() => setMode("view")} className={secondaryButton}>
              Keep it
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

export function AddVehicleToggle({ children, startOpen = false }: { children: React.ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border-2 border-edge bg-white px-4 py-2 font-semibold"
      >
        <IconPlus className="h-4 w-4" />
        Add vehicle
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
