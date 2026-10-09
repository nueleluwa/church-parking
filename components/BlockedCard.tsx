import { IconAlert } from "@/components/icons";
import { redButton } from "@/components/ui";

/**
 * Shown when a check-in is refused because the car already has an open visit, or belongs
 * to a member. It never says whose car it is or shows the other pass.
 */
export function BlockedCard({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div role="alert" className="rounded-card border-2 border-danger bg-blush p-6 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger text-white">
        <IconAlert className="h-7 w-7" />
      </span>
      <p className="mt-3 text-xl font-extrabold text-danger">{message}</p>
      <p className="mt-2 text-ink-soft">An attendant will help you. The parking team has been told.</p>
      <button type="button" onClick={onBack} className={`${redButton} mt-5`}>
        Go back
      </button>
    </div>
  );
}
