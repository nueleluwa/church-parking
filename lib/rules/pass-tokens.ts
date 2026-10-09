/**
 * The passes a phone remembers. A phone can hold more than one at a time (a guest who checks in a second car,
 * or two cars for two people), so the cookie holds a short list, newest first. The list only says "this phone
 * made these passes": it is signed on the server, and the app still checks every pass in the database.
 */
export const MAX_REMEMBERED_PASSES = 6;

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** Reads the cookie's value: a list of tokens, or the single token older versions stored. Anything else is ignored. */
export function parseRemembered(value: string | null | undefined): string[] {
  if (!value) return [];
  const v = value.trim();
  let raw: unknown;
  if (v.startsWith("[")) {
    try {
      raw = JSON.parse(v);
    } catch {
      return [];
    }
  } else {
    raw = [v];
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t === "string" && TOKEN.test(t) && !out.includes(t)) out.push(t);
  }
  return out.slice(0, MAX_REMEMBERED_PASSES);
}

/** Puts a new pass first, removes a repeat of it, and keeps only the newest few. */
export function addRemembered(list: string[], token: string): string[] {
  if (!TOKEN.test(token)) return list;
  return [token, ...list.filter((t) => t !== token)].slice(0, MAX_REMEMBERED_PASSES);
}

export const serialiseRemembered = (list: string[]): string => JSON.stringify(list);

/**
 * Whether this phone may see the full pass: it made the pass, or the signed-in member owns the visit.
 * Being signed in as a member is enough on a new phone, because the member's own account is proof.
 */
export function ownsPass(input: {
  token: string;
  remembered: string[];
  passMemberId: string | null;
  signedInMemberId: string | null;
}): boolean {
  if (input.remembered.includes(input.token)) return true;
  return input.signedInMemberId !== null && input.passMemberId === input.signedInMemberId;
}
