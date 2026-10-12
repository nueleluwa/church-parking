import { redirect } from "next/navigation";

/** The general sign now opens inside Settings. */
export default function GeneralSignRedirect() {
  redirect("/admin/settings/qr-signs/general");
}
