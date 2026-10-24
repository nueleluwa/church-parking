"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Every Settings section. Each is its own address under /admin/settings, so it can be bookmarked or refreshed, and the Settings page stays around it. */
export const SETTINGS_SECTIONS = [
  { slug: "", label: "General" },
  { slug: "services", label: "Services" },
  { slug: "parking-areas", label: "Parking areas" },
  { slug: "qr-signs", label: "QR signs" },
  { slug: "vehicle-rules", label: "Vehicle rules" },
  { slug: "users", label: "Users & access" },
  { slug: "notifications", label: "Notifications" },
  { slug: "system", label: "System" },
] as const;

/** The tab bar. It scrolls sideways inside itself on a phone, so the page never does. */
export function SettingsNav() {
  const path = (usePathname() ?? "").replace(/\/$/, "");
  const current = path.replace(/^\/admin\/settings\/?/, "").split("/")[0] ?? "";
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto border-b border-edge/20 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 print:hidden">
      <ul className="flex min-w-max gap-1">
        {SETTINGS_SECTIONS.map((s) => {
          const on = s.slug === current;
          return (
            <li key={s.label}>
              <Link
                href={s.slug ? `/admin/settings/${s.slug}` : "/admin/settings"}
                aria-current={on ? "page" : undefined}
                className={`-mb-px inline-flex min-h-12 items-center whitespace-nowrap border-b-2 px-4 font-semibold ${
                  on ? "border-accent text-accent" : "border-transparent text-ink hover:text-accent"
                }`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
