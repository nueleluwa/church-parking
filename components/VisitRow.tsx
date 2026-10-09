import Link from "next/link";
import { formatVisitTime } from "@/lib/format";
import { formatPlate } from "@/lib/rules/plates";
import { visitTone } from "@/lib/rules/status";
import { IconCar } from "./icons";
import { StatusBadge } from "./StatusBadge";

const STATUS = { parked: "Parked", released: "Released", missed: "Missed" } as const;

export type Visit = {
  checkedInAt: string;
  plate: string;
  serviceName: string;
  areaName: string;
  status: "parked" | "released" | "missed";
  /** Only for a car still parked today: the row then opens its pass. */
  passToken: string | null;
};

/**
 * One past or current visit: a round car icon (green while the car is parked), the time, the
 * plate, the service and car park, and the status on the right. A car that is still parked
 * opens its pass when tapped.
 */
export function VisitRow({ visit }: { visit: Visit }) {
  const parked = visit.status === "parked";
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
          parked ? "bg-success-soft text-success" : "bg-panel text-ink-soft"
        }`}
      >
        <IconCar className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-nowrap font-bold">{formatVisitTime(visit.checkedInAt)}</p>
        <p className="whitespace-nowrap text-sm font-semibold">{formatPlate(visit.plate)}</p>
        <p className="flex flex-nowrap gap-1.5 whitespace-nowrap text-sm text-ink-soft">
          <span className="truncate">{visit.serviceName}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{visit.areaName}</span>
        </p>
      </div>
      <StatusBadge tone={visitTone(visit.status)} className="shrink-0">
        {STATUS[visit.status]}
      </StatusBadge>
    </>
  );
  const row = "flex items-center gap-3 py-3";
  return (
    <li>
      {visit.passToken ? (
        <Link href={`/p/${visit.passToken}`} aria-label={`Open the pass for ${formatPlate(visit.plate)}`} className={row}>
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}
