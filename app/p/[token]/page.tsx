import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FactRow } from "@/components/FactRow";
import { IconAlert, IconCalendar, IconCheck, IconClock, IconPin } from "@/components/icons";
import { MemberNav } from "@/components/MemberNav";
import { Plate } from "@/components/Plate";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";
import { correctionContext } from "@/lib/correction-context";
import { getPassByToken, getScanDetailByToken } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { formatLagosDate, formatLagosTime } from "@/lib/format";
import { currentMember } from "@/lib/member-auth";
import { rememberedPassToken } from "@/lib/pass-cookie";
import { qrSvg } from "@/lib/qr";
import { buildPassView, buildScanCard, describeVehicle, lagosDate, passTone, type PassState } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";
import { PassRefresher } from "./PassRefresher";
import { SaveDetailsCard } from "./SaveDetailsCard";
import { StaffPass } from "./StaffPass";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parking pass", robots: { index: false } };

const STATE: Record<PassState, { label: string; title: string; note: string }> = {
  valid: { label: "VALID", title: "You are checked in", note: "Show this QR code to the attendant at the exit." },
  released: { label: "CAR RELEASED", title: "This car has left", note: "This pass cannot be used again." },
  missed: { label: "CLOSED", title: "This visit is closed", note: "This visit has been closed." },
  expired: {
    label: "EXPIRED",
    title: "This pass has expired",
    note: "This pass is from an earlier day. Scan the sign to get a new one.",
  },
};

/** The card's colours follow the status: green when valid, red when expired, plain once finished. */
const CARD: Record<PassState, string> = {
  valid: "border-success bg-success-soft",
  expired: "border-danger bg-blush",
  released: "border-edge/20 bg-card",
  missed: "border-edge/20 bg-card",
};

const CIRCLE: Record<PassState, string> = {
  valid: "bg-success text-white",
  expired: "bg-danger text-white",
  released: "bg-panel text-ink",
  missed: "bg-panel text-ink",
};

export default async function PassPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { token } = await params;
  const { saved } = await searchParams;
  const pass = await getPassByToken(token);
  if (!pass) notFound();

  // Signed-in staff see the full staff view: first name, masked phone and the release buttons.
  const staff = await currentStaff();
  if (staff) {
    const detail = await getScanDetailByToken(token);
    if (detail) {
      return (
        <>
          <AppHeader />
          <main className="mx-auto max-w-md space-y-4 px-4 py-6">
            <StaffPass
              card={buildScanCard(detail, lagosDate(new Date()))}
              corrections={await correctionContext(staff)}
            />
          </main>
        </>
      );
    }
  }

  // Only the phone that made the pass sees the full pass (CI-6). Everyone
  // else sees the plate and status, and nothing else.
  const isOwner = (await rememberedPassToken()) === token;
  const member = isOwner ? await currentMember() : null;
  const view = buildPassView(
    {
      plate: pass.plate,
      status: pass.status,
      reference: pass.reference,
      areaName: pass.areaName,
      serviceName: pass.serviceName,
      serviceDate: pass.service_date,
      today: lagosDate(new Date()),
      make: pass.make,
      colour: pass.colour,
      checkedInAt: pass.checkedInAt,
    },
    isOwner,
  );
  const state = STATE[view.state];
  const qr =
    view.kind === "owner" && view.state === "valid"
      ? await qrSvg(`${serverEnv().APP_URL}/p/${token}`)
      : null;
  const details = view.kind === "owner" ? describeVehicle({ make: view.make, colour: view.colour }) : null;
  const StateIcon = view.state === "valid" ? IconCheck : view.state === "expired" ? IconAlert : IconClock;

  return (
    <>
      <AppHeader />
      {view.state === "valid" && <PassRefresher token={token} state={view.state} />}
      <main className={`mx-auto max-w-md space-y-4 px-4 pt-6 ${member ? "pb-28" : "pb-10"}`}>
        {saved && (
          <StatusBadge tone="success" variant="soft">
            Your account is ready. Next time, sign in and check in with two taps.
          </StatusBadge>
        )}

        <section className={`rounded-card border-2 p-5 text-center ${CARD[view.state]}`}>
          <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${CIRCLE[view.state]}`}>
            <StateIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-2 text-2xl font-extrabold">{view.kind === "owner" ? state.title : "Parking pass"}</h1>
          {view.kind === "owner" && <p className="mt-1 text-ink-soft">{state.note}</p>}
          <div className="mt-3">
            <StatusBadge tone={passTone(view.state)} variant="chip">
              {state.label}
            </StatusBadge>
          </div>

          {qr && (
            <div
              role="img"
              aria-label="Your pass QR code"
              className="mx-auto mt-4 w-64 max-w-full rounded-2xl border-2 border-edge/15 bg-white p-3 [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          )}

          <div className="mt-4 flex flex-col items-center">
            {view.kind === "owner" && <VehicleImage size="md" />}
            <Plate plate={view.plate} size="xl" variant="plain" />
            {details && <p className="mt-1 text-lg font-medium text-ink-soft">{details}</p>}
          </div>

          {view.kind === "owner" && (
            <>
              <p className="mt-4 text-sm text-ink-soft">Reference</p>
              <p className="text-3xl font-extrabold tracking-widest">{view.reference}</p>
            </>
          )}
        </section>

        {view.kind === "owner" && (
          <dl className="divide-y divide-edge/15 rounded-card bg-card px-5 shadow-sm">
            <FactRow icon={<IconClock className="h-5 w-5" />} label="Service">
              <span className="block">{view.serviceName}</span>
            </FactRow>
            <FactRow icon={<IconPin className="h-5 w-5" />} label="Parking area">
              <span data-area>{view.areaName}</span>
            </FactRow>
            {view.checkedInAt && (
              <FactRow icon={<IconCalendar className="h-5 w-5" />} label="Checked in">
                <span className="block whitespace-nowrap">{formatLagosTime(view.checkedInAt)}</span>
                <span className="block whitespace-nowrap text-sm font-medium text-ink-soft">
                  {formatLagosDate(view.checkedInAt)}
                </span>
              </FactRow>
            )}
          </dl>
        )}

        {qr && (
          <div className="space-y-1 px-2 text-center text-sm text-ink-soft">
            <p>Tip: turn your screen brightness up so the attendant can scan it in the sun.</p>
            <p>Staying for more than one service? This pass stays valid all day.</p>
          </div>
        )}

        {view.kind === "owner" && view.state === "valid" && pass.isGuest && <SaveDetailsCard token={token} />}
      </main>
      {member && <MemberNav active="home" />}
    </>
  );
}
