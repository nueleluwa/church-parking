import type { ReactNode } from "react";
import { signOut } from "@/app/(team)/staff/actions";
import { BottomNav } from "@/app/(team)/staff/BottomNav";
import { AppHeader } from "@/components/AppHeader";
import { IconLogout } from "@/components/icons";
import { hasRole } from "@/lib/rules";
import type { StaffSession } from "@/lib/staff-auth";

/**
 * The frame around every signed-in staff screen: header, sign-out and the tab
 * bar. The staff screens and the admin screens share it, and because it lives in
 * a layout it stays in place while the page inside changes.
 */
export function StaffChrome({ staff, children }: { staff: StaffSession; children: ReactNode }) {
  const first = staff.name.split(" ")[0];
  return (
    <>
      <AppHeader
        title="Team"
        right={
          <form action={signOut}>
            <button
              aria-label={`Sign out ${first}`}
              className="flex items-center gap-2 rounded-full border-2 border-white/40 p-2 text-sm font-medium hover:bg-white/15 sm:px-3 sm:py-1.5"
            >
              <span className="hidden max-w-20 truncate sm:inline">{first}</span>
              <IconLogout className="h-4 w-4" />
            </button>
          </form>
        }
      />
      <main className="mx-auto max-w-md space-y-4 px-4 pb-28 pt-6">{children}</main>
      <BottomNav coordinator={hasRole(staff.role, "coordinator")} admin={hasRole(staff.role, "admin")} />
    </>
  );
}
