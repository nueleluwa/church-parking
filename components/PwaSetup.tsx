"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { outlineButton } from "@/components/ui";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** Registers the service worker (production only, so development never serves a stale page). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

/**
 * "Add to home screen". Android and desktop Chrome offer a real install button; iPhone has none, so it gets the two taps in words.
 * Nothing shows once the app is already installed.
 */
export function InstallApp() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  // iPhone has no install event; read it once on the phone (false while the page is built on the server)
  const ios = useSyncExternalStore(
    () => () => {},
    () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as unknown as { standalone?: boolean }).standalone,
    () => false,
  );

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (event) {
    return (
      <button
        type="button"
        className={outlineButton}
        onClick={async () => {
          await event.prompt();
          setEvent(null);
        }}
      >
        Add the app to your home screen
      </button>
    );
  }
  if (ios) {
    return (
      <p className="rounded-card bg-blush px-4 py-3 text-center text-sm" data-testid="install-ios">
        To add this app to your home screen, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
    );
  }
  return null;
}
