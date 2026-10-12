import Link from "next/link";
import { listAllAreas } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { qrSvg } from "@/lib/qr";
import { requireStaff } from "@/lib/staff-auth";
import { outlineButton, primaryButton } from "@/components/ui";
import { Chip, SectionHead, card } from "../ui";

export const metadata = { title: "QR signs" };
export const dynamic = "force-dynamic";

/**
 * AD-2: one printable sign for each car park that is switched on, and a general sign for the whole church. A sign is made by its car
 * park (the code opens check-in for that car park), so a new sign comes from adding a car park. The address of a sign never changes
 * when its car park is renamed.
 */
export default async function QrSignsPage() {
  await requireStaff("admin");
  const all = await listAllAreas();
  const areas = all.filter((a) => a.active);
  const off = all.length - areas.length;
  const base = serverEnv().APP_URL.replace(/\/$/, "");
  const signs = await Promise.all(areas.map(async (a) => ({ ...a, svg: await qrSvg(`${base}/c/${a.slug}`) })));

  return (
    <>
      <section aria-label="QR signs" className={card}>
        <SectionHead
          title={
            <>
              QR signs (<span data-testid="sign-count">{signs.length}</span>)
            </>
          }
          action={
            <Link href="/admin/settings/parking-areas?add=1" className={outlineButton + " !w-auto"}>
              Add a car park
            </Link>
          }
        >
          Print one sign for each car park and put it where drivers park. Each code opens check-in for that car park. A new car park gets its own sign.
        </SectionHead>
        {signs.length === 0 ? (
          <p className="rounded-xl bg-page p-4 font-medium">No car park is switched on, so there is no sign to print.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {signs.map((s) => (
              <li key={s.id} className="rounded-xl border border-edge/15 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold">{s.name}</h3>
                  <Chip tone="on">Active</Chip>
                </div>
                <div
                  role="img"
                  aria-label={`QR code for ${s.name}`}
                  className="mx-auto my-3 w-full max-w-40 [&>svg]:h-auto [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: s.svg }}
                />
                <p className="mb-3 truncate text-center text-sm text-ink-soft">Opens check-in at /c/{s.slug}</p>
                <div className="grid gap-2">
                  <Link href={`/admin/settings/qr-signs/${s.slug}`} className={primaryButton}>
                    Open the sign to print
                  </Link>
                  <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`} download={`qr-${s.slug}.svg`} className={outlineButton}>
                    Download the QR code
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
        {off > 0 && (
          <p className="mt-3 text-sm text-ink-soft">
            {off} {off === 1 ? "car park is" : "car parks are"} switched off and {off === 1 ? "has" : "have"} no sign. Switch {off === 1 ? "it" : "them"} on in{" "}
            <Link href="/admin/settings/parking-areas" className="font-semibold text-accent underline">
              Parking areas
            </Link>
            .
          </p>
        )}
      </section>

      <section aria-label="The general sign" className={card}>
        <h2 className="text-lg font-bold">General sign</h2>
        <p className="mt-1 text-sm text-ink-soft">
          One QR code for the whole church. Drivers scan it, then choose their car park. Put it where people arrive, such as the gate or the church door. The
          signs above are still quicker, because the car park is already chosen.
        </p>
        <Link href="/admin/settings/qr-signs/general" className={`${outlineButton} mt-3 sm:!w-auto`}>
          Open the general sign to print
        </Link>
      </section>
    </>
  );
}
