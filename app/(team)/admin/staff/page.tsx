import { redirect } from "next/navigation";

/** The old Staff Accounts screen now lives in Users (the Staff accounts tab). Bookmarks keep working, and a search or role is carried over. */
export default async function StaffRedirect({ searchParams }: { searchParams: Promise<{ q?: string; role?: string }> }) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "staff" });
  if (sp.q) params.set("q", sp.q.trim().slice(0, 40));
  if (sp.role) params.set("role", sp.role);
  redirect(`/admin/users?${params.toString()}`);
}
