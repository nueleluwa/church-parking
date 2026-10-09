"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { TitleHeader } from "./TitleHeader";

/**
 * Where each team screen sits: its header title and where the back arrow goes. The home
 * screen has the logo header instead. The header lives in the team layout, so it stays put
 * (it never disappears and comes back) while the screen below it changes.
 */
const SCREENS: Record<string, { title: string; back: string }> = {
  "/staff/scan": { title: "Scan Pass", back: "/staff" },
  "/staff/search": { title: "Manual Lookup", back: "/staff" },
  "/staff/register": { title: "Add Car", back: "/staff" },
  "/staff/history": { title: "Recent Scans", back: "/staff" },
  "/staff/service": { title: "Service Information", back: "/staff" },
  "/staff/more": { title: "More", back: "/staff" },
  "/staff/dashboard": { title: "Live Board", back: "/staff" },
  "/staff/sweep": { title: "Sweep", back: "/staff" },
  "/admin": { title: "Admin", back: "/staff" },
  "/admin/areas": { title: "Car Parks", back: "/admin" },
};

export function StaffHeader({ initials }: { initials: string }) {
  const path = usePathname();
  const screen = SCREENS[path.replace(/\/$/, "")];

  const avatar = (
    <Link
      href="/staff/more"
      aria-label="More, and your account"
      data-header-right
      className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-extrabold text-night"
    >
      {initials}
      <span
        aria-hidden="true"
        className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-night bg-success"
      />
    </Link>
  );

  if (!screen) return <AppHeader title="Team" right={avatar} />;
  return <TitleHeader title={screen.title} backHref={screen.back} />;
}
