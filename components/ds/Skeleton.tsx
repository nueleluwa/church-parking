import type { ReactNode } from "react";

/**
 * Loading placeholders. They are neutral grey blocks with the shape of what is loading, so the page does not jump when the real
 * content arrives. The wrapper tells a screen reader once that the page is loading; the blocks themselves are hidden from it. The
 * pulse stops for people who ask their system for less motion.
 */
export function SkeletonPage({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-6">
        {children}
      </div>
    </div>
  );
}

export const Block = ({ className = "" }: { className?: string }) => <div className={`skeleton ${className}`} />;

export function SkeletonHeader({ actions = false }: { actions?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2.5">
        <Block className="h-8 w-48" />
        <Block className="h-4 w-72 max-w-full" />
      </div>
      {actions && <Block className="h-11 w-40 rounded-full" />}
    </div>
  );
}

export function SkeletonMetrics({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="metric">
          <Block className="hidden h-11 w-11 shrink-0 rounded-full sm:block" />
          <div className="flex-1 space-y-2.5">
            <Block className="h-3.5 w-24" />
            <Block className="h-7 w-14" />
            <Block className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, filters = false, title = true }: { rows?: number; filters?: boolean; title?: boolean }) {
  return (
    <div className="surface space-y-4">
      {title && <Block className="h-6 w-44" />}
      {filters && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Block className="col-span-2 h-11 xl:col-span-2" />
          <Block className="h-11" />
          <Block className="h-11" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Block className="h-9 w-14 shrink-0" />
            <Block className="h-5 flex-1" />
            <Block className="hidden h-5 w-24 sm:block" />
            <Block className="hidden h-5 w-20 lg:block" />
            <Block className="h-7 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 3, cols = "sm:grid-cols-2 xl:grid-cols-3" }: { count?: number; cols?: string }) {
  return (
    <div className={`grid gap-3 sm:gap-4 ${cols}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="surface space-y-3">
          <Block className="h-5 w-32" />
          <div className="grid grid-cols-3 gap-3">
            <Block className="h-10" />
            <Block className="h-10" />
            <Block className="h-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonForm({ fields = 3 }: { fields?: number }) {
  return (
    <div className="surface space-y-4">
      <Block className="h-6 w-40" />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Block className="h-3.5 w-28" />
          <Block className="h-11 w-full" />
        </div>
      ))}
      <Block className="h-11 w-36 rounded-full" />
    </div>
  );
}
