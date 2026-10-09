import Image from "next/image";
import { notFound } from "next/navigation";
import { getAreaBySlug } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { qrSvg } from "@/lib/qr";
import { requireStaff } from "@/lib/staff-auth";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Print sign" };
export const dynamic = "force-dynamic";

/** The A4 sign: church name and logo, a very large QR code, and the car park name in large type. */
export default async function SignPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireStaff("admin");
  const area = await getAreaBySlug((await params).slug);
  if (!area) notFound();
  const url = `${serverEnv().APP_URL.replace(/\/$/, "")}/c/${area.slug}`;
  const svg = await qrSvg(url);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PrintButton />
        <p className="mt-2 text-center text-sm text-ink-soft">
          Choose A4, portrait. To save a copy, choose &quot;Save as PDF&quot; as the printer.
        </p>
      </div>

      {/* The sign itself. On paper it fills the A4 page. */}
      <article
        aria-label={`Sign for ${area.name}`}
        className="mx-auto flex aspect-[210/297] w-full flex-col overflow-hidden rounded-card border-2 border-edge/20 bg-white text-center print:aspect-auto print:h-[297mm] print:w-[210mm] print:max-w-none print:rounded-none print:border-0"
      >
        <header className="flex flex-col items-center gap-2 bg-night px-6 py-5 text-white">
          <Image src="/cci-logo.svg" alt="Christ Church International" width={210} height={60} unoptimized priority />
          <p className="text-sm font-semibold tracking-wide print:text-lg">Christ Church International</p>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-4">
          <h1 className="text-3xl font-extrabold tracking-tight print:text-6xl">PARKING CHECK-IN</h1>
          <div
            className="w-3/4 [&>svg]:h-auto [&>svg]:w-full"
            role="img"
            aria-label={`QR code for ${area.name}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="text-base font-medium print:text-3xl">Scan this code to register your vehicle for parking.</p>
        </div>
        <footer className="bg-accent px-6 py-5 text-white">
          <p className="text-4xl font-extrabold print:text-7xl">{area.name}</p>
        </footer>
        <p className="px-4 py-2 text-xs text-ink-soft print:text-base">
          No smartphone? Ask a parking attendant to register your car.
        </p>
      </article>
    </div>
  );
}
