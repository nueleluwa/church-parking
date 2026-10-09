"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconAlert, IconKeyboard } from "@/components/icons";
import { outlineButton, redButton } from "@/components/ui";
import type { CorrectionContext } from "@/lib/correction-context";
import type { ScanCard } from "@/lib/rules/scan";
import { lookupPass } from "../actions";
import { ResultCard } from "../ResultCard";

const REGION = "qr-region";

/** Four red corner marks around the middle of the camera picture, to show where to hold the QR code. */
function Corners() {
  const corner = "absolute h-8 w-8 border-accent";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative h-60 w-60">
        <span className={`${corner} left-0 top-0 rounded-tl-2xl border-l-4 border-t-4`} />
        <span className={`${corner} right-0 top-0 rounded-tr-2xl border-r-4 border-t-4`} />
        <span className={`${corner} bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4`} />
        <span className={`${corner} bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4`} />
      </div>
    </div>
  );
}

/** What the attendant sees when a scanned code is not a usable pass. */
function InvalidPass({ reason, onAgain }: { reason: string; onAgain: () => void }) {
  return (
    <div className="space-y-4">
      <section role="alert" className="rounded-card border-2 border-danger bg-blush p-5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white">
          <IconAlert className="h-8 w-8" />
        </span>
        <h2 className="mt-2 text-2xl font-extrabold text-danger">Invalid pass</h2>
        <p className="mt-1 text-ink-soft">This pass is not valid.</p>
        <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-left">
          <span className="block text-sm text-ink-soft">Reason</span>
          <span className="font-semibold">{reason}</span>
        </p>
      </section>
      <button onClick={onAgain} className={redButton}>
        Scan another
      </button>
      <Link href="/staff/search" className={outlineButton}>
        <IconKeyboard className="h-5 w-5" />
        Find the car by plate number
      </Link>
    </div>
  );
}

export function Scanner({ corrections }: { corrections: CorrectionContext | null }) {
  const [card, setCard] = useState<ScanCard | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const busy = useRef(false);

  const scanning = card === null && invalid === null;

  useEffect(() => {
    if (!scanning) return;
    let stop: (() => Promise<void>) | undefined;
    let cancelled = false;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const scanner = new Html5Qrcode(REGION);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (text) => {
            if (busy.current) return;
            busy.current = true;
            const result = await lookupPass(text);
            if ("card" in result) {
              navigator.vibrate?.(60);
              setCard(result.card);
            } else {
              navigator.vibrate?.([120, 80, 120]);
              setInvalid(result.error);
            }
          },
          () => {},
        );
        stop = async () => {
          await scanner.stop().catch(() => {});
          scanner.clear();
        };
        if (cancelled) await stop();
      } catch {
        setCameraError("We cannot use the camera. Allow camera access, or find the car by plate number.");
      }
    })();

    return () => {
      cancelled = true;
      void stop?.();
    };
  }, [scanning, run]);

  const next = useCallback(() => {
    busy.current = false;
    setCard(null);
    setInvalid(null);
    setRun((n) => n + 1);
  }, []);

  if (card) return <ResultCard card={card} method="scan" onDone={next} doneLabel="Scan next pass" corrections={corrections} />;
  if (invalid) return <InvalidPass reason={invalid} onAgain={next} />;

  return (
    <div className="space-y-4">
      <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-card bg-night p-3">
        <p className="absolute text-sm text-white/70">Starting the camera…</p>
        <div id={REGION} className="relative w-full overflow-hidden rounded-2xl" />
        <Corners />
      </div>
      <p className="text-center text-lg font-medium">Position the QR code within the frame</p>
      {cameraError && (
        <p role="alert" className="flex items-center gap-2 rounded-2xl border-2 border-danger bg-white p-3 font-medium text-danger">
          <IconAlert className="h-5 w-5 shrink-0" />
          {cameraError}
        </p>
      )}
      <Link href="/staff/search" className={outlineButton}>
        <IconKeyboard className="h-5 w-5" />
        Enter plate number manually
      </Link>
    </div>
  );
}
