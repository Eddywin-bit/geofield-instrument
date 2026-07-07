import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Link } from "@tanstack/react-router";
import { Crosshair, Minus, Plus } from "lucide-react";
import { loadGeology, type GeoData } from "../lib/geology";
import { UNIT_COLORS, LEGEND, colorForUnit } from "../lib/unit-colors";
import { hydrateLogs, loadLogs, formatTime, type LogEntry } from "../lib/logs-store";

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
  return { version: 8, sources, layers };
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
  kind: "unit" | "log";
  unit: string;
  note?: string;
  time?: string;
  x: number;
  y: number;
};

function detectDebug(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const has = new URLSearchParams(window.location.search).has("debug");
    if (has) {
      window.sessionStorage.setItem("geofield_debug", "1");
      return true;
    }
    return window.sessionStorage.getItem("geofield_debug") === "1";
  } catch {
    return false;
  }
}

function fmtTime(): string {
  const d = new Date();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${mm}:${ss}.${ms}`;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geoRef = useRef<GeoData | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null);
  const accuracyMarkerRef = useRef<maplibregl.Marker | null>(null);
  const firstRunRef = useRef(true);
  const [online, setOnline] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [logsTick, setLogsTick] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);
  const gpsRef = useRef(gps);
  gpsRef.current = gps;

  const [debug] = useState<boolean>(() => detectDebug());
  const [diag, setDiag] = useState<string[]>([]);
  const diagRef = useRef<(line: string) => void>(() => {});
  useEffect(() => {
    diagRef.current = (line: string) => {
      if (!debug) return;
      setDiag((prev) => {
        const next = [...prev, `${fmtTime()}  ${line}`];
        return next.length > 40 ? next.slice(next.length - 40) : next;
      });
    };
  }, [debug]);
  const pushDiag = (line: string) => diagRef.current(line);

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    const c = containerRef.current;
    pushDiag(`mounted; container ${c.offsetWidth}x${c.offsetHeight}`);

    // WebGL probe
    try {
      const probe = document.createElement("canvas");
      const gl2 = !!probe.getContext("webgl2");
      const gl1 = !!probe.getContext("webgl");
      pushDiag(`webgl2=${gl2} webgl=${gl1}`);
    } catch (err) {
      pushDiag(`webgl probe threw: ${(err as Error).message}`);
    }

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildStyle(false),
        bounds: GHANA_BOUNDS,
        fitBoundsOptions: { padding: 20 },
        attributionControl: { compact: true },
      });
      pushDiag("map constructed OK");
    } catch (err) {
      const msg = (err as Error).message;
      console.warn("[MapView] map construction failed", err);
      pushDiag(`map construction threw: ${msg}`);
      setInitError("Map cannot render on this device (WebGL unavailable).");
      return;
    }
    mapRef.current = map;

    const ensureGeologyLayers = (geo: GeoData) => {
      pushDiag(`ensureGeologyLayers: styleLoaded=${map.isStyleLoaded()} hasSource=${!!map.getSource("geology")}`);
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
            "fill-opacity": 0.55,
          },
        });
        map.addLayer({
          id: "geology-line",
          type: "line",
          source: "geology",
          paint: {
            "line-color": "#000000",
            "line-opacity": 0.35,
            "line-width": 0.8,
          },
        });
        pushDiag("layers added");
        map.once("idle", () => {
          try {
            const hasLayer = map.getLayer("geology-fill") !== undefined;
            const count = map.querySourceFeatures("geology").length;
            pushDiag(`idle: hasLayer=${hasLayer} sourceFeatures=${count}`);
          } catch (err) {
            pushDiag(`idle probe threw: ${(err as Error).message}`);
          }
        });
      } catch (err) {
        console.warn("[MapView] ensureGeologyLayers failed", err);
        pushDiag(`ensureGeologyLayers threw: ${(err as Error).message}`);
      }
    };

    map.on("error", (e) => {
      const err = (e as unknown as { error?: Error }).error;
      console.warn("[MapView] map error", err ?? e);
      pushDiag(`map error: ${err?.message ?? String(e)}`);
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
      const w = c.clientWidth;
      const h = c.clientHeight;
      map.resize();
      pushDiag(`resizeObserver: ${w}x${h}`);
    });
    ro.observe(c);

    const dumpCanvasMetrics = (tag: string) => {
      try {
        const canvas = map.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const cs = window.getComputedStyle(canvas);
        const canvases = c.querySelectorAll("canvas").length;
        pushDiag(
          `${tag} canvas attr=${canvas.width}x${canvas.height} rect=${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`,
        );
        pushDiag(
          `${tag} css pos=${cs.position} disp=${cs.display} vis=${cs.visibility} op=${cs.opacity} z=${cs.zIndex}`,
        );
        pushDiag(
          `${tag} container=${c.clientWidth}x${c.clientHeight} inDoc=${document.contains(canvas)} canvases=${canvases}`,
        );
      } catch (err) {
        pushDiag(`${tag} canvas metrics threw: ${(err as Error).message}`);
      }
    };

    map.on("load", () => {
      pushDiag("map load fired");
      dumpCanvasMetrics("load");
      map.once("idle", () => {
        dumpCanvasMetrics("idle");
        try {
          const canvas = map.getCanvas();
          const gl =
            (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
            (canvas.getContext("webgl") as WebGLRenderingContext | null);
          const lost =
            gl && typeof (gl as WebGLRenderingContext).isContextLost === "function"
              ? (gl as WebGLRenderingContext).isContextLost()
              : "n/a";
          pushDiag(`idle gl=${gl !== null} lost=${String(lost)}`);
        } catch (err) {
          pushDiag(`idle gl probe threw: ${(err as Error).message}`);
        }
      });
      void loadGeology()
        .then((geo) => {
          geoRef.current = geo;
          const feats = geo.geo.features ?? [];
          const first = feats[0]?.properties as { unit_name?: string } | undefined;
          pushDiag(`loadGeology ok: features=${feats.length} first=${first?.unit_name ?? "?"}`);
          if (mapRef.current === map) ensureGeologyLayers(geo);
        })
        .catch((err) => {
          console.warn("[MapView] loadGeology failed", err);
          pushDiag(`loadGeology failed: ${(err as Error).message}`);
        });
    });

    // Register click / hover handlers once. Layer-scoped listeners are safe
    // even if the layer is re-added later (e.g. after setStyle).
    map.on("click", "geology-fill", (e) => {
      const f = e.features?.[0];
      const name = (f?.properties as { unit_name?: string } | undefined)?.unit_name;
      if (!name) return;
      const pt = map.project(e.lngLat);
      setPopup({ kind: "unit", unit: name, x: pt.x, y: pt.y });
    });
    map.on("mouseenter", "geology-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "geology-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    // Expose for the online-toggle effect below via a stashed reapply fn.
    (map as unknown as { __reapplyGeology?: () => void }).__reapplyGeology = () => {
      const geo = geoRef.current;
      if (geo) ensureGeologyLayers(geo);
      else {
        void loadGeology()
          .then((g) => {
            geoRef.current = g;
            ensureGeologyLayers(g);
          })
          .catch((err) => pushDiag(`re-apply loadGeology failed: ${(err as Error).message}`));
      }
    };

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
    pushDiag(`setStyle online=${online}`);
    map.setStyle(buildStyle(online), { diff: false });
    const reapply = (map as unknown as { __reapplyGeology?: () => void }).__reapplyGeology;
    if (reapply) reapply();
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
      el.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#F59E0B;border:2px solid #0f1418;box-shadow:0 0 0 2px rgba(245,158,11,0.35);";
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

  // Hydrate & render log pins
  useEffect(() => {
    void hydrateLogs().then(() => setLogsTick((n) => n + 1));
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    const logs: LogEntry[] = loadLogs();
    for (const l of logs) {
      if (l.lat == null || l.lng == null) continue;
      const color = colorForUnit(l.unit, l.belt);
      const el = document.createElement("div");
      el.style.cssText = `width:12px;height:12px;border-radius:9999px;background:${color};border:2px solid #0f1418;box-shadow:0 0 0 1px rgba(255,255,255,0.35);cursor:pointer;`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const pt = map.project([l.lng!, l.lat!]);
        setPopup({
          kind: "log",
          unit: l.unit,
          note: l.note || "No note",
          time: formatTime(l.timestamp),
          x: pt.x,
          y: pt.y,
        });
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([l.lng, l.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
    return () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
    };
  }, [logsTick]);

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

  const copyDiag = () => {
    try {
      void navigator.clipboard.writeText(diag.join("\n"));
    } catch {
      /* ignore */
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

      {/* Diagnostic overlay */}
      {debug && (
        <div className="absolute top-12 left-2 right-2 z-30 rounded-md border border-border bg-background/90 backdrop-blur-md max-h-[40%] overflow-auto text-[10px] font-mono p-2 shadow-lg shadow-black/40">
          <div className="flex items-center justify-between mb-1 sticky top-0 bg-background/90 pb-1">
            <span className="font-bold text-foreground">diag ({diag.length})</span>
            <button
              type="button"
              onClick={copyDiag}
              className="px-2 py-0.5 rounded border border-border text-foreground"
            >
              copy
            </button>
          </div>
          {diag.map((l, i) => (
            <div key={i} className="text-foreground whitespace-pre-wrap break-all leading-tight">
              {l}
            </div>
          ))}
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
      <div className="absolute bottom-3 left-3 max-w-[60%] rounded-md border border-border bg-background/85 backdrop-blur-md px-2.5 py-2 flex flex-col gap-1 shadow-lg shadow-black/40 z-10 max-h-[45%] overflow-auto">
        {LEGEND.map((l) => (
          <div key={l.unit} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
            <span className="mono text-[10px] text-foreground whitespace-nowrap">{l.label}</span>
          </div>
        ))}
      </div>

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
            {popup.kind === "log" ? (
              <>
                <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{popup.note}</div>
                {popup.time && (
                  <div className="mono text-[10px] text-muted-foreground mt-1">{popup.time}</div>
                )}
              </>
            ) : (
              <Link
                to="/know/$unit"
                params={{ unit: encodeURIComponent(popup.unit) }}
                className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-primary hover:underline"
              >
                Know →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
