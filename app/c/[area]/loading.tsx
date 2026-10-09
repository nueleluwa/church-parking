/**
 * Shown while a check-in page loads. The page may open with the logo header (the welcome) or
 * a title header (the member steps), so this shows the same black bar with nothing in it.
 * The bar then stays where it is and only its contents appear, so the header never jumps.
 */
export default function CheckInLoading() {
  return (
    <>
      <header
        aria-hidden="true"
        className="sticky top-0 z-20 rounded-b-3xl border-b-4 border-accent bg-night px-4 py-3 shadow-md"
      >
        <div className="mx-auto h-8 max-w-md" />
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 pb-8 pt-5" aria-busy="true" aria-label="Loading">
        <div className="h-20 animate-pulse rounded-card bg-panel" />
        <div className="h-40 animate-pulse rounded-card bg-panel" />
        <div className="h-14 animate-pulse rounded-full bg-panel" />
      </main>
    </>
  );
}
