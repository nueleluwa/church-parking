import { Chip as DsChip } from "@/components/ds/Chip";
import { EmptyState as DsEmptyState } from "@/components/ds/EmptyState";

/** Shared look for the Settings sections: the same card, field and chip as every other module. */
export const card = "surface";
export const input = "input";
export const EmptyState = DsEmptyState;

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 text-[0.9375rem] sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold sm:text-right">{children}</dd>
    </div>
  );
}

export function Help({ children }: { children: React.ReactNode }) {
  return <span className="help">{children}</span>;
}

/** The heading of a section: its title, one line of what it is for, and room for the main action. */
export function SectionHead({ title, children, action }: { title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h2 className="t-section">{title}</h2>
        {children && <p className="t-support mt-1.5 max-w-3xl">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/** The red main button of a section (Add service, Add car park...). */
export const addButton = "btn btn-primary";

/** A status in words, in black, grey and red only. */
export function Chip({ tone, children }: { tone: "on" | "off" | "alert"; children: React.ReactNode }) {
  return <DsChip tone={tone}>{children}</DsChip>;
}
