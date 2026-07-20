import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification, type LayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Link } from "@tanstack/react-router";
import { Navigation2, Crosshair, ChevronDown, Layers, Loader2, Minus, Plus, X } from "lucide-react";
import { Protocol, PMTiles, FileSource } from "pmtiles";
import { layers as basemapLayers, namedFlavor } from "@protomaps/basemaps";
import { loadGeology, type GeoData } from "../lib/geology";
import { startPositionWatch, startCompassWatch } from "../lib/geo-acquire";
import { UNIT_COLORS, LEGEND } from "../lib/unit-colors";

const GHANA_BOUNDS: [number, number, number, number] = [-3.26, 4.74, 1.19, 11.18];
const OCEAN = "#C7DCEA";
const LAND = "#F3EFE4";

// Location-marker colors, matched to Rockd/Google-Maps-style live-location
// pucks. Measured directly from reference screenshots (pixel sampling, cross
// checked against two independent heading angles): the dot and the heading
// arrow are two distinct, deliberate blues, not the same color at different
// opacity.
const LOCATION_DOT_BLUE = "#1DA1F3";
const LOCATION_ARROW_BLUE = "#49A1EA";

// Above this ground speed, GPS course between fixes is a reliable heading;
// at or below it (walking pace or slower), consecutive fixes are too close
// together relative to their own error to trust a bearing between them, so
// the compass is used instead. ~6.5 km/h: brisk walk/jog, comfortably below
// any vehicle speed.
const HEADING_GPS_SPEED_MPS = 1.8;
// A GPS-course bearing needs the two fixes to actually be far enough apart
// that GPS error isn't the dominant component of the vector between them.
const HEADING_MIN_FIX_DISTANCE_M = 8;
// Discard a prior fix this old rather than derive a bearing across a gap
// that may no longer reflect the current direction of travel.
const HEADING_MAX_FIX_AGE_MS = 20_000;
// Ignore a compass reading once it's this stale; if there's been no orientation
// event in a while, the user hasn't necessarily moved but the sensor may be gone.
const HEADING_MAX_COMPASS_AGE_MS = 5_000;
// Compass fires far faster than we want to re-render at.
const HEADING_COMPASS_THROTTLE_MS = 300;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}

// Initial great-circle bearing from a to b, in degrees clockwise from north.
// This is the "GPS course between consecutive fixes" used as heading while
// moving above walking pace.
function bearingDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const theta = (Math.atan2(y, x) * 180) / Math.PI;
  return (theta + 360) % 360;
}

// Hosted on GitHub Pages (public repo Eddywin-bit/geofield-assets) so the offline
// basemap does not depend on the Lovable CDN. md5 ab08c5fba7f2992419b690cd2ec34663.
const BASEMAP_ASSET_URL =
  "https://eddywin-bit.github.io/geofield-assets/ghana.pmtiles";
const BASEMAP_CACHE = "geofield-basemap-v1";
const BASEMAP_KEY = "/basemap/ghana.pmtiles";
const BASEMAP_SIZE = 92038624;
const BASEMAP_FILE_NAME = "ghana.pmtiles";
const BASEMAP_STYLE_URL = `pmtiles://${BASEMAP_FILE_NAME}`;
// Downloaded as ranged chunks so a dropped connection resumes instead of
// restarting. Each completed chunk is written straight to Cache Storage, so
// peak memory is one chunk, not the whole 92 MB.
const BASEMAP_CHUNK = 8 * 1024 * 1024;
const BASEMAP_PART_PREFIX = "/basemap/ghana.pmtiles.part.";

// Online map: OpenFreeMap's Liberty vector style. Vector renders crisp at any
// zoom and screen density, where the previous CARTO raster tiles (256px PNGs)
// went blurry past their native zoom on high-DPI phones and loaded slowly.
// Keyless, no usage limits, ships its own labels, sprite, glyphs and OSM
// attribution. The raster branch inside buildStyle is superseded by this and
// kept only as unused fallback code.
const ONLINE_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

/** One ranged chunk, with a short backoff. Rejects if the server ignores Range. */
async function fetchBasemapRange(start: number, end: number): Promise<Blob> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(BASEMAP_ASSET_URL, {
        headers: { Range: `bytes=${start}-${end}` },
        cache: "no-store",
      });
      if (res.status === 206) return await res.blob();
      if (res.status === 200) throw new Error("server ignored Range header");
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("range fetch failed");
}

// The assembled basemap lives in the app's private Filesystem sandbox
// (Directory.Data) on native, so Android "Clear Cache" and storage-pressure
// eviction cannot delete it — only uninstalling removes it. On web (the PWA)
// there is no Filesystem plugin, so we keep using Cache Storage there.
// The temporary ranged chunks always stay in Cache Storage regardless.
const BASEMAP_FS_PATH = "ghana.pmtiles";

async function isNativeRuntime(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Returns the assembled basemap as a Blob from whichever durable store holds it,
// or null if not present. Native: served by Capacitor's local file server via
// fetch(convertFileSrc), which streams from disk — no 123 MB base64 string, no
// atob of the whole file. A base64 read remains only as a last-resort fallback.
async function readAssembledBasemap(): Promise<Blob | null> {
  if (await isNativeRuntime()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const stat = await Filesystem.stat({ path: BASEMAP_FS_PATH, directory: Directory.Data }).catch(() => null);
      if (!stat) return null;
      if (typeof stat.size === "number" && stat.size !== BASEMAP_SIZE) {
        // Wrong size (e.g. an interrupted previous assembly) — discard.
        try { await Filesystem.deleteFile({ path: BASEMAP_FS_PATH, directory: Directory.Data }); } catch { /* ignore */ }
        return null;
      }
      const { Capacitor } = await import("@capacitor/core");
      const uri = await Filesystem.getUri({ path: BASEMAP_FS_PATH, directory: Directory.Data });
      try {
        const res = await fetch(Capacitor.convertFileSrc(uri.uri));
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size === BASEMAP_SIZE) return blob;
        }
      } catch { /* fall through to base64 fallback */ }
      // Fallback: whole-file base64 read. Memory-heavy; only if the local
      // file server route failed.
      const read = await Filesystem.readFile({ path: BASEMAP_FS_PATH, directory: Directory.Data });
      const b64 = typeof read.data === "string" ? read.data : "";
      if (!b64) return null;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      return blob.size === BASEMAP_SIZE ? blob : null;
    } catch {
      return null;
    }
  }
  // Web fallback: Cache Storage.
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open(BASEMAP_CACHE);
    const hit = await cache.match(BASEMAP_KEY);
    if (!hit) return null;
    const blob = await hit.blob();
    return blob.size === BASEMAP_SIZE ? blob : null;
  } catch {
    return null;
  }
}

/** One chunk-sized Blob to clean base64 (no data: prefix). */
function blobToBase64(chunk: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("chunk read failed"));
    reader.onload = () => {
      const res = typeof reader.result === "string" ? reader.result : "";
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.readAsDataURL(chunk);
  });
}

