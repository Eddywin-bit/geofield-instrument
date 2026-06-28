/* GeoField Companion Service Worker */
const VERSION = "v1";
const SHELL_CACHE = `geofield-shell-${VERSION}`;
const DATA_CACHE = `geofield-data-${VERSION}`;

const SHELL_URLS = [
  "/",
  "/log",
  "/my-logs",
  "/manifest.webmanifest",
];

const DATA_URLS = [
  "/data/units.json",
  "/data/geology.geojson",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.allSettled(SHELL_URLS.map((u) => shell.add(u).catch(() => null)));
      const data = await caches.open(DATA_CACHE);
      await Promise.allSettled(DATA_URLS.map((u) => data.add(u).catch(() => null)));
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("geofield-") && k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first for /data
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      }),
    );
    return;
  }

  // Network-first for navigations with cached fallback
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch (e) {
          const cache = await caches.open(SHELL_CACHE);
          const cached = (await cache.match(req)) || (await cache.match("/"));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Stale-while-revalidate for other same-origin assets
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
