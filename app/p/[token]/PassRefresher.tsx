"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Quietly re-checks the pass every few seconds while it is on screen, so the status stays true. */
export function PassRefresher({ everySeconds = 10 }: { everySeconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everySeconds * 1000);
    return () => clearInterval(id);
  }, [router, everySeconds]);
  return null;
}
