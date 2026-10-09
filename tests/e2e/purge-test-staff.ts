import { createClient } from "@supabase/supabase-js";

/**
 * Removes the throw-away staff accounts the tests make ("Test attendant", "Test coordinator",
 * "Audit Person 123"). Records they touched (audit rows, releases, alerts) are kept; they just
 * stop pointing at a person who no longer exists. Only these exact test names are touched, and
 * only in the project the tests run against.
 */
export async function purgeTestStaff(): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 0;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data } = await db
    .from("staff")
    .select("id, full_name")
    .or("full_name.ilike.Test attendant,full_name.ilike.Test coordinator,full_name.like.Audit Person *");
  const ids = (data ?? []).map((s) => s.id as string);

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    await db.from("audit_events").update({ staff_id: null }).in("staff_id", part);
    await db.from("visits").update({ released_by: null }).in("released_by", part);
    await db.from("visits").update({ checked_in_by: null }).in("checked_in_by", part);
    await db.from("visits").update({ held_by: null }).in("held_by", part);
    await db.from("alerts").update({ resolved_by: null }).in("resolved_by", part);
    await db.from("staff").delete().in("id", part);
  }
  return ids.length;
}
