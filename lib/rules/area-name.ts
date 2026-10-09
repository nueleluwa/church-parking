export const AREA_NAME_MIN = 2;
export const AREA_NAME_MAX = 40;

/**
 * A car park name an admin types: extra spaces are tidied, and it must be 2 to
 * 40 characters with no control characters. The same limits are enforced in the
 * database, so this only exists to give a friendly message first.
 */
export function checkAreaName(input: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = input.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (name.length === 0) return { ok: false, message: "Please type a name for the car park." };
  if (name.length < AREA_NAME_MIN) return { ok: false, message: "The name is too short. Use at least 2 letters." };
  if (name.length > AREA_NAME_MAX) return { ok: false, message: "The name is too long. Use 40 letters or fewer." };
  return { ok: true, name };
}

export type RenameResult = "ok" | "not_found" | "duplicate" | "bad_input";

export const RENAME_MESSAGES: Record<Exclude<RenameResult, "ok">, string> = {
  not_found: "We cannot find this car park.",
  duplicate: "Another car park already has that name. Please choose a different name.",
  bad_input: "Please check the name and try again.",
};

/**
 * The QR address for a new car park, made from its name: "Church Gate" gives "church-gate".
 * It is never changed afterwards, so printed signs keep working when a car park is renamed.
 * If the address is already taken, a number is added ("church-gate-2").
 */
export const RESERVED_SLUGS = ["general"];

export function makeAreaSlug(name: string, takenSlugs: string[]): string {
  const taken = [...takenSlugs, ...RESERVED_SLUGS];
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24)
      .replace(/-+$/g, "") || "park";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
