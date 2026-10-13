import Link from "next/link";
import { redirect } from "next/navigation";
import { getSettings } from "@/lib/db";
import { SEARCH_MODES, SESSION_HOUR_CHOICES, SETTING_LIMITS } from "@/lib/rules";
import { requireStaff } from "@/lib/staff-auth";
import { AdminForm } from "../AdminForm";
import { saveChurchSettingsAction, savePreferenceSettingsAction } from "../admin-actions";
import { Help, card, input } from "./ui";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** The old addresses (?tab=rules and so on) now open the matching section, so bookmarks keep working. */
const LEGACY: Record<string, string> = {
  rules: "vehicle-rules",
  notifications: "notifications",
  system: "system",
};

/**
 * General: the church's details and a few preferences. Only settings that something in the app really reads can be changed
 * (see lib/rules/settings.ts). The security rules and the time zone are fixed on purpose.
 */
export default async function GeneralSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaff("admin");
  const asked = (await searchParams).tab;
  if (asked && LEGACY[asked]) redirect(`/admin/settings/${LEGACY[asked]}`);
  const settings = await getSettings();

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section aria-label="Church details" className={card}>
        <h2 className="t-card">Church details</h2>
        <p className="mb-4 text-sm text-ink-soft">Basic information used across the system.</p>
        <AdminForm action={saveChurchSettingsAction} submitLabel="Save changes" variant="red" savedMessage="Settings saved successfully.">
          <label className="block font-medium">
            Church name
            <input name="churchName" defaultValue={settings.churchName} required minLength={SETTING_LIMITS.churchName.min} maxLength={SETTING_LIMITS.churchName.max} autoComplete="off" className={input} />
            <Help>Printed on the QR signs.</Help>
          </label>
          <label className="block font-medium">
            Campus / location
            <input name="campus" defaultValue={settings.campus} maxLength={SETTING_LIMITS.campus.max} autoComplete="off" placeholder="Optional" className={input} />
            <Help>Printed under the church name on the QR signs when it is filled in.</Help>
          </label>
          <label className="block font-medium">
            System name
            <input name="systemName" defaultValue={settings.systemName} required minLength={SETTING_LIMITS.systemName.min} maxLength={SETTING_LIMITS.systemName.max} autoComplete="off" className={input} />
            <Help>Shown in the team&apos;s side menu and in the welcome on the home page.</Help>
          </label>
          <label className="block font-medium">
            Time zone
            <select disabled defaultValue="Africa/Lagos" className={`${input} bg-page text-ink-soft`} aria-describedby="tz-help">
              <option value="Africa/Lagos">(GMT+01:00) Africa/Lagos</option>
            </select>
            <span id="tz-help" className="mt-1 block text-sm font-normal text-ink-soft">
              Fixed. It decides when each service day starts and ends, so changing it would move every record and report.
            </span>
          </label>
        </AdminForm>
      </section>

      <section aria-label="System preferences" className={card}>
        <h2 className="t-card">System preferences</h2>
        <p className="mb-4 text-sm text-ink-soft">How the system works for your team.</p>
        <AdminForm action={savePreferenceSettingsAction} submitLabel="Save changes" variant="red" savedMessage="Settings saved successfully.">
          <label className="block font-medium">
            Default search method
            <select name="defaultSearch" defaultValue={settings.defaultSearch} className={input}>
              {SEARCH_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <Help>The tab attendants see first in Manual Lookup. They can still switch.</Help>
          </label>
          <label className="block font-medium">
            Staff session length
            <select name="staffSessionHours" defaultValue={String(settings.staffSessionHours)} className={input}>
              {SESSION_HOUR_CHOICES.map((h) => (
                <option key={h} value={h}>
                  {h} hours{h === 12 ? " (standard)" : ""}
                </option>
              ))}
            </select>
            <Help>How long a team member stays signed in. It applies to people who sign in after you save, and can only be 12 hours or shorter.</Help>
          </label>
        </AdminForm>
        <p className="mt-4 rounded-xl bg-page p-3 text-sm text-ink-soft">
          The rules that protect the exit check, such as one open visit for each car and member plates being locked, are not settings and cannot be
          switched off. See{" "}
          <Link href="/admin/settings/vehicle-rules" className="font-semibold text-accent underline">
            Vehicle rules
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
