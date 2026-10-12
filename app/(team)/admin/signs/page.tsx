import { redirect } from "next/navigation";

/** QR signs now live in Settings. Old bookmarks open that section; nothing is managed on this address any more. */
export default function SignsRedirect() {
  redirect("/admin/settings/qr-signs");
}
