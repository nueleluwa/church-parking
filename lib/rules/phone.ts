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

/**
 * The 11-digit local form (08031234567) of a stored Nigerian number, or null if it has none (an international number).
 * The database computes the same value in `members.phone_local`, so the two must stay identical.
 */
export function toLocalPhone(e164: string): string | null {
  return /^\+234\d{10}$/.test(e164) ? `0${e164.slice(4)}` : null;
}

/**
 * What a member types at check-in, as the local form. Accepts 0803…, +234…, 234… and spaces or dashes; anything that is
 * not a Nigerian number gives null (the check-in page then sends them to parking staff).
 */
export function localPhone(input: string): string | null {
  const e164 = normalisePhone(input);
  return e164 ? toLocalPhone(e164) : null;
}

/**
 * How a stored phone number is shown to staff: the local form (08031234567) for a Nigerian number, and the stored form for any
 * other. Members are told and shown local numbers everywhere; the database keeps the international form.
 */
export function displayPhone(stored: string): string {
  return toLocalPhone(stored) ?? stored;
}

/** 08031234567 shown as 0803 123 4567. */
export function formatLocalPhone(local: string): string {
  return /^\d{11}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
}

/** Last 4 digits only, for staff screens (R-9). */
export function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}
