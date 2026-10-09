import { formatPlate } from "@/lib/rules/plates";

/**
 * A number plate, always on ONE line and never cut off. The text is shown with
 * the usual spacing ("PHC 234 AB") but the stored plate is never changed. The
 * letters scale with the width of the space they are in (a container query), so
 * even a long plate fits a small phone without wrapping.
 */
const SIZES = {
  // Pass page: the biggest, the driver holds this up
  xl: "border-4 px-4 py-2 text-3xl text-[clamp(1.25rem,9.5cqw,3rem)]",
  // Attendant scan card
  lg: "border-4 px-3 py-1.5 text-2xl text-[clamp(1.125rem,9cqw,2.25rem)]",
  // Lists: sweep, alerts, saved cars
  md: "border-2 px-2.5 py-1 text-xl text-[clamp(1rem,8cqw,1.5rem)]",
} as const;

export function Plate({
  plate,
  size = "lg",
  align = "center",
  className = "",
}: {
  plate: string;
  size?: keyof typeof SIZES;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div className={`@container w-full min-w-0 ${align === "center" ? "text-center" : "text-left"} ${className}`}>
      <span
        data-plate
        className={`inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-xl border-ink bg-white font-extrabold leading-none tracking-wider ${SIZES[size]}`}
      >
        {formatPlate(plate)}
      </span>
    </div>
  );
}
