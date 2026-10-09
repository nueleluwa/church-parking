/**
 * Turn what a person types into E.164 (+234...). Accepts Nigerian numbers
 * ("0803 123 4567", "2348031234567") and international ones ("+44 7700 900123",
 * "0044 7700 900123") so visitors from abroad can check in. Returns null if
 * it isn't a usable number.
 */
export function normalisePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(cleaned)) return null;

  // "0044..." is another way to write "+44..."
  const digits = cleaned.replace(/^\+/, "").replace(/^00(?=[1-9])/, "");
  const international = cleaned.startsWith("+") || /^00[1-9]/.test(cleaned);

  if (!international) {
    if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`; // 0803 123 4567
    if (/^234\d{10}$/.test(digits)) return `+${digits}`;
    return null;
  }
  // E.164: a country code that doesn't start with 0, 8 to 15 digits in all
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/** Last 4 digits only, for staff screens (R-9). */
export function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}
