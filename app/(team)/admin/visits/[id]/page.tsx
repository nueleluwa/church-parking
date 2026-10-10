import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FactList, FactRow } from "@/components/FactRow";
import { IconCalendar, IconCheck, IconClock, IconPin, IconTimer, IconUser } from "@/components/icons";
import { Plate } from "@/components/Plate";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";
import { outlineButton } from "@/components/ui";
import { getVisitDetail } from "@/lib/db";
import { formatDuration, formatLagosDate, formatLagosTime } from "@/lib/format";
import { describeVehicle } from "@/lib/rules/vehicle";
import { requireStaff } from "@/lib/staff-auth";
import { RevealPhone } from "./RevealPhone";
import { VisitActions } from "./VisitActions";

export const metadata = { title: "Visit details" };
export const dynamic = "force-dynamic";

const STATUS = {
  parked: { label: "Currently parked", tone: "success" },
  released: { label: "Released", tone: "neutral" },
  missed: { label: "Missed check-out", tone: "danger" },
} as const;

const METHOD: Record<string, string> = {
  scan: "Scanned pass",
  search: "Looked up by hand (no pass)",
  sweep: "End-of-service sweep",
  midnight: "Closed at midnight",
};

const TABS = [
  { value: "details", label: "Details" },
  { value: "timeline", label: "Timeline" },
  { value: "driver", label: "Member / guest" },
] as const;

/** One visit in full: the facts, what you can do with it, the driver (masked), and everything that happened to it, in order. */
export default async function VisitDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireStaff("coordinator");
  const { id } = await params;
  const asked = (await searchParams).tab;
  const tab = TABS.some((t) => t.value === asked) ? (asked as (typeof TABS)[number]["value"]) : "details";
  if (!z.string().uuid().safeParse(id).success) notFound();
  const v = await getVisitDetail(id);
  if (!v) notFound();

  const end = v.releasedAt ? new Date(v.releasedAt) : new Date();
  const minutes = Math.max(0, Math.round((end.getTime() - new Date(v.checkedInAt).getTime()) / 60_000));
  const details = describeVehicle({ make: v.make, colour: v.colour });
  const status = STATUS[v.status];

  return (
    <>
      <section className="rounded-card bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <VehicleImage size="md" />
          <div className="min-w-0 flex-1">
            <Plate plate={v.plate} size="lg" align="start" variant="plain" />
            {details && <p className="truncate text-base text-ink-soft">{details}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {v.held && <StatusBadge tone="danger">ON HOLD</StatusBadge>}
        </div>
      </section>

      <nav aria-label="Visit" className="flex flex-wrap gap-2 border-b border-edge/20 pb-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/visits/${v.id}${t.value === "details" ? "" : `?tab=${t.value}`}`}
            aria-current={t.value === tab ? "page" : undefined}
            className={`rounded-full px-4 py-2 font-semibold ${t.value === tab ? "bg-accent text-white" : "text-ink hover:bg-panel"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "details" && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
        <section aria-label="Details" className="rounded-card bg-card p-4 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-bold">Details</h2>
          <FactList className="mt-1 divide-y divide-edge/15">
            <FactRow icon={<IconClock className="h-5 w-5" />} label="Service">
              <span className="block">{v.serviceName}</span>
            </FactRow>
            <FactRow icon={<IconPin className="h-5 w-5" />} label="Parking area">
              <span data-area>{v.areaName}</span>
            </FactRow>
            <FactRow icon={<IconCalendar className="h-5 w-5" />} label="Checked in">
              <span className="block whitespace-nowrap">{formatLagosTime(v.checkedInAt)}</span>
              <span className="block whitespace-nowrap text-sm font-medium text-ink-soft">{formatLagosDate(v.checkedInAt)}</span>
            </FactRow>
            {v.releasedAt && (
              <FactRow icon={<IconCheck className="h-5 w-5" />} label={v.status === "released" ? "Released" : "Closed"}>
                <span className="block whitespace-nowrap">{formatLagosTime(v.releasedAt)}</span>
                <span className="block text-sm font-medium text-ink-soft">
                  {[v.releasedBy ? `by ${v.releasedBy}` : null, v.releaseMethod ? METHOD[v.releaseMethod] : null].filter(Boolean).join(" · ")}
                </span>
              </FactRow>
            )}
            <FactRow icon={<IconTimer className="h-5 w-5" />} label="Duration">
              <span className="block whitespace-nowrap">{formatDuration(minutes)}</span>
            </FactRow>
            <FactRow icon={<IconClock className="h-5 w-5" />} label="Reference">
              <span className="block whitespace-nowrap">{v.reference}</span>
            </FactRow>
          </FactList>
        </section>


          <section aria-label="Actions" className="space-y-3 rounded-card bg-card p-4 shadow-sm">
            <h2 className="text-lg font-bold">Actions</h2>
            {v.status === "parked" && !v.held ? (
              <VisitActions visitId={v.id} plate={v.plate} />
            ) : (
              <p className="text-ink-soft">
                {v.held ? "This car is on hold. A coordinator clears the hold from the scanner view." : "This visit has ended, so there is nothing to release."}
              </p>
            )}
            <Link href={`/p/${v.passToken}`} className={outlineButton}>
              Open in the scanner view
            </Link>
          </section>
        </div>
      )}

      {tab === "driver" && (
        <section aria-label="Driver" className="rounded-card bg-card p-4 shadow-sm">
          <h2 className="text-lg font-bold">Driver</h2>
          <FactList className="mt-1 divide-y divide-edge/15">
            <FactRow icon={<IconUser className="h-5 w-5" />} label="Pass type">
              <StatusBadge tone="neutral">{v.isGuest ? "GUEST" : "MEMBER"}</StatusBadge>
            </FactRow>
            <FactRow icon={<IconUser className="h-5 w-5" />} label="First name">
              <span className="block">{v.firstName}</span>
            </FactRow>
            <FactRow icon={<IconUser className="h-5 w-5" />} label="Phone">
              <RevealPhone visitId={v.id} last4={v.phoneLast4} />
            </FactRow>
            {v.checkedInBy && (
              <FactRow icon={<IconUser className="h-5 w-5" />} label="Registered by">
                <span className="block">{v.checkedInBy}</span>
              </FactRow>
            )}
          </FactList>
        </section>
      )}

      {tab === "timeline" && (
      <section aria-label="Timeline" className="rounded-card bg-card p-4 shadow-sm">
        <h2 className="text-lg font-bold">Timeline</h2>
        <ol className="mt-2 divide-y divide-edge/15">
          {v.timeline.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex gap-3 py-2">
              <span className="w-24 shrink-0 text-sm font-semibold text-ink-soft">
                <span className="block whitespace-nowrap">{formatLagosTime(e.at)}</span>
                <span className="block whitespace-nowrap text-xs font-normal">{formatLagosDate(e.at)}</span>
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{e.what}</span>
                {e.by && <span className="block text-sm text-ink-soft">by {e.by}</span>}
                {e.reason && <span className="block text-sm text-ink-soft">Reason: {e.reason}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
      )}
    </>
  );
}
