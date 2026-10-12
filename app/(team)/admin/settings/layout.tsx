import { requireStaff } from "@/lib/staff-auth";
import { SettingsNav } from "./SettingsNav";

/**
 * The Settings page: its heading and section tabs stay in place while the section underneath changes. Services, parking areas
 * and QR signs are sections here, not separate screens. Administrators only (each section checks again on the server).
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireStaff("admin");
  return (
    <>
      <header className="print:hidden">
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-ink-soft">Manage your church parking system and preferences.</p>
      </header>
      <SettingsNav />
      {children}
    </>
  );
}
