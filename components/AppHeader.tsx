import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PMark } from "./PMark";

/** Church logo plus a "Parking" label, so every page reads as the church's parking app. */
export function AppHeader({ title = "Parking", right }: { title?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 rounded-b-3xl border-b-4 border-accent bg-night px-4 py-3 text-white shadow-md">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <Link href="/" aria-label="CCI Parking home" className="flex items-center gap-3">
          <Image src="/cci-logo.svg" alt="CCI" width={105} height={30} unoptimized priority />
        </Link>
        <span aria-hidden="true" className="h-7 w-px bg-white/40" />
        <PMark className="h-8 w-8 bg-white text-lg !text-night" />
        <span className="text-lg font-semibold">{title}</span>
        {right && <div className="ml-auto">{right}</div>}
      </div>
    </header>
  );
}
