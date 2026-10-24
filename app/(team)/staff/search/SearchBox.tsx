"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { IconSearch } from "@/components/icons";
import { outlineButton } from "@/components/ui";
import type { CorrectionContext } from "@/lib/correction-context";
import type { CarParkOption } from "@/lib/rules/station";
import type { ScanCard } from "@/lib/rules/scan";
import { searchPasses } from "../actions";
import { ResultCard } from "../ResultCard";

type Mode = "plate" | "phone" | "reference";

const MODES: { mode: Mode; tab: string; label: string; placeholder: string }[] = [
  { mode: "plate", tab: "By plate", label: "Vehicle plate number", placeholder: "KJA 456 RT" },
  { mode: "phone", tab: "By phone", label: "Phone number", placeholder: "0803 123 4567" },
  { mode: "reference", tab: "By reference", label: "Pass reference", placeholder: "PK-7Q4M" },
];

/** Manual lookup (EX-4): find today's car by plate, phone number or pass reference. */
export function SearchBox({
  corrections,
  areas,
  station,
  defaultMode = "plate",
}: {
  corrections: CorrectionContext | null;
  areas: CarParkOption[];
  station: string | null;
  /** Which tab opens first (an admin's choice in Settings). */
  defaultMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<ScanCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = MODES.find((m) => m.mode === mode)!;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // A reference always starts "PK-", so a person can leave that off
    const text = mode === "reference" && !/^pk-/i.test(query.trim()) ? `PK-${query.trim()}` : query;
    start(async () => {
      const r = await searchPasses(text);
      if ("error" in r) setError(r.error);
      else {
        setError(null);
        setCards(r.cards);
      }
    });
  }

  function pick(next: Mode) {
    setMode(next);
    setQuery("");
    setCards(null);
    setError(null);
  }

  function clear() {
    setQuery("");
    setCards(null);
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="How to look the car up"
        className="grid grid-cols-3 gap-1 rounded-full bg-panel p-1"
      >
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="tab"
            aria-selected={m.mode === mode}
            onClick={() => pick(m.mode)}
            className={`min-h-11 rounded-full px-1 text-center text-sm font-semibold leading-tight transition ${
              m.mode === mode ? "bg-action text-white shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {m.tab}
          </button>
        ))}
      </div>

      <form noValidate onSubmit={submit} className="space-y-3 rounded-card bg-card p-4 shadow-sm">
        <label className="block text-sm font-semibold">
          {current.label}
          <span className="relative mt-1.5 block">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-soft" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type={mode === "phone" ? "tel" : "text"}
              inputMode={mode === "phone" ? "tel" : "text"}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder={current.placeholder}
              required
              className={`input mt-0! min-h-12 pl-11 pr-12 text-lg font-semibold ${mode === "phone" ? "" : "uppercase"}`}
            />
            {query && (
              <button
                type="button"
                onClick={clear}
                aria-label="Clear"
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-xl text-ink-soft"
              >
                ×
              </button>
            )}
          </span>
        </label>
        <button disabled={pending} className="btn btn-primary w-full">
          <IconSearch className="h-5 w-5" />
          {pending ? "Looking..." : "Search"}
        </button>
      </form>

      {error && (
        <p role="alert" className="font-medium text-danger">
          {error}
        </p>
      )}
      {cards?.length === 0 && (
        <div className="space-y-3 rounded-card bg-card p-5 text-center shadow-sm">
          <p className="font-medium text-ink-soft">No car found today. Check the number, or use Add car to register it.</p>
          <Link
            href={mode === "plate" ? `/staff/register?plate=${encodeURIComponent(query.trim())}` : "/staff/register"}
            className={outlineButton}
          >
            Add car{mode === "plate" && query.trim() ? ` ${query.trim().toUpperCase()}` : ""}
          </Link>
        </div>
      )}
      {cards?.map((c) => (
        <ResultCard key={c.visitId} card={c} method="search" onDone={clear} doneLabel="Done" corrections={corrections} areas={areas} station={station} />
      ))}
    </div>
  );
}
