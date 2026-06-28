import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Crosshair, ChevronDown, ChevronRight, MapPin, Loader2 } from "lucide-react";
import { loadLogs, formatCoord, formatTime, type LogEntry } from "../lib/logs-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GeoField Companion — Locate" },
      { name: "description", content: "Offline-first geological field companion for exploration teams." },
    ],
  }),
  component: LocateScreen,
});

type Fix = {
  unit: string;
  belt: string;
  lat: number;
  lng: number;
  accuracy: number;
  expectedRocks: string[];
  expectedStructures: string[];
  mineralization: string;
  engineering: string;
};

const DEMO_FIX: Fix = {
  unit: "Tarkwaian Banket Series",
  belt: "Ashanti Greenstone Belt",
  lat: 6.3361,
  lng: -2.0042,
  accuracy: 4.2,
  expectedRocks: [
    "Quartz-pebble conglomerate",
    "Quartzite",
    "Phyllite interbeds",
    "Sericite schist",
  ],
  expectedStructures: [
    "NE-trending bedding (035–050°)",
    "Reverse faulting along Ashanti Trend",
    "Bedding-parallel shear zones",
  ],
  mineralization:
    "Paleoplacer Au hosted in pebble conglomerate (Banket reef). Associated pyrite ± hematite. Grades typically 1.5–8 g/t.",
  engineering:
    "Competent quartzite; moderate weathering in saprolite (0–25 m). Watch for shear-zone wedge failures on cuts >6 m.",
};

function LocateScreen() {
  const [state, setState] = useState<"idle" | "locating" | "found">("idle");
  const [fix, setFix] = useState<Fix | null>(null);
  const recent = loadLogs().slice(0, 3);

  const locate = () => {
    setState("locating");
    setTimeout(() => {
      setFix(DEMO_FIX);
      setState("found");
    }, 1400);
  };

  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Locate</h1>
          <span className="label-instrument">SCREEN 01</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Identify geological unit at your position.
        </p>
      </div>

      {state !== "found" && (
        <div className="px-4">
          <button
            onClick={locate}
            disabled={state === "locating"}
            className="w-full h-32 rounded-lg bg-primary text-primary-foreground font-bold tracking-[0.2em] text-lg flex flex-col items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-80"
          >
            {state === "locating" ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin" />
                ACQUIRING GPS…
              </>
            ) : (
              <>
                <Crosshair className="h-7 w-7" strokeWidth={2.5} />
                LOCATE ME
              </>
            )}
          </button>
          <button className="w-full mt-3 h-12 rounded-lg border border-border bg-panel text-foreground text-sm font-semibold tracking-wide hover:bg-panel-2">
            SELECT UNIT MANUALLY
          </button>
        </div>
      )}

      {state === "found" && fix && (
        <div className="px-4 space-y-3">
          <FixCard fix={fix} onRelocate={() => setState("idle")} />
          <Collapsible title="Expected Rocks" count={fix.expectedRocks.length}>
            <ul className="space-y-2">
              {fix.expectedRocks.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Collapsible>
          <Collapsible title="Expected Structures" count={fix.expectedStructures.length}>
            <ul className="space-y-2">
              {fix.expectedStructures.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Collapsible>
          <Collapsible title="Mineralization Notes">
            <p className="text-sm leading-relaxed text-foreground/90">{fix.mineralization}</p>
          </Collapsible>
          <Collapsible title="Engineering Notes">
            <p className="text-sm leading-relaxed text-foreground/90">{fix.engineering}</p>
          </Collapsible>
          <button className="w-full h-11 rounded-lg border border-border bg-panel text-sm font-semibold tracking-wide hover:bg-panel-2">
            SELECT UNIT MANUALLY
          </button>
        </div>
      )}

      <div className="mt-8 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="label-instrument">Recent Logs</span>
          <span className="mono text-[11px] text-muted-foreground">{recent.length}</span>
        </div>
        <div className="space-y-2">
          {recent.map((l) => (
            <RecentRow key={l.id} log={l} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

function FixCard({ fix, onRelocate }: { fix: Fix; onRelocate: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-panel overflow-hidden">
      <div className="px-4 py-3 bg-panel-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="label-instrument text-success">FIX ACQUIRED</span>
        </div>
        <button
          onClick={onRelocate}
          className="text-[11px] tracking-[0.14em] font-semibold text-primary"
        >
          RE-LOCATE
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="label-instrument">Geological Unit</div>
          <div className="text-lg font-bold leading-tight mt-1">{fix.unit}</div>
        </div>
        <div>
          <div className="label-instrument">Belt / Formation</div>
          <div className="text-sm mt-1">{fix.belt}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div>
            <div className="label-instrument">Position</div>
            <div className="mono text-xs mt-1 leading-snug">
              {formatCoord(fix.lat)} N<br />
              {formatCoord(fix.lng)} W
            </div>
          </div>
          <div>
            <div className="label-instrument">Accuracy</div>
            <div className="mono text-xs mt-1">± {fix.accuracy.toFixed(1)} m</div>
            <div className="mt-1 flex gap-0.5">
              {[1, 2, 3, 4, 5].map((b) => (
                <span
                  key={b}
                  className={`h-1.5 w-4 rounded-sm ${b <= 4 ? "bg-success" : "bg-border"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Collapsible({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-panel">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 h-14 text-left"
      >
        <span className="font-semibold tracking-wide text-sm">
          {title}
          {count !== undefined && (
            <span className="ml-2 mono text-[11px] text-muted-foreground">[{count}]</span>
          )}
        </span>
        {open ? (
          <ChevronDown className="h-5 w-5 text-primary" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>}
    </div>
  );
}

function RecentRow({ log }: { log: LogEntry }) {
  return (
    <div className="flex items-center gap-3 px-3 h-14 rounded-md border border-border bg-panel">
      <MapPin className="h-4 w-4 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{log.unit}</div>
        <div className="text-[11px] text-muted-foreground truncate">{log.note}</div>
      </div>
      <span className="mono text-[11px] text-muted-foreground shrink-0">{formatTime(log.timestamp)}</span>
    </div>
  );
}
