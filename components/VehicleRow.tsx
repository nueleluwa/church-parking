import type { ReactNode } from "react";
import { describeVehicle } from "@/lib/rules/vehicle";
import { Plate } from "./Plate";
import { VehicleImage } from "./VehicleImage";

/**
 * One saved vehicle: the illustration, the registration number in prominent type, and
 * the make, model and colour when we have them. Used for choosing a vehicle, My
 * Vehicles and the confirmation, so a car always looks the same.
 *
 * It adapts to the room it is given. With room (about 17rem and up) the picture sits
 * beside the plate. On the narrowest phones the plate (and any menu) gets the whole top
 * line, and the picture and details sit underneath, so the plate is never squeezed.
 */
export function VehicleRow({
  plate,
  make,
  colour,
  trailing,
  className = "",
}: {
  plate: string;
  make?: string | null;
  colour?: string | null;
  trailing?: ReactNode;
  className?: string;
}) {
  const details = describeVehicle({ make, colour });
  return (
    <div className={`@container min-w-0 ${className}`}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        <VehicleImage
          size="sm"
          className="col-start-1 row-start-2 @[15rem]:row-span-2 @[15rem]:row-start-1 @[15rem]:w-16"
        />
        <div className="col-span-2 col-start-1 row-start-1 min-w-0 @[15rem]:col-span-1 @[15rem]:col-start-2">
          <Plate plate={plate} size="md" align="start" variant="plain" />
        </div>
        {trailing && (
          <div className="col-start-3 row-start-1 @[15rem]:row-span-2">{trailing}</div>
        )}
        <p
          className={`col-span-2 col-start-2 row-start-2 min-w-0 truncate whitespace-nowrap text-sm text-ink-soft @[15rem]:col-span-1 @[15rem]:-mt-1 ${
            details ? "" : "invisible"
          }`}
        >
          {details ?? "No details"}
        </p>
      </div>
    </div>
  );
}
