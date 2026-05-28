/* Service worker (PLAN.md §3). Network-first for entry documents (so new deploys + rollbacks
   are picked up and a stale bootstrap can't pin); cache-first for static JS/CSS/SVG assets.
   Cache name is versioned; old caches purge on activate. App DATA never goes over the network. */
const APP_VERSION = "1.0.1";
const CACHE = "lor-prod-" + APP_VERSION;

const PRECACHE = [
  "./", "./index.html", "./manifest.webmanifest", "./version.json",
  "./css/tokens.css", "./css/base.css", "./css/components.css", "./css/screens.css",
  "./js/boot.js", "./js/app.js", "./js/config.js", "./js/util.js", "./js/schema.js",
  "./js/store.js", "./js/leadops.js", "./js/seed.js",
  "./js/engine/score.js", "./js/engine/pricing.js", "./js/engine/message.js",
  "./js/engine/fulfillment.js", "./js/engine/parse.js", "./js/engine/net.js", "./js/engine/ai.js",
  "./js/ui/components.js", "./js/ui/dashboard.js", "./js/ui/inbox.js", "./js/ui/detail.js",
  "./js/ui/add.js", "./js/ui/pipeline.js", "./js/ui/settings.js", "./js/ui/diagnostics.js",
  "./assets/icon.svg", "./assets/icon-192.png", "./assets/icon-512.png", "./assets/icon-180.png",
];

const NETWORK_FIRST = [/index\.html$/, /\.webmanifest$/, /version\.json$/, /\/$/];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(PRECACHE.map((u) => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("lor-prod-")).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (e.g. Anthropic) here

  const isDoc = req.mode === "navigate" || NETWORK_FIRST.some((re) => re.test(url.pathname));
  if (isDoc) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE); c.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) || (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // cache-first for static assets, with background refresh
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const c = await caches.open(CACHE); c.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
