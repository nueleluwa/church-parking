"use client";

import { useState, useTransition } from "react";
import type { ScanCard } from "@/lib/rules/scan";
import { formatPlate } from "@/lib/rules/plates";
import { doesNotMatch, releaseCar, revealPhone } from "./actions";

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", {
        timeZone: "Africa/Lagos",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const btn = "w-full rounded-full px-6 py-4 text-lg font-semibold disabled:opacity-60";

type Props = {
  card: ScanCard;
  method: "scan" | "search";
  onDone: () => void;
  doneLabel: string;
};

export function ResultCard({ card, method, onDone, doneLabel }: Props) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [finished, setFinished] = useState<"released" | "held" | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  const warning =
    card.state === "already_released"
      ? `ALREADY RELEASED${card.releasedByName ? ` by ${card.releasedByName}` : ""} at ${time(card.releasedAt)}`
      : card.state === "expired"
        ? "OLD PASS. This pass is from an earlier day. Do not release."
        : card.state === "closed"
          ? "This visit is closed. Do not release."
          : null;

  function release() {
    start(async () => {
      const r = await releaseCar(card.visitId, method);
      if (r.ok) setFinished("released");
      else setMessage(r.message);
    });
  }
  function hold() {
    start(async () => {
      const r = await doesNotMatch(card.visitId, card.plate);
      if (r.ok) setFinished("held");
      else setMessage(r.message);
    });
  }
  function show() {
    start(async () => {
      const r = await revealPhone(card.visitId);
      if ("phone" in r) setPhone(r.phone);
      else setMessage(r.error);
    });
  }

  return (
    <div className="rounded-card bg-card p-6 text-center shadow-sm">
      <p className="text-5xl font-extrabold tracking-wide">{formatPlate(card.plate)}</p>
      <p className="mt-2 text-lg font-medium">
        {card.areaName} · {card.serviceName}
      </p>
      <p className="mt-1 text-ink-soft">Reference {card.reference}</p>

      <p className="mt-4 text-xl font-semibold">{card.firstName}</p>
      {card.isGuest && (
        <div className="mt-2 space-y-2">
          <span className="inline-block rounded-full border-2 border-edge bg-select px-3 py-1 text-sm font-extrabold">
            GUEST
          </span>
          <p>
            Phone: <span className="font-semibold">{phone ?? `•••• ${card.phoneLast4}`}</span>
          </p>
          {!phone && (
            <button onClick={show} disabled={pending} className="font-medium text-brand underline">
              Show number
            </button>
          )}
          <p className="text-sm text-ink-soft">Ask the driver for their name and phone number and check them.</p>
        </div>
      )}

      {warning && (
        <p role="alert" className="mt-4 rounded-xl border-4 border-danger p-3 font-extrabold text-danger">
          {warning}
        </p>
      )}
      {message && (
        <p role="alert" className="mt-4 rounded-xl border-2 border-danger p-3 font-medium text-danger">
          {message}
        </p>
      )}

      {finished ? (
        <div className="mt-5 space-y-3">
          <p className="rounded-xl border-4 border-edge bg-select p-3 text-xl font-extrabold">
            {finished === "released" ? "Car released" : "Car held. The coordinator has been told."}
          </p>
          <button onClick={onDone} className={`${btn} bg-brand text-white hover:bg-brand-dark`}>
            {doneLabel}
          </button>
        </div>
      ) : card.state === "ready" ? (
        <div className="mt-5 space-y-3">
          <button onClick={release} disabled={pending} className={`${btn} bg-brand text-white hover:bg-brand-dark`}>
            Release car
          </button>
          <button onClick={hold} disabled={pending} className={`${btn} border-2 border-danger bg-white text-danger`}>
            Does not match
          </button>
        </div>
      ) : (
        <button onClick={onDone} className={`${btn} mt-5 border-2 border-edge bg-white`}>
          {doneLabel}
        </button>
      )}
    </div>
  );
}
