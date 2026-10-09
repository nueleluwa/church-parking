import Image from "next/image";
import { PMark } from "./PMark";

/** Church logo plus a "Parking" label, so every page reads as the church's parking app. */
export function AppHeader({ title = "Parking" }: { title?: string }) {
  return (
    <header className="flex items-center gap-3 bg-slate-green px-4 py-3 text-white">
      <Image src="/cci-logo.svg" alt="CCI" width={105} height={30} unoptimized priority />
      <span aria-hidden="true" className="h-7 w-px bg-white/40" />
      <PMark className="h-8 w-8 bg-white text-lg !text-slate-green" />
      <span className="text-lg font-semibold">{title}</span>
    </header>
  );
}
