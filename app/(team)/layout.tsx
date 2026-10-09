import type { Metadata } from "next";
import { StaffChrome } from "@/components/StaffChrome";
import { requireStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: "/staff/manifest.webmanifest",
  applicationName: "Church Parking Team",
  appleWebApp: { capable: true, title: "Parking Team", statusBarStyle: "default" },
};

/**
 * One frame for every signed-in team screen, the staff pages and the admin pages
 * alike. Because they share this layout, the header and tab bar stay exactly in
 * place while the page inside changes. Each page still checks its own role.
 */
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("attendant");
  return <StaffChrome staff={staff}>{children}</StaffChrome>;
}
