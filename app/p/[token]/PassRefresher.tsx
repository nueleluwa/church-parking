"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps an open pass honest without reloading it over and over. Every so often
 * it asks a tiny status endpoint what the pass is now, and reloads the page
 * only if that has changed (for example the car was released).
 */
export function PassRefresher({
  token,
  state,
  everySeconds = 15,
}: {
  token: string;
  state: string;
  everySeconds?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/p/${token}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const body: { state: string | null } = await res.json();
        if (body.state && body.state !== state) router.refresh();
      } catch {
        // No connection: try again next time. Nothing to show.
      }
    }, everySeconds * 1000);
    return () => clearInterval(id);
  }, [router, token, state, everySeconds]);

  return null;
}
