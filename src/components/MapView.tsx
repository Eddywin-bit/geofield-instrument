import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification, type LayerSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Link } from "@tanstack/react-router";
import { Navigation2, Crosshair, ChevronDown, Layers, Minus, Plus, X } from "lucide-react";
import { Protocol, PMTiles, FileSource } from "pmtiles";
import { layers as basemapLayers, namedFlavor } from "@protomaps/basemaps";
import { loadGeology, type GeoData } from "../lib/geology";
import { UNIT_COLORS, LEGEND } from "../lib/unit-colors";

const GHANA_BOUNDS: [number, number, number, number] = [-3.26, 4.74, 1.19, 11.18];
const GHANA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-4.8, 3.6],
  [2.6, 12.2],
];
const BG = "#121417";

const BASEMAP_ASSET_URL = "/__l5e/assets-v1/3df05f2c-d083-43a1-9753-5c88e4ba4d40/ghana.pmtiles";
const BASEMAP_CACHE = "geofield-basemap-v1";
const BASEMAP_KEY = "/basemap/ghana.pmtiles";
const BASEMAP_SIZE = 92038624;
const BASEMAP_FILE_NAME = "ghana.pmtiles";
const BASEMAP_STYLE_URL = `pmtiles://${BASEMAP_FILE_NAME}`;

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

