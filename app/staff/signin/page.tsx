import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { currentStaff } from "@/lib/staff-auth";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function StaffSignInPage() {
  if (await currentStaff()) redirect("/staff/scan");
  return (
    <>
      <AppHeader title="Team" />
      <main className="mx-auto max-w-md px-4 py-6">
        <div className="rounded-card bg-card p-6 shadow-sm">
          <h1 className="mb-4 text-2xl font-bold">Team sign-in</h1>
          <SignInForm />
        </div>
      </main>
    </>
  );
}
