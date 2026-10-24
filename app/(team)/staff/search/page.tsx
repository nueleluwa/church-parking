import { correctionContext } from "@/lib/correction-context";
import { getSettings } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";
import { stationContext } from "@/lib/station";
import { StationPicker } from "../StationPicker";
import { SearchBox } from "./SearchBox";

export const metadata = { title: "Manual lookup" };

export default async function SearchPage() {
  const staff = await requireStaff("attendant");
  const { areas, station } = await stationContext();
  const { defaultSearch } = await getSettings();
  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <StationPicker areas={areas} station={station} />
      <p className="text-ink-soft">
        For drivers with no pass. Ask for their name and phone number without reading them out first.
      </p>
      <SearchBox corrections={await correctionContext(staff)} areas={areas} station={station} defaultMode={defaultSearch} />
    </div>
  );
}
