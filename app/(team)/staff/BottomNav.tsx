"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconAlert, IconCar, IconCheck, IconClock, IconMore, IconScan } from "@/components/icons";

type Tab = { href: string; label: string; full: string; icon: React.ReactNode; active: (path: string) => boolean };

// Short words under the icons so six tabs fit on a small phone. `full` is read out by screen readers.
const scan: Tab = {
  href: "/staff",
  label: "Scan",
  full: "Scan pass",
  icon: <IconScan />,
  // Scanning, looking a car up and adding one by hand are all part of the Scan tab
  active: (p) => ["/staff", "/staff/scan", "/staff/search", "/staff/register"].includes(p),
};
const history: Tab = { href: "/staff/history", label: "History", full: "Recent scans", icon: <IconClock />, active: (p) => p === "/staff/history" };
const live: Tab = { href: "/staff/dashboard", label: "Live", full: "Live board", icon: <IconAlert />, active: (p) => p === "/staff/dashboard" };
const sweep: Tab = { href: "/staff/sweep", label: "Sweep", full: "Sweep", icon: <IconCheck />, active: (p) => p === "/staff/sweep" };
const admin: Tab = { href: "/admin", label: "Admin", full: "Admin", icon: <IconCar />, active: (p) => p.startsWith("/admin") };
const more: Tab = { href: "/staff/more", label: "More", full: "More", icon: <IconMore />, active: (p) => p === "/staff/more" || p === "/staff/service" || p === "/staff/register/member" };

/** Big tabs at the bottom of the screen, easy to reach with a thumb. */
export function BottomNav({ coordinator, admin: isAdmin }: { coordinator: boolean; admin: boolean }) {
  const path = usePathname().replace(/(.)\/$/, "$1");
  const items = [scan, history, ...(coordinator ? [live, sweep] : []), ...(isAdmin ? [admin] : []), more];
  return (
    <nav
      aria-label="Parking team"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-edge/30 bg-night-soft px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
    >
      <ul className="mx-auto flex max-w-md gap-1">
        {items.map((t) => {
          const active = t.active(path);
          return (
            <li key={t.href} className="min-w-0 flex-1">
              <Link
                href={t.href}
                aria-label={t.full}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 whitespace-nowrap rounded-2xl border-2 px-0.5 py-2 text-[11px] font-semibold ${
                  active ? "border-accent bg-accent text-white" : "border-transparent text-white/80 hover:bg-white/15"
                }`}
              >
                {t.icon}
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
