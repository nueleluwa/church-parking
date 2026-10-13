"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconX } from "@/components/icons";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The right-hand panel (a full-screen sheet on a phone). It is opened by the address, so a link or a refresh keeps it. Focus moves into
 * it when it opens, Tab stays inside it, Escape closes it, and the page behind does not scroll.
 */
export function Panel({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea');
    (first ?? ref.current)?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = scroll;
      previous?.focus?.();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      router.push(closeHref);
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstItem) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <Link href={closeHref} aria-label="Close panel" tabIndex={-1} className="absolute inset-0 bg-night/40" />
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex h-full w-full min-w-0 flex-col bg-white shadow-xl focus:outline-none sm:max-w-md"
      >
        <header className="flex items-center gap-3 border-b border-edge/15 px-5 py-4">
          <h2 className="t-section flex-1">{title}</h2>
          <Link href={closeHref} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-page">
            <IconX className="h-5 w-5" />
          </Link>
        </header>
        {children}
      </section>
    </div>
  );
}
