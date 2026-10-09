import { correctionContext } from "@/lib/correction-context";
import { requireStaff } from "@/lib/staff-auth";
import { SearchBox } from "./SearchBox";

export const metadata = { title: "Find car" };

export default async function SearchPage() {
  const staff = await requireStaff("attendant");
  return (
    <>
      <h1 className="text-2xl font-bold">Find car</h1>
      <p className="text-ink-soft">
        For drivers with no pass. Ask for their name and phone number without reading them out first.
      </p>
      <SearchBox corrections={await correctionContext(staff)} />
    </>
  );
}
