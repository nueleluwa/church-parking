import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FactRow } from "@/components/FactRow";
import { IconCalendar, IconClock, IconPin } from "@/components/icons";
import { Plate } from "@/components/Plate";
import { StatusBadge } from "@/components/StatusBadge";
import { VehicleImage } from "@/components/VehicleImage";
import { correctionContext } from "@/lib/correction-context";
import { getPassByToken, getScanDetailByToken } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { formatLagosDate, formatLagosTime } from "@/lib/format";
import { rememberedPassToken } from "@/lib/pass-cookie";
import { qrSvg } from "@/lib/qr";
import { buildPassView, buildScanCard, describeVehicle, lagosDate, passTone, type PassState } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";
import { PassRefresher } from "./PassRefresher";
import { SaveDetailsCard } from "./SaveDetailsCard";
import { StaffPass } from "./StaffPass";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parking pass", robots: { index: false } };

const STATE: Record<PassState, { label: string; note: string }> = {
  valid: { label: "VALID", note: "Checked in. Show this QR code to the attendant at the exit." },
  released: { label: "CAR RELEASED", note: "This car has left. This pass cannot be used again." },
  missed: { label: "CLOSED", note: "This visit has been closed." },
  expired: { label: "EXPIRED", note: "This pass is from an earlier day. Scan the sign to get a new one." },
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

  return (
    <>
      <AppHeader />
      {view.state === "valid" && <PassRefresher token={token} state={view.state} />}
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        {saved && (
          <StatusBadge tone="success" variant="soft">
            Your account is ready. Next time, sign in and check in with two taps.
          </StatusBadge>
        )}

        <StatusBadge tone={passTone(view.state)} variant="banner">
          {state.label}
        </StatusBadge>
        {view.kind === "owner" && <p className="px-2 text-center text-lg font-medium">{state.note}</p>}

        <div className="rounded-card bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink-soft">Plate number</p>
          <Plate plate={view.plate} size="xl" className="mt-2" />

          {view.kind === "owner" && (
            <>
              <div className="mt-3 flex flex-col items-center">
                <VehicleImage size="lg" />
                {details && <p className="mt-1 text-base font-medium text-ink-soft">{details}</p>}
              </div>

              {qr && (
                <div
                  role="img"
                  aria-label="Your pass QR code"
                  className="mx-auto mt-4 w-72 max-w-full rounded-2xl border-2 border-edge/30 bg-white p-3 [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              )}
              <p className="mt-5 text-sm text-ink-soft">Reference</p>
              <p className="text-4xl font-extrabold tracking-widest">{view.reference}</p>

              <dl className="mt-4 divide-y divide-edge/15 border-t border-edge/15 text-left">
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

              {qr && (
                <div className="mt-4 space-y-2 text-sm text-ink-soft">
                  <p>Tip: turn your screen brightness up so the attendant can scan it in the sun.</p>
                  <p>Staying for more than one service? This pass stays valid all day.</p>
                </div>
              )}
            </>
          )}
        </div>

        {view.kind === "owner" && view.state === "valid" && pass.isGuest && <SaveDetailsCard token={token} />}
      </main>
    </>
  );
}
