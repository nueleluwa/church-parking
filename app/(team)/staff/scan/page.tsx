import { correctionContext } from "@/lib/correction-context";
import { requireStaff } from "@/lib/staff-auth";
import { Scanner } from "./Scanner";

export const metadata = { title: "Scan pass" };

export default async function ScanPage() {
  const staff = await requireStaff("attendant");
  return (
    <>
      <h1 className="text-2xl font-bold">Scan pass</h1>
      <Scanner corrections={await correctionContext(staff)} />
    </>
  );
}
