"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconAlert, IconCheck, IconPlus, IconScan, IconSearch } from "@/components/icons";

const tabs = [
  { href: "/staff/scan", label: "Scan pass", icon: <IconScan /> },
  { href: "/staff/search", label: "Find car", icon: <IconSearch /> },
  { href: "/staff/register", label: "Add car", icon: <IconPlus /> },
];

const coordinatorTabs = [
  { href: "/staff/dashboard", label: "Live board", icon: <IconAlert /> },
  { href: "/staff/sweep", label: "Sweep", icon: <IconCheck /> },
];

/** Big tabs at the bottom of the screen, easy to reach with a thumb. */
export function BottomNav({ coordinator }: { coordinator: boolean }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Parking team"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-edge/30 bg-night-soft px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
    >
      <ul className="mx-auto flex max-w-md gap-2">
        {(coordinator ? [...tabs, ...coordinatorTabs] : tabs).map((t) => {
          const active = path === t.href;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2 text-xs font-semibold ${
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