// Persists the assembled Blob to the durable store.
//
// Native: written to the Filesystem sandbox in BASEMAP_CHUNK-sized appends.
// Each appendFile call decodes its own base64 payload to raw bytes before
// appending, so per-call padding is harmless and peak memory stays around one
// chunk (~11 MB as base64) instead of the ~215 MB that encoding the whole
// 92 MB at once cost — which froze the UI and killed the assembly on
// mid-range phones. Blob.slice on a disk-backed blob is cheap; only the
// slice being encoded is ever materialised.
//
// Web: Cache Storage under BASEMAP_KEY, unchanged.
async function writeAssembledBasemap(full: Blob): Promise<void> {
  if (await isNativeRuntime()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    for (let offset = 0, i = 0; offset < full.size; offset += BASEMAP_CHUNK, i++) {
      const slice = full.slice(offset, Math.min(offset + BASEMAP_CHUNK, full.size));
      const b64 = await blobToBase64(slice);
      if (i === 0) {
        // writeFile overwrites, so a partial file from a previously
        // interrupted assembly self-heals here.
        await Filesystem.writeFile({ path: BASEMAP_FS_PATH, data: b64, directory: Directory.Data });
      } else {
        await Filesystem.appendFile({ path: BASEMAP_FS_PATH, data: b64, directory: Directory.Data });
      }
    }
    const stat = await Filesystem.stat({ path: BASEMAP_FS_PATH, directory: Directory.Data });
    if (typeof stat.size === "number" && stat.size !== BASEMAP_SIZE) {
      try { await Filesystem.deleteFile({ path: BASEMAP_FS_PATH, directory: Directory.Data }); } catch { /* ignore */ }
      throw new Error(`sandbox write size mismatch: got ${stat.size}, expected ${BASEMAP_SIZE}`);
    }
    return;
  }
  if (typeof caches === "undefined") throw new Error("Cache Storage unavailable");
  const cache = await caches.open(BASEMAP_CACHE);
  await cache.put(
    BASEMAP_KEY,
    new Response(full, { headers: { "Content-Type": "application/octet-stream" } }),
  );
}

type BasemapDl = { status: "idle" | "downloading" | "error" | "done"; pct: number };

/**
 * Module-level so the download outlives the component. Switching tabs unmounts
 * MapView; without this the progress UI reset while the chunk loop kept
 * running, and two taps could race two loops against the same cache.
 */
