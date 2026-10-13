"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Spinner } from "@/components/Spinner";
import { errorBox, field } from "@/components/ui";
import { findMembersAction, saveVehicleAction, type MemberChoice, type VehicleFormState } from "../vehicle-actions";

export type FormVehicle = {
  id: string;
  plate: string;
  type: string;
  make: string;
  colour: string;
  active: boolean;
  ownerId: string | null;
  ownerName: string | null;
};

const TYPES = [
  { value: "car", label: "Car" },
  { value: "suv", label: "SUV" },
  { value: "van", label: "Van" },
  { value: "bus", label: "Bus" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "other", label: "Other" },
];

const input = `${field} !mt-1 !py-2.5 !text-base`;
const note = "mt-1 text-sm font-medium text-accent";

/**
 * The add / edit form in the right-hand panel. Each problem shows beside its own field, the button is off while saving,
 * and the answer comes from the server (a plate already registered, a member not found, and so on).
 */
export function VehicleForm({ vehicle, doneHref }: { vehicle?: FormVehicle; doneHref: string }) {
  const router = useRouter();
  const editing = Boolean(vehicle);
  const [state, setState] = useState<VehicleFormState>({});
  const [pending, start] = useTransition();
  const [ownership, setOwnership] = useState<"member" | "guest">(vehicle ? (vehicle.ownerId ? "member" : "guest") : "guest");
  const [member, setMember] = useState<{ id: string; name: string } | null>(vehicle?.ownerId ? { id: vehicle.ownerId, name: vehicle.ownerName ?? "Member" } : null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberChoice[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errors = state.fieldErrors ?? {};

  function search(text: string) {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => setResults(await findMembersAction(text)), 250);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const result = await saveVehicleAction(data);
      setState(result);
      if (result.ok) {
        const plate = vehicle?.plate ?? String(data.get("plate") ?? "");
        const join = doneHref.includes("?") ? "&" : "?";
        router.push(`${doneHref}${join}notice=${editing ? "saved" : "added"}&plate=${encodeURIComponent(plate.toUpperCase().replace(/[^A-Z0-9]/g, ""))}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {vehicle && <input type="hidden" name="id" value={vehicle.id} />}

        <label className="block text-sm font-medium">
          Plate number <span className="text-accent">*</span>
          {editing ? (
            <>
              <input value={vehicle?.plate} readOnly aria-readonly="true" className={`${input} bg-page font-extrabold uppercase`} />
              <span className="mt-1 block text-xs text-ink-soft">A plate number is not changed once registered, because every visit is filed under it.</span>
            </>
          ) : (
            <input name="plate" autoComplete="off" autoCapitalize="characters" inputMode="text" maxLength={14} aria-invalid={Boolean(errors.plate)} aria-describedby={errors.plate ? "err-plate" : undefined} className={`${input} uppercase`} />
          )}
          {errors.plate && (
            <span id="err-plate" role="alert" className={`block ${note}`}>
              {errors.plate}
            </span>
          )}
        </label>

        <label className="block text-sm font-medium">
          Vehicle type
          <select name="type" defaultValue={vehicle?.type ?? ""} aria-invalid={Boolean(errors.type)} className={input}>
            <option value="">Not recorded</option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {errors.type && <span role="alert" className={`block ${note}`}>{errors.type}</span>}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0 text-sm font-medium">
            Make and model
            <input name="make" defaultValue={vehicle?.make ?? ""} autoComplete="off" placeholder="e.g. Toyota Corolla" aria-invalid={Boolean(errors.make)} className={input} />
            {errors.make && <span role="alert" className={`block ${note}`}>{errors.make}</span>}
          </label>
          <label className="block min-w-0 text-sm font-medium">
            Colour
            <input name="colour" defaultValue={vehicle?.colour ?? ""} autoComplete="off" placeholder="e.g. Silver" aria-invalid={Boolean(errors.colour)} className={input} />
            {errors.colour && <span role="alert" className={`block ${note}`}>{errors.colour}</span>}
          </label>
        </div>

        <fieldset className="text-sm font-medium">
          <legend>Ownership</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["member", "guest"] as const).map((o) => (
              <label key={o} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 ${ownership === o ? "border-edge bg-page" : "border-edge/25 bg-white"}`}>
                <input type="radio" name="ownership" value={o} checked={ownership === o} onChange={() => setOwnership(o)} className="h-4 w-4 accent-[#141414]" />
                {o === "member" ? "Member" : "Guest"}
              </label>
            ))}
          </div>
          <span className="mt-1 block text-xs font-normal text-ink-soft">
            {ownership === "member" ? "A member vehicle is linked to one member account. Their own check-in uses it." : "A guest vehicle is not linked to any member."}
          </span>
          {errors.ownership && <span role="alert" className={`block ${note}`}>{errors.ownership}</span>}
        </fieldset>

        {ownership === "member" && (
          <div className="text-sm font-medium">
            <label htmlFor="member-search">Linked member</label>
            <input type="hidden" name="memberId" value={member?.id ?? ""} />
            {member ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border-2 border-edge/25 bg-page px-3 py-2.5">
                <span data-testid="linked-member" className="font-semibold">
                  {member.name}
                </span>
                <button type="button" onClick={() => setMember(null)} className="font-semibold text-accent underline">
                  Change
                </button>
              </div>
            ) : (
              <>
                <input id="member-search" value={query} onChange={(e) => search(e.target.value)} autoComplete="off" placeholder="Search by name or phone number" aria-invalid={Boolean(errors.memberId)} className={input} />
                {results && (
                  <ul aria-label="Members found" className="mt-2 divide-y divide-edge/10 overflow-hidden rounded-xl border border-edge/20 bg-white">
                    {results.length === 0 && <li className="px-3 py-2.5 font-normal text-ink-soft">No member found.</li>}
                    {results.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setMember({ id: m.id, name: m.name });
                            setResults(null);
                            setQuery("");
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-page"
                        >
                          <span className="font-semibold">{m.name}</span>
                          <span className="text-xs font-normal text-ink-soft">…{m.phoneEnd}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {errors.memberId && <span role="alert" className={`block ${note}`}>{errors.memberId}</span>}
          </div>
        )}

        <label className="block text-sm font-medium">
          Status
          <select name="status" defaultValue={vehicle && !vehicle.active ? "inactive" : "active"} className={input}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <span className="mt-1 block text-xs font-normal text-ink-soft">
            An inactive vehicle cannot be checked in. Its history stays, and a visit that is open now is not closed.
          </span>
        </label>

        {state.error && (
          <p role="alert" className={errorBox}>
            {state.error}
          </p>
        )}
      </div>

      <div className="flex gap-3 border-t border-edge/15 bg-white px-5 py-4">
        <button type="button" onClick={() => router.push(doneHref)} disabled={pending} className="btn btn-outline flex-1">
          Cancel
        </button>
        <button disabled={pending} className="btn btn-primary flex-1">
          {pending && <Spinner />}
          {pending ? "Saving..." : "Save vehicle"}
        </button>
      </div>
    </form>
  );
}
