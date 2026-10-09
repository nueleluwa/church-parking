import type { ReactNode } from "react";
import { BottomNav } from "@/app/(team)/staff/BottomNav";
import { StaffHeader } from "@/components/StaffHeader";
import { hasRole } from "@/lib/rules";
import type { StaffSession } from "@/lib/staff-auth";

/** Up to two letters from a name, for the round avatar: "Parking Lead" gives "PL". */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase());
  return (letters.length > 1 ? letters[0] + letters[letters.length - 1] : (letters[0] ?? "?")).slice(0, 2);
}

/**
 * The frame around every signed-in team screen: the header, the tab bar and the page area.
 * The staff screens and the admin screens share it, and because it lives in a layout it
 * stays in place while the screen inside changes.
 */
export function StaffChrome({ staff, children }: { staff: StaffSession; children: ReactNode }) {
  return (
    <>
      <StaffHeader initials={initialsOf(staff.name)} />
      <main className="mx-auto max-w-md space-y-4 px-4 pb-28 pt-5">{children}</main>
      <BottomNav coordinator={hasRole(staff.role, "coordinator")} admin={hasRole(staff.role, "admin")} />
    </>
  );
}
