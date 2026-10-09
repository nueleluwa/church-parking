"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { parseSignScan } from "@/lib/rules/sign-scan";
import { IconAlert, IconScan } from "./icons";
import { outlineButton, redButton } from "./ui";

const REGION = "sign-scan-region";

/**
 * The camera on the Church Parking home page, for a driver who opened the site first and is standing at a
 * car park sign. Scanning a sign takes them to that car park's check-in. It only follows our own signs: a code
 * for any other website is refused, and a parking pass (the driver's own checkout code) is never taken for a sign.
 * The phone's own camera app does the same job with no page at all, which is still the quickest way.
 */
export function SignScanner({ knownSlugs, startOpen = false }: { knownSlugs: string[]; startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [problem, setProblem] = useState<string | null>(null);
  const [passToken, setPassToken] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
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
          (text) => {
            if (busy.current) return;
            const found = parseSignScan(text, window.location.host);
            if (found.kind === "sign" && knownSlugs.includes(found.slug)) {
              busy.current = true;
              navigator.vibrate?.(60);
              router.push(`/c/${found.slug}`);
            } else if (found.kind === "sign") {
              setProblem("That car park sign is not in use. Please choose your car park from the list.");
            } else if (found.kind === "pass") {
              setPassToken(found.token);
              setProblem("That is a parking pass, not a car park sign. Scan the sign at your car park.");
            } else {
              setPassToken(null);
              setProblem("That is not a Church Parking sign. Scan the sign at your car park, or choose it from the list.");
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
        setProblem(
          window.isSecureContext
            ? "We cannot use the camera. Allow camera access, or choose your car park from the list."
            : "The camera only works on a secure (https) address. Choose your car park from the list instead.",
        );
      }
    })();

    return () => {
      cancelled = true;
      void stop?.();
    };
  }, [open, knownSlugs, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={outlineButton}>
        <IconScan className="h-5 w-5" />
        Scan a car park sign
      </button>
    );
  }

  return (
    <section aria-label="Scan a car park sign" className="space-y-3">
      <div className="relative flex min-h-72 items-center justify-center overflow-hidden rounded-card bg-night p-3">
        <p className="absolute text-sm text-white/70">Starting the camera…</p>
        <div id={REGION} className="relative w-full overflow-hidden rounded-2xl" />
      </div>
      <p className="text-center text-lg font-medium">Point the camera at the QR code on the car park sign</p>
      {problem && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border-2 border-danger bg-white p-3 font-medium text-danger">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            {problem}
            {passToken && (
              <>
                {" "}
                <Link href={`/p/${passToken}`} className="underline">
                  Open this pass
                </Link>
              </>
            )}
          </span>
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setProblem(null);
          setPassToken(null);
        }}
        className={redButton}
      >
        Choose my car park from the list
      </button>
    </section>
  );
}
