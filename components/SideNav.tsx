"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconAlert,
  IconCalendar,
  IconCar,
  IconCheck,
  IconClock,
  IconGrid,
  IconPin,
  IconQr,
  IconReport,
  IconScan,
  IconSettings,
  IconTrend,
  IconUsers,
} from "./icons";

type Item = { href: string; label: string; icon: ReactNode; admin?: boolean; match: (p: string) => boolean };

const ITEMS: Item[] = [
  { href: "/admin", label: "Dashboard", icon: <IconGrid />, admin: true, match: (p) => p === "/admin" },
  { href: "/staff/dashboard", label: "Live Parking", icon: <IconAlert />, match: (p) => p === "/staff/dashboard" },
  { href: "/staff/sweep", label: "Sweep", icon: <IconCheck />, match: (p) => p === "/staff/sweep" },
  { href: "/admin/analytics", label: "Analytics", icon: <IconTrend />, admin: true, match: (p) => p.startsWith("/admin/analytics") },
  { href: "/admin/reports", label: "Reports", icon: <IconReport />, admin: true, match: (p) => p.startsWith("/admin/reports") },
  { href: "/admin/visits", label: "Visits", icon: <IconClock />, match: (p) => p.startsWith("/admin/visits") },
  { href: "/admin/vehicles", label: "Vehicles", icon: <IconCar />, admin: true, match: (p) => p.startsWith("/admin/vehicles") },
  { href: "/admin/services", label: "Services", icon: <IconCalendar />, admin: true, match: (p) => p.startsWith("/admin/services") },
  { href: "/admin/signs", label: "QR Signs", icon: <IconQr />, admin: true, match: (p) => p.startsWith("/admin/signs") },
  { href: "/admin/staff", label: "Staff Accounts", icon: <IconUsers />, admin: true, match: (p) => p.startsWith("/admin/staff") },
  { href: "/admin/members", label: "Members", icon: <IconUsers />, admin: true, match: (p) => p.startsWith("/admin/members") },
  { href: "/admin/areas", label: "Car Parks", icon: <IconPin />, admin: true, match: (p) => p.startsWith("/admin/areas") },
  { href: "/admin/settings", label: "Settings", icon: <IconSettings />, admin: true, match: (p) => p.startsWith("/admin/settings") },
  {
    href: "/staff",
    label: "Attendant tools",
    icon: <IconScan />,
    match: (p) => p === "/staff" || ["/staff/scan", "/staff/search", "/staff/register", "/staff/history", "/staff/service", "/staff/more"].includes(p),
  },
];

/**
 * The menu down the left side of wide screens, for coordinators and admins (the parking lead often
 * works at a desk). On a phone the tab bar is used instead and this is hidden.
 */
export function SideNav({ admin, name, role, initials, systemName }: { admin: boolean; name: string; role: string; initials: string; systemName: string }) {
  const path = usePathname().replace(/(.)\/$/, "$1");
  return (
    <aside
      aria-label="Menu"
      className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-night text-white lg:flex print:hidden"
    >
      <p className="px-6 pb-4 pt-6 text-lg font-extrabold">{systemName}</p>
      <nav aria-label="Parking team, desktop" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-1">
          {ITEMS.filter((i) => admin || !i.admin).map((i) => {
            const active = i.match(path);
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 font-semibold ${
                    active ? "bg-accent text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  {i.icon}
                  {i.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link href="/staff/more" className="m-3 flex items-center gap-3 rounded-xl bg-white/10 p-3 hover:bg-white/15">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-extrabold text-night">
          {initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block text-xs text-white/70">{role}</span>
        </span>
      </Link>
    </aside>
  );
}
