import { cache } from "react";
import { SETTING_KEYS, resolveSettings, type AppSettings } from "@/lib/rules/settings";
import { db } from "./client";

function fail(message: string): never {
  throw new Error(`Database error: ${message}`);
}

/**
 * The settings in force. Each is read from the database, and a missing or unreadable one is replaced by its default, so a
 * problem with a setting can never stop the app. The answer is kept for the length of one request.
 */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const { data, error } = await db().from("app_settings").select("key, value");
  if (error) {
    // Settings are a convenience: if they cannot be read, the defaults keep the app working
    return resolveSettings([]);
  }
  return resolveSettings((data ?? []) as { key: string; value: unknown }[]);
});

/** Saves some settings and returns what they were before, for the audit record. */
export async function saveSettings(values: Partial<AppSettings>, staffId: string): Promise<{ before: Partial<AppSettings> }> {
  const before = await getSettings();
  const names = Object.keys(values) as (keyof AppSettings)[];
  const rows = names.map((name) => ({ key: SETTING_KEYS[name], value: values[name], updated_by: staffId, updated_at: new Date().toISOString() }));
  const { error } = await db().from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) fail(error.message);
  return { before: Object.fromEntries(names.map((n) => [n, before[n]])) as Partial<AppSettings> };
}
