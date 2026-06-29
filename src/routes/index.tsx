import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Crosshair, ChevronDown, ChevronRight, MapPin, Loader2, Keyboard } from "lucide-react";
import { hydrateLogs, loadLogs, formatCoord, formatTime, type LogEntry } from "../lib/logs-store";
import { loadGeology, findUnitAt, unitByName, nearbyUnits, type GeoUnit } from "../lib/geology";
import {
  acquireFix,
  accuracyToneClass,
  accuracyBarClass,
  type Acquisition,
} from "../lib/geo-acquire";
import { ManualCoordsSheet, type ManualCoords } from "../components/ManualCoordsSheet";

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
  accuracy: number | null;
  manual?: boolean;
  expectedRocks: string[];
  expectedStructures: string[];
  mineralization: string;
  engineering: string;
  nearby?: string[];
};

const UNMAPPED: Pick<Fix, "belt" | "expectedRocks" | "expectedStructures" | "mineralization" | "engineering"> = {
  belt: "Outside mapped sheets",
  expectedRocks: [],
  expectedStructures: [],
  mineralization: "No mapped unit at this position. You can still log the observation; select a unit manually if known.",
  engineering: "No engineering guidance available for an unmapped location.",
};

function fixFromUnit(
  unit: GeoUnit | null,
  lat: number,
  lng: number,
  accuracy: number | null,
  manual = false,
): Fix {
  if (!unit) {
    return { unit: "Unmapped", lat, lng, accuracy, manual, ...UNMAPPED };
  }
  return {
    unit: unit.unit_name,
    belt: unit.also_known_as,
    lat,
    lng,
    accuracy,
    manual,
    expectedRocks: unit.expected_rocks,
    expectedStructures: unit.expected_features,
    mineralization: unit.mineral_note,
    engineering: unit.engineering_note,
  };
}

