"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronLeft } from "./icons";

/**
 * The header for a screen that needs a page title (Check In, Confirm Check In, My Account).
 * It looks exactly like the logo header (same black bar, same red edge, same height), with
 * a back arrow on the left and the title in the middle, as in the member journey. Give it
 * `backHref` to go to another page, or `onBack` to go back a step on the same page.
 */
export function TitleHeader({
  title,
  backHref,
  onBack,
  right,
  wide = false,
  logo = false,
}: {
  title: string;
  backHref?: string;
  onBack?: () => void;
  right?: ReactNode;
  /** Line the title row up with the wide page column on large screens (team screens). */
  wide?: boolean;
  /** Show the church logo beside the title (the team screens), dropped below 360px so the title keeps its room. */
  logo?: boolean;
}) {
  const back = "flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/15";
  return (
    <header className="sticky top-0 z-20 rounded-b-3xl border-b-4 border-accent bg-night px-4 py-3 text-white shadow-md">
      <div className={`relative mx-auto flex h-8 max-w-md items-center justify-center ${logo ? "px-9" : ""} ${wide ? "lg:max-w-5xl" : ""}`}>
        {backHref ? (
          <Link href={backHref} aria-label="Back" className={`absolute -left-2 ${back}`}>
            <IconChevronLeft className="h-6 w-6" />
          </Link>
        ) : onBack ? (
          <button type="button" onClick={onBack} aria-label="Back" className={`absolute -left-2 ${back}`}>
            <IconChevronLeft className="h-6 w-6" />
          </button>
        ) : null}
        {logo && (
          <>
            <Image src="/cci-logo.svg" alt="Celebration Church" width={84} height={24} unoptimized priority className="h-5 w-auto shrink-0 min-[390px]:h-6 max-[359px]:hidden" />
            <span aria-hidden="true" className="mx-2 h-6 w-px shrink-0 bg-white/40 min-[390px]:mx-2.5 max-[359px]:hidden" />
          </>
        )}
        <h1 className={logo ? "min-w-0 truncate text-base font-semibold min-[390px]:text-lg" : "px-12 text-lg font-semibold"}>{title}</h1>
        {right && <div className="absolute -right-2 flex items-center">{right}</div>}
      </div>
    </header>
  );
}
