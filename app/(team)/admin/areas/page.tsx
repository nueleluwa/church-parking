import { listAllAreas } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";
import { AreaList } from "./AreaList";

export const metadata = { title: "Car parks" };

export default async function AreasPage() {
  await requireStaff("admin");
  const areas = await listAllAreas();
  return (
    <>
      <p className="text-ink-soft">
        Change a name to match the real car park. The QR signs keep working, and past records keep their car park.
      </p>
      <AreaList areas={areas} />
    </>
  );
}
