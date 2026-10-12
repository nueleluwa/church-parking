import { redirect } from "next/navigation";

/** The old Members screen now lives in Users (the Members tab). Bookmarks keep working, and a search is carried over. */
export default async function MembersRedirect({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  redirect(q ? `/admin/users?q=${encodeURIComponent(q)}` : "/admin/users");
}
