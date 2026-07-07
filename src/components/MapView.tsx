import { useEffect, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Link } from "@tanstack/react-router";
import { Crosshair, Map as MapIcon, Minus, Plus } from "lucide-react";
import { loadGeology } from "../lib/geology";
import { UNIT_COLORS, LEGEND, colorForUnit } from "../lib/unit-colors";
import { hydrateLogs, loadLogs, formatTime, type LogEntry } from "../lib/logs-store";

const GHANA_BOUNDS: [number, number, number, number] = [-3.26, 4.74, 1.19, 11.18];
const BG = "#121417";

function buildStyle(online: boolean): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [
    {
      id: "bg",
      type: "background",
      paint: { "background-color": BG },
    },
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
  return {
    version: 8,
    sources,
    layers,
  };
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

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null);
  const accuracyMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [online, setOnline] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [logsTick, setLogsTick] = useState(0);
  const gpsRef = useRef(gps);
  gpsRef.current = gps;

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(false),
      bounds: GHANA_BOUNDS,
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("error", () => {
      // Silence tile / style errors.
    });

    map.on("load", async () => {
      try {
        const geo = await loadGeology();
        if (!mapRef.current) return;
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
      } catch {
        /* silent */
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update style on online toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildStyle(online), { diff: false });
    map.once("styledata", async () => {
      try {
        const geo = await loadGeology();
        if (!map.getSource("geology")) {
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
        }
      } catch {
        /* silent */
      }
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
      el.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#F59E0B;border:2px solid #0f1418;box-shadow:0 0 0 2px rgba(245,158,11,0.35);";
      gpsMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([gps.lng, gps.lat])
        .addTo(map);
    } else {
      gpsMarkerRef.current.setLngLat([gps.lng, gps.lat]);
    }

    // Accuracy circle sized in screen px based on current zoom
    const metersPerPixel =
      (156543.03392 * Math.cos((gps.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
    const diameterPx = Math.max(20, (gps.accuracy * 2) / metersPerPixel);
    if (!accuracyMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `pointer-events:none;border-radius:9999px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);`;
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
    // Clear existing
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

  // Reposition popup on move/zoom (approximate: hide during move)
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

  return (
    <div className="fixed left-0 right-0 top-11 bottom-16 overflow-hidden bg-[#121417]">
      <div ref={containerRef} className="absolute inset-0" />

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
                {popup.time && <div className="mono text-[10px] text-muted-foreground mt-1">{popup.time}</div>}
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

// Prevent unused import warning while keeping MapIcon reserved for future empty states.
void MapIcon;
