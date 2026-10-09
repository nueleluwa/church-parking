"use client";

import { AppHeader } from "@/components/AppHeader";
import { IconAlert } from "@/components/icons";
import { card, pageMain, primaryButton } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <AppHeader />
      <main className={pageMain}>
        <div className={`${card} text-center`}>
          <IconAlert className="mx-auto h-12 w-12 text-danger" />
          <h1 className="mt-3 text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-ink-soft">
            Please try again. If it keeps happening, see a parking attendant. They have paper tallies as a back-up.
          </p>
          <button onClick={reset} className={`${primaryButton} mt-5`}>
            Try again
          </button>
        </div>
      </main>
    </>
  );
}
