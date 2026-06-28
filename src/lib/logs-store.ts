export type LogEntry = {
  id: string;
  timestamp: number;
  unit: string;
  belt: string;
  lat: number;
  lng: number;
  accuracy: number;
  note: string;
  photo?: string; // data URL or placeholder
  hasVoice?: boolean;
};

const KEY = "geofield.logs.v1";

export function loadLogs(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    return JSON.parse(raw) as LogEntry[];
  } catch {
    return [];
  }
}

export function saveLogs(logs: LogEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(logs));
}

export function addLog(entry: LogEntry) {
  const logs = loadLogs();
  logs.unshift(entry);
  saveLogs(logs);
}

function seed(): LogEntry[] {
  const now = Date.now();
  const demo: LogEntry[] = [
    {
      id: "seed-1",
      timestamp: now - 1000 * 60 * 45,
      unit: "Tarkwaian Banket Series",
      belt: "Ashanti Belt",
      lat: 6.3361,
      lng: -2.0042,
      accuracy: 4.2,
      note: "Quartz-pebble conglomerate outcrop; pyrite stringers visible along bedding.",
      hasVoice: true,
    },
    {
      id: "seed-2",
      timestamp: now - 1000 * 60 * 60 * 5,
      unit: "Birimian Metavolcanics",
      belt: "Sefwi Belt",
      lat: 6.214,
      lng: -2.341,
      accuracy: 6.8,
      note: "Sheared mafic volcanic, chlorite-altered. Foliation 045/72NW.",
    },
    {
      id: "seed-3",
      timestamp: now - 1000 * 60 * 60 * 27,
      unit: "Birimian Metasediments",
      belt: "Kibi-Winneba Belt",
      lat: 6.012,
      lng: -1.412,
      accuracy: 5.1,
      note: "Graphitic phyllite, intensely folded. Possible structural trap.",
    },
  ];
  saveLogs(demo);
  return demo;
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