const basemapDl = (() => {
  let state: BasemapDl = { status: "idle", pct: 0 };
  const listeners = new Set<(s: BasemapDl) => void>();
  let inFlight = false;

  const emit = (next: BasemapDl) => {
    state = next;
    for (const l of listeners) l(state);
  };

  const start = async () => {
    if (inFlight) return;
    inFlight = true;
    emit({ status: "downloading", pct: state.pct });
    try {
      if (typeof caches === "undefined") throw new Error("Cache Storage unavailable");
      const cache = await caches.open(BASEMAP_CACHE);
      const partCount = Math.ceil(BASEMAP_SIZE / BASEMAP_CHUNK);

      // Resume: count chunks already on disk from a previous attempt.
      let done = 0;
      for (let i = 0; i < partCount; i++) {
        if (await cache.match(BASEMAP_PART_PREFIX + i)) done++;
      }
      emit({ status: "downloading", pct: Math.min(99, Math.floor((done / partCount) * 100)) });

      for (let i = 0; i < partCount; i++) {
        const key = BASEMAP_PART_PREFIX + i;
        if (await cache.match(key)) continue;
        const start_ = i * BASEMAP_CHUNK;
        const end = Math.min(start_ + BASEMAP_CHUNK, BASEMAP_SIZE) - 1;
        const chunk = await fetchBasemapRange(start_, end);
        await cache.put(
          key,
          new Response(chunk, { headers: { "Content-Type": "application/octet-stream" } }),
        );
        done++;
        emit({ status: "downloading", pct: Math.min(99, Math.floor((done / partCount) * 100)) });
      }

      // Assemble. Blob parts stay disk-backed, so this does not load 92 MB into RAM.
      const parts: Blob[] = [];
      for (let i = 0; i < partCount; i++) {
        const hit = await cache.match(BASEMAP_PART_PREFIX + i);
        if (!hit) throw new Error(`missing chunk ${i}`);
        parts.push(await hit.blob());
      }
      const full = new Blob(parts, { type: "application/octet-stream" });
      if (full.size !== BASEMAP_SIZE) {
        throw new Error(`size mismatch: got ${full.size}, expected ${BASEMAP_SIZE}`);
      }

      // Assembled file goes to the durable store (Filesystem sandbox on native).
      await writeAssembledBasemap(full);
      // Temporary chunks are only ever in Cache Storage; clear them now.
      for (let i = 0; i < partCount; i++) {
        await cache.delete(BASEMAP_PART_PREFIX + i);
      }

      pmProtocol.add(new PMTiles(new FileSource(new File([full], BASEMAP_FILE_NAME))));
      emit({ status: "done", pct: 100 });
    } catch (err) {
      console.warn("[MapView] basemap download failed", err);
      // Completed chunks are deliberately kept. They are the resume point.
      // A wrong-sized assembled file is discarded; completed chunks are kept as
      // the resume point. readAssembledBasemap already deletes a wrong-sized
      // sandbox file as a side effect, so a simple probe is enough here.
      try {
        await readAssembledBasemap();
      } catch {
        /* ignore */
      }
      emit({ status: "error", pct: state.pct });
    } finally {
      inFlight = false;
    }
  };

  return {
    get: () => state,
    subscribe(fn: (s: BasemapDl) => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    start,
    dismissDone() {
      if (state.status === "done") emit({ status: "idle", pct: 100 });
    },
  };
})();

// Survives tab switches. MapView unmounts when you leave the Map tab; without
// this, basemapReady reset to false on every return and the async disk read
// re-flashed the download bar for a couple of seconds before flipping true.
// pmProtocol also already holds the registered PMTiles source across mounts,
// so once ready, always ready for this app session.
const basemapSession = { ready: false };

// Cross-launch, synchronously readable hint for whether the basemap file is
// already on disk. basemapSession only survives tab switches within one JS
// runtime; on a cold launch it resets to false, so the async disk read
// (Filesystem stat + blob) is the only source of truth and it resolves after
// first paint. That async gap is what flashed the download button and then
// rebuilt the style once readiness flipped. This hint lets the first render
// assume the offline basemap and skip the download CTA. It is only a hint: the
// disk read still runs and rewrites it to match what is actually present.
const BASEMAP_READY_HINT_KEY = "geofield-basemap-ready-v1";

function readBasemapReadyHint(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(BASEMAP_READY_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeBasemapReadyHint(ready: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (ready) localStorage.setItem(BASEMAP_READY_HINT_KEY, "1");
    else localStorage.removeItem(BASEMAP_READY_HINT_KEY);
  } catch {
    /* ignore */
  }
}


const REGIONAL_CAPITALS: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: (
    [
      ["Accra", 5.6037, -0.187],
      ["Kumasi", 6.6885, -1.6244],
      ["Tamale", 9.4008, -0.8393],
      ["Sekondi-Takoradi", 4.934, -1.7137],
      ["Cape Coast", 5.1054, -1.2466],
      ["Koforidua", 6.0941, -0.2591],
      ["Sunyani", 7.3349, -2.3123],
      ["Ho", 6.611, 0.4713],
      ["Bolgatanga", 10.7856, -0.8514],
      ["Wa", 10.0601, -2.5099],
      ["Techiman", 7.5909, -1.9344],
      ["Goaso", 6.8036, -2.517],
      ["Sefwi Wiawso", 6.2059, -2.4854],
      ["Dambai", 8.0654, 0.1786],
      ["Nalerigu", 10.5273, -0.3697],
      ["Damongo", 9.083, -1.8188],
    ] as Array<[string, number, number]>
  ).map(([name, lat, lng]) => ({
    type: "Feature" as const,
    properties: { name },
    geometry: { type: "Point" as const, coordinates: [lng, lat] },
  })),
};

const PERM_DENIED_MSG =
  "Location is blocked for this app. Enable location permission in your browser or site settings, then try again.";
const POS_UNAVAILABLE_MSG =
  "Location unavailable. Check that your device's GPS/location is switched on.";
const TIMEOUT_MSG = "GPS timed out. Move to open sky and try again.";

function geoErrMsg(code: number): string | null {
  if (code === 1) return PERM_DENIED_MSG;
  if (code === 2) return POS_UNAVAILABLE_MSG;
  if (code === 3) return TIMEOUT_MSG;
  return null;
}

const pmProtocol = new Protocol();
maplibregl.addProtocol("pmtiles", pmProtocol.tile);

const CAPITAL_NAMES = [
  "Accra", "Kumasi", "Tamale", "Sekondi-Takoradi", "Cape Coast", "Koforidua",
  "Sunyani", "Ho", "Bolgatanga", "Wa", "Techiman", "Goaso", "Sefwi Wiawso",
  "Dambai", "Nalerigu", "Damongo",
];

function legacyToExpression(f: unknown): unknown[] | null {
  if (!Array.isArray(f)) return null;
  const [op, ...rest] = f as [string, ...unknown[]];
  if (op === "all" || op === "any") {
    const parts = rest.map(legacyToExpression);
    if (parts.some((p) => p === null)) return null;
    return [op, ...(parts as unknown[][])];
  }
  if ((op === "==" || op === "!=") && typeof rest[0] === "string" && rest.length === 2) {
    return [op, ["get", rest[0]], rest[1]];
  }
  if (op === "in" && typeof rest[0] === "string" && rest.length >= 2) {
    return ["in", ["get", rest[0]], ["literal", rest.slice(1)]];
  }
  if (op === "!in" && typeof rest[0] === "string" && rest.length >= 2) {
    return ["!", ["in", ["get", rest[0]], ["literal", rest.slice(1)]]];
  }
  if (op === "has" && typeof rest[0] === "string" && rest.length === 1) {
    return ["has", rest[0]];
  }
  if (op === "!has" && typeof rest[0] === "string" && rest.length === 1) {
    return ["!", ["has", rest[0]]];
  }
  return null;
}

function buildPlacesFilter(existing: unknown, exclusion: unknown): unknown {
  if (existing === undefined) return exclusion;
  const converted = legacyToExpression(existing);
  if (converted === null) return existing;
  return ["all", converted, exclusion];
}

function buildBasemapLayers(): LayerSpecification[] {
  const capitalExclusion: unknown = [
    "!",
    ["in", ["coalesce", ["get", "name:en"], ["get", "name"]], ["literal", CAPITAL_NAMES]],
  ];
  const list = basemapLayers("basemap", namedFlavor("black"), { lang: "en" }) as LayerSpecification[];
  const layers = list
    .filter((l) => {
      if (l.type === "background") return false;
      if (l.type !== "symbol") return true;
      if (l.id.toLowerCase().includes("shield")) return false;
      const tf = (l.layout as { "text-field"?: unknown } | undefined)?.["text-field"];
      if (tf !== undefined && JSON.stringify(tf).includes('"ref"')) return false;
      return true;
    })
    .map((l) => {
      const srcLayer = (l as { "source-layer"?: string })["source-layer"];
      const idLower = l.id.toLowerCase();
      const srcLower = (srcLayer ?? "").toLowerCase();
      const isWaterSrc = /water/.test(srcLower) || /water/.test(idLower);
      const isWaterwaySrc = /water(way)?/.test(srcLower) || /water(way)?/.test(idLower);
      const isRoadSrc =
        /road|transport|highway/.test(srcLower) || /road|transport|highway/.test(idLower);
      if (l.type === "fill" && srcLower === "earth") {
        return {
          ...l,
          paint: { ...((l as { paint?: object }).paint ?? {}), "fill-color": LAND },
        } as LayerSpecification;
      }
      if (l.type === "fill" && isWaterSrc) {
        return {
          ...l,
          paint: { ...((l as { paint?: object }).paint ?? {}), "fill-color": OCEAN },
        } as LayerSpecification;
      }
      if (l.type === "line" && isWaterwaySrc) {
        return {
          ...l,
          paint: {
            ...((l as { paint?: object }).paint ?? {}),
            "line-color": "#4A90C2",
            "line-opacity": 0.85,
          },
        } as LayerSpecification;
      }
      if (l.type === "line" && isRoadSrc) {
        const isMajor = /motorway|trunk|primary|highway_major|road_major/.test(idLower);
        return {
          ...l,
          paint: {
            ...((l as { paint?: object }).paint ?? {}),
            "line-color": isMajor ? "#C9CFDA" : "#79808C",
          },
        } as LayerSpecification;
      }
      if (l.type === "symbol") {
        const isPlaces = srcLayer === "places";
        const existingFilter = (l as { filter?: unknown }).filter;
        const mergedFilter = isPlaces
          ? buildPlacesFilter(existingFilter, capitalExclusion)
          : existingFilter;
        const nextLayout = l.layout
          ? { ...l.layout, "text-font": ["Noto Sans Regular"] }
          : l.layout;
        return {
          ...l,
          ...(mergedFilter !== undefined ? { filter: mergedFilter } : {}),
          ...(nextLayout ? { layout: nextLayout } : {}),
        } as LayerSpecification;
      }
      return l;
    });
  const waterFillIdx = layers.findIndex(
    (l) =>
      l.type === "fill" &&
      /water/.test(((l as { "source-layer"?: string })["source-layer"] ?? "").toLowerCase()),
  );
  if (waterFillIdx !== -1) {
    layers.splice(waterFillIdx + 1, 0, {
      id: "water-label",
      type: "symbol",
      source: "basemap",
      "source-layer": "water",
      minzoom: 10,
      filter: ["has", "name"],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10.5,
        "text-letter-spacing": 0.05,
        "text-max-width": 8,
      },
      paint: {
        "text-color": "#8FB4D9",
        "text-halo-color": "#0B0E14",
        "text-halo-width": 1.2,
      },
    } as LayerSpecification);
  }
  return layers;
}

