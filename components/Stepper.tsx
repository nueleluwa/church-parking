import { IconCheck } from "./icons";

/**
 * "1 Vehicle, 2 Confirm": where the member is in the check-in. The current step is a filled
 * red circle, finished steps have a tick, and the steps still to come are plain. The number
 * and the word are always there, so it never relies on colour alone.
 */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mx-auto flex max-w-xs items-start" aria-label="Check-in steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "invisible" : done || active ? "bg-accent" : "bg-edge/20"}`} />
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  done || active ? "border-accent bg-accent text-white" : "border-edge/30 bg-white text-ink-soft"
                }`}
              >
                {done ? <IconCheck className="h-4 w-4" /> : n}
              </span>
              <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? "invisible" : done ? "bg-accent" : "bg-edge/20"}`} />
            </div>
            <span className={`text-sm ${active ? "font-bold text-ink" : "text-ink-soft"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
