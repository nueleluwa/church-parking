/* Church Parking service worker.
 * It makes the installed app start faster and shows a clear page when a phone has no signal.
 * It keeps only things that never hold anyone's data: the offline page, the icons and logo, and the build files
 * (their names change with every release, so a stored copy can never be out of date). It never stores a page, a pass
 * or any data (there is no offline mode, D-06): pages always come from the network. */
const SHELL = "church-parking-shell-v2";
const STATIC = "church-parking-static-v2";
const PRECACHE = ["/offline", "/icon-192.png", "/cci-logo.svg", "/vehicle-illustration.png"];
const KEEP = [SHELL, STATIC];
const STATIC_LIMIT = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)));
      // Lets the browser start the page request while this worker wakes up, instead of waiting for it
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

/** Build files and fonts: named by their content, so the stored copy is always right. Keep a bounded number. */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    cache.put(request, res.clone());
    const keys = await cache.keys();
    if (keys.length > STATIC_LIMIT) await cache.delete(keys[0]);
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    // Pages always come from the network; only if that fails is the offline page shown
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(req));
        } catch {
          return (await caches.match("/offline")) || Response.error();
        }
      })(),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
});
