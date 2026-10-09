export const MAKE_MAX = 40;
export const COLOUR_MAX = 20;

export type VehicleDetails = { make: string | null; colour: string | null };

const clean = (input: string) =>
  input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/**
 * The optional "Make and model" and "Colour" a member can add to a saved car,
 * for example "Toyota Corolla" and "Silver". Empty means not given. The
 * database only has a `make` field, so the make and model share it.
 */
export function checkVehicleDetails(
  input: { make?: string | null; colour?: string | null },
): { ok: true; details: VehicleDetails } | { ok: false; message: string } {
  const make = clean(input.make ?? "");
  const colour = clean(input.colour ?? "");
  if (make.length > MAKE_MAX) {
    return { ok: false, message: `The make and model is too long. Use ${MAKE_MAX} letters or fewer.` };
  }
  if (colour.length > COLOUR_MAX) {
    return { ok: false, message: `The colour is too long. Use ${COLOUR_MAX} letters or fewer.` };
  }
  return { ok: true, details: { make: make || null, colour: colour || null } };
}

/** "Toyota Corolla · Silver", or just what is known, or null when nothing is known. */
export function describeVehicle(v: { make?: string | null; colour?: string | null }): string | null {
  const parts = [v.make?.trim(), v.colour?.trim()].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(" · ") : null;
}
