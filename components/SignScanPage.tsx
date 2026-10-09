"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { describeCameraProblem, type CameraProblem } from "@/lib/rules/camera-problem";
import { parseSignScan } from "@/lib/rules/sign-scan";
import { IconAlert, IconCheck } from "./icons";
import { outlineButton, redButton } from "./ui";

const REGION = "sign-scan-region";

type Notice = { message: string; passToken?: string };

/**
 * The dedicated page for scanning a car park sign. It does one job: read the QR code on the sign, find that car
 * park among the church's own records, and open check-in for it. There is no list of car parks here: the sign
 * decides the car park, and the check-in page that opens shows it ("You are parking in ...").
 *
 * It only follows our own signs. A code for another website, a sign for a car park that is not in use, or a
 * parking pass (the driver's own checkout code) is refused with a plain message and the camera keeps looking.
 * A camera that will not start gets its own message and a Try again button.
 */
export function SignScanPage({ areas }: { areas: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"starting" | "scanning" | "found" | "blocked">("starting");
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [foundName, setFoundName] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    let stop: (() => Promise<void>) | undefined;
    let cancelled = false;

    const refuse = (next: Notice) =>
      setNotice((now) => (now?.message === next.message && now.passToken === next.passToken ? now : next));

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      const scanner = new Html5Qrcode(REGION);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (handled.current) return;
            const scan = parseSignScan(text, window.location.host);
            if (scan.kind === "sign") {
              const area = areas.find((a) => a.slug === scan.slug);
              if (!area) {
                refuse({ message: "That car park sign is not in use. Check you are at the right car park, then scan again." });
                return;
              }
              // A real car park: stop reading, show which one, and open its check-in once
              handled.current = true;
              navigator.vibrate?.(60);
              setNotice(null);
              setFoundName(area.name);
              setPhase("found");
              setTimeout(() => router.push(`/c/${area.slug}`), 500);
            } else if (scan.kind === "pass") {
              refuse({ message: "That is a parking pass, not a car park sign. Scan the sign at your car park.", passToken: scan.token });
            } else {
              refuse({ message: "That QR code is not a Church Parking car park sign. Scan the sign at your car park." });
            }
          },
          () => {},
        );
        stop = async () => {
          await scanner.stop().catch(() => {});
          scanner.clear();
        };
        if (cancelled) await stop();
        else setPhase((p) => (p === "found" ? p : "scanning"));
      } catch (e) {
        if (!cancelled) {
          setProblem(describeCameraProblem(e, window.isSecureContext));
          setPhase("blocked");
        }
      }
    })();

    return () => {
      cancelled = true;
      void stop?.();
    };
  }, [attempt, areas, router]);

  function tryAgain() {
    handled.current = false;
    setProblem(null);
    setNotice(null);
    setFoundName(null);
    setPhase("starting");
    setAttempt((n) => n + 1);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Scan the car park sign</h1>
        <p className="mt-1 text-ink-soft">Point your camera at the QR code on the sign at your car park.</p>
      </div>

      {phase === "blocked" && problem ? (
        <section role="alert" aria-label="The camera did not start" className="space-y-3 rounded-card border-2 border-danger bg-blush p-5">
          <p className="flex items-start gap-2 font-semibold text-danger">
            <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{problem.message}</span>
          </p>
          {problem.kind !== "insecure" && (
            <button type="button" onClick={tryAgain} className={redButton}>
              Try again
            </button>
          )}
        </section>
      ) : phase === "found" && foundName ? (
        <section role="status" className="rounded-card border-2 border-success bg-success-soft p-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success text-white">
            <IconCheck className="h-7 w-7" />
          </span>
          <h2 className="mt-2 text-2xl font-extrabold">{foundName}</h2>
          <p className="mt-1 text-ink-soft">Car park found. Opening check-in…</p>
        </section>
      ) : (
        <div className="relative flex min-h-72 items-center justify-center overflow-hidden rounded-card bg-night p-3">
          <p className="absolute text-sm text-white/70">{phase === "starting" ? "Starting the camera…" : ""}</p>
          <div id={REGION} className="relative w-full overflow-hidden rounded-2xl" />
        </div>
      )}

      {notice && phase !== "found" && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border-2 border-danger bg-white p-3 font-medium text-danger">
          <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            {notice.message}
            {notice.passToken && (
              <>
                {" "}
                <Link href={`/p/${notice.passToken}`} className="underline">
                  Open this pass
                </Link>
              </>
            )}
          </span>
        </p>
      )}

      <Link href="/" className={outlineButton}>
        Go back
      </Link>
    </div>
  );
}
