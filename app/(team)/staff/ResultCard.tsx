"use client";

import { useToast } from "@/components/ds/Toast";
import { useState, useTransition } from "react";
import { FactList, FactRow } from "@/components/FactRow";
import { IconAlert, IconCalendar, IconCheck, IconClock, IconFlag, IconPin, IconTimer, IconUser } from "@/components/icons";
import { Plate } from "@/components/Plate";
import { Spinner } from "@/components/Spinner";
import { StatusBadge } from "@/components/StatusBadge";
import { field, outlineButton, primaryButton, redButton } from "@/components/ui";
import { VehicleImage } from "@/components/VehicleImage";
import type { CorrectionContext } from "@/lib/correction-context";
import { formatDuration, formatLagosDate, formatLagosTime } from "@/lib/format";
import { describeVehicle } from "@/lib/rules/vehicle";
import { atOtherCarPark, type ScanCard } from "@/lib/rules/scan";
import type { CarParkOption } from "@/lib/rules/station";
import { CorrectionPanel } from "./CorrectionPanel";
import { doesNotMatch, moveToCarPark, releaseCar, revealPhone } from "./actions";
import { clearHoldAction } from "./ops-actions";

const time = (iso: string | null) => (iso ? formatLagosTime(iso) : "");

type Props = {
  card: ScanCard;
  method: "scan" | "search";
  onDone: () => void;
  doneLabel: string;
  /** Set for coordinators and admins: shows the corrections panel. */
  corrections?: CorrectionContext | null;
  /** The open car parks, and the one this attendant says they are standing at. */
  areas?: CarParkOption[];
  station?: string | null;
};

/**
 * What the attendant sees for one car (EX-2, EX-6): a status card first (green and ready, or
 * red and a reason), then the car, then the facts to check, then the actions. Only the first
 * name and the last 4 phone digits are ever shown (R-9).
 */
