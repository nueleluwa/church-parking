import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * The one Supabase client. It uses the service key, so it must only run on
 * the server (Server Actions and route handlers) and only be used from lib/db.
 */
export function db(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("The database client must never run in the browser.");
  }
  const env = serverEnv();
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
