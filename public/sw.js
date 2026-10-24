/* Church Parking service worker.
 * It exists so the app can be installed and so a phone with no signal sees a clear page instead of the browser's error.
 * It never stores pages, passes or data (there is no offline mode, D-06): only the offline page and the icons. */
const CACHE = "church-parking-shell-v1";
const SHELL = ["/offline", "/icon-192.png", "/cci-logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  // Pages always come from the network; only if that fails is the offline page shown
  event.respondWith(fetch(req).catch(() => caches.match("/offline")));
});