export function ResultCard({ card, method, onDone, doneLabel, corrections, areas = [], station = null }: Props) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const toast = useToast();
  const [finished, setFinished] = useState<"released" | "held" | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  // The car park can be corrected here, so what is shown follows the correction
  const [movedTo, setMovedTo] = useState<{ name: string; slug: string } | null>(null);
  const [moveChoice, setMoveChoice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const areaName = movedTo?.name ?? card.areaName;
  const areaSlug = movedTo?.slug ?? card.areaSlug;
  const [clearReason, setClearReason] = useState("");
  const [cleared, setCleared] = useState(false);

  const problem =
    card.state === "already_released"
      ? {
          chip: "ALREADY RELEASED",
          title: "Already released",
          reason: card.releasedBySelf
            ? `The member checked out with the exit sign at ${time(card.releasedAt)}. Do not release again.`
            : `Released${card.releasedByName ? ` by ${card.releasedByName}` : ""} at ${time(card.releasedAt)}. Do not release again.`,
        }
      : card.state === "expired"
        ? { chip: "OLD PASS", title: "Old pass", reason: "OLD PASS. This pass is from an earlier day. Do not release." }
        : card.state === "closed"
          ? { chip: "CLOSED", title: "Visit closed", reason: "This visit is closed. Do not release." }
          : card.state === "held"
            ? {
                chip: "ON HOLD",
                title: "On hold",
                reason: "Do not release this car. Stay with it and call the coordinator.",
              }
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
        toast.success("Vehicle released successfully.");
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
        toast.success("Car held. The coordinator has been alerted.");
      } else setMessage(r.message);
    });
  }
  function clear() {
    start(async () => {
      const r = await clearHoldAction(card.visitId, clearReason);
      if (r.ok) {
        setCleared(true);
        setMessage(null);
        toast.success("The hold was lifted.");
      } else setMessage(r.message);
    });
  }
  function move(areaId: number) {
    start(async () => {
      const r = await moveToCarPark(card.visitId, areaId);
      if (r.ok) {
        buzz(80);
        setMovedTo({ name: r.areaName, slug: r.areaSlug });
        setMoveChoice("");
        setMessage(null);
        setNotice(`Car park changed to ${r.areaName}.`);
        toast.success("Car park updated.");
      } else {
        setNotice(null);
        setMessage(r.message);
      }
    });
  }
  function show() {
    start(async () => {
      const r = await revealPhone(card.visitId);
      if ("phone" in r) setPhone(r.phone);
      else setMessage(r.error);
    });
  }

  // The status card: its colour and words follow what has happened
  const tone = finished === "released" ? "success" : finished === "held" || problem ? "danger" : "success";
  const cardClass = tone === "success" ? "border-success bg-success-soft" : "border-danger bg-blush";
  const circle = tone === "success" ? "bg-success text-white" : "bg-danger text-white";
  const Icon = tone === "success" ? IconCheck : IconAlert;
  const title =
    finished === "released" ? "Car released" : finished === "held" ? "Car held" : (problem?.title ?? "Ready for exit");
  const sub =
    finished === "released"
      ? "Vehicle has been released."
      : finished === "held"
        ? "Do not release this vehicle. Stay with it and call the coordinator."
        : (problem?.reason ?? "Confirm the details, then release the car.");

  const details = describeVehicle({ make: card.make, colour: card.colour });
  const parked = (card.state === "ready" || card.state === "held") && !finished;
  const stationArea = areas.find((a) => a.slug === station) ?? null;
  const mismatch = parked && stationArea !== null && atOtherCarPark(areaSlug, station);
  const status =
    finished === "released"
      ? "Released"
      : card.state === "ready"
        ? "Valid"
        : card.state === "held"
          ? "On hold"
          : card.state === "already_released"
          ? "Released"
          : card.state === "expired"
            ? "Expired"
            : "Closed";

  return (
    <div className="space-y-4">
      <section
        role={finished ? "status" : undefined}
        className={`rounded-card border-2 p-4 text-center ${cardClass}`}
      >
        <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${circle}`}>
          <Icon className="h-7 w-7" />
        </span>
        <h2 className="mt-2 text-2xl font-extrabold">{title}</h2>
        <p className="mt-1 text-ink-soft">{sub}</p>
        {!finished && (
          <div className="mt-3">
            <StatusBadge tone={problem ? "danger" : "success"} variant="chip">
              {problem ? problem.chip : "VALID PASS"}
            </StatusBadge>
          </div>
        )}
      </section>

      {mismatch && stationArea && (
        <section
          aria-label="This car checked in at a different car park"
          data-testid="car-park-mismatch"
          className="rounded-card border-2 border-warning-edge bg-warning-soft p-4 text-warning-ink"
        >
          <p className="flex items-start gap-2 font-bold">
            <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />
            This car checked in at {areaName}, but you are at {stationArea.name}.
          </p>
          <p className="mt-1 text-sm">
            Ask the driver where they parked. If they scanned the wrong sign, move the car to {stationArea.name}. If anything else
            is not right, tap Does not match.
          </p>
          <button onClick={() => move(stationArea.id)} disabled={pending} className={`${outlineButton} mt-3`}>
            Move to {stationArea.name}
          </button>
        </section>
      )}

      <section className="rounded-card bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <VehicleImage size="md" />
          <div className="min-w-0 flex-1">
            <Plate plate={card.plate} size="lg" align="start" variant="plain" />
            {details && <p className="truncate text-base text-ink-soft">{details}</p>}
          </div>
        </div>

        <FactList className="mt-2 divide-y divide-edge/15">
          <FactRow icon={<IconUser className="h-5 w-5" />} label="Driver">
            <span className="inline-flex flex-wrap items-center gap-2 @[15rem]:justify-end">
              <span className="font-bold">{card.firstName}</span>
              <StatusBadge tone="neutral">{card.isGuest ? "GUEST" : "MEMBER"}</StatusBadge>
              {card.isNewCar && <StatusBadge tone="danger">NEW CAR</StatusBadge>}
            </span>
          </FactRow>
          <FactRow icon={<IconUser className="h-5 w-5" />} label="Phone">
            <span className="block">{phone ?? `•••• ${card.phoneLast4}`}</span>
            {!phone && (
              <button onClick={show} disabled={pending} className="text-sm font-semibold text-accent underline">
                Show number
              </button>
            )}
          </FactRow>
          <FactRow icon={<IconClock className="h-5 w-5" />} label="Service">
            <span className="block">{card.serviceName}</span>
          </FactRow>
          <FactRow icon={<IconPin className="h-5 w-5" />} label="Parking area">
            <span data-area>{areaName}</span>
          </FactRow>
          {card.checkedInAt && (
            <FactRow icon={<IconCalendar className="h-5 w-5" />} label="Checked in">
              <span className="block whitespace-nowrap">{time(card.checkedInAt)}</span>
              <span className="block whitespace-nowrap text-sm font-medium text-ink-soft">
                {formatLagosDate(card.checkedInAt)}
              </span>
            </FactRow>
          )}
          {card.minutesParked !== null && (
            <FactRow icon={<IconTimer className="h-5 w-5" />} label="Duration">
              <span className="block whitespace-nowrap">{formatDuration(card.minutesParked)}</span>
            </FactRow>
          )}
          <FactRow icon={<IconCheck className="h-5 w-5" />} label="Pass status">
            <StatusBadge tone={finished === "released" ? "neutral" : problem ? "danger" : "success"}>{status}</StatusBadge>
          </FactRow>
          <FactRow icon={<IconClock className="h-5 w-5" />} label="Reference">
            <span className="block whitespace-nowrap">{card.reference}</span>
          </FactRow>
        </FactList>

        {parked && areas.length > 1 && (
          <details className="mt-3 rounded-2xl border-2 border-edge/15 p-3">
            <summary className="cursor-pointer font-semibold">Wrong car park?</summary>
            <div className="mt-3 space-y-3">
              <label className="block font-medium">
                Move this car to
                <select value={moveChoice} onChange={(e) => setMoveChoice(e.target.value)} className={field}>
                  <option value="">Choose a car park</option>
                  {areas
                    .filter((a) => a.slug !== areaSlug)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <button onClick={() => moveChoice && move(Number(moveChoice))} disabled={pending || !moveChoice} className={outlineButton}>
                Move car
              </button>
            </div>
          </details>
        )}

        {card.state === "ready" && !finished && (
          <p className={`mt-3 text-sm ${card.askForDetails ? "font-semibold text-ink" : "text-ink-soft"}`}>
            {card.askForDetails
              ? card.isNewCar
                ? "New car on this account. Ask the driver for their name and phone number and check them."
                : "Ask the driver for their name and phone number and check them."
              : "Check that the plate matches the car."}
          </p>
        )}
      </section>

      {notice && (
        <p role="status" className="rounded-2xl border-2 border-success bg-success-soft p-3 font-medium">
          {notice}
        </p>
      )}

      {message && (
        <p role="alert" className="rounded-2xl border-2 border-danger bg-white p-3 font-medium text-danger">
          {message}
        </p>
      )}

      {finished ? (
        <button onClick={onDone} className={primaryButton}>
          {doneLabel}
        </button>
      ) : card.state === "ready" ? (
        <div className="space-y-3">
          <button onClick={release} disabled={pending} className={primaryButton}>
            {pending ? <Spinner /> : <IconCheck />}
            Release car
          </button>
          <button onClick={hold} disabled={pending} className={redButton}>
            <IconFlag />
            Does not match
          </button>
          <button onClick={onDone} disabled={pending} className={outlineButton}>
            {doneLabel}
          </button>
        </div>
      ) : card.state === "held" ? (
        <div className="space-y-3">
          {cleared ? (
            <p role="status" className="rounded-2xl border-2 border-success bg-success-soft p-3 font-medium">
              Hold cleared. Look the car up again to release it.
            </p>
          ) : corrections ? (
            <div className="space-y-2 rounded-card bg-card p-4 shadow-sm">
              <label className="block font-medium">
                Why is the hold being cleared?
                <input
                  value={clearReason}
                  onChange={(e) => setClearReason(e.target.value)}
                  className="mt-1 w-full rounded-2xl border-2 border-edge/30 bg-white px-4 py-3"
                  maxLength={200}
                />
              </label>
              <button onClick={clear} disabled={pending} className={redButton}>
                Clear hold
              </button>
            </div>
          ) : (
            <p className="rounded-2xl bg-card p-3 text-ink-soft shadow-sm">Only a coordinator can clear a hold.</p>
          )}
          <button onClick={onDone} className={outlineButton}>
            {doneLabel}
          </button>
        </div>
      ) : (
        <button onClick={onDone} className={outlineButton}>
          {doneLabel}
        </button>
      )}

      {corrections && <CorrectionPanel visitId={card.visitId} context={corrections} />}
    </div>
  );
}
