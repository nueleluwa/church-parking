import { loadDashboard } from "@/lib/dashboard-data";
import { requireStaff } from "@/lib/staff-auth";
import { DashboardLive } from "./DashboardLive";

export const metadata = { title: "Live board" };

export default async function DashboardPage() {
  await requireStaff("coordinator");
  const initial = await loadDashboard();
  return (
    <>
      <h1 className="text-2xl font-bold">Live board</h1>
      <DashboardLive initial={initial} />
    </>
  );
}
