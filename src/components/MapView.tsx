import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification, type LayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Link } from "@tanstack/react-router";
import { Navigation2, Crosshair, ChevronDown, Layers, Minus, Plus, X } from "lucide-react";
import { Protocol, PMTiles, FileSource } from "pmtiles";
import { layers as basemapLayers, namedFlavor } from "@protomaps/basemaps";
import { loadGeology, type GeoData } from "../lib/geology";
import { startPositionWatch } from "../lib/geo-acquire";
import { UNIT_COLORS, LEGEND } from "../lib/unit-colors";

const GHANA_BOUNDS: [number, number, number, number] = [-3.26, 4.74, 1.19, 11.18];
const BG = "#1B2027";
const OCEAN = "#14304A";
const LAND = "#141414";

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

/** One ranged chunk, with a short backoff. Rejects if the server ignores Range. */
async function fetchBasemapRange(start: number, end: number): Promise<Blob> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("range fetch failed");
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
  return list
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
}

function buildStyle(online: boolean, basemap: boolean): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [
    { id: "bg", type: "background", paint: { "background-color": OCEAN } },
  ];
  if (online) {
    // openstreetmap.org's own tile servers throttle third-party apps hard,
    // which is half the reason this layer took minutes to appear. CARTO serves
    // the same OSM data from a global CDN, needs no API key, and its dark
    // basemap matches the obsidian shell.
    sources.osm = {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
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
  } else if (basemap) {
    sources.basemap = { type: "vector", url: BASEMAP_STYLE_URL };
    for (const l of buildBasemapLayers()) layers.push(l);
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
  const reapplyGeologyRef = useRef<(() => void) | null>(null);
  const attributionRef = useRef<maplibregl.AttributionControl | null>(null);
  const firstRunRef = useRef(true);
  const [online, setOnline] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [basemapReady, setBasemapReady] = useState(false);
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "error">("idle");
  const [downloadPct, setDownloadPct] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const gpsRef = useRef(gps);
  gpsRef.current = gps;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const basemapReadyRef = useRef(basemapReady);
  basemapReadyRef.current = basemapReady;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  };

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;

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
  }, []);

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
    map.setStyle(buildStyle(online, basemapReady), { diff: false });
    map.once("style.load", () => {
      attributionRef.current = new maplibregl.AttributionControl({ compact: true });
      map.addControl(attributionRef.current, "top-left");
      reapplyGeologyRef.current?.();
    });
  }, [online, basemapReady]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof caches === "undefined") return;
        const cache = await caches.open(BASEMAP_CACHE);
        const hit = await cache.match(BASEMAP_KEY);
        if (!hit || cancelled) return;
        const blob = await hit.blob();
        if (cancelled) return;
        const file = new File([blob], BASEMAP_FILE_NAME);
        pmProtocol.add(new PMTiles(new FileSource(file)));
        setBasemapReady(true);
      } catch (err) {
        console.warn("[MapView] basemap cache load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const downloadBasemap = async () => {
    setDownloadState("downloading");
    try {
      if (typeof caches === "undefined") throw new Error("Cache Storage unavailable");
      const cache = await caches.open(BASEMAP_CACHE);
      const partCount = Math.ceil(BASEMAP_SIZE / BASEMAP_CHUNK);

      // Resume: count chunks already on disk from a previous attempt.
      let done = 0;
      for (let i = 0; i < partCount; i++) {
        if (await cache.match(BASEMAP_PART_PREFIX + i)) done++;
      }
      setDownloadPct(Math.min(99, Math.floor((done / partCount) * 100)));

      for (let i = 0; i < partCount; i++) {
        const key = BASEMAP_PART_PREFIX + i;
        if (await cache.match(key)) continue;
        const start = i * BASEMAP_CHUNK;
        const end = Math.min(start + BASEMAP_CHUNK, BASEMAP_SIZE) - 1;
        const chunk = await fetchBasemapRange(start, end);
        await cache.put(
          key,
          new Response(chunk, { headers: { "Content-Type": "application/octet-stream" } }),
        );
        done++;
        setDownloadPct(Math.min(99, Math.floor((done / partCount) * 100)));
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

      await cache.put(
        BASEMAP_KEY,
        new Response(full, { headers: { "Content-Type": "application/octet-stream" } }),
      );
      for (let i = 0; i < partCount; i++) {
        await cache.delete(BASEMAP_PART_PREFIX + i);
      }

      pmProtocol.add(new PMTiles(new FileSource(new File([full], BASEMAP_FILE_NAME))));
      setDownloadPct(100);
      setBasemapReady(true);
      setDownloadState("idle");
    } catch (err) {
      console.warn("[MapView] basemap download failed", err);
      // Completed chunks are deliberately kept. They are the resume point.
      // Only a corrupt assembled file is discarded.
      try {
        const cache = await caches.open(BASEMAP_CACHE);
        const hit = await cache.match(BASEMAP_KEY);
        if (hit) {
          const size = (await hit.blob()).size;
          if (size !== BASEMAP_SIZE) await cache.delete(BASEMAP_KEY);
        }
      } catch {
        /* ignore */
      }
      setDownloadState("error");
    }
  };

  // Watch GPS. Uses the fused provider on native; navigator.geolocation on web.
  useEffect(() => {
    const watch = startPositionWatch(
      (c) => {
        setGps({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy });
      },
      (err) => {
        const code = (err as GeolocationPositionError).code;
        const msg = typeof code === "number" ? geoErrMsg(code) : err.message;
        if (msg) showToast(msg);
      },
    );
    return () => watch.stop();
  }, []);

  // Render GPS marker + accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps) return;

    if (!gpsMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = "width:40px;height:40px;position:relative;";

      const dot = document.createElement("div");
      dot.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#F59E0B;border:2px solid #0f1418;box-shadow:0 0 0 2px rgba(245,158,11,0.35);position:absolute;top:13px;left:13px;";

      const halo = document.createElement("div");
      halo.style.cssText =
        "position:absolute;top:13px;left:13px;width:14px;height:14px;border-radius:9999px;background:#F59E0B;";
      halo.animate(
        [{ transform: "scale(1)", opacity: 0.6 }, { transform: "scale(2.6)", opacity: 0 }],
        { duration: 1500, iterations: Infinity, easing: "ease-out" },
      );

      el.appendChild(halo);
      el.appendChild(dot);
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
      el.style.cssText =
        "pointer-events:none;border-radius:9999px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);";
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
    <div className="fixed left-0 right-0 top-11 bottom-16 overflow-hidden bg-[#121417]">
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
      {!online && !basemapReady && downloadState === "idle" && (
        <button
          type="button"
          onClick={downloadBasemap}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap inline-flex items-center rounded-full border border-border bg-background/85 backdrop-blur-md px-4 py-2 text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40 text-foreground"
        >
          Download Ghana Base Map · 92 MB
        </button>
      )}
      {!online && downloadState === "downloading" && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap inline-flex items-center rounded-full border border-border bg-background/85 backdrop-blur-md px-4 py-2 text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40 text-muted-foreground">
          Downloading… {downloadPct}%
        </div>
      )}
      {!online && downloadState === "error" && (
        <button
          type="button"
          onClick={downloadBasemap}
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
