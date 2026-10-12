"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { errorBox, field, okBox, primaryButton, secondaryButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import type { AreaRecord } from "@/lib/db";
import { AdminForm } from "../../AdminForm";
import { setAreaActiveAction } from "../../admin-actions";
import { renameAreaAction, type RenameState } from "../../actions";
import { Chip } from "../ui";

export type AreaRow = AreaRecord & { parkedNow: number };

/** One car park: its name, address, how many cars are in it now, a Rename form that opens in place, and Switch off / on. */
function Row({ area }: { area: AreaRow }) {
  const [state, action, pending] = useActionState<RenameState, FormData>(renameAreaAction, {});
  const [editing, setEditing] = useState(false);
  const { bind } = useFields({ name: area.name });

  // After a successful save, close the form. The name shown comes from the saved result.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setEditing(false);
  }
  const shownName = state.ok && state.name ? state.name : area.name;

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
            <span className="truncate">{shownName}</span>
            <Chip tone={area.active ? "on" : "off"}>{area.active ? "Active" : "Off"}</Chip>
          </p>
          <p className="text-sm text-ink-soft">
            QR address /c/{area.slug} · {area.parkedNow} {area.parkedNow === 1 ? "car" : "cars"} parked now
          </p>
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-2">
            {area.active && (
              <Link href={`/admin/settings/qr-signs/${area.slug}`} aria-label={`QR sign for ${shownName}`} className="inline-flex min-h-10 items-center rounded-lg border border-edge/30 bg-white px-4 font-semibold hover:bg-page">
                QR sign
              </Link>
            )}
            <button onClick={() => setEditing(true)} aria-label={`Rename ${shownName}`} className="inline-flex min-h-10 items-center rounded-lg border border-edge/30 bg-white px-4 font-semibold hover:bg-page">
              Rename
            </button>
          </div>
        )}
      </div>

      {editing && (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="areaId" value={area.id} />
          <label className="block font-medium">
            New name
            <input {...bind("name")} required maxLength={60} autoFocus autoComplete="off" className={field} />
          </label>
          {state.error && (
            <p role="alert" className={errorBox}>
              {state.error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button disabled={pending} className={primaryButton}>
              {pending && <Spinner />}
              {pending ? "Saving..." : "Save name"}
            </button>
            <button type="button" disabled={pending} onClick={() => setEditing(false)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!editing && (
        <details className="mt-3">
          <summary className="cursor-pointer font-semibold">{area.active ? "Switch off" : "Switch on"}</summary>
          <div className="mt-3 max-w-md">
            <AdminForm action={setAreaActiveAction} submitLabel={area.active ? "Switch off this car park" : "Switch on this car park"} variant="secondary">
              <input type="hidden" name="areaId" value={area.id} />
              <input type="hidden" name="active" value={area.active ? "no" : "yes"} />
              <p className="text-sm text-ink-soft">
                {area.active
                  ? "Drivers will not be able to check in here. A car park with cars still parked in it cannot be switched off. Past visits keep their car park."
                  : "Drivers can check in here again."}
              </p>
            </AdminForm>
          </div>
        </details>
      )}

      {!editing && state.ok && (
        <p role="status" className={`${okBox} mt-3`}>
          Name saved.
        </p>
      )}
    </li>
  );
}

export function AreaList({ areas }: { areas: AreaRow[] }) {
  return (
    <ul className="divide-y divide-edge/15">
      {areas.map((a) => (
        <Row key={a.id} area={a} />
      ))}
    </ul>
  );
}
