/**
 * The settings an admin can change, with their defaults and what each one is allowed to be. Only settings that something
 * in the app really reads are here:
 *
 * - churchName and campus: printed on the QR signs.
 * - systemName: the name in the team's side menu and in the home page's welcome.
 * - defaultSearch: which tab attendants see first in Manual Lookup.
 * - staffSessionHours: how long a new staff sign-in lasts. It can only be 12 hours or shorter, never longer, so it can
 *   shorten the session but never weaken it.
 *
 * Rules that protect the exit check (one open visit a car, member plates locked, passes valid on the day they were
 * issued, release only by staff, the audit log) are not settings and cannot be switched off here. The time zone is fixed
 * at Africa/Lagos because it decides when each service day starts and ends, so it would change every report.
 */

export type SearchMode = "plate" | "phone" | "reference";

export const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: "plate", label: "Vehicle number" },
  { value: "phone", label: "Phone number" },
  { value: "reference", label: "Pass reference" },
];

/** The staff session lengths on offer, in hours. 12 is the longest and the default (decision D-03). */
export const SESSION_HOUR_CHOICES = [2, 4, 8, 12] as const;

export type AppSettings = {
  churchName: string;
  campus: string;
  systemName: string;
  defaultSearch: SearchMode;
  staffSessionHours: number;
  // QR check-in policy (SRS section 11). Read by the check-in and checkout; no screen changes them yet, so they are set
  // in the app_settings table. Each falls back to its default if missing or out of range.
  /** How long the checkout credential in a member's browser works. */
  credentialHours: number;
  /** A visit open longer than this is flagged in the admin and staff views. Nothing is closed because of it. */
  longSessionHours: number;
  /** Phone lookups allowed per minute from one address. */
  lookupIpPerMinute: number;
  /** Phone lookups or check-ins allowed per phone number in `lookupPhoneMinutes`. */
  lookupPhoneMax: number;
  lookupPhoneMinutes: number;
  /** Times a phone number may get a replacement credential in `reissueMinutes`. */
  reissueMax: number;
  reissueMinutes: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  churchName: "Celebration Church",
  campus: "",
  systemName: "Church Parking",
  defaultSearch: "plate",
  staffSessionHours: 12,
  credentialHours: 24,
  longSessionHours: 12,
  lookupIpPerMinute: 10,
  lookupPhoneMax: 5,
  lookupPhoneMinutes: 10,
  reissueMax: 3,
  reissueMinutes: 60,
};

/** The key each setting is stored under. */
export const SETTING_KEYS: Record<keyof AppSettings, string> = {
  churchName: "church_name",
  campus: "campus",
  systemName: "system_name",
  defaultSearch: "default_search",
  staffSessionHours: "staff_session_hours",
  credentialHours: "credential_hours",
  longSessionHours: "long_session_hours",
  lookupIpPerMinute: "lookup_ip_per_minute",
  lookupPhoneMax: "lookup_phone_max",
  lookupPhoneMinutes: "lookup_phone_minutes",
  reissueMax: "reissue_max",
  reissueMinutes: "reissue_minutes",
};

/** The range each QR policy number may take. A stored value outside it is ignored, so a typo cannot lock everyone out or open the door. */
export const POLICY_RANGES = {
  credentialHours: { min: 1, max: 48 },
  longSessionHours: { min: 1, max: 48 },
  lookupIpPerMinute: { min: 1, max: 120 },
  lookupPhoneMax: { min: 1, max: 60 },
  lookupPhoneMinutes: { min: 1, max: 1440 },
  reissueMax: { min: 1, max: 20 },
  reissueMinutes: { min: 1, max: 1440 },
} as const;