function buildStyle(online: boolean, basemap: boolean): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  // Full-coverage ocean base. Background layers paint the entire viewport
  // (and, in the globe projection, the whole sphere) regardless of any
  // source's extent, so this is what shows through everywhere world-land
  // has no polygon — including the far hemisphere at global zoom before the
  // offline PMTiles basemap is loaded. world-land (fill, LAND) sits on top of
  // this for the continents, and the Ghana geology polygons sit on top of
  // that. Do not repoint this at LAND: the two are the ocean/land halves of
  // the same two-layer stack, not interchangeable background colours.
  const layers: StyleSpecification["layers"] = [
    { id: "bg", type: "background", paint: { "background-color": OCEAN } },
  ];
  if (online) {
    // openstreetmap.org's own tile servers throttle third-party apps hard,
    // which is half the reason this layer took minutes to appear. CARTO serves
    // the same OSM data from a global CDN with no API key. Voyager is the
    // colourful street style: field-tested dark_all and it was unreadable.
    sources.osm = {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors, © CARTO",
      minzoom: 0,
      maxzoom: 20,
    };
    layers.push({
      id: "osm",
      type: "raster",
      source: "osm",
    });
    // Voyager base carries few POI labels. CARTO's labels-only companion
    // raster restores shop/hostel/street names on top, same CDN, no key.
    sources["osm-labels"] = {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 20,
    };
    layers.push({
      id: "osm-labels",
      type: "raster",
      source: "osm-labels",
    });
  } else if (basemap) {
    sources.basemap = { type: "vector", url: BASEMAP_STYLE_URL };
    sources["capital-fix"] = {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Cape Coast" },
            geometry: { type: "Point", coordinates: [-1.2466, 5.1053] },
          },
        ],
      },
    };
    for (const l of buildBasemapLayers()) layers.push(l);
    layers.push({
      id: "capital-fix-dot",
      type: "circle",
      source: "capital-fix",
      minzoom: 5.2,
      maxzoom: 9,
      paint: {
        "circle-radius": 2.5,
        "circle-color": "#E8EAF0",
        "circle-stroke-color": "#0B0E14",
        "circle-stroke-width": 1,
      },
    });
    layers.push({
      id: "capital-fix-label",
      type: "symbol",
      source: "capital-fix",
      minzoom: 5.2,
      maxzoom: 9,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 0.6],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-optional": true,
      },
      paint: {
        "text-color": "#D6DAE2",
        "text-halo-color": "#0B0E14",
        "text-halo-width": 1.4,
      },
    });
  }
  return {
    version: 8,
    sources,
    layers,
    glyphs: "/fonts/{fontstack}/{range}.pbf",
    // Globe is a zoomed-out aesthetic for the local vector basemap only. Left on
    // for the online raster layer it makes MapLibre request tiles across the
    // whole visible sphere before Ghana ever paints, which is the other half of
    // the slow-load bug.
    projection: { type: online ? "mercator" : "globe" } as any,
    ...(online
      ? {}
      : {
          sky: {
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.4, 5, 0.2, 8, 0],
          } as any,
        }),
  } as StyleSpecification;
}

function unitMatchExpression(): maplibregl.ExpressionSpecification {
  const expr: (string | string[])[] = ["match", ["get", "unit_name"]];
  for (const [name, color] of Object.entries(UNIT_COLORS)) {
    expr.push(name, color);
  }
  expr.push("#6B7280");
  return expr as unknown as maplibregl.ExpressionSpecification;
}

