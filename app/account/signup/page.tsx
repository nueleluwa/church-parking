import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { currentMember } from "@/lib/member-auth";
import { SignUpForm } from "./SignUpForm";

export const dynamic = "force-dynamic";

const SAFE_NEXT = /^\/c\/[a-z0-9-]{1,40}$/;

export default async function MemberSignUpPage({
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
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <div className="rounded-card bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Create an account</h1>
          <p className="mb-4 mt-1 text-ink-soft">
            Save your car once. Next Sunday you check in with two taps.
          </p>
          <SignUpForm next={safeNext} />
        </div>
        <p className="text-center">
          Already have an account?{" "}
          <Link
            href={`/account/signin${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}
            className="font-semibold text-accent underline"
          >
            Sign in
          </Link>
        </p>
        <p className="px-2 text-sm text-ink-soft">
          We keep your name, phone number and car plates only to run church parking. You can
          delete your account at any time.
        </p>
      </main>
    </>
  );
}
