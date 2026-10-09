/**
 * A one-time key for a check-in attempt, kept in this browser tab for 30 minutes (the same time the server
 * remembers it for). If the signal drops after the request reached the server, the phone tries again with the
 * SAME key, and the server hands back the pass it already made instead of treating the retry as a second car.
 *
 * The key is tied to the car (its plate, or the member's saved car), so checking in a different car gets a
 * fresh key. It lives in sessionStorage so it survives the page restarting itself after an error.
 * If storage is blocked it still works; the retry just is not recognised.
 */
const MINUTES = 30;

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older browsers, and plain-http test addresses, have no randomUUID: build one from random bytes
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function keyForAttempt(scope: string, car: string): string {
  const storageKey = `cp-check-in:${scope}:${car}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw) as { key?: string; at?: number };
      if (saved.key && typeof saved.at === "number" && Date.now() - saved.at < MINUTES * 60_000) return saved.key;
    }
  } catch {
    /* storage blocked or unreadable: make a new key */
  }
  const key = newUuid();
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ key, at: Date.now() }));
  } catch {
    /* storage blocked: the key still works for this attempt */
  }
  return key;
}
