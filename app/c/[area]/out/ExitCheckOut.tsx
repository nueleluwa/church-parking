"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconAlert, IconCheckAnimated } from "@/components/icons";
import { Plate } from "@/components/Plate";
import { Spinner } from "@/components/Spinner";
import { VehicleImage } from "@/components/VehicleImage";
import { AppHeader } from "@/components/AppHeader";
import { outlineButton, redButton } from "@/components/ui";
import { formatLagosTime } from "@/lib/format";
import { checkOut, type ExitResult } from "./actions";

type Phase = { name: "working" } | { name: "done"; result: ExitResult } | { name: "failed" };

/**
 * What the member sees after scanning the exit sign. The check-out is sent once, as soon as the screen opens, with no input.
 * Success is shown only after the server has answered that the visit is closed; a failed request is shown as a failure, never
 * as success, and can be tried again safely.
 */
export function ExitCheckOut({ areaSlug, areaName }: { areaSlug: string; areaName: string | null }) {
  const [phase, setPhase] = useState<Phase>({ name: "working" });
  const started = useRef(false);

  const run = useCallback(async () => {
    setPhase({ name: "working" });
    try {
      setPhase({ name: "done", result: await checkOut(areaSlug) });
    } catch {
      setPhase({ name: "failed" });
    }
  }, [areaSlug]);

  // Once per visit to this screen (the server would also cope with a second request)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const result = phase.name === "done" ? phase.result : null;

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-md space-y-5 px-4 pb-10 pt-6" aria-live="polite">
        {areaName && <p className="text-center text-lg font-semibold text-ink-soft">{areaName}</p>}

        {phase.name === "working" && (
          <section role="status" className="rounded-card bg-card p-6 text-center shadow-sm">
            <Spinner />
            <h1 className="mt-3 text-2xl font-extrabold">Checking you out…</h1>
          </section>
        )}

        {phase.name === "failed" && (
          <Notice tone="problem" title="We could not check you out" text="We could not reach the server, so nothing was changed. You are not checked out yet.">
            <button type="button" onClick={() => void run()} className={redButton}>
              Try again
            </button>
          </Notice>
        )}

        {result?.status === "ok" && (
          <section role="status" className="space-y-3 rounded-card border-2 border-success bg-success-soft p-6 text-center">
            <span className="check-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
              <IconCheckAnimated className="h-8 w-8" />
            </span>
            <h1 className="text-2xl font-extrabold">You are checked out</h1>
            <div className="flex justify-center">
              <VehicleImage size="lg" />
            </div>
            <Plate plate={result.plate} size="lg" variant="plain" />
            <p className="text-ink-soft">Left at {formatLagosTime(result.releasedAt)}</p>
            <p className="text-lg font-semibold">Thank you for worshipping with us. Go well, and have a blessed week.</p>
          </section>
        )}

        {result?.status === "already_closed" && (
          <Notice tone="calm" title="You are already checked out" text="There is nothing more to do. If an attendant released your car, that is fine." />
        )}
        {result?.status === "closed_missed" && (
          <Notice tone="calm" title="This visit is already closed" text="It was closed at the end of the day, so there is nothing to check out." />
        )}

        {result?.status === "no_credential" && (
          <Notice
            tone="problem"
            title="We could not find your check-in on this phone"
            text="If you have already checked out, you are done. If not, scan the check-in sign at this car park again to bring your check-in back to this phone, then scan this exit sign. Or ask parking staff."
          >
            <Link href={`/c/${areaSlug}`} className={redButton}>
              Go to check-in
            </Link>
          </Notice>
        )}
        {result?.status === "expired" && (
          <Notice tone="problem" title="Your check-in has expired" text="Please see parking staff. They can close it for you." />
        )}
        {result?.status === "wrong_area" && (
          <Notice
            tone="problem"
            title="This is not your car park"
            text={`You are checked in at a different car park, so this exit sign cannot check you out. Please see parking staff${areaName ? ` at ${areaName}` : ""}.`}
          />
        )}
        {result?.status === "held" && <Notice tone="problem" title="Please see an attendant" text="An attendant needs to look at your car before you leave." />}
        {result?.status === "bad_sign" && (
          <Notice tone="problem" title="This sign is not working" text="Please see parking staff. They can close your check-in for you." />
        )}
        {result?.status === "bad_origin" && (
          <Notice tone="problem" title="We could not check you out from here" text="Please scan the exit sign again with your camera, or see parking staff." />
        )}
        {result?.status === "rate_limited" && (
          <Notice tone="problem" title="Too many tries" text="Please wait a minute, then scan the exit sign again, or see parking staff.">
            <button type="button" onClick={() => void run()} className={outlineButton}>
              Try again
            </button>
          </Notice>
        )}
        {result?.status === "error" && (
          <Notice tone="problem" title="We could not check you out" text="Something went wrong, so nothing was changed. You are not checked out yet.">
            <button type="button" onClick={() => void run()} className={redButton}>
              Try again
            </button>
          </Notice>
        )}
      </main>
    </>
  );
}

function Notice({ tone, title, text, children }: { tone: "calm" | "problem"; title: string; text: string; children?: ReactNode }) {
  return (
    <section role={tone === "problem" ? "alert" : "status"} className={`space-y-3 rounded-card border-2 p-6 ${tone === "problem" ? "border-danger bg-blush" : "border-edge/20 bg-card"}`}>
      <h1 className="flex items-start gap-2 text-xl font-extrabold">
        {tone === "problem" && <IconAlert className="mt-1 h-5 w-5 shrink-0 text-danger" />}
        <span>{title}</span>
      </h1>
      <p className="font-medium text-ink-soft">{text}</p>
      {children}
    </section>
  );
}
