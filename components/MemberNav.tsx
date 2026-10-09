import Link from "next/link";
import { IconCar, IconClock, IconHome, IconMore } from "./icons";

const ITEMS = [
  { key: "home", label: "Home", href: "/", icon: <IconHome /> },
  { key: "vehicles", label: "My Vehicles", href: "/account", icon: <IconCar /> },
  { key: "history", label: "History", href: "/account?tab=history", icon: <IconClock /> },
  { key: "more", label: "More", href: "/account/more", icon: <IconMore /> },
] as const;

export type MemberNavKey = (typeof ITEMS)[number]["key"];

/**
 * The tab bar for signed-in members, at the bottom of the screen: Home, My Vehicles, History
 * and More. The open one is red. (Staff have their own black tab bar.) Pages that show it need
 * about 6rem of space at the bottom.
 */
export function MemberNav({ active }: { active?: MemberNavKey }) {
  return (
    <nav
      aria-label="Member"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-edge/15 bg-card px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
    >
      <ul className="mx-auto flex max-w-md gap-1">
        {ITEMS.map((i) => (
          <li key={i.key} className="min-w-0 flex-1">
            <Link
              href={i.href}
              aria-current={active === i.key ? "page" : undefined}
              className={`flex flex-col items-center gap-1 whitespace-nowrap rounded-2xl px-0.5 py-2 text-[11px] font-semibold ${
                active === i.key ? "text-accent" : "text-ink-soft"
              }`}
            >
              {i.icon}
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
