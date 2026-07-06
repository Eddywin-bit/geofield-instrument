import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { Crosshair, Map as MapIcon, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { LEGEND } from "../lib/unit-colors";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [{ title: "GeoField — Map" }] }),
  component: MapScreen,
});

// Static OpenStreetMap tiles around southern Ghana (Ashanti / gold belt region).
// Zoom 7, tiles x=31, y=56 area. Free OSM tile hot-link as a placeholder image.
const OSM_TILE =
  "https://tile.openstreetmap.org/7/31/56.png";

function MapScreen() {
  const [online, setOnline] = useState(false);
  const [imgOk, setImgOk] = useState(true);

  return (
    <AppLayout>
      {/* Full-bleed fixed map area: below status bar (h-11) and above bottom nav (h-16 + safe area) */}
      <div className="fixed left-0 right-0 top-11 bottom-16 overflow-hidden bg-[#0f1418]">
        {/* Real dimmed map image background */}
        {imgOk ? (
          <img
            src={OSM_TILE}
            alt=""
            aria-hidden="true"
            onError={() => setImgOk(false)}
            className="absolute inset-0 w-full h-full object-cover opacity-45 saturate-50"
            style={{ filter: "brightness(0.55) contrast(1.05)" }}
          />
        ) : (
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 40%, #1f3a2e 0%, transparent 45%), radial-gradient(circle at 70% 60%, #3a3320 0%, transparent 50%), linear-gradient(135deg, #14191e 0%, #1a2128 100%)",
            }}
          />
        )}
        {/* Subtle dark vignette so controls pop */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/40 pointer-events-none" />

        {/* Online / Offline pill */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
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
        <div className="absolute top-16 right-3 flex flex-col rounded-md border border-border bg-background/85 backdrop-blur-md overflow-hidden shadow-lg shadow-black/40">
          <button
            type="button"
            disabled
            className="h-9 w-9 flex items-center justify-center text-foreground border-b border-border"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            disabled
            className="h-9 w-9 flex items-center justify-center text-foreground"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Recenter */}
        <button
          type="button"
          disabled
          className="absolute bottom-3 right-3 h-11 w-11 rounded-full border border-border bg-background/85 backdrop-blur-md flex items-center justify-center text-primary shadow-lg shadow-black/40"
          aria-label="Recenter"
        >
          <Crosshair className="h-5 w-5" strokeWidth={2.5} />
        </button>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 max-w-[60%] rounded-md border border-border bg-background/85 backdrop-blur-md px-2.5 py-2 flex flex-col gap-1 shadow-lg shadow-black/40">
          {LEGEND.map((l) => (
            <LegendDot key={l.unit} color={l.color} label={l.label} />
          ))}
        </div>

        {/* GPS dot near centre */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute inset-0 -m-3 rounded-full bg-[#3B82F6]/30 animate-ping" />
          <span className="relative block h-3 w-3 rounded-full bg-[#3B82F6] ring-2 ring-background" />
        </div>

        {/* Coming soon overlay */}
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
          <div className="rounded-2xl border border-border bg-background/80 backdrop-blur-md p-6 flex flex-col items-center gap-4 text-center max-w-xs shadow-2xl shadow-black/50">
            <MapIcon className="h-10 w-10 text-primary" strokeWidth={1.75} />
            <div className="space-y-1">
              <span className="label-instrument block">COMING SOON</span>
              <p className="text-base font-bold tracking-tight">Geological map view</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your geological units as coloured layers with your live GPS position. Arriving in a
              future update.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="mono text-[10px] text-foreground">{label}</span>
    </div>
  );
}
