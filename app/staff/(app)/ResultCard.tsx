"use client";

import { useState, useTransition } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { dangerButton, primaryButton, secondaryButton } from "@/components/ui";
import { Spinner } from "@/components/Spinner";
import { formatPlate } from "@/lib/rules/plates";
import type { ScanCard } from "@/lib/rules/scan";
import { doesNotMatch, releaseCar, revealPhone } from "./actions";

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", {
        timeZone: "Africa/Lagos",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

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

  function buzz(pattern: number | number[]) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  }

  function release() {
    start(async () => {
      const r = await releaseCar(card.visitId, method);
      if (r.ok) {
        buzz(80);
        setFinished("released");
      } else {
        buzz([120, 80, 120]);
        setMessage(r.message);
      }
    });
  }
  function hold() {
    start(async () => {
      const r = await doesNotMatch(card.visitId, card.plate);
      if (r.ok) {
        buzz([200, 100, 200]);
        setFinished("held");
      } else setMessage(r.message);
    });
  }
  function show() {
    start(async () => {
      const r = await revealPhone(card.visitId);
      if ("phone" in r) setPhone(r.phone);
      else setMessage(r.error);
    });
  }

  const border = warning ? "border-danger" : "border-edge";

  return (
    <div className={`overflow-hidden rounded-card border-4 bg-card text-center shadow-sm ${border}`}>
      {warning && (
        <p role="alert" className="flex items-center justify-center gap-2 bg-danger px-4 py-3 text-lg font-extrabold text-white">
          <IconAlert className="h-6 w-6 shrink-0" />
          <span>{warning}</span>
        </p>
      )}

      <div className="p-6">
        <div className="mx-auto inline-block rounded-xl border-4 border-ink bg-white px-4 py-2">
          <p className="text-4xl font-extrabold tracking-wider">{formatPlate(card.plate)}</p>
        </div>
        <p className="mt-3 text-lg font-semibold">
          {card.areaName} · {card.serviceName}
        </p>
        <p className="mt-1 text-ink-soft">Reference {card.reference}</p>

        <p className="mt-4 text-2xl font-bold">{card.firstName}</p>
        {card.isGuest && (
          <div className="mt-2 space-y-2">
            <span className="inline-block rounded-full border-2 border-edge bg-blush px-3 py-1 text-sm font-extrabold">
              GUEST
            </span>
            <p>
              Phone: <span className="font-semibold">{phone ?? `•••• ${card.phoneLast4}`}</span>
            </p>
            {!phone && (
              <button onClick={show} disabled={pending} className="font-medium text-accent underline">
                Show number
              </button>
            )}
            <p className="text-sm text-ink-soft">
              Ask the driver for their name and phone number and check them.
            </p>
          </div>
        )}

        {message && (
          <p role="alert" className="mt-4 rounded-2xl border-2 border-danger p-3 font-medium text-danger">
            {message}
          </p>
        )}

        {finished ? (
          <div className="mt-5 space-y-3">
            <p className="flex items-center justify-center gap-2 rounded-2xl border-4 border-edge bg-blush p-3 text-xl font-extrabold">
              <IconCheck />
              {finished === "released" ? "Car released" : "Car held. The coordinator has been told."}
            </p>
            <button onClick={onDone} className={primaryButton}>
              {doneLabel}
            </button>
          </div>
        ) : card.state === "ready" ? (
          <div className="mt-5 space-y-3">
            <button onClick={release} disabled={pending} className={primaryButton}>
              {pending ? <Spinner /> : <IconCheck />}
              Release car
            </button>
            <button onClick={hold} disabled={pending} className={dangerButton}>
              Does not match
            </button>
          </div>
        ) : (
          <button onClick={onDone} className={`${secondaryButton} mt-5`}>
            {doneLabel}
          </button>
        )}
      </div>
    </div>
  );
}
