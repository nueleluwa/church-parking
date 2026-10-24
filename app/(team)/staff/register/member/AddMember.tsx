"use client";

import { useActionState, useState, useTransition } from "react";
import { IconCheckAnimated } from "@/components/icons";
import { card, errorBox, field, outlineButton, redButton } from "@/components/ui";
import { useFields } from "@/components/useFields";
import type { MemberMatchCard } from "@/lib/rules";
import { addMember, searchMembers, type AddMemberState } from "../../member-actions";

const note = "mt-1 text-sm font-medium text-danger";

/** Look first, then add. The server refuses a phone number or plate that is already a member, whatever was searched. */
export function AddMember() {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<MemberMatchCard[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const [searching, startSearch] = useTransition();

  const [state, action, pending] = useActionState<AddMemberState, FormData>(addMember, {});
  const { bind } = useFields({ name: "", phone: "", plate: "", make: "", colour: "" });
  const errors = state.fieldErrors ?? {};

  function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startSearch(async () => {
      const result = await searchMembers(query);
      if ("error" in result) {
        setSearchError(result.error);
        setCards(null);
      } else {
        setSearchError("");
        setCards(result.cards);
      }
    });
  }

  if (state.added) {
    return (
      <div className="space-y-4">
        <section role="status" className="rounded-card border-2 border-success bg-success-soft p-5 text-center">
          <span className="check-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
            <IconCheckAnimated className="h-8 w-8" />
          </span>
          <h2 className="mt-2 text-2xl font-extrabold">Member added</h2>
          <p className="mt-1 text-ink-soft">
            {state.added.firstName} can now check in with their phone number. Ask them to scan the sign again.
          </p>
        </section>
        <a href="/staff/register/member" className={redButton}>
          Add another member
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={card} aria-labelledby="check-first">
        <h2 id="check-first" className="text-lg font-bold">
          1. Check first
        </h2>
        <p className="text-ink-soft">Is this driver already a member? Look up their phone number or plate.</p>
        <form onSubmit={search} noValidate className="mt-3 space-y-3">
          <label className="block font-medium">
            Phone number or plate
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="0803 123 4567"
              className={field}
            />
          </label>
          <button disabled={searching} className={outlineButton}>
            {searching ? "Looking..." : "Check"}
          </button>
        </form>
        {searchError && (
          <p role="alert" className={`${errorBox} mt-3`}>
            {searchError}
          </p>
        )}
        {cards && cards.length === 0 && (
          <p role="status" className="mt-3 font-medium">
            No member found. You can add them below.
          </p>
        )}
        {cards && cards.length > 0 && (
          <ul aria-label="Members found" className="mt-3 space-y-2">
            {cards.map((c, i) => (
              <li key={i} className="rounded-2xl border-2 border-edge/30 p-3">
                <p className="font-bold">
                  {c.firstName} <span className="font-medium text-ink-soft">{c.phoneEnding}</span>
                </p>
                <p>{c.plates.length ? c.plates.join(", ") : "No vehicle saved"}</p>
                <p className="font-semibold">{c.active ? "Already a member" : "Already a member, switched off. Ask an administrator."}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="add-member">
        <h2 id="add-member" className="text-lg font-bold">
          2. Add the member
        </h2>
        <form action={action} noValidate className="mt-3 space-y-4">
          <label className="block font-medium">
            Full name
            <input {...bind("name")} maxLength={80} autoComplete="off" aria-invalid={Boolean(errors.name)} className={field} />
            {errors.name && <span role="alert" className={`block ${note}`}>{errors.name}</span>}
          </label>
          <label className="block font-medium">
            Phone number
            <input {...bind("phone")} type="tel" inputMode="tel" autoComplete="off" placeholder="0803 123 4567" aria-invalid={Boolean(errors.phone)} className={field} />
            {errors.phone && <span role="alert" className={`block ${note}`}>{errors.phone}</span>}
          </label>
          <label className="block font-medium">
            Plate number
            <input {...bind("plate")} autoCapitalize="characters" autoComplete="off" aria-invalid={Boolean(errors.plate)} className={`${field} uppercase`} />
            {errors.plate && <span role="alert" className={`block ${note}`}>{errors.plate}</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block font-medium">
              Make and model
              <input {...bind("make")} autoComplete="off" className={field} />
            </label>
            <label className="block font-medium">
              Colour
              <input {...bind("colour")} autoComplete="off" className={field} />
            </label>
          </div>
          {state.error && !state.fieldErrors?.name && !state.fieldErrors?.phone && !state.fieldErrors?.plate && (
            <p role="alert" className={errorBox}>
              {state.error}
            </p>
          )}
          <button disabled={pending} className={redButton}>
            {pending ? "Please wait..." : "Add member"}
          </button>
        </form>
      </section>
    </div>
  );
}
