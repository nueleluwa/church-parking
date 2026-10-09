import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { currentStaff } from "@/lib/staff-auth";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function StaffSignInPage() {
  if (await currentStaff()) redirect("/staff");
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-md px-4 pb-8 pt-5">
        <div className="rounded-card bg-card p-5 shadow-sm">
          <h1 className="mb-4 text-2xl font-bold">Team sign-in</h1>
          <SignInForm />
        </div>
      </main>
    </>
  );
}
