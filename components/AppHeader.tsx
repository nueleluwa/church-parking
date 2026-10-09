import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PMark } from "./PMark";

/**
 * Church logo plus a "Parking" label, centred, so every page reads as the
 * church's parking app. An optional action (such as sign-out) sits in the
 * right-hand corner without moving the centred contents.
 */
export function AppHeader({ title = "Parking", right }: { title?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 rounded-b-3xl border-b-4 border-accent bg-night px-4 py-3 text-white shadow-md">
      <div
        className={`relative mx-auto flex max-w-md items-center justify-center gap-2.5 ${right ? "pr-11 min-[400px]:pr-0" : ""}`}
      >
        <Link href="/" aria-label="CCI Parking home" className="flex shrink-0 items-center">
          <Image src="/cci-logo.svg" alt="CCI" width={105} height={30} unoptimized priority />
        </Link>
        <span aria-hidden="true" className="h-7 w-px bg-white/40" />
        <PMark className="h-8 w-8 bg-white text-lg text-night!" />
        <span className="text-lg font-semibold">{title}</span>
        {right && <div className="absolute inset-y-0 right-0 flex items-center">{right}</div>}
      </div>
    </header>
  );
}
