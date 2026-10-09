"use client";

import { useActionState, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { errorBox, field, okBox, primaryButton, secondaryButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import type { AreaRecord } from "@/lib/db";
import { renameAreaAction, type RenameState } from "../actions";

/** One car park: its name with a Rename button that opens a small form in place. */
function AreaRow({ area }: { area: AreaRecord }) {
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
    <li className="rounded-card bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{shownName}</p>
          <p className="truncate text-sm text-ink-soft">QR address /c/{area.slug}</p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            aria-label={`Rename ${shownName}`}
            className="shrink-0 rounded-full border-2 border-edge bg-white px-4 py-2 font-semibold"
          >
            Rename
          </button>
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

      {!editing && state.ok && (
        <p role="status" className={`${okBox} mt-3`}>
          Name saved.
        </p>
      )}
    </li>
  );
}

export function AreaList({ areas }: { areas: AreaRecord[] }) {
  return (
    <ul className="space-y-3">
      {areas.map((a) => (
        <AreaRow key={a.id} area={a} />
      ))}
    </ul>
  );
}
