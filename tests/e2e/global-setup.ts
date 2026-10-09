import { createClient } from "@supabase/supabase-js";

/**
 * Before the live tests, clear old rate-limit records in the DEV database, so a
 * day of test runs from one address doesn't trip the limits. Refuses to run unless
 * the app is pointed at localhost, so it can never touch a real deployment.
 */
export default async function globalSetup() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  if (!APP_URL?.startsWith("http://localhost")) {
    console.warn("Skipping rate-limit reset: APP_URL is not localhost.");
    return;
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error } = await db.from("rate_events").delete().gte("id", 0);
  if (error) console.warn("Could not clear rate_events:", error.message);
}
