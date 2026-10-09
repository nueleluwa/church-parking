import { IconAlert } from "@/components/icons";
import { secondaryButton } from "@/components/ui";

/**
 * Shown when a check-in is refused because the car already has an open visit, or
 * belongs to a member. It never says whose car it is or shows the other pass.
 */
export function BlockedCard({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div role="alert" className="rounded-card border-4 border-danger bg-white p-5 text-center">
      <IconAlert className="mx-auto h-10 w-10 text-danger" />
      <p className="mt-2 text-xl font-extrabold text-danger">{message}</p>
      <p className="mt-2 text-ink-soft">An attendant will help you. The parking team has been told.</p>
      <button type="button" onClick={onBack} className={`${secondaryButton} mt-4`}>
        Go back
      </button>
    </div>
  );
}
