import localforage from "localforage";

export type LogEntry = {
  id: string;
  ref?: string; // human-readable reference, e.g. GF-20260709-0001. Absent on pre-0.2.0 logs.
  timestamp: number;
  unit: string;
  belt: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  note: string;
  photo?: string; // legacy single photo (data URL) — kept for backward compat
  photos?: string[]; // new: multiple photos (data URLs)
  voice?: string; // data URL (audio)
  hasVoice?: boolean;
};

const KEY = "geofield.logs.v1";

let store: LocalForage | null = null;
function getStore(): LocalForage {
  if (!store) {
    store = localforage.createInstance({
      name: "geofield",
      storeName: "logs",
      description: "GeoField Companion offline logs",
    });
  }
  return store;
}

// In-memory mirror so synchronous callers (existing UI) keep working.
let memoryCache: LogEntry[] = [];
let hydrated = false;
let hydratePromise: Promise<LogEntry[]> | null = null;

export function hydrateLogs(): Promise<LogEntry[]> {
  if (hydrated) return Promise.resolve(memoryCache);
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const v = await getStore().getItem<LogEntry[]>(KEY);
      memoryCache = Array.isArray(v) ? v : [];
    } catch {
      memoryCache = [];
    }
    hydrated = true;
    return memoryCache;
  })();
  return hydratePromise;
}

// Kick off hydration eagerly in the browser.
if (typeof window !== "undefined") {
  void hydrateLogs();
}

export function loadLogs(): LogEntry[] {
  // Best-effort sync read from in-memory cache. Hydration runs on import.
  if (!hydrated && typeof window !== "undefined") {
    void hydrateLogs();
  }
  return memoryCache;
}

export function saveLogs(logs: LogEntry[]) {
  memoryCache = logs;
  if (typeof window === "undefined") return;
  void getStore().setItem(KEY, logs);
}

const REF_PREFIX = "GF";

function refDatePart(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// Next reference for the given day = highest SURVIVING ref that day, plus one.
// Deleting the newest log therefore frees its number; deleting a middle log
// leaves a permanent gap. This is deliberate.
export function nextRef(ts: number, logs: LogEntry[] = memoryCache): string {
  const prefix = `${REF_PREFIX}-${refDatePart(ts)}-`;
  let max = 0;
  for (const l of logs) {
    if (typeof l.ref !== "string" || !l.ref.startsWith(prefix)) continue;
    const n = Number(l.ref.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

// Pre-0.2.0 logs have no ref; fall back to the opaque id so nothing renders blank.
export function displayRef(l: LogEntry): string {
  return l.ref ?? l.id;
}

export function addLog(entry: LogEntry) {
  const withRef: LogEntry = entry.ref ? entry : { ...entry, ref: nextRef(entry.timestamp) };
  const next = [withRef, ...memoryCache];
  saveLogs(next);
}

export function deleteLog(id: string) {
  const next = memoryCache.filter((l) => l.id !== id);
  saveLogs(next);
}

export function formatCoord(n: number) {
  const abs = Math.abs(n);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${deg}° ${min.toFixed(3)}'`;
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateGroup(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "TODAY";
  if (sameDay(d, yest)) return "YESTERDAY";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}
