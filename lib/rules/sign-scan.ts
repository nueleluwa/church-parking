/**
 * What a driver's camera found when they scan from the Church Parking home page. Only our own addresses count:
 * a printed sign for another website must never send a driver somewhere else, so anything else is "other".
 *
 * Two different codes exist and must never be mixed up:
 *  - a CAR PARK SIGN (/c/<car park>) opens check-in for that car park, and an EXIT SIGN (/c/<car park>/out) opens check-out;
 *  - a PARKING PASS (/p/<token>) is the driver's own checkout code, shown to the attendant.
 */
export type SignScan = { kind: "sign"; slug: string } | { kind: "exit"; slug: string } | { kind: "pass"; token: string } | { kind: "other" };

const OUR_HOSTS = ["churchparking.online", "www.churchparking.online"];

/** `currentHost` is the host this page is being served from (for example localhost while testing). */
export function parseSignScan(text: string, currentHost: string): SignScan {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return { kind: "other" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "other" };
  const host = url.host.toLowerCase();
  if (host !== currentHost.toLowerCase() && !OUR_HOSTS.includes(host)) return { kind: "other" };

  const sign = /^\/c\/([a-z0-9-]{1,40})\/?$/.exec(url.pathname);
  if (sign) return { kind: "sign", slug: sign[1] };
  // An EXIT sign (/c/<car park>/out) opens the exit page for that car park, where a member who checked in by phone checks out
  const exit = /^\/c\/([a-z0-9-]{1,40})\/out\/?$/.exec(url.pathname);
  if (exit) return { kind: "exit", slug: exit[1] };
  const pass = /^\/p\/([A-Za-z0-9_-]{22})\/?$/.exec(url.pathname);
  if (pass) return { kind: "pass", token: pass[1] };
  return { kind: "other" };
}
