import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { ImageViewer } from "../components/ImageViewer";
import { Search, Image as ImageIcon, Mic, Trash2, FileDown, Loader2, X, Check, CheckSquare } from "lucide-react";
import { buildTraverseReport, reportFilename, shareOrDownload } from "../lib/report";
import {
  deleteLog,
  displayRef,
  formatDateGroup,
  formatTime,
  hydrateLogs,
  loadLogs,
  type LogEntry,
} from "../lib/logs-store";
import { colorForUnit } from "../lib/unit-colors";
import { getLastBackupStatus, type LastBackupStatus } from "../lib/backup";

export const Route = createFileRoute("/my-logs")({
  head: () => ({ meta: [{ title: "GeoField — My Logs" }] }),
  validateSearch: (search: Record<string, unknown>): { open?: string } => {
    const open = search.open;
    return typeof open === "string" && open.length > 0 ? { open } : {};
  },
  component: MyLogsScreen,
});

function MyLogsScreen() {
  const { open: openId } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [, force] = useState(0);
  useEffect(() => {
    void hydrateLogs().then(() => force((n) => n + 1));
  }, []);
  const logs = loadLogs();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<LastBackupStatus>(null);
  useEffect(() => {
    void getLastBackupStatus().then(setLastBackup);
  }, []);

  const exportLogs = async (items: LogEntry[]) => {
    if (items.length === 0 || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      // Yield a frame so the spinner paints before the blocking PDF build.
      await new Promise((r) => setTimeout(r, 30));
      const doc = buildTraverseReport(items);
      await shareOrDownload(doc, reportFilename(items));
    } catch {
      setExportError("Could not create the report. If a log has many photos, try exporting fewer at a time.");
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(
    () =>
      logs.filter((l) =>
        (l.unit + " " + l.note + " " + displayRef(l)).toLowerCase().includes(query.toLowerCase()),
      ),
    [logs, query],
  );

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Only ever count logs that still exist and still match the filter.
  const selectedLogs = useMemo(
    () => filtered.filter((l) => selectedIds.has(l.id)),
    [filtered, selectedIds],
  );
  const allFilteredSelected = filtered.length > 0 && selectedLogs.length === filtered.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleAll = () => {
    if (allFilteredSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((l) => l.id)));
  };

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
        <Link
          to="/backup"
          className="mt-1 inline-block text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
        >
          {lastBackup
            ? `Last backed up ${new Date(lastBackup.timestamp).toLocaleDateString()} · Back up again`
            : "Not backed up yet · Tap to back up"}
        </Link>
        {filtered.length > 0 && !selectMode && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void exportLogs(filtered)}
              disabled={exporting}
              className="flex-1 h-11 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-black/10 text-[11px] font-bold tracking-[0.18em] flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-70"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  BUILDING REPORT…
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" strokeWidth={2.5} />
                  EXPORT {filtered.length === logs.length ? "ALL" : `${filtered.length}`} AS PDF
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              disabled={exporting}
              className="h-11 px-3 rounded-2xl border border-border bg-panel shadow-sm shadow-black/5 text-foreground text-[11px] font-bold tracking-[0.18em] flex items-center gap-1.5 hover:bg-panel-2 disabled:opacity-60"
            >
              <CheckSquare className="h-4 w-4" />
              SELECT
            </button>
          </div>
        )}

        {selectMode && (
          <div className="mt-3 rounded-2xl border border-primary/40 bg-primary/5 shadow-sm shadow-black/5 p-2.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="mono text-[11px] text-foreground">
                {selectedLogs.length} of {filtered.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="h-8 px-2.5 rounded-xl border border-border bg-panel text-[10px] font-bold tracking-[0.14em] text-foreground hover:bg-panel-2"
                >
                  {allFilteredSelected ? "CLEAR" : "ALL"}
                </button>
                <button
                  type="button"
                  onClick={exitSelect}
                  className="h-8 px-2.5 rounded-xl border border-border bg-panel text-[10px] font-bold tracking-[0.14em] text-muted-foreground hover:bg-panel-2"
                >
                  CANCEL
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await exportLogs(selectedLogs);
                exitSelect();
              }}
              disabled={exporting || selectedLogs.length === 0}
              className="w-full h-11 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-black/10 text-[11px] font-bold tracking-[0.18em] flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  BUILDING REPORT…
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" strokeWidth={2.5} />
                  {selectedLogs.length === 0
                    ? "SELECT LOGS TO EXPORT"
                    : `EXPORT ${selectedLogs.length} AS PDF`}
                </>
              )}
            </button>
          </div>
        )}
        {exportError && (
          <div className="mt-2 flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <span className="flex-1 leading-snug">{exportError}</span>
            <button type="button" onClick={() => setExportError(null)} aria-label="Dismiss" className="shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="px-4">
        <div className="flex items-center gap-2 h-12 px-3 rounded-2xl bg-panel border border-border shadow-sm shadow-black/5 focus-within:border-primary">
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
              {selectMode ? (
                <button
                  type="button"
                  onClick={() => {
                    const ids = items.map((l) => l.id);
                    const everyOne = ids.every((id) => selectedIds.has(id));
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      for (const id of ids) {
                        if (everyOne) next.delete(id);
                        else next.add(id);
                      }
                      return next;
                    });
                  }}
                  className="mono text-[10px] font-bold tracking-[0.14em] text-foreground underline underline-offset-2"
                >
                  {items.every((l) => selectedIds.has(l.id)) ? "NONE" : "ALL"}
                </button>
              ) : (
                <span className="mono text-[11px] text-muted-foreground">{items.length}</span>
              )}
            </div>
            <div className="space-y-2 px-4">
              {items.map((l) => (
                <LogCard
                  key={l.id}
                  log={l}
                  initialOpen={!selectMode && l.id === openId}
                  autoScroll={!selectMode && l.id === openId}
                  onDeleted={() => force((n) => n + 1)}
                  onExport={() => void exportLogs([l])}
                  exporting={exporting}
                  selectMode={selectMode}
                  selected={selectedIds.has(l.id)}
                  onToggleSelect={() => toggleSelect(l.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppLayout>
  );
}

function LogCard({ log, onDeleted, onExport, exporting, selectMode, selected, onToggleSelect, initialOpen = false, autoScroll = false }: { log: LogEntry; onDeleted: () => void; onExport: () => void; exporting: boolean; selectMode: boolean; selected: boolean; onToggleSelect: () => void; initialOpen?: boolean; autoScroll?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [confirming, setConfirming] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [autoScroll]);



  const effectivePhotos: string[] = log.photos ?? (log.photo ? [log.photo] : []);
  const photoCount = effectivePhotos.length;
  const stripeColor = colorForUnit(log.unit, log.belt);
  const tags = (log as LogEntry & { tags?: string[] }).tags;
  const hasPosition =
    log.lat !== null && log.lng !== null && log.accuracy !== null;

  const handleDelete = () => {
    if (selected) onToggleSelect();
    deleteLog(log.id);
    onDeleted();
  };

  const activate = () => {
    if (selectMode) onToggleSelect();
    else setOpen((v) => !v);
  };

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      className={`w-full text-left rounded-2xl overflow-hidden cursor-pointer transition-colors border shadow-md shadow-black/5 ${
        selectMode && selected ? "border-primary bg-primary/10" : "border-transparent bg-panel"
      }`}
    >
      <div className="flex items-stretch">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: stripeColor }} />
        <div className="flex-1 p-3 min-w-0">
          <div className="flex items-start gap-3">
            {selectMode && (
              <div
                className={`h-5 w-5 shrink-0 mt-0.5 rounded border flex items-center justify-center ${
                  selected ? "bg-primary border-primary" : "border-border bg-panel-2"
                }`}
                aria-hidden
              >
                {selected && <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />}
              </div>
            )}
            <div className="relative h-14 w-14 rounded-xl bg-panel-2 flex items-center justify-center shrink-0 overflow-hidden">
              {photoCount > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    if (selectMode) return;
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
              <div className="mono text-[10px] text-muted-foreground/80 mt-1 tracking-wide">
                {displayRef(log)}
              </div>
              {log.note ? (
                <div className="text-xs mt-1.5 line-clamp-2 text-foreground/90 leading-relaxed">
                  {log.note}
                </div>
              ) : (
                <div className="text-xs mt-1.5 italic text-muted-foreground/70">
                  No note
                </div>
              )}
              {tags && tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-1.5 h-5 rounded-full border border-border bg-panel-2 text-[10px] text-foreground/90"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-2">
                {(log.photo || (log.photos && log.photos.length > 0)) && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <ImageIcon className="h-3 w-3" /> Photo
                  </span>
                )}
                {log.hasVoice && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Mic className="h-3 w-3 text-primary" /> Voice
                  </span>
                )}
                {hasPosition && (
                  <span className="mono text-[10px] text-muted-foreground">
                    ± {log.accuracy!.toFixed(1)} m
                  </span>
                )}
              </div>
            </div>
          </div>
          {open && (
            <div
              className="mt-3 pt-3 border-t border-border space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Detail label="Reference" value={displayRef(log)} />
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
                        className="h-20 w-20 rounded-xl border border-border bg-black/40 overflow-hidden"
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onExport}
                      disabled={exporting}
                      className="h-8 px-3 rounded-xl bg-panel-2 border border-border text-foreground text-[11px] font-bold tracking-[0.18em] flex items-center gap-1.5 hover:bg-panel disabled:opacity-60"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="h-8 px-3 rounded-xl border border-destructive/60 text-destructive text-[11px] font-bold tracking-[0.18em] flex items-center gap-1.5 hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      DELETE
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-destructive/60 bg-destructive/5 p-3">
                    <p className="text-xs text-foreground/90">
                      Delete this observation? This cannot be undone.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="h-8 px-3 rounded-xl border border-border text-[11px] font-bold tracking-[0.18em] text-muted-foreground hover:bg-panel-2"
                      >
                        CANCEL
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="h-8 px-3 rounded-xl bg-destructive text-destructive-foreground text-[11px] font-bold tracking-[0.18em] flex items-center gap-1.5"
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
