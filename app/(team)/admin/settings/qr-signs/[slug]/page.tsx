import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAreaBySlug, getSettings } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { qrSvg } from "@/lib/qr";
import { requireStaff } from "@/lib/staff-auth";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Print sign" };
export const dynamic = "force-dynamic";

/** The A4 sign: church name and logo, a very large QR code, and the car park name in large type. */
export default async function SignPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ size?: string; kind?: string }> }) {
  await requireStaff("admin");
  const area = await getAreaBySlug((await params).slug);
  const query = await searchParams;
  const a5 = query.size === "a5";
  // The check-in sign opens check-in; the exit sign opens the exit page, where a member who checked in by phone checks out
  const exit = query.kind === "exit";
  const kindQuery = exit ? "kind=exit" : "";
  const settings = await getSettings();
  if (!area) notFound();
  const url = `${serverEnv().APP_URL.replace(/\/$/, "")}/c/${area.slug}${exit ? "/out" : ""}`;
  const svg = await qrSvg(url);

  return (
    <div className="space-y-4">
      {/* The paper size the browser prints on */}
      <style>{`@page { size: ${a5 ? "A5" : "A4"} portrait; margin: 0 }`}</style>
      <div className="space-y-3 print:hidden">
        <nav aria-label="Which sign" className="flex justify-center gap-2">
          {[
            { label: "Check-in sign", href: `/admin/settings/qr-signs/${area.slug}${a5 ? "?size=a5" : ""}`, on: !exit },
            { label: "Exit sign", href: `/admin/settings/qr-signs/${area.slug}?kind=exit${a5 ? "&size=a5" : ""}`, on: exit },
          ].map((o) => (
            <Link
              key={o.label}
              href={o.href}
              aria-current={o.on ? "true" : undefined}
              className={`rounded-full border-2 px-4 py-2 font-semibold ${o.on ? "border-night bg-night text-white" : "border-edge/30 bg-white hover:bg-page"}`}
            >
              {o.label}
            </Link>
          ))}
        </nav>
        {exit && (
          <p className="text-center text-sm text-ink-soft">
            The exit sign is for car parks that use phone check-in. A member who checked in by phone scans it to check out. Put it where drivers leave.
          </p>
        )}
        <nav aria-label="Paper size" className="flex justify-center gap-2">
          {[
            { label: "A4 (portrait)", href: `/admin/settings/qr-signs/${area.slug}${kindQuery ? `?${kindQuery}` : ""}`, on: !a5 },
            { label: "A5 (portrait)", href: `/admin/settings/qr-signs/${area.slug}?${kindQuery ? `${kindQuery}&` : ""}size=a5`, on: a5 },
          ].map((o) => (
            <Link
              key={o.label}
              href={o.href}
              aria-current={o.on ? "true" : undefined}
              className={`rounded-full border-2 px-4 py-2 font-semibold ${o.on ? "border-night bg-night text-white" : "border-edge/30 bg-white hover:bg-page"}`}
            >
              {o.label}
            </Link>
          ))}
        </nav>
        <PrintButton />
        <p className="text-center text-sm text-ink-soft">
          Choose {a5 ? "A5" : "A4"}, portrait. To save a PDF, choose &quot;Save as PDF&quot; as the printer.
        </p>
        <a
          href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          download={`qr-${area.slug}${exit ? "-exit" : ""}.svg`}
          className="block text-center font-semibold text-accent underline"
        >
          Download the QR code on its own
        </a>
      </div>

      {/* The sign itself. On paper it fills the A4 page. */}
      <article
        aria-label={`${exit ? "Exit sign" : "Sign"} for ${area.name}`}
        className={`mx-auto flex w-full flex-col overflow-hidden rounded-card border-2 border-edge/20 bg-white text-center print:aspect-auto print:max-w-none print:rounded-none print:border-0 ${a5 ? "aspect-[148/210] print:h-[210mm] print:w-[148mm]" : "aspect-[210/297] print:h-[297mm] print:w-[210mm]"}`}
      >
        <header className="flex flex-col items-center gap-2 bg-night px-6 py-5 text-white">
          <Image src="/cci-logo.svg" alt={settings.churchName} width={210} height={60} unoptimized priority />
          <p className="text-sm font-semibold tracking-wide print:text-lg">{settings.churchName}</p>
          {settings.campus && <p className="-mt-1 text-sm print:text-base">{settings.campus}</p>}
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-4">
          <h1 className={`text-3xl font-extrabold tracking-tight ${a5 ? "print:text-4xl" : "print:text-6xl"}`}>{exit ? "PARKING CHECK-OUT" : "PARKING CHECK-IN"}</h1>
          <div
            className="w-3/4 [&>svg]:h-auto [&>svg]:w-full"
            role="img"
            aria-label={`${exit ? "Exit QR code" : "QR code"} for ${area.name}`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className={`text-base font-medium ${a5 ? "print:text-xl" : "print:text-3xl"}`}>{exit ? "Scan this code when you leave to check out." : "Scan this code to register your vehicle for parking."}</p>
        </div>
        <footer className="bg-accent px-6 py-5 text-white">
          <p className={`text-4xl font-extrabold ${a5 ? "print:text-5xl" : "print:text-7xl"}`}>{area.name}</p>
        </footer>
        <p className="px-4 py-2 text-xs text-ink-soft print:text-base">
          {exit ? "No smartphone, or it did not work? Show your pass to the attendant at the exit." : "No smartphone? Ask a parking attendant to register your car."}
        </p>
      </article>
    </div>
  );
}
