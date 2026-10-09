"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconAlert, IconCar, IconCheck, IconPlus, IconScan, IconSearch } from "@/components/icons";

type Tab = { href: string; label: string; full: string; icon: React.ReactNode; match?: string };

// Short words under the icons so six tabs fit on a small phone. `full` is read out by screen readers.
const tabs: Tab[] = [
  { href: "/staff/scan", label: "Scan", full: "Scan pass", icon: <IconScan /> },
  { href: "/staff/search", label: "Find", full: "Find car", icon: <IconSearch /> },
  { href: "/staff/register", label: "Add", full: "Add car", icon: <IconPlus /> },
];
const coordinatorTabs: Tab[] = [
  { href: "/staff/dashboard", label: "Live", full: "Live board", icon: <IconAlert /> },
  { href: "/staff/sweep", label: "Sweep", full: "Sweep", icon: <IconCheck /> },
];
const adminTabs: Tab[] = [{ href: "/admin", label: "Admin", full: "Admin", icon: <IconCar />, match: "/admin" }];

/** Big tabs at the bottom of the screen, easy to reach with a thumb. */
export function BottomNav({ coordinator, admin }: { coordinator: boolean; admin: boolean }) {
  const path = usePathname();
  const items = [...tabs, ...(coordinator ? coordinatorTabs : []), ...(admin ? adminTabs : [])];
  return (
    <nav
      aria-label="Parking team"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-edge/30 bg-night-soft px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
    >
      <ul className="mx-auto flex max-w-md gap-1">
        {items.map((t) => {
          const active = t.match ? path.startsWith(t.match) : path === t.href;
          return (
            <li key={t.href} className="min-w-0 flex-1">
              <Link
                href={t.href}
                aria-label={t.full}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 whitespace-nowrap rounded-2xl border-2 px-0.5 py-2 text-[11px] font-semibold ${
                  active
                    ? "border-edge bg-blush text-ink"
                    : "border-transparent text-white hover:bg-white/15"
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
