"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanCard } from "@/lib/rules/scan";
import { lookupPass } from "../actions";
import { ResultCard } from "../ResultCard";

const REGION = "qr-region";

export function Scanner() {
  const [card, setCard] = useState<ScanCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const busy = useRef(false);

  const scanning = card === null;

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
              setError(null);
              setCard(result.card);
            } else {
              setError(result.error);
              setTimeout(() => (busy.current = false), 1500);
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
        setCameraError("We can't use the camera. Allow camera access, or use Find car instead.");
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
    setError(null);
    setRun((n) => n + 1);
  }, []);

  if (card) return <ResultCard card={card} method="scan" onDone={next} doneLabel="Scan next pass" />;

  return (
    <div className="space-y-3">
      <div id={REGION} className="overflow-hidden rounded-card bg-slate-green-dark" />
      <p className="text-center font-medium">Point the camera at the driver&apos;s QR code.</p>
      {error && (
        <p role="alert" className="rounded-xl border-2 border-danger bg-white p-3 text-center font-medium text-danger">
          {error}
        </p>
      )}
      {cameraError && (
        <p role="alert" className="rounded-xl border-2 border-danger bg-white p-3 text-center font-medium text-danger">
          {cameraError}
        </p>
      )}
    </div>
  );
}
