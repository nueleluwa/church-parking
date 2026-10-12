import Link from "next/link";
import { IconPlus } from "@/components/icons";
import { field } from "@/components/ui";
import { countParkedNowIn, listAllAreas } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";
import { AdminForm } from "../../AdminForm";
import { addAreaAction } from "../../admin-actions";
import { Panel } from "../../Panel";
import { SectionHead, addButton, card } from "../ui";
import { AreaList } from "./AreaList";

export const metadata = { title: "Parking areas" };
export const dynamic = "force-dynamic";

/**
 * The car parks, inside Settings. A rename changes only the name shown: the car park keeps its id and QR address, so signs and past
 * records are untouched. A car park with cars in it cannot be switched off, and switching one off deletes nothing.
 */
export default async function ParkingAreasPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  await requireStaff("admin");
  const sp = await searchParams;
  const all = await listAllAreas();
  const areas = await Promise.all(all.map(async (a) => ({ ...a, parkedNow: await countParkedNowIn(null, a.id) })));

  return (
    <>
      <section aria-label="Parking areas" className={card}>
        <SectionHead
          title={
            <>
              Parking areas (<span data-testid="area-count">{areas.length}</span>)
            </>
          }
          action={
            <Link href="/admin/settings/parking-areas?add=1" className={addButton}>
              <IconPlus aria-hidden="true" className="h-5 w-5" />
              Add car park
            </Link>
          }
        >
          Change a name to match the real car park. The QR signs keep working, and past records keep their car park.
        </SectionHead>
        {areas.length === 0 ? <p className="rounded-xl bg-page p-4 font-medium">No car parks are set up yet.</p> : <AreaList areas={areas} />}
      </section>

      {sp.add && (
        <Panel title="Add car park" closeHref="/admin/settings/parking-areas">
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <p className="text-sm text-ink-soft">
              Give it a name. It gets its own QR address, and its sign is ready to print under{" "}
              <Link href="/admin/settings/qr-signs" className="font-semibold text-accent underline">
                QR signs
              </Link>
              .
            </p>
            <AdminForm action={addAreaAction} submitLabel="Add car park" clearOnSuccess>
              <label className="block font-medium">
                Name of the car park
                <input name="name" required minLength={2} maxLength={40} autoComplete="off" className={field} />
              </label>
            </AdminForm>
          </div>
        </Panel>
      )}
    </>
  );
}