const inRange = (name: keyof typeof POLICY_RANGES) => (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= POLICY_RANGES[name].min && v <= POLICY_RANGES[name].max;

export const SETTING_LIMITS = { churchName: { min: 2, max: 80 }, campus: { max: 80 }, systemName: { min: 2, max: 40 } } as const;

const isMode = (v: unknown): v is SearchMode => SEARCH_MODES.some((m) => m.value === v);
const isHours = (v: unknown): v is number => typeof v === "number" && (SESSION_HOUR_CHOICES as readonly number[]).includes(v);
const isText = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.length >= min && v.length <= max && !hasControl(v);
const hasControl = (v: string) => /[\u0000-\u001f\u007f<>]/.test(v);

/** The settings in force: each stored value if it is valid, otherwise its default. An unreadable value never breaks a screen. */
export function resolveSettings(rows: { key: string; value: unknown }[]): AppSettings {
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const pick = <K extends keyof AppSettings>(name: K, ok: (v: unknown) => boolean): AppSettings[K] => {
    const value = stored.get(SETTING_KEYS[name]);
    return ok(value) ? (value as AppSettings[K]) : DEFAULT_SETTINGS[name];
  };
  return {
    churchName: pick("churchName", (v) => isText(v, SETTING_LIMITS.churchName.min, SETTING_LIMITS.churchName.max)),
    campus: pick("campus", (v) => isText(v, 0, SETTING_LIMITS.campus.max)),
    systemName: pick("systemName", (v) => isText(v, SETTING_LIMITS.systemName.min, SETTING_LIMITS.systemName.max)),
    defaultSearch: pick("defaultSearch", isMode),
    staffSessionHours: pick("staffSessionHours", isHours),
    credentialHours: pick("credentialHours", inRange("credentialHours")),
    longSessionHours: pick("longSessionHours", inRange("longSessionHours")),
    lookupIpPerMinute: pick("lookupIpPerMinute", inRange("lookupIpPerMinute")),
    lookupPhoneMax: pick("lookupPhoneMax", inRange("lookupPhoneMax")),
    lookupPhoneMinutes: pick("lookupPhoneMinutes", inRange("lookupPhoneMinutes")),
    reissueMax: pick("reissueMax", inRange("reissueMax")),
    reissueMinutes: pick("reissueMinutes", inRange("reissueMinutes")),
  };
}

export type Validated<T> = { ok: true; values: T } | { ok: false; error: string };

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Church name, campus and system name from the form. */
export function validateChurch(input: Record<string, unknown>): Validated<Pick<AppSettings, "churchName" | "campus" | "systemName">> {
  const churchName = clean(input.churchName);
  const campus = clean(input.campus);
  const systemName = clean(input.systemName);
  if (churchName.length < SETTING_LIMITS.churchName.min) return { ok: false, error: "Please enter the church name (at least 2 characters)." };
  if (churchName.length > SETTING_LIMITS.churchName.max) return { ok: false, error: `The church name can be at most ${SETTING_LIMITS.churchName.max} characters.` };
  if (campus.length > SETTING_LIMITS.campus.max) return { ok: false, error: `The campus or location can be at most ${SETTING_LIMITS.campus.max} characters.` };
  if (systemName.length < SETTING_LIMITS.systemName.min) return { ok: false, error: "Please enter a system name (at least 2 characters)." };
  if (systemName.length > SETTING_LIMITS.systemName.max) return { ok: false, error: `The system name can be at most ${SETTING_LIMITS.systemName.max} characters.` };
  for (const text of [churchName, campus, systemName]) {
    if (hasControl(text)) return { ok: false, error: "Names cannot contain the characters < or >." };
  }
  return { ok: true, values: { churchName, campus, systemName } };
}

/** Default search method and staff session length from the form. */
export function validatePreferences(input: Record<string, unknown>): Validated<Pick<AppSettings, "defaultSearch" | "staffSessionHours">> {
  if (!isMode(input.defaultSearch)) return { ok: false, error: "Please choose how attendants search first." };
  const hours = Number(input.staffSessionHours);
  if (!isHours(hours)) return { ok: false, error: "Please choose a session length from the list (up to 12 hours)." };
  return { ok: true, values: { defaultSearch: input.defaultSearch, staffSessionHours: hours } };
}
