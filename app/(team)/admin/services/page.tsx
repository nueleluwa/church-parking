import { redirect } from "next/navigation";

/** Services now live in Settings. Old bookmarks open the Services section there; nothing is managed on this address any more. */
export default function ServicesRedirect() {
  redirect("/admin/settings/services");
}
