import type { ReactNode } from "react";
import { BottomNav } from "@/app/(team)/staff/BottomNav";
import { SideNav } from "@/components/SideNav";
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
  const coordinator = hasRole(staff.role, "coordinator");
  const admin = hasRole(staff.role, "admin");
  const roleName = admin ? "Parking Admin" : coordinator ? "Coordinator" : "Attendant";
  return (
    <>
      {coordinator && <SideNav admin={admin} name={staff.name} role={roleName} initials={initialsOf(staff.name)} />}
      <div className={coordinator ? "lg:pl-64 print:pl-0" : ""}>
        <div className="print:hidden">
          <StaffHeader initials={initialsOf(staff.name)} wide={coordinator} />
        </div>
        <main
          className={`mx-auto space-y-4 px-4 pb-28 pt-5 print:max-w-none print:p-0 ${
            coordinator ? "max-w-md lg:max-w-5xl lg:pb-10 xl:max-w-7xl" : "max-w-md"
          }`}
        >
          {children}
        </main>
      </div>
      <div className="lg:hidden print:hidden">
        <BottomNav coordinator={coordinator} admin={admin} />
      </div>
    </>
  );
}
