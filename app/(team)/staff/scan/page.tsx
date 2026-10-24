import { correctionContext } from "@/lib/correction-context";
import { requireStaff } from "@/lib/staff-auth";
import { stationContext } from "@/lib/station";
import { StationPicker } from "../StationPicker";
import { Scanner } from "./Scanner";

export const metadata = { title: "Scan pass" };

export default async function ScanPage() {
  const staff = await requireStaff("attendant");
  const { areas, station } = await stationContext();
  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <StationPicker areas={areas} station={station} />
      <Scanner corrections={await correctionContext(staff)} areas={areas} station={station} />
    </div>
  );
}
