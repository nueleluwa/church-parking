"use client";

import { useState, useTransition } from "react";
import { IconCheck } from "@/components/icons";
import { Plate } from "@/components/Plate";
import { Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { dangerButton, primaryButton, secondaryButton } from "@/components/ui";
import type { CorrectionContext } from "@/lib/correction-context";
import type { ScanCard } from "@/lib/rules/scan";
import { CorrectionPanel } from "./CorrectionPanel";
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
  /** Set for coordinators and admins: shows the corrections panel. */
  corrections?: CorrectionContext | null;
};

/** A line of facts that stays on one line. Long names shorten with "..." rather than wrap. */
const oneLine = "flex min-w-0 flex-nowrap items-center justify-center gap-2 whitespace-nowrap";

export function ResultCard({ card, method, onDone, doneLabel, corrections }: Props) {
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

  return (
    <div
      className={`overflow-hidden rounded-card border-4 bg-card text-center shadow-sm ${warning ? "border-danger" : "border-success"}`}
    >
      {!finished &&
        (warning ? (
          <StatusBadge tone="danger" variant="bar">
            <span role="alert">{warning}</span>
          </StatusBadge>
        ) : (
          <StatusBadge tone="success" variant="bar">
            VALID PASS
          </StatusBadge>
        ))}

      <div className="space-y-2 p-4">
        <Plate plate={card.plate} size="lg" />

        <p className={`${oneLine} text-base font-semibold`}>
          <span data-area className="shrink-0">{card.areaName}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{card.serviceName}</span>
        </p>

        <div className={oneLine}>
          <span className="truncate text-xl font-bold">{card.firstName}</span>
          <StatusBadge tone="neutral">{card.isGuest ? "GUEST" : "MEMBER"}</StatusBadge>
          {card.isNewCar && <StatusBadge tone="danger">NEW CAR</StatusBadge>}
        </div>

        <p className={`${oneLine} text-base`}>
          <span>Phone</span>
          <span className="font-semibold">{phone ?? `•••• ${card.phoneLast4}`}</span>
          {!phone && (
            <button onClick={show} disabled={pending} className="font-medium text-accent underline">
              Show number
            </button>
          )}
        </p>
        <p className="text-sm text-ink-soft">Ref {card.reference}</p>

        <p className={`text-sm ${card.askForDetails ? "font-semibold text-ink" : "text-ink-soft"}`}>
          {card.askForDetails
            ? card.isNewCar
              ? "New car on this account. Ask the driver for their name and phone number and check them."
              : "Ask the driver for their name and phone number and check them."
            : "Check that the plate matches the car."}
        </p>

        {message && (
          <p role="alert" className="rounded-2xl border-2 border-danger p-3 font-medium text-danger">
            {message}
          </p>
        )}

        {finished ? (
          <div className="space-y-3 pt-2">
            <StatusBadge tone={finished === "released" ? "success" : "warning"} variant="soft" className="justify-center text-lg">
              {finished === "released" ? "Car released" : "Car held. The coordinator has been told."}
            </StatusBadge>
            <button onClick={onDone} className={primaryButton}>
              {doneLabel}
            </button>
          </div>
        ) : card.state === "ready" ? (
          <div className="space-y-3 pt-2">
            <button onClick={release} disabled={pending} className={primaryButton}>
              {pending ? <Spinner /> : <IconCheck />}
              Release car
            </button>
            <button onClick={hold} disabled={pending} className={dangerButton}>
              Does not match
            </button>
          </div>
        ) : (
          <button onClick={onDone} className={`${secondaryButton} mt-2`}>
            {doneLabel}
          </button>
        )}

        {corrections && <CorrectionPanel visitId={card.visitId} context={corrections} />}
      </div>
    </div>
  );
}
