import Link from "next/link";
import type { ReactNode } from "react";
import { VehicleImage } from "@/components/VehicleImage";
import { describeVehicle, formatPlate } from "@/lib/rules";

/**
 * A vehicle wherever it is listed: the illustration, the registration number in bold, and the make, colour or any other detail under
 * it. The picture is always the same one, the same width and the same distance from the number, so a car looks the same in the
 * dashboard, Visits, Vehicles, Sweep and the rest, and a table row never grows because of it. A missing detail just leaves the line out.
 *
 * `href` makes the number a link (to the visit or the vehicle). `detail` shows the make and colour. `children` adds extra lines under
 * the number (service, car park, time).
 */
export function VehicleIdentity({
  plate,
  make,
  colour,
  href,
  ariaLabel,
  detail = true,
  summary,
  children,
}: {
  plate: string;
  make?: string | null;
  colour?: string | null;
  href?: string;
  ariaLabel?: string;
  detail?: boolean;
  /** Replaces the make and colour line, for a screen that also shows the type. */
  summary?: string | null;
  children?: ReactNode;
}) {
  const shown = formatPlate(plate);
  const details = summary !== undefined ? summary : detail ? describeVehicle({ make, colour }) : null;
  const number = "whitespace-nowrap text-base font-extrabold leading-snug sm:text-lg";
  return (
    <span className="flex min-w-0 items-center gap-3">
      <VehicleImage size="sm" />
      <span className="min-w-0">
        {href ? (
          <Link href={href} aria-label={ariaLabel} data-plate className={`block ${number} underline-offset-2 hover:underline`}>
            {shown}
          </Link>
        ) : (
          <span data-plate className={`block ${number}`}>
            {shown}
          </span>
        )}
        {details && <span className="block truncate text-sm leading-snug text-ink-soft">{details}</span>}
        {children}
      </span>
    </span>
  );
}
