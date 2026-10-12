import { redirect } from "next/navigation";

/** Car parks now live in Settings (Parking areas). Old bookmarks open that section; nothing is managed on this address any more. */
export default function AreasRedirect() {
  redirect("/admin/settings/parking-areas");
}
