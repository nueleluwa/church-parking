import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Plate } from "@/components/Plate";
import { StatusBadge } from "@/components/StatusBadge";
import { correctionContext } from "@/lib/correction-context";
import { getPassByToken, getScanDetailByToken } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { rememberedPassToken } from "@/lib/pass-cookie";
import { qrSvg } from "@/lib/qr";
import { buildPassView, buildScanCard, lagosDate, passTone, type PassState } from "@/lib/rules";
import { currentStaff } from "@/lib/staff-auth";
import { PassRefresher } from "./PassRefresher";
import { StaffPass } from "./StaffPass";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parking pass", robots: { index: false } };

const STATE: Record<PassState, { label: string; note: string }> = {
  valid: { label: "VALID", note: "Show this to the attendant at the exit." },
  released: { label: "CAR RELEASED", note: "This car has left. This pass cannot be used again." },
  missed: { label: "CLOSED", note: "This visit has been closed." },
  expired: { label: "EXPIRED", note: "This pass is from an earlier day. Scan the sign to get a new one." },
};

export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
  // else sees the plate and status. Staff details arrive with staff sessions.
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
    },
    isOwner,
  );
  const state = STATE[view.state];
  const qr =
    view.kind === "owner" && view.state === "valid"
      ? await qrSvg(`${serverEnv().APP_URL}/p/${token}`)
      : null;

  return (
    <>
      <AppHeader />
      {view.state === "valid" && <PassRefresher token={token} state={view.state} />}
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <StatusBadge tone={passTone(view.state)} variant="banner">
          {state.label}
        </StatusBadge>
        {view.kind === "owner" && <p className="px-2 text-center text-lg font-medium">{state.note}</p>}

        <div className="rounded-card bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink-soft">Plate number</p>
          <Plate plate={view.plate} size="xl" className="mt-2" />

          {view.kind === "owner" && (
            <>
              {qr && (
                <div
                  role="img"
                  aria-label="Your pass QR code"
                  className="mx-auto mt-6 w-72 max-w-full rounded-2xl border-2 border-edge/30 bg-white p-3 [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              )}
              <p className="mt-5 text-sm text-ink-soft">Reference</p>
              <p className="text-4xl font-extrabold tracking-widest">{view.reference}</p>
              <p className="mt-3 flex flex-nowrap items-center justify-center gap-2 whitespace-nowrap text-lg font-semibold">
                <span data-area className="shrink-0">{view.areaName}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{view.serviceName}</span>
              </p>
              {qr && (
                <div className="mt-4 space-y-2 text-sm text-ink-soft">
                  <p>Tip: turn your screen brightness up so the attendant can scan it in the sun.</p>
                  <p>Staying for more than one service? This pass stays valid all day.</p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