type Popup = {
  unit: string;
  x: number;
  y: number;
};

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geoRef = useRef<GeoData | null>(null);
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null);
  const accuracyMarkerRef = useRef<maplibregl.Marker | null>(null);
  // Child node of gpsMarkerRef's own element (see the marker-creation effect),
  // not a separate Marker: a second Marker only coincidentally shared the
  // dot's lng/lat and could render detached from it on screen.
  const headingArrowRef = useRef<HTMLDivElement | null>(null);
  const reapplyGeologyRef = useRef<(() => void) | null>(null);
  const attributionRef = useRef<maplibregl.AttributionControl | null>(null);
  const firstRunRef = useRef(true);
  const [online, setOnline] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  // Direction arrow on the GPS marker. Null means "don't show a direction":
  // no reliable signal, not a guess. See the GPS watch effect for the
  // GPS-course-vs-compass selection rule.
  const [heading, setHeading] = useState<number | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [basemapReady, setBasemapReady] = useState(basemapSession.ready || readBasemapReadyHint());
  // False until the disk read has resolved (or the session already knows).
  // Gates map construction so the offline vector basemap is built once, after
  // its PMTiles source is registered, instead of building the GeoJSON fallback
  // first and rebuilding into the vector basemap when the async read lands.
  const [basemapProbed, setBasemapProbed] = useState(basemapSession.ready);
  const [dl, setDl] = useState<BasemapDl>(basemapDl.get());
  const [toast, setToast] = useState<string | null>(null);
  const gpsRef = useRef(gps);
  gpsRef.current = gps;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const basemapReadyRef = useRef(basemapReady);
  basemapReadyRef.current = basemapReady;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsGateRef = useRef<{ accuracy: number; at: number } | null>(null);
  // Last *accepted* GPS-watch fix, kept for GPS-course bearing between
  // consecutive fixes. Independent of gpsGateRef, which only gates accept/reject.
  const prevFixRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  // Latest raw compass reading plus when it arrived, for staleness checks.
  const compassRef = useRef<{ heading: number; at: number } | null>(null);
  const movingFastRef = useRef(false);
  const lastCompassUpdateRef = useRef(0);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  };

  // Init the map once basemap readiness is resolved. Gating on basemapProbed
  // guarantees the offline vector basemap is only built after its PMTiles source
  // is registered, so the map is constructed a single time with the correct
  // style rather than painting the GeoJSON fallback and then rebuilding into the
  // vector basemap when the async disk read resolves.
  useEffect(() => {
    if (!containerRef.current || !basemapProbed) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildStyle(false, basemapReadyRef.current),
        bounds: GHANA_BOUNDS,
        fitBoundsOptions: { padding: 20 },
        attributionControl: false,
        dragRotate: true,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        // In the globe projection, sphere diameter (css px) is worldSize/pi
        // where worldSize = 512 * 2^zoom - the same tile-pixel scale as
        // mercator. 1.3 keeps the globe from shrinking past roughly filling
        // the screen edge to edge on a typical phone width (~380-420px),
        // matching the reference: a tiny globe adrift in empty space reads
        // as broken, not as "zoomed out".
        minZoom: 1.3,
      });
      attributionRef.current = new maplibregl.AttributionControl({ compact: true });
      map.addControl(attributionRef.current, "top-left");
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 96, unit: "metric" }), "bottom-left");
    } catch (err) {
      console.warn("[MapView] map construction failed", err);
      setInitError("Map cannot render on this device (WebGL unavailable).");
      return;
    }
    mapRef.current = map;

    const ensureGeologyLayers = (geo: GeoData) => {
      if (map.getSource("geology")) return;
      try {
        map.addSource("geology", { type: "geojson", data: geo.geo });
        map.addLayer({
          id: "geology-fill",
          type: "fill",
          source: "geology",
          paint: {
            "fill-color": unitMatchExpression(),
            "fill-opacity": 0.45,
          },
        });
        map.addLayer({
          id: "geology-line-soft",
          type: "line",
          source: "geology",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#000000",
            "line-opacity": 0.14,
            "line-width": 2.4,
            "line-blur": 1.4,
          },
        });
        map.addLayer({
          id: "geology-line",
          type: "line",
          source: "geology",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#000000",
            "line-opacity": 0.4,
            "line-width": 0.7,
          },
        });
      } catch (err) {
        console.warn("[MapView] ensureGeologyLayers failed", err);
      }
    };

    type BaseData = {
      roads?: GeoJSON.FeatureCollection;
      rivers?: GeoJSON.FeatureCollection;
      regions?: GeoJSON.FeatureCollection;
      places?: GeoJSON.FeatureCollection;
    };
    const baseDataRef: { current: BaseData | null } = { current: null };

    const ensureBaseLayers = (base: BaseData) => {
      const beforeId = map.getLayer("geology-fill") ? "geology-fill" : undefined;
      try {
        if (base.rivers && !map.getSource("base-rivers")) {
          map.addSource("base-rivers", { type: "geojson", data: base.rivers });
        }
        if (base.rivers && !map.getLayer("base-rivers")) {
          map.addLayer(
            {
              id: "base-rivers",
              type: "line",
              source: "base-rivers",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#4A7FB0",
                "line-opacity": 0.6,
                "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 12, 1.6],
              },
            },
            beforeId,
          );
        }
        if (base.roads && !map.getSource("base-roads")) {
          map.addSource("base-roads", { type: "geojson", data: base.roads });
        }
        if (base.roads && !map.getLayer("base-roads")) {
          map.addLayer(
            {
              id: "base-roads",
              type: "line",
              source: "base-roads",
              layout: { "line-join": "round", "line-cap": "round" },
              paint: {
                "line-color": "#B8BEC9",
                "line-opacity": 0.55,
                "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 10, 1.0, 14, 2.4],
              },
            },
            beforeId,
          );
        }
        if (base.regions && !map.getSource("base-regions")) {
          map.addSource("base-regions", { type: "geojson", data: base.regions });
        }
        if (base.regions && !map.getLayer("base-regions")) {
          map.addLayer(
            {
              id: "base-regions",
              type: "line",
              source: "base-regions",
              paint: {
                "line-color": "#7A8290",
                "line-opacity": 0.35,
                "line-width": 0.8,
                "line-dasharray": [2, 2],
              },
            },
            beforeId,
          );
        }
        if (base.places && !map.getSource("base-places")) {
          map.addSource("base-places", { type: "geojson", data: base.places });
        }
        if (base.places && !map.getLayer("place-labels-city")) {
          map.addLayer({
            id: "place-labels-city",
            type: "symbol",
            source: "base-places",
            filter: ["all", ["==", ["get", "place"], "city"], ["!", ["in", ["get", "name"], ["literal", CAPITAL_NAMES]]]],
            minzoom: 6,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 15,
              "text-anchor": "center",
              "text-allow-overlap": false,
              "text-optional": true,
            },
            paint: {
              "text-color": "#E8EAF0",
              "text-halo-color": "#0B0E14",
              "text-halo-width": 1.4,
            },
          });
        }
        if (base.places && !map.getLayer("place-labels-town")) {
          map.addLayer({
            id: "place-labels-town",
            type: "symbol",
            source: "base-places",
            filter: ["all", ["==", ["get", "place"], "town"], ["!", ["in", ["get", "name"], ["literal", CAPITAL_NAMES]]]],
            minzoom: 8,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 12,
              "text-anchor": "center",
              "text-allow-overlap": false,
              "text-optional": true,
            },
            paint: {
              "text-color": "#E8EAF0",
              "text-halo-color": "#0B0E14",
              "text-halo-width": 1.4,
            },
          });
        }
      } catch (err) {
        console.warn("[MapView] ensureBaseLayers failed", err);
      }
    };

    const ensureCapitalsLayer = () => {
      try {
        if (!map.getSource("regional-capitals")) {
          map.addSource("regional-capitals", { type: "geojson", data: REGIONAL_CAPITALS });
        }
        if (!map.getLayer("regional-capitals-dot")) {
          map.addLayer({
            id: "regional-capitals-dot",
            type: "circle",
            source: "regional-capitals",
            minzoom: 5.2,
            paint: {
              "circle-radius": 2.5,
              "circle-color": "#E8EAF0",
              "circle-stroke-color": "#0B0E14",
              "circle-stroke-width": 1,
            },
          });
        }
        if (!map.getLayer("regional-capitals")) {
          map.addLayer({
            id: "regional-capitals",
            type: "symbol",
            source: "regional-capitals",
            minzoom: 5.2,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "text-anchor": "top",
              "text-offset": [0, 0.6],
              "text-allow-overlap": false,
              "text-optional": true,
            },
            paint: {
              "text-color": "#D6DAE2",
              "text-halo-color": "#0B0E14",
              "text-halo-width": 1.4,
            },
          });
        }
      } catch (err) {
        console.warn("[MapView] ensureCapitalsLayer failed", err);
      }
    };

    const worldLandRef: { current: GeoJSON.FeatureCollection | null } = { current: null };
    const ensureWorldLandLayer = () => {
      const data = worldLandRef.current;
      if (!data) return;
      try {
        if (!map.getSource("world-land")) {
          map.addSource("world-land", { type: "geojson", data });
        }
        if (!map.getLayer("world-land")) {
          map.addLayer({
            id: "world-land",
            type: "fill",
            source: "world-land",
            paint: { "fill-color": LAND, "fill-opacity": 1 },
          });
        }
      } catch (err) {
        console.warn("[MapView] ensureWorldLandLayer failed", err);
      }
    };

    const applyAll = () => {
      const vectorBase = basemapReadyRef.current && !onlineRef.current;
      ensureWorldLandLayer();
      if (!onlineRef.current && !basemapReadyRef.current && baseDataRef.current) {
        ensureBaseLayers(baseDataRef.current);
      }
      if (geoRef.current) ensureGeologyLayers(geoRef.current);
      ensureCapitalsLayer();

      // Move world-land to the very bottom (just above "bg").
      if (map.getLayer("world-land")) {
        const styleLayers = (map.getStyle().layers ?? []) as LayerSpecification[];
        const firstOther = styleLayers.find(
          (l) => l.id !== "bg" && l.id !== "world-land",
        );
        if (firstOther) map.moveLayer("world-land", firstOther.id);
      }


      if (vectorBase) {
        // Insert geology BEFORE the first road-line or symbol layer in the basemap.
        const styleLayers = (map.getStyle().layers ?? []) as LayerSpecification[];
        let beforeId: string | undefined;
        for (const l of styleLayers) {
          if (
            l.id.startsWith("geology") ||
            l.id === "regional-capitals" ||
            l.id === "regional-capitals-dot"
          ) {
            continue;
          }
          const sourceLayer = (l as { "source-layer"?: string })["source-layer"];
          const isRoadLine =
            l.type === "line" &&
            (((sourceLayer && /road|transport/i.test(sourceLayer)) as boolean) ||
              /road|transport/i.test(l.id));
          if (isRoadLine || l.type === "symbol") {
            beforeId = l.id;
            break;
          }
        }
        if (beforeId) {
          for (const id of ["geology-fill", "geology-line-soft", "geology-line"]) {
            if (map.getLayer(id)) map.moveLayer(id, beforeId);
          }
        }
        // Capitals sit above geology (moveLayer with no arg = top).
        for (const id of ["regional-capitals-dot", "regional-capitals"]) {
          if (map.getLayer(id)) map.moveLayer(id);
        }
      } else {
        for (const id of [
          "base-rivers",
          "base-roads",
          "base-regions",
          "geology-fill",
          "geology-line-soft",
          "geology-line",
          "regional-capitals-dot",
          "regional-capitals",
          "place-labels-town",
          "place-labels-city",
        ]) {
          if (map.getLayer(id)) map.moveLayer(id);
        }
      }

      const placeLabelVisibility = onlineRef.current ? "none" : "visible";
      for (const id of [
        "place-labels-town",
        "place-labels-city",
        "regional-capitals",
        "regional-capitals-dot",
        "base-rivers",
        "base-roads",
        "base-regions",
        "world-land",
      ]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", placeLabelVisibility);
      }

      // Vector basemap already provides place labels; hide our GeoJSON fallback labels
      // so towns like Kumasi don't render twice.
      if (vectorBase) {
        for (const id of ["place-labels-city", "place-labels-town"]) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
        }
      }

      // Online = pure OSM street map; hide geology entirely.
      const geologyVisibility = onlineRef.current ? "none" : "visible";
      for (const id of ["geology-fill", "geology-line-soft", "geology-line"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", geologyVisibility);
      }
    };

    map.on("error", (e) => {
      const err = (e as unknown as { error?: Error }).error;
      console.warn("[MapView] map error", err ?? e);
    });

    const onWindowResize = () => map.resize();
    const onVisibility = () => {
      if (!document.hidden) map.resize();
    };
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("focus", onWindowResize);
    document.addEventListener("visibilitychange", onVisibility);
    requestAnimationFrame(() => {
      try {
        map.resize();
      } catch {
        /* ignore */
      }
    });

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);

    map.on("load", () => {
      reapplyGeologyRef.current = applyAll;
      const fetchJson = (url: string) =>
        fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
      void Promise.all([
        loadGeology().catch((err) => {
          console.warn("[MapView] loadGeology failed", err);
          return null;
        }),
        fetchJson("/data/ghana-roads.geojson").catch(() => null),
        fetchJson("/data/ghana-rivers.geojson").catch(() => null),
        fetchJson("/data/ghana-regions.geojson").catch(() => null),
        fetchJson("/data/ghana-places.geojson").catch(() => null),
        fetchJson("/data/world-land.geojson").catch(() => null),
      ]).then(([geo, roads, rivers, regions, places, worldLand]) => {
        if (mapRef.current !== map) return;
        if (geo) geoRef.current = geo;
        if (worldLand) worldLandRef.current = worldLand as GeoJSON.FeatureCollection;
        baseDataRef.current = {
          roads: roads ?? undefined,
          rivers: rivers ?? undefined,
          regions: regions ?? undefined,
          places: places ?? undefined,
        };
        applyAll();
      });
    });

    map.on("click", "geology-fill", (e) => {
      const f = e.features?.[0];
      const name = (f?.properties as { unit_name?: string } | undefined)?.unit_name;
      if (!name) return;
      const pt = map.project(e.lngLat);
      setPopup({ unit: name, x: pt.x, y: pt.y });
    });
    map.on("mouseenter", "geology-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "geology-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("focus", onWindowResize);
      document.removeEventListener("visibilitychange", onVisibility);
      map.remove();
      mapRef.current = null;
    };
  }, [basemapProbed]);

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    setPopup(null);
    if (attributionRef.current) {
      try {
        map.removeControl(attributionRef.current);
      } catch {
        /* ignore */
      }
      attributionRef.current = null;
    }
    // MapLibre accepts a style URL directly. Online gets Liberty (vector);
    // offline keeps our locally built style. The style.load handler below
    // re-adds attribution and re-applies our layers either way, and applyAll
    // already hides geology and capitals while online.
    map.setStyle(online ? ONLINE_STYLE_URL : buildStyle(false, basemapReady), { diff: false });
    map.once("style.load", () => {
      attributionRef.current = new maplibregl.AttributionControl({ compact: true });
      map.addControl(attributionRef.current, "top-left");
      reapplyGeologyRef.current?.();
    });
  }, [online, basemapReady]);

  useEffect(() => {
    // Already loaded earlier this session: pmProtocol still holds the source and
    // basemapSession.ready is true, so skip the disk read entirely — this is what
    // removes the flash on tab re-entry within a session.
    if (basemapSession.ready) {
      setBasemapReady(true);
      setBasemapProbed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      let present = false;
      try {
        // One-time migration: users who already downloaded to Cache Storage on a
        // previous version get their file copied into the durable sandbox, so
        // they never re-download the 92 MB. Harmless/no-op on web and on fresh
        // installs.
        if (await isNativeRuntime() && typeof caches !== "undefined") {
          try {
            const already = await readAssembledBasemap();
            if (!already) {
              const cache = await caches.open(BASEMAP_CACHE);
              const legacy = await cache.match(BASEMAP_KEY);
              if (legacy) {
                const legacyBlob = await legacy.blob();
                if (legacyBlob.size === BASEMAP_SIZE) {
                  await writeAssembledBasemap(legacyBlob);
                  try { await cache.delete(BASEMAP_KEY); } catch { /* ignore */ }
                }
              }
            }
          } catch { /* migration is best-effort */ }
        }

        const blob = await readAssembledBasemap();
        if (cancelled) return;
        if (blob) {
          const file = new File([blob], BASEMAP_FILE_NAME);
          pmProtocol.add(new PMTiles(new FileSource(file)));
          basemapSession.ready = true;
          present = true;
        }
      } catch (err) {
        console.warn("[MapView] basemap durable load failed", err);
      } finally {
        if (!cancelled) {
          // Reconcile the optimistic hint with what is actually on disk, then
          // open the gate so the map builds once with the correct style and a
          // registered PMTiles source.
          setBasemapReady(present);
          writeBasemapReadyHint(present);
          setBasemapProbed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-attach to any in-flight download after a tab switch remounts this view,
  // and flip to ready the moment the manager finishes.
  useEffect(() => {
    const unsub = basemapDl.subscribe(setDl);
    setDl(basemapDl.get());
    return unsub;
  }, []);

  useEffect(() => {
    if (dl.status === "done") {
      basemapSession.ready = true;
      writeBasemapReadyHint(true);
      setBasemapReady(true);
      setBasemapProbed(true);
    }
  }, [dl.status]);

  // Watch GPS. Uses the fused provider on native; navigator.geolocation on web.
  useEffect(() => {
    const watch = startPositionWatch(
      (c) => {
        const now = Date.now();
        const prev = gpsGateRef.current;
        const speedMps = typeof c.speed === "number" && Number.isFinite(c.speed) ? c.speed : null;
        // The fused provider's coarser (network) readings often omit speed.
        // Rather than treat an unreported speed as "stopped", keep the last
        // known moving-fast state for this one tick: a vehicle doesn't
        // instantly stop just because one interleaved reading lacked speed.
        const movingFast = speedMps !== null ? speedMps > HEADING_GPS_SPEED_MPS : movingFastRef.current;
        movingFastRef.current = movingFast;

        // The fused provider interleaves coarse network fixes with fine GNSS
        // fixes; rendering every raw reading makes the dot teleport. Accept a
        // reading only if it is not much worse than the one shown, or if the
        // shown one is older than the reject window (never let the dot freeze).
        //
        // While moving above walking pace, recency matters far more than
        // accuracy: holding onto a stale high-accuracy fix on the road while
        // the vehicle keeps moving is what produced the lag-then-snap-forward
        // reported in the field. Shrinking the window sharply lets a newer,
        // slightly-worse fix replace it almost immediately instead of waiting
        // for one that beats the old fix on accuracy, which could be many
        // seconds and many metres away.
        const rejectWindowMs = movingFast ? 2_000 : 15_000;
        if (prev && c.accuracy > prev.accuracy * 1.5 && now - prev.at < rejectWindowMs) return;
        gpsGateRef.current = { accuracy: c.accuracy, at: now };
        setGps({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy });

        // Heading: GPS course between consecutive accepted fixes while moving
        // fast enough for that bearing to be reliable; device compass
        // otherwise. Never a guess: no reliable signal means no heading, and
        // the marker effect hides the arrow rather than showing one.
        const cur = { lat: c.latitude, lng: c.longitude };
        const prevFix = prevFixRef.current;
        let nextHeading: number | null = null;
        if (
          movingFast &&
          prevFix &&
          now - prevFix.at <= HEADING_MAX_FIX_AGE_MS &&
          haversineMeters(prevFix, cur) >= HEADING_MIN_FIX_DISTANCE_M
        ) {
          nextHeading = bearingDegrees(prevFix, cur);
        } else {
          const compass = compassRef.current;
          if (compass && now - compass.at <= HEADING_MAX_COMPASS_AGE_MS) {
            nextHeading = compass.heading;
          }
        }
        setHeading(nextHeading);
        prevFixRef.current = { lat: cur.lat, lng: cur.lng, at: now };
      },
      (err) => {
        const code = (err as GeolocationPositionError).code;
        const msg = typeof code === "number" ? geoErrMsg(code) : err.message;
        if (msg) showToast(msg);
      },
    );
    return () => watch.stop();
  }, []);

  // Compass fallback for heading at or below walking pace, where GPS course
  // between fixes is unreliable. Independent of the GPS cadence: orientation
  // events fire far faster, so updates here are throttled and skipped
  // entirely while moving fast (the GPS watch above owns heading then).
  useEffect(() => {
    const compass = startCompassWatch((headingDeg) => {
      const now = Date.now();
      compassRef.current = { heading: headingDeg, at: now };
      if (movingFastRef.current) return;
      if (now - lastCompassUpdateRef.current < HEADING_COMPASS_THROTTLE_MS) return;
      lastCompassUpdateRef.current = now;
      setHeading(headingDeg);
    });
    return () => compass.stop();
  }, []);

  // Render GPS marker + accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps) return;

    if (!gpsMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = "width:40px;height:40px;position:relative;";

      // A still screenshot can't show motion either way, so the reference
      // images are not evidence the live marker has no pulse - it does, just
      // small: a subtle scale/opacity breathe close to the dot's own size,
      // not the old amber version's large 2.6x sonar-style expansion.
      const pulse = document.createElement("div");
      pulse.style.cssText =
        `position:absolute;top:13px;left:13px;width:14px;height:14px;border-radius:9999px;background:${LOCATION_DOT_BLUE};`;
      pulse.animate(
        [{ transform: "scale(1)", opacity: 0.45 }, { transform: "scale(1.6)", opacity: 0 }],
        { duration: 1700, iterations: Infinity, easing: "ease-out" },
      );

      // Solid fill + a plain white ring (box-shadow, so it doesn't affect
      // layout size).
      const dot = document.createElement("div");
      dot.style.cssText =
        `width:14px;height:14px;border-radius:9999px;background:${LOCATION_DOT_BLUE};box-shadow:0 0 0 2.5px #ffffff;position:absolute;top:13px;left:13px;`;

      // Direction arrow, fused to the dot as a child of the same marker
      // element rather than a second Marker: two independently-anchored
      // Markers only coincidentally shared the dot's lng/lat, and could
      // render detached from it on screen (different element sizes and
      // MapLibre's rotationAlignment:"map" transform path vs. the dot's
      // plain viewport alignment). A pivot positioned at the container's own
      // center (20,20) holds the arrow offset upward from it, so rotating the
      // pivot sweeps the arrowhead around the dot at a fixed radius and
      // gap. Rotation and visibility are driven by the [heading, bearing]
      // effect below, not this one, since heading/bearing change
      // independently of gps.
      //
      // The reference's arrowhead is a concave kite/chevron (verified by
      // pixel-scanning both reference screenshots row by row: the back edge
      // curves inward at the centerline rather than running flat), which a
      // CSS border-trick triangle cannot produce, hence SVG. It sits with a
      // small gap short of the ring, never overlapping it, in both reference
      // screenshots.
      const arrowPivot = document.createElement("div");
      arrowPivot.style.cssText = "position:absolute;top:20px;left:20px;width:0;height:0;pointer-events:none;display:none;";
      const svgNs = "http://www.w3.org/2000/svg";
      const arrowSvg = document.createElementNS(svgNs, "svg");
      arrowSvg.setAttribute("viewBox", "-7 0 14 9");
      arrowSvg.setAttribute("width", "14");
      arrowSvg.setAttribute("height", "9");
      arrowSvg.style.cssText = "position:absolute;top:-21.5px;left:-7px;display:block;";
      const arrowPolygon = document.createElementNS(svgNs, "polygon");
      arrowPolygon.setAttribute("points", "0,0 7,9 0,6.5 -7,9");
      arrowPolygon.setAttribute("fill", LOCATION_ARROW_BLUE);
      arrowSvg.appendChild(arrowPolygon);
      arrowPivot.appendChild(arrowSvg);

      el.appendChild(pulse);
      el.appendChild(dot);
      el.appendChild(arrowPivot);
      headingArrowRef.current = arrowPivot;
      gpsMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([gps.lng, gps.lat])
        .addTo(map);
    } else {
      gpsMarkerRef.current.setLngLat([gps.lng, gps.lat]);
    }

    const metersPerPixel =
      (156543.03392 * Math.cos((gps.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
    const diameterPx = Math.max(20, (gps.accuracy * 2) / metersPerPixel);
    if (!accuracyMarkerRef.current) {
      const el = document.createElement("div");
      // Soft, static fill only, no border: the reference's accuracy circle
      // fades into the basemap with no visible ring at its edge.
      el.style.cssText =
        "pointer-events:none;border-radius:9999px;background:rgba(29,161,243,0.08);";
      el.style.width = `${diameterPx}px`;
      el.style.height = `${diameterPx}px`;
      accuracyMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([gps.lng, gps.lat])
        .addTo(map);
    } else {
      const el = accuracyMarkerRef.current.getElement();
      el.style.width = `${diameterPx}px`;
      el.style.height = `${diameterPx}px`;
      accuracyMarkerRef.current.setLngLat([gps.lng, gps.lat]);
    }
  }, [gps]);

  // Show/rotate the heading arrow. Separate from the marker-position effect
  // above: heading and bearing change on their own schedules (GPS course or
  // compass; the user dragging the map), not in lockstep with gps updates.
  // The arrow is a plain child element (see the marker-creation effect
  // above), so this is manual CSS rotation rather than Marker.setRotation.
  // heading - bearing matches the existing reset-north control's own
  // -bearing compensation: rotating by heading first (the target compass
  // direction if the map were unrotated), then countering however far the
  // user has since rotated the map, keeps the arrow pointing at the true
  // heading regardless of map rotation.
  useEffect(() => {
    const el = headingArrowRef.current;
    if (!el) return;
    if (heading === null) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.transform = `rotate(${heading - bearing}deg)`;
  }, [heading, bearing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onZoom = () => {
      const g = gpsRef.current;
      const el = accuracyMarkerRef.current?.getElement();
      if (!g || !el) return;
      const metersPerPixel =
        (156543.03392 * Math.cos((g.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
      const diameterPx = Math.max(20, (g.accuracy * 2) / metersPerPixel);
      el.style.width = `${diameterPx}px`;
      el.style.height = `${diameterPx}px`;
    };
    map.on("zoom", onZoom);
    return () => {
      map.off("zoom", onZoom);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => setPopup(null);
    map.on("movestart", onMove);
    return () => {
      map.off("movestart", onMove);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onRotate = () => setBearing(map.getBearing());
    map.on("rotate", onRotate);
    return () => {
      map.off("rotate", onRotate);
    };
  }, []);

  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const recenter = async () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (typeof navigator !== "undefined" && navigator.permissions) {
        const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        if (p.state === "denied") {
          showToast(PERM_DENIED_MSG);
          return;
        }
      }
    } catch {
      /* ignore — some browsers don't support this */
    }
    if (gpsRef.current) {
      const g = gpsRef.current;
      map.flyTo({ center: [g.lng, g.lat], zoom: Math.max(map.getZoom(), 12) });
      return;
    }
    map.fitBounds(GHANA_BOUNDS, { padding: 20 });
  };

  return (
    <div
      className="fixed left-0 right-0 top-[calc(2.75rem+env(safe-area-inset-top))] bottom-[calc(4rem+env(safe-area-inset-bottom))] overflow-hidden"
      style={{
        background:
          "radial-gradient(circle, #F1F4FB 0%, #F1F4FB 40%, #A1B7E0 60%, #8EA6D6 71%, #7E98C9 100%)",
      }}
    >
      <style>{`
        .maplibregl-ctrl-scale {
          box-sizing: border-box;
          background: rgba(18,20,23,0.75) !important;
          border: 1px solid rgba(200,210,225,0.6) !important;
          border-radius: 6px !important;
          color: #E8EAF0 !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          letter-spacing: 0.04em !important;
          height: 26px !important;
          line-height: 24px !important;
          padding: 0 6px !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.6) !important;
        }
        .maplibregl-ctrl-bottom-left {
          margin-bottom: 46px !important;
        }
      `}</style>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      {/* Neutral state while basemap readiness is still resolving, so the
          download CTA never flashes before we know the file is present. */}
      {!basemapProbed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/85 backdrop-blur-md px-4 py-2 text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading base map
          </div>
        </div>
      )}

      {initError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
          <div className="rounded-lg border border-border bg-background/90 backdrop-blur-md p-4 text-center text-sm text-muted-foreground max-w-xs">
            {initError}
          </div>
        </div>
      )}

      {/* Offline / Online pill */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <div className="inline-flex items-center rounded-full border border-border bg-background/85 backdrop-blur-md overflow-hidden text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40">
          <button
            type="button"
            onClick={() => setOnline(false)}
            className={`px-3 py-1.5 ${!online ? "bg-panel-2 text-foreground" : "text-muted-foreground"}`}
          >
            Offline
          </button>
          <button
            type="button"
            onClick={() => setOnline(true)}
            className={`px-3 py-1.5 ${online ? "bg-panel-2 text-foreground" : "text-muted-foreground"}`}
          >
            Online
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 max-w-[92%]">
          <div className="flex items-start gap-2 rounded-md border border-border bg-background/95 backdrop-blur-md px-3 py-2 shadow-lg shadow-black/50">
            <span className="text-[11px] leading-snug text-foreground">{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute top-16 right-3 flex flex-col rounded-md border border-border bg-background/85 backdrop-blur-md overflow-hidden shadow-lg shadow-black/40 z-10">
        <button
          type="button"
          onClick={zoomIn}
          className="h-9 w-9 flex items-center justify-center text-foreground border-b border-border"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={zoomOut}
          className="h-9 w-9 flex items-center justify-center text-foreground"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      {/* Basemap download */}
      {!online && basemapProbed && !basemapReady && dl.status === "idle" && (
        <button
          type="button"
          onClick={() => void basemapDl.start()}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap inline-flex items-center rounded-full border border-border bg-background/85 backdrop-blur-md px-4 py-2 text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40 text-foreground"
        >
          Download Ghana Base Map · 92 MB
        </button>
      )}
      {!online && dl.status === "downloading" && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap inline-flex items-center rounded-full border border-border bg-background/85 backdrop-blur-md px-4 py-2 text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40 text-muted-foreground"
        >
          Downloading… {dl.pct}%
        </div>
      )}
      {!online && dl.status === "done" && (
        <button
          type="button"
          onClick={() => basemapDl.dismissDone()}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border border-success bg-background/85 backdrop-blur-md px-4 py-2 text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40 text-success"
        >
          Base map downloaded ✓
        </button>
      )}
      {!online && dl.status === "error" && (
        <button
          type="button"
          onClick={() => void basemapDl.start()}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap inline-flex items-center rounded-full border border-destructive bg-background/85 backdrop-blur-md px-4 py-2 text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40 text-destructive"
        >
          Download failed. Tap to resume.
        </button>
      )}

      {/* Reset north (compass) */}
      <button
        type="button"
        onClick={() => mapRef.current?.resetNorth()}
        className="absolute bottom-16 right-3 h-11 w-11 rounded-full border border-border bg-background/85 backdrop-blur-md flex items-center justify-center text-foreground shadow-lg shadow-black/40 z-10"
        aria-label="Reset north"
      >
        <Navigation2 className="h-5 w-5" strokeWidth={2.5} style={{ transform: `rotate(${-bearing}deg)` }} />
      </button>




      {/* Recenter / locate FAB */}
      <button
        type="button"
        onClick={recenter}
        className="absolute bottom-3 right-3 h-11 w-11 rounded-full border border-border bg-background/85 backdrop-blur-md flex items-center justify-center text-primary shadow-lg shadow-black/40 z-10"
        aria-label="Recenter"
      >
        <Crosshair className="h-5 w-5" strokeWidth={2.5} />
      </button>

      {/* Legend — hidden when Online (no geology shown) */}
      {!online && !legendOpen && (
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          className="absolute bottom-3 left-3 z-10 inline-flex items-center justify-center gap-1.5 border border-border bg-background/85 backdrop-blur-md shadow-lg shadow-black/40"
          style={{ width: 96, height: 26, borderRadius: 6, fontSize: 10 }}
        >
          <Layers className="h-3 w-3 text-foreground" />
          <span className="font-semibold text-foreground uppercase tracking-wider" style={{ fontSize: 10 }}>Legend</span>
        </button>
      )}
      {!online && legendOpen && (
        <div className="absolute bottom-3 left-3 max-w-[60%] rounded-md border border-border bg-background/85 backdrop-blur-md shadow-lg shadow-black/40 z-10 flex flex-col max-h-[45%]">
          <div className="flex items-center justify-between px-2.5 py-2 border-b border-border shrink-0">
            <span className="text-[10px] font-semibold text-foreground">Legend</span>
            <button
              type="button"
              onClick={() => setLegendOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Collapse legend"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="px-2.5 py-2 flex flex-col gap-1 overflow-auto">
            {LEGEND.map((l) => (
              <div key={l.unit} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="mono text-[10px] text-foreground whitespace-nowrap">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Popup */}
      {popup && (
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-full pointer-events-auto"
          style={{ left: popup.x, top: popup.y - 8 }}
        >
          <div className="rounded-md border border-border bg-background/95 backdrop-blur-md shadow-xl shadow-black/50 px-3 py-2 min-w-[160px] max-w-[220px]">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs font-bold leading-tight">{popup.unit}</div>
              <button
                type="button"
                onClick={() => setPopup(null)}
                className="text-muted-foreground hover:text-foreground text-xs leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <Link
              to="/know/$unit"
              params={{ unit: encodeURIComponent(popup.unit) }}
              className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-primary hover:underline"
            >
              Know →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
