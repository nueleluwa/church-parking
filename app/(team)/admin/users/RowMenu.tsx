"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DeleteButton } from "@/components/ds/Bulk";
import { useToast } from "@/components/ds/Toast";
import { IconMore } from "@/components/icons";
import { deleteMembersAction } from "../admin-actions";
import { setMemberActiveAction } from "../member-actions";

const MEMBER_DELETE_NOTE =
  "This removes the member's account, PIN and saved cars. Their past visits stay in the records, shown as Deleted member. A member with a car parked right now cannot be deleted.";

/**
 * The "..." menu on a member row: the actions that really exist. View details, set a new PIN (on the member's page), and
 * switch the account off or on, or delete it. Each asks first.
 */
export function RowMenu({ id, name, active }: { id: string; name: string; active: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await setMemberActiveAction(id, !active);
      if (r.ok) toast.success("Member account updated.");
      else toast.error(r.error ?? r.message ?? "The account was not changed.");
      setAsking(false);
      setOpen(false);
      router.refresh();
    });
  }

  const item = "block w-full px-4 py-2.5 text-left font-semibold hover:bg-page";
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${name}`}
        onClick={() => {
          setOpen((o) => !o);
          setAsking(false);
        }}
        className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-page"
      >
        <IconMore aria-hidden="true" className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-edge/20 bg-white shadow-lg">
          {!asking ? (
            <>
              <Link role="menuitem" href={`/admin/members/${id}`} className={item}>
                View details
              </Link>
              <Link role="menuitem" href={`/admin/members/${id}#pin`} className={item}>
                Set a new PIN
              </Link>
              <button role="menuitem" type="button" onClick={() => setAsking(true)} className={`${item} text-accent`}>
                {active ? "Switch account off" : "Switch account on"}
              </button>
              <DeleteButton
                id={id}
                label={name}
                noun="member"
                text="Delete member"
                className={`${item} text-accent`}
                consequence={MEMBER_DELETE_NOTE}
                action={deleteMembersAction}
              />
            </>
          ) : (
            <div role="alertdialog" aria-label={active ? `Switch off ${name}` : `Switch on ${name}`} className="p-3">
              <p className="text-sm font-medium">
                {active ? `Switch off ${name}? They cannot sign in or be checked in. Their history is kept.` : `Switch on ${name}?`}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setAsking(false)} disabled={pending} className="min-h-10 flex-1 rounded-full border-2 border-edge/70 bg-white px-3 text-sm font-semibold hover:bg-page">
                  Cancel
                </button>
                <button type="button" onClick={run} disabled={pending} className="min-h-10 flex-1 rounded-full bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-60">
                  {active ? "Yes, switch off" : "Yes, switch on"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
