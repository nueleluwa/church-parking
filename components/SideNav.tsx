"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconAlert,
  IconCar,
  IconCheck,
  IconClock,
  IconGrid,
  IconReport,
  IconScan,
  IconSettings,
  IconTrend,
  IconUsers,
} from "./icons";

type Item = { href: string; label: string; icon: ReactNode; admin?: boolean; group: string; match: (p: string) => boolean };

const ITEMS: Item[] = [
  { href: "/admin", label: "Dashboard", group: "Operate", icon: <IconGrid />, admin: true, match: (p) => p === "/admin" },
  { href: "/staff/dashboard", label: "Live Parking", group: "Operate", icon: <IconAlert />, match: (p) => p === "/staff/dashboard" },
  { href: "/staff/sweep", label: "Sweep", group: "Operate", icon: <IconCheck />, match: (p) => p === "/staff/sweep" },
  { href: "/admin/analytics", label: "Analytics", group: "Insights", icon: <IconTrend />, admin: true, match: (p) => p.startsWith("/admin/analytics") },
  { href: "/admin/reports", label: "Reports", group: "Insights", icon: <IconReport />, admin: true, match: (p) => p.startsWith("/admin/reports") },
  { href: "/admin/visits", label: "Visits", group: "Records", icon: <IconClock />, match: (p) => p.startsWith("/admin/visits") },
  { href: "/admin/vehicles", label: "Vehicles", group: "Records", icon: <IconCar />, admin: true, match: (p) => p.startsWith("/admin/vehicles") },
  { href: "/admin/users", label: "Users", group: "Records", icon: <IconUsers />, admin: true, match: (p) => ["/admin/users", "/admin/members", "/admin/staff"].some((r) => p.startsWith(r)) },
  { href: "/admin/settings", label: "Settings", group: "Setup", icon: <IconSettings />, admin: true, match: (p) => p.startsWith("/admin/settings") },
  {
    href: "/staff",
    label: "Attendant tools", group: "Tools",
    icon: <IconScan />,
    match: (p) => p === "/staff" || ["/staff/scan", "/staff/search", "/staff/register", "/staff/register/member", "/staff/history", "/staff/service", "/staff/more"].includes(p),
  },
];

const GROUPS = ["Operate", "Insights", "Records", "Setup", "Tools"];

/**
 * The menu down the left side of wide screens, for coordinators and admins (the parking lead often
 * works at a desk). On a phone the tab bar is used instead and this is hidden.
 */
export function SideNav({ admin, name, role, initials, systemName, churchName }: { admin: boolean; name: string; role: string; initials: string; systemName: string; churchName: string }) {
  const path = usePathname().replace(/(.)\/$/, "$1");
  return (
    <aside
      aria-label="Menu"
      className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-night text-white lg:flex print:hidden"
    >
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-extrabold">
          P
        </span>
        <p className="min-w-0 leading-tight">
          <span className="block truncate text-lg font-extrabold">{systemName}</span>
          {churchName && <span className="block truncate text-xs text-white/70">{churchName}</span>}
        </p>
      </div>
      <nav aria-label="Parking team, desktop" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {GROUPS.map((group) => {
          const items = ITEMS.filter((i) => i.group === group && (admin || !i.admin));
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="px-4 pb-1.5 text-xs font-semibold text-white/60">{group}</p>
              <ul className="space-y-1">
                {items.map((i) => {
                  const active = i.match(path);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-xl px-4 py-2.5 font-semibold ${
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
            </div>
          );
        })}
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
