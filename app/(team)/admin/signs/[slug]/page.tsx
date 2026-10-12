import { redirect } from "next/navigation";

/** A car park's printable sign now opens inside Settings. The paper size is kept. */
export default async function SignRedirect({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ size?: string }> }) {
  const { slug } = await params;
  const size = (await searchParams).size === "a5" ? "?size=a5" : "";
  redirect(`/admin/settings/qr-signs/${encodeURIComponent(slug)}${size}`);
}
