export default function Loading() {
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6" aria-busy="true" aria-label="Loading">
      <div className="h-24 animate-pulse rounded-card bg-panel" />
      <div className="h-64 animate-pulse rounded-card bg-panel" />
      <div className="h-14 animate-pulse rounded-full bg-panel" />
    </main>
  );
}
