import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getPassByToken } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { rememberedPassToken } from "@/lib/pass-cookie";
import { qrSvg } from "@/lib/qr";
import { buildPassView, formatPlate, lagosDate, type PassState } from "@/lib/rules";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const STATE: Record<PassState, { label: string; note: string; box: string }> = {
  valid: {
    label: "VALID",
    note: "Show this to the attendant at the exit.",
    box: "border-edge bg-select text-ink",
  },
  released: {
    label: "CAR RELEASED",
    note: "This car has left. This pass can't be used again.",
    box: "border-edge bg-white text-ink",
  },
  missed: {
    label: "CLOSED",
    note: "This visit has been closed.",
    box: "border-edge bg-white text-ink",
  },
  expired: {
    label: "EXPIRED",
    note: "This pass is from an earlier day. Scan the sign to get a new one.",
    box: "border-danger bg-white text-danger",
  },
};

export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pass = await getPassByToken(token);
  if (!pass) notFound();

  // Only the phone that made the pass sees the full pass (CI-6). Everyone
  // else sees the plate and status. Staff details arrive in M3.
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
  const qr = view.kind === "owner" && view.state === "valid"
    ? await qrSvg(`${serverEnv().APP_URL}/p/${token}`)
    : null;

  return (
    <>
      <AppHeader title="Parking pass" />
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <div className="rounded-card bg-card p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink-soft">Plate number</p>
          <p className="text-5xl font-extrabold tracking-wide">{formatPlate(view.plate)}</p>

          <div className={`mt-5 rounded-xl border-4 px-4 py-3 ${state.box}`}>
            <p className="text-2xl font-extrabold">{state.label}</p>
            {view.kind === "owner" && <p className="mt-1 font-medium">{state.note}</p>}
          </div>

          {view.kind === "owner" && (
            <>
              {qr && (
                <div
                  role="img"
                  aria-label="Your pass QR code"
                  className="mx-auto mt-5 w-64 max-w-full [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              )}
              <p className="mt-4 text-sm text-ink-soft">Reference</p>
              <p className="text-3xl font-extrabold tracking-widest">{view.reference}</p>
              <p className="mt-3 font-medium">
                {view.areaName} · {view.serviceName}
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
