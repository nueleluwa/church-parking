import { IconCheck, IconLock } from "@/components/icons";

/** Active or Inactive, in words and a small mark, in the church's black, grey and red only. */
export function StatusChip({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-edge/70 bg-white px-2.5 py-0.5 text-sm font-semibold text-ink">
      <IconCheck aria-hidden="true" className="h-3.5 w-3.5" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-edge/15 bg-panel px-2.5 py-0.5 text-sm font-semibold text-ink-soft">
      <IconLock aria-hidden="true" className="h-3.5 w-3.5" />
      Inactive
    </span>
  );
}
