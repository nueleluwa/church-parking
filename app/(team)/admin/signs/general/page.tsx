import Image from "next/image";
import { serverEnv } from "@/lib/env";
import { qrSvg } from "@/lib/qr";
import { getSettings } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";
import { PrintButton } from "../[slug]/PrintButton";

export const metadata = { title: "Print the general sign" };
export const dynamic = "force-dynamic";

/**
 * The general sign: one QR code for the whole church. It opens "Where are you parking?", and the driver chooses
 * their car park. The signs for each car park (which have the car park already chosen) are still the quicker way
 * in, so these go where drivers arrive, such as the gate or the church door.
 */
export default async function GeneralSignPage() {
  await requireStaff("admin");
  const settings = await getSettings();
  const url = `${serverEnv().APP_URL.replace(/\/$/, "")}/c`;
  const svg = await qrSvg(url);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PrintButton />
        <p className="mt-2 text-center text-sm text-ink-soft">
          Choose A4, portrait. To save a copy, choose &quot;Save as PDF&quot; as the printer.
        </p>
      </div>

      <article
        aria-label="The general sign"
        className="mx-auto flex aspect-[210/297] w-full flex-col overflow-hidden rounded-card border-2 border-edge/20 bg-white text-center print:aspect-auto print:h-[297mm] print:w-[210mm] print:max-w-none print:rounded-none print:border-0"
      >
        <header className="flex flex-col items-center gap-2 bg-night px-6 py-5 text-white">
          <Image src="/cci-logo.svg" alt={settings.churchName} width={210} height={60} unoptimized priority />
          <p className="text-sm font-semibold tracking-wide print:text-lg">{settings.churchName}</p>
          {settings.campus && <p className="-mt-1 text-sm print:text-base">{settings.campus}</p>}
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-4">
          <h1 className="text-3xl font-extrabold tracking-tight print:text-6xl">PARKING CHECK-IN</h1>
          <div
            className="w-3/4 [&>svg]:h-auto [&>svg]:w-full"
            role="img"
            aria-label="QR code to choose your car park"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="text-base font-medium print:text-3xl">Scan this code, then choose your car park.</p>
        </div>
        <footer className="bg-accent px-6 py-5 text-white">
          <p className="text-4xl font-extrabold print:text-7xl">Choose your car park</p>
        </footer>
        <p className="px-4 py-2 text-xs text-ink-soft print:text-base">
          No smartphone? Ask a parking attendant to register your car.
        </p>
      </article>
    </div>
  );
}
