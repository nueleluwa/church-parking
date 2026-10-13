import type { ReactNode } from "react";

/** What a list or table says when there is nothing to show: a plain sentence, and (if useful) what to do next. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className="rounded-xl bg-page p-5 text-[0.9375rem] font-medium leading-relaxed">
      {children} {action}
    </div>
  );
}

/** What a screen says when its data could not be loaded. It is an alert, and it offers the retry the page can give. */
export function LoadError({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border-2 border-accent bg-white p-5 text-[0.9375rem] font-medium leading-relaxed text-accent">
      {children} {action}
    </div>
  );
}