function buildBasemapLayers(): LayerSpecification[] {
  const capitalExclusion: unknown = [
    "!",
    ["in", ["coalesce", ["get", "name:en"], ["get", "name"]], ["literal", CAPITAL_NAMES]],
  ];
  const list = basemapLayers("basemap", namedFlavor("black"), { lang: "en" }) as LayerSpecification[];
  return list
    .filter((l) => {
      if (l.type !== "symbol") return true;
      if (l.id.toLowerCase().includes("shield")) return false;
      const tf = (l.layout as { "text-field"?: unknown } | undefined)?.["text-field"];
      if (tf !== undefined && JSON.stringify(tf).includes('"ref"')) return false;
      return true;
    })
    .map((l) => {
      const srcLayer = (l as { "source-layer"?: string })["source-layer"];
      const idLower = l.id.toLowerCase();
      const isWaterSrc = (srcLayer && /water/i.test(srcLayer)) || /water/i.test(idLower);
      const isWaterwaySrc =
        (srcLayer && /water(way)?/i.test(srcLayer)) || /water(way)?/i.test(idLower);
      if (l.type === "fill" && isWaterSrc) {
        return {
          ...l,
          paint: { ...((l as { paint?: object }).paint ?? {}), "fill-color": "#1D3A5C" },
        } as LayerSpecification;
      }
      if (l.type === "line" && isWaterwaySrc) {
        return {
          ...l,
          paint: {
            ...((l as { paint?: object }).paint ?? {}),
            "line-color": "#4A8FD4",
            "line-opacity": 0.8,
          },
        } as LayerSpecification;
      }
      if (l.type === "symbol") {
        const isPlaces = srcLayer === "places";
        const existingFilter = (l as { filter?: unknown }).filter;
        const mergedFilter = isPlaces
          ? existingFilter
            ? ["all", existingFilter, capitalExclusion]
            : capitalExclusion
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
    { id: "bg", type: "background", paint: { "background-color": BG } },
  ];
  if (online) {
    sources.osm = {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    };
    layers.push({
      id: "osm",
      type: "raster",
      source: "osm",
      paint: { "raster-opacity": 0.75 },
    });
  } else if (basemap) {
    sources.basemap = { type: "vector", url: BASEMAP_STYLE_URL };
    for (const l of buildBasemapLayers()) layers.push(l);
  }
  return { version: 8, sources, layers, glyphs: "/fonts/{fontstack}/{range}.pbf", projection: { type: "globe" } as any };
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
        maxBounds: GHANA_MAX_BOUNDS,
        minZoom: 5.2,
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
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
            filter: ["==", ["get", "place"], "city"],
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
            filter: ["==", ["get", "place"], "town"],
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
        if (base.roads && !map.getLayer("road-labels")) {
          map.addLayer({
            id: "road-labels",
            type: "symbol",
            source: "base-roads",
            minzoom: 9,
            layout: {
              "text-field": ["coalesce", ["get", "ref"], ""],
              "text-font": ["Noto Sans Regular"],
              "text-size": 11,
              "symbol-placement": "line",
              "text-rotation-alignment": "map",
              "text-allow-overlap": false,
              "text-optional": true,
            },
            paint: {
              "text-color": "#C9CFDA",
              "text-halo-color": "#0B0E14",
              "text-halo-width": 1.3,
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

    const applyAll = () => {
      const vectorBase = basemapReadyRef.current && !onlineRef.current;
      if (!vectorBase && baseDataRef.current) ensureBaseLayers(baseDataRef.current);
      if (geoRef.current) ensureGeologyLayers(geoRef.current);
      ensureCapitalsLayer();

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
          "road-labels",
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
      ]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", placeLabelVisibility);
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
      ]).then(([geo, roads, rivers, regions, places]) => {
        if (mapRef.current !== map) return;
        if (geo) geoRef.current = geo;
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
    map.setStyle(buildStyle(online, basemapReady), { diff: false });
    map.once("style.load", () => {
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
    setDownloadPct(0);
    try {
      const res = await fetch(BASEMAP_ASSET_URL);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get("Content-Length")) || BASEMAP_SIZE;
      const [progressBranch, cacheBranch] = res.body.tee();

      const cache = await caches.open(BASEMAP_CACHE);
      const cachePut = cache.put(
        BASEMAP_KEY,
        new Response(cacheBranch, { headers: { "Content-Type": "application/octet-stream" } }),
      );

      const reader = progressBranch.getReader();
      let received = 0;
      const readAll = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.byteLength;
            const pct = Math.min(99, Math.floor((received / total) * 100));
            setDownloadPct(pct);
          }
        }
      })();

      await Promise.all([cachePut, readAll]);

      const hit = await cache.match(BASEMAP_KEY);
      if (!hit) throw new Error("cache miss after put");
      const blob = await hit.blob();
      const file = new File([blob], BASEMAP_FILE_NAME);
      pmProtocol.add(new PMTiles(new FileSource(file)));
      setDownloadPct(100);
      setBasemapReady(true);
      setDownloadState("idle");
    } catch (err) {
      console.warn("[MapView] basemap download failed", err);
      try {
        const cache = await caches.open(BASEMAP_CACHE);
        await cache.delete(BASEMAP_KEY);
      } catch {
        /* ignore */
      }
      setDownloadState("error");
    }
  };

  // Watch GPS
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        const msg = geoErrMsg(err.code);
        if (msg) showToast(msg);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
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

  const accuracyLabel = gps ? `±${Math.round(gps.accuracy)} m` : null;
  const accuracyAmber = gps ? gps.accuracy > 30 : false;

  return (
    <div className="fixed left-0 right-0 top-11 bottom-16 overflow-hidden bg-[#121417]">
      <style>{`
        .maplibregl-ctrl-scale {
          background: rgba(18,20,23,0.75) !important;
          border: 1px solid rgba(200,210,225,0.6) !important;
          border-top: none !important;
          color: #E8EAF0 !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          letter-spacing: 0.04em !important;
          padding: 1px 4px !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.6) !important;
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
          Download failed — tap to retry
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

      {/* GPS accuracy chip */}
      {accuracyLabel && (
        <div
          className={`absolute bottom-3 right-16 z-10 inline-flex items-center rounded-full border border-border bg-background/85 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase shadow-lg shadow-black/40 mono ${
            accuracyAmber ? "text-amber-400" : "text-foreground"
          }`}
        >
          {accuracyLabel}
        </div>
      )}

      {/* Recenter / locate FAB */}
      <button
        type="button"
        onClick={recenter}
        className="absolute bottom-3 right-3 h-11 w-11 rounded-full border border-border bg-background/85 backdrop-blur-md flex items-center justify-center text-primary shadow-lg shadow-black/40 z-10"
        aria-label="Recenter"
      >
        <Crosshair className="h-5 w-5" strokeWidth={2.5} />
      </button>

      {/* Legend */}
      {!legendOpen && (
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/85 backdrop-blur-md px-3 py-1.5 shadow-lg shadow-black/40"
        >
          <Layers className="h-3.5 w-3.5 text-foreground" />
          <span className="text-[10px] font-semibold text-foreground">Legend</span>
        </button>
      )}
      {legendOpen && (
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
