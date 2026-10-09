import { IconPin } from "./icons";

/** "You are parking in Car Park 1": the car park comes from the QR sign, so it is shown, never asked. */
export function AreaCard({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-card p-4 shadow-sm">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent">
        <IconPin className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-soft">You are parking in</p>
        <h2 className="text-xl font-bold">{name}</h2>
        <p className="text-sm text-ink-soft">Selected from the QR sign</p>
      </div>
    </div>
  );
}
