"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Says so when the phone has no internet, instead of leaving buttons that seem to do nothing (D-06: no offline mode). */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div role="alert" className="fixed inset-x-0 bottom-0 z-50 bg-danger px-4 py-3 text-center font-semibold text-white">
      No internet connection. Please wait, or see an attendant. Staff: use the paper tallies.
    </div>
  );
}
