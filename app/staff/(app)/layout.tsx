import { AppHeader } from "@/components/AppHeader";
import { IconLogout } from "@/components/icons";
import { canCorrect } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { signOut } from "./actions";
import { BottomNav } from "./BottomNav";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("attendant");
  return (
    <>
      <AppHeader
        title="Team"
        right={
          <form action={signOut}>
            <button
              aria-label={`Sign out ${staff.name.split(" ")[0]}`}
              className="flex items-center gap-2 rounded-full border-2 border-white/40 p-2 text-sm font-medium hover:bg-white/15 sm:px-3 sm:py-1.5"
            >
              <span className="hidden max-w-20 truncate sm:inline">{staff.name.split(" ")[0]}</span>
              <IconLogout className="h-4 w-4" />
            </button>
          </form>
        }
      />
      <main className="mx-auto max-w-md space-y-4 px-4 pb-28 pt-6">{children}</main>
      <BottomNav coordinator={canCorrect(staff.role)} />
    </>
  );
}
