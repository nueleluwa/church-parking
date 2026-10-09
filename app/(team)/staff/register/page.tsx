import { listActiveAreas } from "@/lib/db";
import { requireStaff } from "@/lib/staff-auth";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  await requireStaff("attendant");
  const areas = await listActiveAreas();
  return (
    <>
      <h1 className="text-2xl font-bold">Add car</h1>
      <p className="text-ink-soft">For drivers with no smartphone, a flat battery or no data.</p>
      <RegisterForm areas={areas.map((a) => ({ slug: a.slug, name: a.name }))} />
    </>
  );
}
