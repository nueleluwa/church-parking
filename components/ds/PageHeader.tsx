import type { ReactNode } from "react";

/** The top of every admin page: the title, one line of what the page is for, and the page's main action or filters on the right. */
export function PageHeader({ title, children, actions }: { title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="t-page">{title}</h1>
        {children && <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink-soft">{children}</p>}
      </div>
      {actions}
    </header>
  );
}
