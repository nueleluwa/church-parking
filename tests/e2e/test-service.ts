import { createClient } from "@supabase/supabase-js";

/**
 * The automated tests and manual weekday testing need a service that is running
 * right now, but the real services are Sunday-only. This single clearly named
 * row stands in for one, and it is switched OFF whenever tests are not running,
 * so it never shows up in the live interface.
 */
export const TEST_SERVICE_NAME = "Automated test service";
const LEGACY_NAME = "TEST ALL DAY"; // the name this row had when it was first made by hand

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function client() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  // Never touch a real deployment: this is for the local dev database only.
  if (!APP_URL?.startsWith("http://localhost")) {
    console.warn("Skipping the test service: APP_URL is not localhost.");
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Switch the test service on (open all day, today's weekday) or off (hidden everywhere). */
export async function setTestService(on: boolean): Promise<void> {
  const db = client();
  if (!db) return;

  const { data: existing } = await db
    .from("services")
    .select("id, name")
    .in("name", [TEST_SERVICE_NAME, LEGACY_NAME])
    .limit(1)
    .maybeSingle();

  if (!on) {
    if (existing) await db.from("services").update({ name: TEST_SERVICE_NAME, active: false }).eq("id", existing.id);
    return;
  }

  const weekday = WEEKDAYS.indexOf(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short" }).format(new Date()),
  );
  const row = { name: TEST_SERVICE_NAME, weekday, starts_at: "00:00", ends_at: "23:59", active: true };
  const { error } = existing
    ? await db.from("services").update(row).eq("id", existing.id)
    : await db.from("services").insert(row);
  if (error) throw new Error(`Could not switch the test service on: ${error.message}`);
}
