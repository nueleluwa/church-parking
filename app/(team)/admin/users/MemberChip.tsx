import { IconAlert, IconCheck, IconLock } from "@/components/icons";
import { MEMBER_STATE_LABEL, type MemberState } from "@/lib/rules";

/** A member's state in words and a small mark, in the church's black, grey and red only. */
export function MemberChip({ state }: { state: MemberState }) {
  const look =
    state === "active" ? "border-edge/70 bg-white text-ink" : state === "inactive" ? "border-edge/15 bg-panel text-ink-soft" : "border-accent bg-white text-accent";
  const icon = state === "active" ? <IconCheck className="h-3.5 w-3.5" /> : state === "inactive" ? <IconLock className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-semibold ${look}`}>
      <span aria-hidden="true">{icon}</span>
      {MEMBER_STATE_LABEL[state]}
    </span>
  );
}
