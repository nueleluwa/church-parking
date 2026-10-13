import { Chip } from "@/components/ds/Chip";
import { IconCheck, IconLock } from "@/components/icons";

/** Active or Inactive, in words and a small mark, in the church's black and grey. */
export function StatusChip({ active }: { active: boolean }) {
  return active ? (
    <Chip tone="on" icon={<IconCheck className="h-3.5 w-3.5" />}>
      Active
    </Chip>
  ) : (
    <Chip tone="off" icon={<IconLock className="h-3.5 w-3.5" />}>
      Inactive
    </Chip>
  );
}
