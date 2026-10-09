import { StaffChrome } from "@/components/StaffChrome";
import { requireStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

/**
 * One frame for every signed-in team screen, the staff pages and the admin pages
 * alike. Because they share this layout, the header and tab bar stay exactly in
 * place while the page inside changes. Each page still checks its own role.
 */
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("attendant");
  return <StaffChrome staff={staff}>{children}</StaffChrome>;
}
