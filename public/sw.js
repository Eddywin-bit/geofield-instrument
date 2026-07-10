/* GeoField Companion Service Worker */
const VERSION = "v5";
const SHELL_CACHE = `geofield-shell-${VERSION}`;
const DATA_CACHE = `geofield-data-${VERSION}`;
// Owned by MapView, not by this worker. Holds the 92 MB offline basemap and its
// resumable part files. It must survive every activation: re-downloading it
// costs a field geologist real money on Ghanaian mobile data.
const BASEMAP_CACHE = "geofield-basemap-v1";

const SHELL_URLS = [
  "/",
  "/log",
  "/my-logs",
  "/manifest.webmanifest",
  "/fonts/Noto%20Sans%20Regular/0-255.pbf",
  "/fonts/Noto%20Sans%20Regular/256-511.pbf",
];

const DATA_URLS = [
  "/data/units.json",
  "/data/geology.geojson",
  "/data/ghana-roads.geojson",
  "/data/ghana-rivers.geojson",
  "/data/ghana-regions.geojson",
  "/data/ghana-places.geojson",
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
  if (url.pathname.startsWith("/__l5e/")) return;

  // Stale-while-revalidate for /data: serve cache instantly (offline-safe),
  // refresh in the background so data edits propagate on the next load.
  if (url.pathname.startsWith("/data/") && url.pathname !== "/data/ghana.pmtiles") {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
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
