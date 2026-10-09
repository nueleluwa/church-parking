import { listAllAreas } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";
import { field } from "@/components/ui";
import { AdminForm } from "../AdminForm";
import { addAreaAction } from "../admin-actions";
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

      <section className="rounded-card bg-card p-4 shadow-sm lg:max-w-xl">
        <h2 className="text-lg font-bold">Add a car park</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Give it a name. It gets its own QR address, and its sign is ready to print under QR Signs.
        </p>
        <div className="mt-3">
          <AdminForm action={addAreaAction} submitLabel="Add car park" clearOnSuccess>
            <label className="block font-medium">
              Name of the car park
              <input name="name" required minLength={2} maxLength={40} autoComplete="off" className={field} />
            </label>
          </AdminForm>
        </div>
      </section>
    </>
  );
}
