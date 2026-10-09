import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireStaff } from "@/lib/staff-auth";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

const links = [
  { href: "/staff/scan", label: "Scan pass" },
  { href: "/staff/search", label: "Find car" },
  { href: "/staff/register", label: "Add car" },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("attendant");
  return (
    <>
      <AppHeader title="Parking team" />
      <nav className="flex items-center gap-2 overflow-x-auto bg-slate-green-dark px-3 py-2 text-white">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-full px-4 py-2 font-medium hover:bg-white/15">
            {l.label}
          </Link>
        ))}
        <form action={signOut} className="ml-auto">
          <button className="whitespace-nowrap rounded-full px-4 py-2 font-medium hover:bg-white/15">
            Sign out ({staff.name.split(" ")[0]})
          </button>
        </form>
      </nav>
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">{children}</main>
    </>
  );
}
