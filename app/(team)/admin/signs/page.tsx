import Link from "next/link";
import { listAllAreas } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { qrSvg } from "@/lib/qr";
import { requireStaff } from "@/lib/staff-auth";
import { outlineButton, primaryButton } from "@/components/ui";

export const metadata = { title: "QR signs" };
export const dynamic = "force-dynamic";

/** AD-2: one printable sign for each car park. The QR address never changes when a car park is renamed. */
export default async function SignsPage() {
  await requireStaff("admin");
  const areas = (await listAllAreas()).filter((a) => a.active);
  const base = serverEnv().APP_URL.replace(/\/$/, "");
  const signs = await Promise.all(areas.map(async (a) => ({ ...a, svg: await qrSvg(`${base}/c/${a.slug}`) })));

  return (
    <>
      <p className="text-ink-soft">
        Print one sign for each car park and put it where drivers park. Each code opens check-in for that car park.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {signs.map((s) => (
          <li key={s.id} className="rounded-card bg-card p-4 shadow-sm">
            <h2 className="text-lg font-bold">{s.name}</h2>
            <div
              role="img"
              aria-label={`QR code for ${s.name}`}
              className="mx-auto my-3 w-full max-w-48 [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: s.svg }}
            />
            <p className="mb-3 truncate text-center text-sm text-ink-soft">/c/{s.slug}</p>
            <div className="grid gap-2">
              <Link href={`/admin/signs/${s.slug}`} className={primaryButton}>
                Open the sign to print
              </Link>
              <a
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`}
                download={`qr-${s.slug}.svg`}
                className={outlineButton}
              >
                Download the QR code
              </a>
            </div>
          </li>
        ))}
      </ul>
      <section aria-label="The general sign" className="rounded-card bg-card p-4 shadow-sm">
        <h2 className="text-lg font-bold">General sign</h2>
        <p className="mt-1 text-sm text-ink-soft">
          One QR code for the whole church. Drivers scan it, then choose their car park. Put it where people arrive, such as the
          gate or the church door. The signs above are still quicker, because the car park is already chosen.
        </p>
        <Link href="/admin/signs/general" className={`${outlineButton} mt-3`}>
          Open the general sign to print
        </Link>
      </section>
      <Link href="/admin" className={outlineButton}>
        Back to Admin
      </Link>
    </>
  );
}
