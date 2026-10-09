"use client";

import { useState, useTransition } from "react";
import type { ScanCard } from "@/lib/rules/scan";
import { searchPasses } from "../actions";
import type { CorrectionContext } from "@/lib/correction-context";
import { ResultCard } from "../ResultCard";

export function SearchBox({ corrections }: { corrections: CorrectionContext | null }) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<ScanCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await searchPasses(query);
      if ("error" in r) setError(r.error);
      else {
        setError(null);
        setCards(r.cards);
      }
    });
  }

  function clear() {
    setQuery("");
    setCards(null);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3">
        <label className="block font-medium">
          Plate number, phone number or reference
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            required
            className="mt-1 w-full rounded-xl border-2 border-edge/40 bg-white px-4 py-3 text-lg focus:border-edge focus:outline-none"
          />
        </label>
        <button
          disabled={pending}
          className="w-full rounded-full bg-action px-6 py-4 text-lg font-semibold text-white hover:bg-action-dark disabled:opacity-60"
        >
          {pending ? "Looking..." : "Find car"}
        </button>
      </form>

      {error && <p role="alert" className="font-medium text-danger">{error}</p>}
      {cards?.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-center font-medium">
          No car found today. Check the number, or use Add car to register it.
        </p>
      )}
      {cards?.map((c) => (
        <ResultCard key={c.visitId} card={c} method="search" onDone={clear} doneLabel="Done" corrections={corrections} />
      ))}
    </div>
  );
}
