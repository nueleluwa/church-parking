import Link from "next/link";
import { IconCar } from "@/components/icons";
import { requireStaff } from "@/lib/staff-auth";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  await requireStaff("admin");
  return (
    <>
      <ul className="space-y-3">
        <li>
          <Link
            href="/admin/areas"
            className="flex items-center gap-4 rounded-card bg-card p-5 shadow-sm hover:bg-page"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night text-white">
              <IconCar />
            </span>
            <span>
              <span className="block text-lg font-bold">Car parks</span>
              <span className="block text-sm text-ink-soft">Change the names of your car parks</span>
            </span>
          </Link>
        </li>
      </ul>
    </>
  );
}
