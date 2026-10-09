import Image from "next/image";

/**
 * The supplied vehicle illustration (references/images (2).jpg), with its white margin
 * trimmed by scripts/prepare-vehicle-image.mjs. It is only a visual aid: the plate
 * and the vehicle record are what identify a car. The picture keeps its shape (never
 * stretched or cropped), and `mix-blend-multiply` lets its white background disappear
 * on tinted cards, such as a selected row.
 */
const SIZES = {
  sm: "w-14", // lists: history
  md: "w-20", // lists: saved vehicles
  lg: "w-36", // the pass
  xl: "w-44", // the confirmation, the main picture on that screen
} as const;

export function VehicleImage({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <Image
      src="/vehicle-illustration.png"
      alt=""
      aria-hidden="true"
      width={166}
      height={90}
      unoptimized
      className={`h-auto shrink-0 select-none mix-blend-multiply ${SIZES[size]} ${className}`}
    />
  );
}
