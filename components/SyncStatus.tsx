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

/** "Online" or "Offline" with a dot, from the phone's own connection. There is no offline mode (D-06). */
export function SyncStatus() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <span className="flex items-center gap-2 font-semibold">
      {online ? "Online" : "Offline"}
      <span aria-hidden="true" className={`h-3 w-3 rounded-full ${online ? "bg-success" : "bg-danger"}`} />
    </span>
  );
}
