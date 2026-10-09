/** Uppercase, letters and digits only: "phc-234 ab" becomes "PHC234AB". */
export function normalisePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Show a stored plate for people. Nigerian plates (3 letters, 3 digits,
 * 2 letters) are spaced as "PHC 234 AB". Anything else is shown as stored.
 */
export function formatPlate(plate: string): string {
  const p = normalisePlate(plate);
  const m = /^([A-Z]{3})([0-9]{3})([A-Z]{2})$/.exec(p);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : p;
}
