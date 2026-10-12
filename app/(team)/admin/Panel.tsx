import Link from "next/link";
import type { ReactNode } from "react";

/** The right-hand panel (a full-screen sheet on a phone). It is opened by the address, so a link or a refresh keeps it. */
export function Panel({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <Link href={closeHref} aria-label="Close panel" className="absolute inset-0 bg-night/40" />
      <section role="dialog" aria-modal="true" aria-label={title} className="relative flex h-full w-full min-w-0 flex-col bg-white shadow-xl sm:max-w-md">
        <header className="flex items-center gap-3 border-b border-edge/15 px-5 py-4">
          <h2 className="flex-1 text-xl font-extrabold">{title}</h2>
          <Link href={closeHref} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-2xl leading-none hover:bg-page">
            ×
          </Link>
        </header>
        {children}
      </section>
    </div>
  );
}
