import { SignScanPage } from "@/components/SignScanPage";
import { TitleHeader } from "@/components/TitleHeader";
import { listActiveAreas } from "@/lib/db";

export const metadata = { title: "Scan a car park sign" };
export const dynamic = "force-dynamic";

/**
 * Scanning a car park sign: its own page, separate from choosing a car park from the list (/c). The sign's QR code
 * is looked up among the church's open car parks, so a sign for a car park that is not in use is never accepted.
 */
export default async function ScanSignRoute() {
  const areas = await listActiveAreas();
  return (
    <>
      <TitleHeader title="Scan Sign" backHref="/" />
      <main className="mx-auto max-w-md px-4 pb-10 pt-5">
        <SignScanPage areas={areas.map((a) => ({ slug: a.slug, name: a.name }))} />
      </main>
    </>
  );
}