// Persist current fix across screens so /log can attach real context.
const FIX_KEY = "geofield.currentFix.v1";
export function readCurrentFix(): Fix | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FIX_KEY);
    return raw ? (JSON.parse(raw) as Fix) : null;
  } catch {
    return null;
  }
}
function writeCurrentFix(f: Fix) {
  try {
    window.localStorage.setItem(FIX_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

function LocateScreen() {
  const [state, setState] = useState<"idle" | "locating" | "found" | "error">("idle");
  const [fix, setFix] = useState<Fix | null>(null);
  const [liveAccuracy, setLiveAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const acqRef = useRef<Acquisition | null>(null);

  const [, force] = useState(0);
  useEffect(() => {
    void hydrateLogs().then(() => force((n) => n + 1));

    return () => {
      acqRef.current?.stop();
    };
  }, []);
  const recent = loadLogs().slice(0, 3);

  const locate = () => {
    acqRef.current?.stop();
    setState("locating");
    setError(null);
    setFix(null);
    setLiveAccuracy(null);

    acqRef.current = acquireFix({
      onUpdate: (accuracy, coords) => {
        setLiveAccuracy(accuracy);
        // Do NOT resolve geology during acquisition — position hasn't converged.
        setFix({
          unit: "Identifying…",
          belt: "—",
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy,
          expectedRocks: [],
          expectedStructures: [],
          mineralization: "",
          engineering: "",
        });
      },
      onSettle: async (best) => {
        try {
          const geo = await loadGeology();
          const name = findUnitAt(best.longitude, best.latitude, geo.geo);
          const unit = unitByName(geo.units, name);
          const next = fixFromUnit(unit, best.latitude, best.longitude, best.accuracy);
          if (typeof best.accuracy === "number" && Number.isFinite(best.accuracy)) {
            const overlaps = nearbyUnits(best.longitude, best.latitude, best.accuracy, geo.geo);
            if (overlaps.length > 1) next.nearby = overlaps;
          }
          setFix(next);
          setLiveAccuracy(best.accuracy);
          writeCurrentFix(next);
          setState("found");
        } catch {
          setError("Could not load geology data.");
          setState("error");
        }
      },
      onError: (err) => {
        const msg =
          "code" in err && (err as GeolocationPositionError).code === 1
            ? "Location permission denied. Enable GPS access to continue."
            : "code" in err && (err as GeolocationPositionError).code === 2
            ? "GPS position unavailable. Move to open sky and retry."
            : "code" in err && (err as GeolocationPositionError).code === 3
            ? "GPS timed out. Retry with a clearer view of the sky."
            : (err as Error).message || "Could not acquire GPS fix.";
        setError(msg);
        setState("error");
      },
    });
  };

  const handleManual = async (c: ManualCoords) => {
    acqRef.current?.stop();
    try {
      const geo = await loadGeology();
      const name = findUnitAt(c.longitude, c.latitude, geo.geo);
      const unit = unitByName(geo.units, name);
      const next = fixFromUnit(unit, c.latitude, c.longitude, null, true);
      setFix(next);
      setLiveAccuracy(null);
      writeCurrentFix(next);
      setState("found");
      setShowManual(false);
    } catch {
      setError("Could not load geology data.");
      setState("error");
    }
  };

  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Locate</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Identify geological unit at your position.
        </p>
      </div>

      {!fix && (
        <div className="px-4 space-y-2">
          <button
            onClick={locate}
            disabled={state === "locating"}
            className="w-full h-32 rounded-lg bg-primary text-primary-foreground font-bold tracking-[0.2em] text-lg flex flex-col items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-80"
          >
            {state === "locating" ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin" />
                {liveAccuracy === null ? "LOCATING…" : `ACQUIRING · ± ${liveAccuracy.toFixed(1)} M`}
              </>
            ) : (
              <>
                <Crosshair className="h-7 w-7" strokeWidth={2.5} />
                LOCATE ME
              </>
            )}
          </button>
          {state === "error" && error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <button
            onClick={() => setShowManual(true)}
            className="w-full h-12 rounded-lg border border-primary/70 bg-primary/5 text-foreground text-sm font-semibold tracking-wide hover:bg-primary/10 flex items-center justify-center gap-2"
          >
            <Keyboard className="h-4 w-4 text-primary" />
            ENTER COORDINATES MANUALLY
          </button>
        </div>
      )}

      {fix && (
        <div className="px-4 space-y-3">
          <FixCard
            fix={fix}
            acquiring={state === "locating"}
            liveAccuracy={liveAccuracy}
            onRelocate={() => {
              acqRef.current?.stop();
              setFix(null);
              setLiveAccuracy(null);
              setState("idle");
            }}
          />
          {state === "found" && fix.nearby && fix.nearby.length > 1 && (
            <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-xs leading-relaxed text-primary">
              <div className="label-instrument text-primary mb-1">Possible contact nearby</div>
              <div className="text-foreground/90">
                Your GPS accuracy circle overlaps: <span className="font-semibold">{fix.nearby.join(", ")}</span>. Move a few metres or select the unit manually to confirm.
              </div>
            </div>
          )}
          {state === "found" && (
            <>
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
            </>
          )}
          {state === "found" && !fix.manual && typeof fix.accuracy === "number" && fix.accuracy > 30 && (
            <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-xs leading-relaxed text-primary">
              <div className="label-instrument text-primary mb-1">GPS is weak here</div>
              <div className="text-foreground/90">
                Accuracy is low at this spot. If you have coordinates from another device (a Garmin, survey point, or a better phone), enter them for a more precise fix.
              </div>
            </div>
          )}
          <button
            onClick={() => setShowManual(true)}
            className={`w-full h-11 rounded-lg text-sm font-semibold tracking-wide flex items-center justify-center gap-2 ${
              state === "found" && !fix.manual && typeof fix.accuracy === "number" && fix.accuracy > 30
                ? "border border-primary bg-primary/10 hover:bg-primary/20"
                : "border border-primary/70 bg-primary/5 text-foreground hover:bg-primary/10"
            }`}
          >
            <Keyboard className="h-4 w-4 text-primary" />
            ENTER COORDINATES MANUALLY
          </button>
        </div>
      )}

      <ManualCoordsSheet
        open={showManual}
        onClose={() => setShowManual(false)}
        onSubmit={handleManual}
      />



      <div className="mt-8 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="label-instrument">Recent Logs</span>
          <span className="mono text-[11px] text-muted-foreground">{recent.length}</span>
        </div>
        <div className="space-y-2">
          {recent.map((l) => (
            <RecentRow key={l.id} log={l} />
          ))}
          {recent.length === 0 && (
            <div className="text-xs text-muted-foreground px-1">No observations yet.</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function FixCard({
  fix,
  acquiring,
  liveAccuracy,
  onRelocate,
}: {
  fix: Fix;
  acquiring?: boolean;
  liveAccuracy?: number | null;
  onRelocate: () => void;
}) {
  const displayAccuracy =
    acquiring && liveAccuracy !== null && liveAccuracy !== undefined ? liveAccuracy : fix.accuracy;
  const isManual = !!fix.manual && displayAccuracy === null;
  const bars =
    displayAccuracy === null
      ? 0
      : Math.max(1, Math.min(5, Math.round(6 - Math.min(displayAccuracy, 30) / 6)));
  const toneText = accuracyToneClass(displayAccuracy);
  const toneBar = accuracyBarClass(displayAccuracy);
  
  return (
    <div className="rounded-lg border border-border bg-panel overflow-hidden">
      <div className="px-4 py-3 bg-panel-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${acquiring ? "bg-primary animate-pulse" : "bg-success"}`} />
          <span className={`label-instrument ${acquiring ? "text-primary" : "text-success"}`}>
            {acquiring ? "ACQUIRING…" : isManual ? "MANUAL ENTRY" : "FIX ACQUIRED"}
          </span>
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
          <div className="text-lg font-bold leading-tight mt-1">
            {acquiring ? "Identifying…" : fix.unit}
          </div>
        </div>
        <div>
          <div className="label-instrument">Belt / Formation</div>
          <div className="text-sm mt-1">{acquiring ? "—" : fix.belt}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div>
            <div className="label-instrument">Position</div>
            <div className="mono text-xs mt-1 leading-snug">
              {formatCoord(fix.lat)} {fix.lat >= 0 ? "N" : "S"}<br />
              {formatCoord(fix.lng)} {fix.lng >= 0 ? "E" : "W"}
            </div>
          </div>
          <div>
            <div className="label-instrument">Accuracy</div>
            {displayAccuracy === null ? (
              <div className="mono text-xs mt-1 text-muted-foreground">Manual entry</div>
            ) : (
              <>
                <div className={`mono text-xs mt-1 ${toneText}`}>± {displayAccuracy.toFixed(1)} m</div>
                <div className="mt-1 flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((b) => (
                    <span
                      key={b}
                      className={`h-1.5 w-4 rounded-sm ${b <= bars ? toneBar : "bg-border"}`}
                    />
                  ))}
                </div>
              </>
            )}
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
    <Link
      to="/my-logs"
      search={{ open: log.id }}
      className="flex items-center gap-3 px-3 h-14 rounded-md border border-border bg-panel active:bg-panel-2 hover:bg-panel-2 transition-colors"
    >
      <MapPin className="h-4 w-4 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{log.unit}</div>
        <div className="text-[11px] text-muted-foreground truncate">{log.note}</div>
      </div>
      <span className="mono text-[11px] text-muted-foreground shrink-0">{formatTime(log.timestamp)}</span>
    </Link>
  );
}

