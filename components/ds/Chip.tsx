import type { ReactNode } from "react";

export type ChipTone = "on" | "off" | "alert";

/**
 * The one status chip: words, a small mark, and black, grey or red. `on` is the normal or open state, `off` is finished or switched
 * off, `alert` needs attention. Meaning never depends on colour alone, because the words and the mark are always there.
 */
export function Chip({ tone, icon, children }: { tone: ChipTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`chip chip-${tone}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
