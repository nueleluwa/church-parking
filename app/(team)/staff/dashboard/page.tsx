import { loadDashboard } from "@/lib/dashboard-data";
import { requireStaff } from "@/lib/staff-auth";
import { DashboardLive } from "./DashboardLive";

export const metadata = { title: "Live board" };

export default async function DashboardPage() {
  await requireStaff("coordinator");
  const initial = await loadDashboard();
  return (
    <>
      <DashboardLive initial={initial} />
    </>
  );
}
