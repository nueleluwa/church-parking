import { Chip } from "@/components/ds/Chip";
import { IconAlert, IconCheck, IconLock } from "@/components/icons";
import { MEMBER_STATE_LABEL, type MemberState } from "@/lib/rules";

/** A member's state in words and a small mark: active, inactive (switched off) or locked (too many wrong PINs). */
export function MemberChip({ state }: { state: MemberState }) {
  const tone = state === "active" ? "on" : state === "inactive" ? "off" : "alert";
  const icon = state === "active" ? <IconCheck className="h-3.5 w-3.5" /> : state === "inactive" ? <IconLock className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />;
  return (
    <Chip tone={tone} icon={icon}>
      {MEMBER_STATE_LABEL[state]}
    </Chip>
  );
}
