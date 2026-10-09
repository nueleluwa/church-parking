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
            <Link href={`/admin/signs/${s.slug}`} className={primaryButton}>
              Open the sign to print
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/admin" className={outlineButton}>
        Back to Admin
      </Link>
    </>
  );
}
