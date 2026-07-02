import localforage from "localforage";

export type LogEntry = {
  id: string;
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

export function addLog(entry: LogEntry) {
  const next = [entry, ...memoryCache];
  saveLogs(next);
}

export function deleteLog(id: string) {
  const next = memoryCache.filter((l) => l.id !== id);
  saveLogs(next);
}

export function formatCoord(n: number) {
  const dir = n >= 0 ? "" : "-";
  const abs = Math.abs(n);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${dir}${deg}° ${min.toFixed(3)}'`;
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
