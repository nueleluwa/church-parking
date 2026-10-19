import { requireStaff } from "@/lib/staff-auth";
import { AddMember } from "./AddMember";

export const metadata = { title: "Add member" };

export default async function AddMemberPage() {
  await requireStaff("attendant");
  return (
    <>
      <p className="text-ink-soft">For a driver who is not a member yet and was sent to parking staff by the check-in page.</p>
      <AddMember />
    </>
  );
}
