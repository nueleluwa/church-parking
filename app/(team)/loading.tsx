/**
 * Shown while any team page loads. It sits inside the team layout, so the header and
 * the tab bar stay exactly where they are and only this area changes.
 */
export default function TeamLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-panel" />
      <div className="h-48 animate-pulse rounded-card bg-panel" />
      <div className="h-14 animate-pulse rounded-full bg-panel" />
    </div>
  );
}
