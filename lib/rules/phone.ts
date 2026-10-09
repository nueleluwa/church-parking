/**
 * Turn what a person types into E.164 (+234...). Accepts "0803 123 4567",
 * "+234 803 123 4567" and "2348031234567". Returns null if it isn't a
 * Nigerian mobile number we can use.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  const bare = digits.replace(/^\+/, "");
  if (/^0\d{10}$/.test(bare)) return `+234${bare.slice(1)}`;
  if (/^234\d{10}$/.test(bare)) return `+${bare}`;
  return null;
}

/** Last 4 digits only, for staff screens (R-9). */
export function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}
