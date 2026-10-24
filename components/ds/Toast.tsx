"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconX } from "@/components/icons";

type Tone = "success" | "error" | "warning" | "info";
type Toast = { id: number; tone: Tone; message: string };

type Api = { success: (message: string) => void; error: (message: string) => void; warning: (message: string) => void; info: (message: string) => void };

const NOOP: Api = { success: () => {}, error: () => {}, warning: () => {}, info: () => {} };
const Ctx = createContext<Api>(NOOP);

/** Show a short confirmation or error from any screen: `const toast = useToast(); toast.success("Vehicle saved successfully.")`. */
export const useToast = (): Api => useContext(Ctx);

const LIFETIME = { success: 6000, info: 6000, warning: 8000, error: 9000 } as const;

/**
 * A notice the server put in the page (a saved banner, a bad date range) shown as a toast when the page opens. Use it where a server
 * component used to draw a message box. It renders nothing itself.
 */
export function ToastNotice({ tone, children, clear = [] }: { tone: Tone; children: string; clear?: string[] }) {
  const toast = useToast();
  const clearKey = clear.join(",");
  useEffect(() => {
    toast[tone](children);
    // Take the one-time words out of the address, so going back to the page does not show the notice again
    if (clearKey) {
      const url = new URL(window.location.href);
      for (const name of clearKey.split(",")) url.searchParams.delete(name);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [toast, tone, children, clearKey]);
  return null;
}

/**
 * The toasts. They appear at the top (the top-right corner on a wide screen, under the search bar), where the eye already is, disappear by themselves, and can be dismissed. The same message
 * is never stacked twice, and at most four are shown. They are announced politely to a screen reader, and they do not move for people
 * who ask for less motion. Success is only ever shown after the server has confirmed the change.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const recent = useRef(new Map<string, number>());

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (tone: Tone, message: string) => {
      const key = `${tone}:${message}`;
      const now = new Date().getTime();
      if (now - (recent.current.get(key) ?? 0) < 2000) return; // the same message, a moment ago
      recent.current.set(key, now);
      const id = next.current++;
      setToasts((all) => [...all.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), LIFETIME[tone]);
    },
    [dismiss],
  );

  const api = useMemo<Api>(
    () => ({ success: (m) => show("success", m), error: (m) => show("error", m), warning: (m) => show("warning", m), info: (m) => show("info", m) }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Confirmations"
        className="pointer-events-none fixed inset-x-4 top-4 z-[80] flex flex-col items-center gap-2 sm:items-end lg:left-auto lg:right-6 lg:top-20 lg:w-96 print:hidden"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            data-toast={t.tone}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl px-4 py-3 text-[0.9375rem] font-medium shadow-lg motion-safe:animate-[toast-in_160ms_ease-out] ${
              t.tone === "error"
                ? "border-2 border-accent bg-white text-accent"
                : t.tone === "warning"
                  ? "border-2 border-warning-edge bg-warning-soft text-ink"
                  : "bg-night text-white"
            }`}
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {t.tone === "error" || t.tone === "warning" ? <IconAlert className="h-5 w-5" /> : <IconCheck className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current">
              <IconX className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
