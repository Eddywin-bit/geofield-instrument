import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { Crosshair, Map as MapIcon, Minus, Plus } from "lucide-react";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [{ title: "GeoField — Map" }] }),
  component: MapScreen,
});

function MapScreen() {
  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Map</h1>
        </div>
      </div>

      <div className="relative mx-4 mb-4 rounded-xl border border-border overflow-hidden bg-panel min-h-[calc(100dvh-12rem)]">
        {/* Dimmed fake map */}
        <div className="absolute inset-0 opacity-40">
          <FakeMap />
        </div>

        {/* Crisp map controls */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <div className="inline-flex items-center rounded-full border border-border bg-background/90 backdrop-blur-sm overflow-hidden text-[10px] font-semibold tracking-wider uppercase">
            <span className="px-3 py-1.5 bg-panel-2 text-foreground">Offline</span>
            <span className="px-3 py-1.5 text-muted-foreground">Online</span>
          </div>
        </div>

        <div className="absolute top-16 right-3 flex flex-col rounded-md border border-border bg-background/90 backdrop-blur-sm overflow-hidden">
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

        <button
          type="button"
          disabled
          className="absolute bottom-3 right-3 h-11 w-11 rounded-full border border-border bg-background/90 backdrop-blur-sm flex items-center justify-center text-primary"
          aria-label="Recenter"
        >
          <Crosshair className="h-5 w-5" strokeWidth={2.5} />
        </button>

        <div className="absolute bottom-3 left-3 max-w-[60%] rounded-md border border-border bg-background/90 backdrop-blur-sm px-2.5 py-2 flex flex-col gap-1">
          <LegendDot color="#3FB37F" label="Birimian Sed." />
          <LegendDot color="#2BA29A" label="Birimian Volc." />
          <LegendDot color="#D4A017" label="Tarkwaian" />
          <LegendDot color="#8B5E3C" label="Voltaian" />
        </div>

        {/* Coming soon overlay */}
        <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
          <div className="rounded-2xl border border-border bg-background/80 backdrop-blur-md p-6 flex flex-col items-center gap-4 text-center max-w-xs">
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

function FakeMap() {
  return (
    <div className="relative w-full h-full bg-[#0f1418]">
      {/* Grid */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2a3138" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Roads */}
        <path
          d="M -20 120 Q 150 80 380 180 T 700 220"
          stroke="#3a4148"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M 50 -10 Q 90 200 200 360 T 330 700"
          stroke="#3a4148"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M 0 420 L 400 380"
          stroke="#3a4148"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="4 4"
        />
      </svg>

      {/* Coloured geology polygons */}
      <div
        className="absolute bg-[#3FB37F]/60"
        style={{
          top: "8%",
          left: "6%",
          width: "42%",
          height: "30%",
          clipPath: "polygon(0% 20%, 30% 0%, 100% 10%, 90% 80%, 40% 100%, 0% 70%)",
        }}
      />
      <div
        className="absolute bg-[#2BA29A]/60"
        style={{
          top: "20%",
          right: "4%",
          width: "38%",
          height: "34%",
          clipPath: "polygon(20% 0%, 100% 15%, 95% 90%, 30% 100%, 0% 60%)",
        }}
      />
      <div
        className="absolute bg-[#D4A017]/60"
        style={{
          bottom: "18%",
          left: "10%",
          width: "44%",
          height: "32%",
          clipPath: "polygon(0% 30%, 50% 0%, 100% 25%, 85% 100%, 15% 95%)",
        }}
      />
      <div
        className="absolute bg-[#8B5E3C]/55"
        style={{
          bottom: "6%",
          right: "8%",
          width: "36%",
          height: "26%",
          clipPath: "polygon(10% 10%, 100% 0%, 90% 100%, 0% 85%)",
        }}
      />
      <div
        className="absolute bg-[#7A5BBF]/50"
        style={{
          top: "44%",
          left: "32%",
          width: "30%",
          height: "22%",
          clipPath: "polygon(0% 40%, 40% 0%, 100% 30%, 80% 100%, 20% 90%)",
        }}
      />

      {/* Towns */}
      <Town top="22%" left="18%" label="Obuasi" />
      <Town top="46%" left="58%" label="Bekwai" />
      <Town top="72%" left="28%" label="Dunkwa" />

      {/* GPS dot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute inset-0 -m-3 rounded-full bg-[#3B82F6]/30 animate-ping" />
        <span className="relative block h-3 w-3 rounded-full bg-[#3B82F6] ring-2 ring-background" />
      </div>
    </div>
  );
}

function Town({ top, left, label }: { top: string; left: string; label: string }) {
  return (
    <div className="absolute flex items-center gap-1.5" style={{ top, left }}>
      <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
      <span className="mono text-[9px] text-foreground/70">{label}</span>
    </div>
  );
}
