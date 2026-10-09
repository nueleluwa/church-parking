import { AppHeader } from "@/components/AppHeader";

/**
 * Shown while a public page loads. It carries the same header as the pages
 * themselves, so moving between pages never makes the header disappear and come
 * back. (The staff area has its own loading screen inside its layout, so its
 * header and tab bar stay put.)
 */
export default function Loading() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-md space-y-4 px-4 pb-8 pt-5" aria-busy="true" aria-label="Loading">
        <div className="h-24 animate-pulse rounded-card bg-panel" />
        <div className="h-64 animate-pulse rounded-card bg-panel" />
        <div className="h-14 animate-pulse rounded-full bg-panel" />
      </main>
    </>
  );
}
