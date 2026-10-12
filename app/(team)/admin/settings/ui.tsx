import { field } from "@/components/ui";

/** Shared look for the Settings sections: one white card with a thin border, and a few small pieces. */
export const card = "rounded-2xl border border-edge/15 bg-card p-4 sm:p-5";
export const input = `${field} !mt-1 !py-2.5 !text-base`;

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold sm:text-right">{children}</dd>
    </div>
  );
}

export function Help({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-sm font-normal text-ink-soft">{children}</span>;
}

/** The heading of a section: its title, one line of what it is for, and room for the main action. */
export function SectionHead({ title, children, action }: { title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold">{title}</h2>
        {children && <p className="text-sm text-ink-soft">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/** The red main button of a section (Add service, Add car park...). */
export const addButton =
  "inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-white hover:bg-accent-dark";

/** A status in words and a small mark, in black, grey and red only. */
export function Chip({ tone, children }: { tone: "on" | "off" | "alert"; children: React.ReactNode }) {
  const look = tone === "on" ? "border-edge/70 bg-white text-ink" : tone === "off" ? "border-edge/15 bg-panel text-ink-soft" : "border-accent bg-white text-accent";
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-semibold ${look}`}>{children}</span>;
}
