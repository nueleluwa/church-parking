import { AppHeader } from "@/components/AppHeader";
import { IconLogout } from "@/components/icons";
import { requireStaff } from "@/lib/staff-auth";
import { signOut } from "./actions";
import { BottomNav } from "./BottomNav";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("attendant");
  return (
    <>
      <AppHeader
        title="Parking team"
        right={
          <form action={signOut}>
            <button
              aria-label={`Sign out ${staff.name.split(" ")[0]}`}
              className="flex items-center gap-2 rounded-full border-2 border-white/40 px-3 py-1.5 text-sm font-medium hover:bg-white/15"
            >
              <span className="max-w-20 truncate">{staff.name.split(" ")[0]}</span>
              <IconLogout className="h-4 w-4" />
            </button>
          </form>
        }
      />
      <main className="mx-auto max-w-md space-y-4 px-4 pb-28 pt-6">{children}</main>
      <BottomNav />
    </>
  );
}
