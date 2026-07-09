import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Link } from "@tanstack/react-router";
import { Navigation2, Crosshair, ChevronDown, Layers, Minus, Plus } from "lucide-react";
import { loadGeology, type GeoData } from "../lib/geology";
import { UNIT_COLORS, LEGEND } from "../lib/unit-colors";

const GHANA_BOUNDS: [number, number, number, number] = [-3.26, 4.74, 1.19, 11.18];
const BG = "#121417";

function buildStyle(online: boolean): StyleSpecification {
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
  const gpsRef = useRef(gps);
  gpsRef.current = gps;

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildStyle(false),
        bounds: GHANA_BOUNDS,
        fitBoundsOptions: { padding: 20 },
        attributionControl: false,
        dragRotate: true,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");
    } catch (err) {
      const msg = (err as Error).message;
      console.warn("[MapView] map construction failed", err);
      setInitError("Map cannot render on this device (WebGL unavailable).");
      return;
    }
    mapRef.current = map;

    const ensureGeologyLayers = (geo: GeoData) => {
      if (!map.isStyleLoaded()) {
        map.once("styledata", () => ensureGeologyLayers(geo));
        return;
      }
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
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
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
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
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
      if (!map.isStyleLoaded()) {
        map.once("styledata", () => ensureBaseLayers(base));
        return;
      }
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
      } catch (err) {
        console.warn("[MapView] ensureBaseLayers failed", err);
      }
    };

    const applyAll = () => {
      if (!map.isStyleLoaded()) {
        map.once("styledata", applyAll);
        return;
      }
      if (baseDataRef.current) ensureBaseLayers(baseDataRef.current);
      if (geoRef.current) ensureGeologyLayers(geoRef.current);
      // Enforce draw order bottom→top by moving each existing layer to the top in sequence.
      for (const id of [
        "base-rivers",
        "base-roads",
        "base-regions",
        "geology-fill",
        "geology-line-soft",
        "geology-line",
      ]) {
        if (map.getLayer(id)) map.moveLayer(id);
      }
    };

    map.on("error", (e) => {
      const err = (e as unknown as { error?: Error }).error;
      console.warn("[MapView] map error", err ?? e);
    });

    const onWindowResize = () => map.resize();
    window.addEventListener("resize", onWindowResize);
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
      ]).then(([geo, roads, rivers, regions]) => {
        if (mapRef.current !== map) return;
        if (geo) geoRef.current = geo;
        baseDataRef.current = {
          roads: roads ?? undefined,
          rivers: rivers ?? undefined,
          regions: regions ?? undefined,
        };
        applyAll();
      });
    });

    // Register click / hover handlers once. Layer-scoped listeners are safe
    // even if the layer is re-added later (e.g. after setStyle).
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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Online toggle — skip first run so we don't race the initial style load.
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildStyle(online), { diff: false });
    map.once("style.load", () => {
      reapplyGeologyRef.current?.();
    });
  }, [online]);

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
      () => {
        /* silent */
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

  // Resize accuracy circle on zoom
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

  // Hide popup on map move
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => setPopup(null);
    map.on("movestart", onMove);
    return () => {
      map.off("movestart", onMove);
    };
  }, []);

  // Track bearing so the compass button reflects the map rotation
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
  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (gps) {
      map.flyTo({ center: [gps.lng, gps.lat], zoom: Math.max(map.getZoom(), 12) });
    } else {
      map.fitBounds(GHANA_BOUNDS, { padding: 20 });
    }
  };

  return (
    <div className="fixed left-0 right-0 top-11 bottom-16 overflow-hidden bg-[#121417]">
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

      {/* Reset north (compass) */}
      <button
        type="button"
        onClick={() => mapRef.current?.resetNorth()}
        className="absolute bottom-16 right-3 h-11 w-11 rounded-full border border-border bg-background/85 backdrop-blur-md flex items-center justify-center text-foreground shadow-lg shadow-black/40 z-10"
        aria-label="Reset north"
      >
        <Navigation2 className="h-5 w-5" strokeWidth={2.5} style={{ transform: `rotate(${-bearing}deg)` }} />
      </button>

      {/* Recenter FAB */}
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
