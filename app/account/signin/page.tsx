import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { currentMember } from "@/lib/member-auth";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

const SAFE_NEXT = /^\/c\/[a-z0-9-]{1,40}$/;

export default async function MemberSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next = "" } = await searchParams;
  const safeNext = SAFE_NEXT.test(next) ? next : "";
  if (await currentMember()) redirect(safeNext || "/account");
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-md space-y-4 px-4 pb-8 pt-5">
        <div className="rounded-card bg-card p-5 shadow-sm">
          <h1 className="mb-4 text-2xl font-bold">Sign in</h1>
          <SignInForm next={safeNext} />
        </div>
        <p className="text-center">
          New here?{" "}
          <Link
            href={`/account/signup${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}
            className="font-semibold text-accent underline"
          >
            Create an account
          </Link>
        </p>
      </main>
    </>
  );
}
