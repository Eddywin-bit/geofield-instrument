import { jsPDF } from "jspdf";
import { formatCoord, formatTime, type LogEntry } from "./logs-store";

// Keep in sync with APP_VERSION / CHANNEL in src/routes/about.tsx.
const APP_VERSION = "0.5.0 Beta";

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2;
const FOOT_Y = PAGE_H - 12;

const INK: [number, number, number] = [26, 30, 36];
const MUTED: [number, number, number] = [110, 118, 130];
const RULE: [number, number, number] = [205, 210, 218];
const AMBER: [number, number, number] = [217, 138, 12];
const PANEL: [number, number, number] = [244, 246, 249];

const COLS = 2;
const GUTTER = 5;
const CELL_W = (CONTENT_W - 6 - GUTTER) / COLS;
const CELL_H = 55;
const CAP_H = 5;

type S = { doc: jsPDF; y: number };

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function displayRefLocal(l: LogEntry) {
  return l.ref ?? l.id;
}

function positionOf(l: LogEntry) {
  if (l.lat === null || l.lng === null) return "Position not recorded";
  return `${formatCoord(l.lat)} ${l.lat >= 0 ? "N" : "S"}  \u00B7  ${formatCoord(l.lng)} ${l.lng >= 0 ? "E" : "W"}`;
}

function accuracyOf(l: LogEntry) {
  if (l.accuracy === null || l.accuracy === undefined) return "Manual entry";
  return `\u00B1 ${l.accuracy.toFixed(1)} m`;
}

function photosOf(l: LogEntry): string[] {
  return l.photos ?? (l.photo ? [l.photo] : []);
}

function need(s: S, h: number) {
  if (s.y + h > FOOT_Y - 8) {
    s.doc.addPage();
    s.y = M;
  }
}

function masthead(s: S, count: number) {
  const { doc } = s;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...AMBER);
  doc.text("GeoField", M, s.y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("TRAVERSE REPORT", M, s.y + 11.5);

  const rx = PAGE_W - M;
  doc.setFontSize(8);
  doc.text(`Exported  ${formatDate(Date.now())}`, rx, s.y + 4, { align: "right" });
  doc.text(`Observations  ${count}`, rx, s.y + 8, { align: "right" });
  doc.text(`GeoField v${APP_VERSION} \u00B7 Ghana Edition`, rx, s.y + 12, { align: "right" });

  s.y += 16;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
  doc.line(M, s.y, PAGE_W - M, s.y);
  s.y += 8;
}

function logHeader(s: S, log: LogEntry) {
  const { doc } = s;
  need(s, 22);
  doc.setFillColor(...INK);
  doc.rect(M, s.y, CONTENT_W, 9, "F");
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(displayRefLocal(log), M + 3, s.y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(formatTime(log.timestamp), PAGE_W - M - 3, s.y + 6, { align: "right" });
  s.y += 9;
}

function field(s: S, label: string, value: string, mono = false) {
  const { doc } = s;
  need(s, 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(label.toUpperCase(), M + 3, s.y + 4.6);
  doc.setFont(mono ? "courier" : "helvetica", mono ? "normal" : "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(String(value), M + 42, s.y + 4.6);
  s.y += 6.6;
  doc.setDrawColor(238, 240, 243);
  doc.setLineWidth(0.2);
  doc.line(M + 3, s.y, PAGE_W - M - 3, s.y);
}

function noteBlock(s: S, note: string) {
  const { doc } = s;
  need(s, 10);
  s.y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("FIELD NOTE", M + 3, s.y);
  s.y += 3;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const lines: string[] = doc.splitTextToSize(note || "(no note)", CONTENT_W - 10);
  for (const ln of lines) {
    need(s, 5);
    doc.text(ln, M + 3, s.y + 3.6);
    s.y += 4.4;
  }
  s.y += 2;
}

// Aspect-preserving fit inside a fixed cell. Never stretches, never crops.
export function fitInto(imgW: number, imgH: number, cellW: number, cellH: number) {
  const scale = Math.min(cellW / imgW, cellH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { w, h, dx: (cellW - w) / 2, dy: (cellH - h) / 2 };
}

function photoGrid(s: S, photos: string[]) {
  const { doc } = s;
  if (photos.length === 0) return;
  s.y += 3;
  need(s, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`PHOTOGRAPHS (${photos.length})`, M + 3, s.y);
  s.y += 3;

  for (let i = 0; i < photos.length; i += COLS) {
    const rowH = CELL_H + CAP_H;
    need(s, rowH + 2);
    for (let c = 0; c < COLS; c++) {
      const idx = i + c;
      if (idx >= photos.length) break;
      const x = M + 3 + c * (CELL_W + GUTTER);
      const data = photos[idx];

      doc.setFillColor(...PANEL);
      doc.rect(x, s.y, CELL_W, CELL_H, "F");

      let props: { width: number; height: number } | null = null;
      try {
        props = doc.getImageProperties(data) as { width: number; height: number };
      } catch {
        props = null;
      }
      if (props && props.width && props.height) {
        const f = fitInto(props.width, props.height, CELL_W - 2, CELL_H - 2);
        doc.addImage(data, "JPEG", x + 1 + f.dx, s.y + 1 + f.dy, f.w, f.h, undefined, "FAST");
      }
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.rect(x, s.y, CELL_W, CELL_H, "S");

      doc.setFont("courier", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(`Photo ${idx + 1} of ${photos.length}`, x, s.y + CELL_H + 3.4);
    }
    s.y += rowH + 2;
  }
}

function footers(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(M, FOOT_Y - 5, PAGE_W - M, FOOT_Y - 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(
      "Units identified from a national-scale geological map. Not field-verified, not survey-grade. Confirm contacts on the ground.",
      M,
      FOOT_Y - 1.5,
    );
    doc.text(`Page ${p} of ${n}`, PAGE_W - M, FOOT_Y - 1.5, { align: "right" });
  }
}

export function buildTraverseReport(logs: LogEntry[]): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const s: S = { doc, y: M };
  const ordered = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  masthead(s, ordered.length);

  if (ordered.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("No observations to export.", M, s.y + 6);
  }

  ordered.forEach((log, i) => {
    if (i > 0) s.y += 6;
    logHeader(s, log);
    field(s, "Geological unit", log.unit);
    field(s, "Belt / formation", log.belt);
    field(s, "Position", positionOf(log), true);
    field(s, "Fix accuracy", accuracyOf(log), true);
    if (log.hasVoice) field(s, "Voice memo", "Recorded \u2014 in app only, not exported");
    noteBlock(s, log.note);
    photoGrid(s, photosOf(log));
  });

  footers(doc);
  return doc;
}

export function reportFilename(logs: LogEntry[]): string {
  if (logs.length === 1) return `GeoField-${displayRefLocal(logs[0])}.pdf`;
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `GeoField-Traverse-${stamp}.pdf`;
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

// Hands the PDF to the OS.
//
// Native: the WebView supports neither Web Share with files nor blob-URL
// anchor downloads, so doc.save() was a silent no-op in the APK. Write the
// PDF into the app cache and hand its URI to the Android share sheet, where
// saving to Files or Drive, or sending on WhatsApp, is one tap.
//
// Web: unchanged. Web Share where available, browser download otherwise.
export async function shareOrDownload(doc: jsPDF, filename: string): Promise<ShareResult> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const base64 = doc.output("datauristring").split(",")[1];
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share({ title: filename, files: [written.uri] });
      return "shared";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(msg)) return "cancelled";
      throw err;
    }
  }

  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  doc.save(filename);
  return "downloaded";
}
