import { redirect } from "next/navigation";
import { MemberNav } from "@/components/MemberNav";
import { TitleHeader } from "@/components/TitleHeader";
import { outlineButton } from "@/components/ui";
import { currentMember } from "@/lib/member-auth";
import { signOutMember } from "../actions";
import { ChangePinForm, DeleteAccountForm } from "../AccountForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "More" };

/** Settings for a member: change the PIN, delete the account, sign out. */
export default async function MorePage() {
  const member = await currentMember();
  if (!member) redirect("/account/signin");

  return (
    <>
      <TitleHeader title="More" backHref="/account" />
      <main className="mx-auto max-w-md space-y-4 px-4 pb-28 pt-5">
        <div className="rounded-card bg-card p-5 shadow-sm">
          <p className="text-sm text-ink-soft">Signed in as</p>
          <p className="text-xl font-bold">{member.full_name}</p>
        </div>

        <details className="rounded-card bg-card p-5 shadow-sm">
          <summary className="cursor-pointer text-xl font-bold">Change my PIN</summary>
          <div className="mt-4">
            <ChangePinForm />
          </div>
        </details>

        <details className="rounded-card bg-card p-5 shadow-sm">
          <summary className="cursor-pointer text-xl font-bold">Delete my account</summary>
          <div className="mt-4">
            <DeleteAccountForm />
          </div>
        </details>

        <form action={signOutMember}>
          <button className={outlineButton}>Sign out</button>
        </form>
      </main>
      <MemberNav active="more" />
    </>
  );
}
