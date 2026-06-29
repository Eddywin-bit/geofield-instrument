import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { ImageViewer } from "../components/ImageViewer";
import { Search, Image as ImageIcon, Mic, Trash2 } from "lucide-react";
import {
  deleteLog,
  formatDateGroup,
  formatTime,
  hydrateLogs,
  loadLogs,
  type LogEntry,
} from "../lib/logs-store";

export const Route = createFileRoute("/my-logs")({
  head: () => ({ meta: [{ title: "GeoField — My Logs" }] }),
  validateSearch: (search: Record<string, unknown>): { open?: string } => {
    const open = search.open;
    return typeof open === "string" && open.length > 0 ? { open } : {};
  },
  component: MyLogsScreen,
});

function MyLogsScreen() {
  const [query, setQuery] = useState("");
  const [, force] = useState(0);
  useEffect(() => {
    void hydrateLogs().then(() => force((n) => n + 1));
  }, []);
  const logs = loadLogs();

  const filtered = useMemo(
    () =>
      logs.filter((l) =>
        (l.unit + " " + l.note).toLowerCase().includes(query.toLowerCase()),
      ),
    [logs, query],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const l of filtered) {
      const k = formatDateGroup(l.timestamp);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">My Logs</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="mono">{logs.length}</span> observations · stored on device
        </p>
      </div>

      <div className="px-4">
        <div className="flex items-center gap-2 h-12 px-3 rounded-lg bg-panel border border-border focus-within:border-primary">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by unit or keyword…"
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-4 space-y-6">
        {grouped.length === 0 && (
          <div className="px-4 py-16 text-center">
            <p className="label-instrument">No logs</p>
            <p className="text-sm text-muted-foreground mt-2">
              Capture an observation from the Log screen.
            </p>
          </div>
        )}
        {grouped.map(([date, items]) => (
          <section key={date}>
            <div className="px-4 flex items-center gap-3 mb-2">
              <span className="label-instrument">{date}</span>
              <div className="flex-1 h-px bg-border" />
              <span className="mono text-[11px] text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-2 px-4">
              {items.map((l) => (
                <LogCard key={l.id} log={l} onDeleted={() => force((n) => n + 1)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppLayout>
  );
}

function LogCard({ log, onDeleted }: { log: LogEntry; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  const effectivePhotos: string[] = log.photos ?? (log.photo ? [log.photo] : []);
  const photoCount = effectivePhotos.length;

  const handleDelete = () => {
    deleteLog(log.id);
    onDeleted();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      className="w-full text-left rounded-lg border border-border bg-panel overflow-hidden cursor-pointer"
    >
      <div className="flex items-stretch">
        <div className="w-1 bg-primary" />
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-start gap-3">
            <div className="relative h-14 w-14 rounded-md bg-panel-2 border border-border flex items-center justify-center shrink-0 overflow-hidden">
              {photoCount > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewingIndex(0);
                  }}
                  aria-label="Open photo full screen"
                  className="h-full w-full block"
                >
                  <img src={effectivePhotos[0]} alt="" className="h-full w-full object-cover" />
                </button>
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
              {photoCount > 1 && (
                <span className="absolute bottom-0.5 right-0.5 mono text-[9px] font-bold px-1 rounded-sm bg-black/75 text-white border border-white/20">
                  {photoCount}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold truncate">{log.unit}</div>
                <span className="mono text-[11px] text-muted-foreground shrink-0">
                  {formatTime(log.timestamp)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                {log.belt}
              </div>
              <div className="text-xs mt-1.5 line-clamp-1 text-foreground/90">
                {log.note}
              </div>
              <div className="flex items-center gap-3 mt-2">
                {log.hasVoice && (
                  <span className="flex items-center gap-1 text-[10px] text-primary">
                    <Mic className="h-3 w-3" /> VOICE
                  </span>
                )}
                <span className="mono text-[10px] text-muted-foreground">
                  {log.accuracy !== null ? `± ${log.accuracy.toFixed(1)} m` : "± — m"}
                </span>
              </div>
            </div>
          </div>
          {open && (
            <div
              className="mt-3 pt-3 border-t border-border space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Detail label="Position" value={log.lat !== null && log.lng !== null ? `${log.lat.toFixed(5)}, ${log.lng.toFixed(5)}` : "Position unknown"} />
              <Detail label="Belt" value={log.belt} />
              {photoCount > 0 && (
                <div>
                  <div className="label-instrument mb-1">{photoCount > 1 ? "Photos" : "Photo"}</div>
                  <div className="flex flex-wrap gap-2">
                    {effectivePhotos.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingIndex(i);
                        }}
                        className="h-20 w-20 rounded-md border border-border bg-black/40 overflow-hidden"
                        aria-label={`Open photo ${i + 1} full screen`}
                      >
                        <img src={p} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {log.voice && (
                <div>
                  <div className="label-instrument mb-1">Voice Note</div>
                  <audio
                    src={log.voice}
                    controls
                    onClick={(e) => e.stopPropagation()}
                    className="w-full"
                  />
                </div>
              )}
              <div>
                <div className="label-instrument">Note</div>
                <p className="text-sm mt-1 leading-relaxed">{log.note}</p>
              </div>


              <div className="pt-2">
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="h-8 px-3 rounded-md border border-destructive/60 text-destructive text-[11px] font-bold tracking-[0.18em] flex items-center gap-1.5 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    DELETE
                  </button>
                ) : (
                  <div className="rounded-md border border-destructive/60 bg-destructive/5 p-3">
                    <p className="text-xs text-foreground/90">
                      Delete this observation? This cannot be undone.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="h-8 px-3 rounded-md border border-border text-[11px] font-bold tracking-[0.18em] text-muted-foreground hover:bg-panel-2"
                      >
                        CANCEL
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="h-8 px-3 rounded-md bg-destructive text-destructive-foreground text-[11px] font-bold tracking-[0.18em] flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        DELETE
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {viewingIndex !== null && photoCount > 0 && (
        <ImageViewer
          images={effectivePhotos}
          startIndex={viewingIndex}
          onClose={() => setViewingIndex(null)}
        />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label-instrument">{label}</span>
      <span className="mono text-xs">{value}</span>
    </div>
  );
}
