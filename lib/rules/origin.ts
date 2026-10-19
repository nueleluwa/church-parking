/**
 * Is a request really from this site's own pages? Used by the checkout, which changes state and is authorised by a cookie, so
 * it must not be possible to trigger it from another website. Next's own check for Server Actions lets a request with NO
 * Origin header through, so this one is stricter: the header must be there and must name this site's host.
 *
 * The site's host is the one the browser used: `x-forwarded-host` when a proxy forwards it (nginx and Cloudflare do), otherwise
 * `host`. This is the same comparison Next makes, so it holds wherever the existing Server Actions already work.
 */
export function isSameOrigin(origin: string | null, host: string | null, forwardedHost: string | null): boolean {
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false; // "null" (a sandboxed or cross-origin redirect) and anything else that is not an address
  }
  const siteHost = (forwardedHost?.split(",")[0] ?? host ?? "").trim().toLowerCase();
  return siteHost !== "" && originHost === siteHost;
}
