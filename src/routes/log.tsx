import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { ImageViewer } from "../components/ImageViewer";
import { Camera, Mic, Check, MapPin, Square, X } from "lucide-react";
import { addLog, formatCoord, formatTime } from "../lib/logs-store";
import { readCurrentFix } from "./index";
import { loadGeology, findUnitAt, unitByName } from "../lib/geology";
import { acquireFix, accuracyToneClass, type Acquisition } from "../lib/geo-acquire";

export const Route = createFileRoute("/log")({
  head: () => ({ meta: [{ title: "GeoField — Log Observation" }] }),
  validateSearch: (search: Record<string, unknown>): { fresh?: boolean } => ({
    fresh: search.fresh === true || search.fresh === "true" ? true : undefined,
  }),
  component: LogScreen,
});

type Ctx = {
  unit: string;
  belt: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  manual: boolean;
  timestamp: number;
};

function hasRealFix(c: { lat: number | null; lng: number | null }) {
  return c.lat !== null && c.lng !== null && !(c.lat === 0 && c.lng === 0);
}

function LogScreen() {
  const navigate = useNavigate();
  const fresh = Route.useSearch({ select: (s) => s.fresh === true });
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [ctx, setCtx] = useState<Ctx>(() => {
    const f = fresh ? null : readCurrentFix();
    const hasFix = !!f && !(f.lat === 0 && f.lng === 0);
    return {
      unit: f?.unit ?? "Unmapped",
      belt: f?.belt ?? "—",
      lat: hasFix ? f!.lat : null,
      lng: hasFix ? f!.lng : null,
      accuracy: hasFix ? f!.accuracy : null,
      manual: hasFix ? !!f!.manual : false,
      timestamp: Date.now(),
    };
  });

  // Live clock for the Time field
  useEffect(() => {
    const id = setInterval(() => setCtx((c) => ({ ...c, timestamp: Date.now() })), 1000);
    return () => clearInterval(id);
  }, []);

  const acqRef = useRef<Acquisition | null>(null);

  // Auto-acquire fix if we don't have a real one, or always when `fresh` is set
  useEffect(() => {
    if (!fresh && hasRealFix(ctx)) return;
    if (fresh) {
      setCtx((c) => ({ ...c, lat: null, lng: null, accuracy: null, manual: false }));
      // Clear the fresh flag so a reload doesn't re-trigger
      navigate({ to: "/log", search: {}, replace: true });
    }
    setLocating(true);
    acqRef.current?.stop();
    acqRef.current = acquireFix({
      onUpdate: async (accuracy, coords) => {
        try {
          const geo = await loadGeology();
          const name = findUnitAt(coords.longitude, coords.latitude, geo.geo);
          const unit = unitByName(geo.units, name);
          setCtx((c) => ({
            ...c,
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy,
            unit: unit?.unit_name ?? c.unit,
            belt: unit?.also_known_as ?? c.belt,
          }));
        } catch {
          setCtx((c) => ({ ...c, lat: coords.latitude, lng: coords.longitude, accuracy }));
        }
      },
      onSettle: async (best) => {
        try {
          const geo = await loadGeology();
          const name = findUnitAt(best.longitude, best.latitude, geo.geo);
          const unit = unitByName(geo.units, name);
          setCtx((c) => ({
            ...c,
            lat: best.latitude,
            lng: best.longitude,
            accuracy: best.accuracy,
            unit: unit?.unit_name ?? "Unmapped",
            belt: unit?.also_known_as ?? "Outside mapped sheets",
          }));
        } catch {
          setCtx((c) => ({
            ...c,
            lat: best.latitude,
            lng: best.longitude,
            accuracy: best.accuracy,
          }));
        } finally {
          setLocating(false);
        }
      },
      onError: () => {
        setLocating(false);
        setCtx((c) => ({ ...c, lat: null, lng: null, accuracy: null }));
      },
    });
    return () => {
      acqRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { /* ignore */ }
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  const startRecording = async () => {
    setVoiceError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Microphone not available on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""];
      const mime = candidates.find((m) => m === "" || MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") setVoice(reader.result);
        };
        reader.readAsDataURL(blob);
        releaseMic();
        setRecording(false);
      };
      rec.start();
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = setInterval(() => setRecordSec((s) => s + 1), 1000);
    } catch {
      setVoiceError("Microphone permission denied.");
      releaseMic();
    }
  };

  const toggleVoice = () => {
    if (recording) stopRecording();
    else void startRecording();
  };

  const clearVoice = () => {
    setVoice(null);
    setVoiceError(null);
  };

  useEffect(() => {
    return () => {
      stopRecording();
      releaseMic();
    };
  }, []);

  const save = () => {
    setSaving(true);
    addLog({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      unit: ctx.unit,
      belt: ctx.belt,
      lat: ctx.lat,
      lng: ctx.lng,
      accuracy: ctx.accuracy,
      note: note || "(no note)",
      photo: photo ?? undefined,
      voice: voice ?? undefined,
      hasVoice: !!voice,
    });
    setTimeout(() => navigate({ to: "/my-logs" }), 400);
  };

  const positionDisplay =
    ctx.lat !== null && ctx.lng !== null
      ? `${formatCoord(ctx.lat)} ${ctx.lat >= 0 ? "N" : "S"} · ${formatCoord(ctx.lng)} ${ctx.lng >= 0 ? "E" : "W"}`
      : locating
      ? "Locating…"
      : "—";

  const accuracyDisplay =
    ctx.accuracy !== null
      ? `± ${ctx.accuracy.toFixed(1)} m`
      : ctx.manual
      ? "Manual entry"
      : locating
      ? "Locating…"
      : "—";

  const positionMuted = ctx.lat === null || ctx.lng === null;
  const accuracyMuted = ctx.accuracy === null;
  const accuracyClass = ctx.accuracy !== null ? accuracyToneClass(ctx.accuracy) : "";

  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Log Observation</h1>
        </div>
      </div>

      {/* Auto-attached context */}
      <div className="mx-4 rounded-lg border border-border bg-panel">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="label-instrument">Auto-attached</span>
        </div>
        <div className="p-4 space-y-2">
          <Row icon={<MapPin className="h-4 w-4 text-primary" />} label="Unit" value={ctx.unit} />
          <Row label="Position" value={positionDisplay} mono muted={positionMuted} />
          <Row label="Accuracy" value={accuracyDisplay} mono muted={accuracyMuted} valueClass={accuracyClass} />
          <Row label="Time" value={formatTime(ctx.timestamp)} mono />
        </div>
      </div>

      {/* Capture actions */}
      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPickPhoto}
        />
        <CaptureTile
          active={!!photo}
          onClick={() => fileRef.current?.click()}
          icon={<Camera className="h-7 w-7" strokeWidth={2.2} />}
          label="PHOTO"
          status={photo ? "Captured" : "Tap to capture"}
        />
        <CaptureTile
          active={!!voice || recording}
          onClick={toggleVoice}
          icon={
            recording ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                <Square className="h-6 w-6" strokeWidth={2.2} fill="currentColor" />
              </span>
            ) : (
              <Mic className="h-7 w-7" strokeWidth={2.2} />
            )
          }
          label={recording ? "RECORDING" : "VOICE"}
          status={
            recording
              ? `${recordSec}s · tap to stop`
              : voice
              ? "Captured"
              : "Tap to record"
          }
        />
      </div>

      {(voice || voiceError) && (
        <div className="px-4 mt-3 space-y-2">
          {voiceError && (
            <div className="rounded-md border border-destructive/60 bg-destructive/5 p-2 text-xs text-destructive">
              {voiceError}
            </div>
          )}
          {voice && (
            <div className="rounded-lg border border-border bg-panel p-3 flex items-center gap-3">
              <audio src={voice} controls className="flex-1 min-w-0" />
              <button
                type="button"
                onClick={clearVoice}
                aria-label="Discard recording"
                className="h-9 w-9 shrink-0 rounded-md border border-border text-muted-foreground flex items-center justify-center hover:bg-panel-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {photo && (
        <div className="px-4 mt-3">
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="block w-full rounded-lg border border-border bg-black/40 overflow-hidden"
            aria-label="Open photo full screen"
          >
            <img
              src={photo}
              alt="Observation"
              className="w-full h-40 object-contain"
            />
          </button>
        </div>
      )}
      {viewing && photo && <ImageViewer src={photo} onClose={() => setViewing(false)} />}


      {/* Short note */}
      <div className="px-4 mt-3">
        <label className="label-instrument">Short Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. quartz vein, pyrite stringers…"
          rows={3}
          className="mt-1 w-full rounded-lg bg-panel border border-border p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
        />
      </div>

      {/* Save */}
      <div className="px-4 mt-5">
        <button
          onClick={save}
          disabled={saving}
          className="w-full h-16 rounded-lg bg-primary text-primary-foreground font-bold tracking-[0.2em] text-base flex items-center justify-center gap-3 active:scale-[0.99] transition-transform disabled:opacity-70"
        >
          <Check className="h-6 w-6" strokeWidth={3} />
          {saving ? "SAVED" : "SAVE OBSERVATION"}
        </button>
      </div>
    </AppLayout>
  );
}

function Row({
  label,
  value,
  icon,
  mono,
  muted,
  valueClass,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
  muted?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="label-instrument">{label}</span>
      </div>
      <span
        className={`text-sm font-semibold text-right truncate ${mono ? "mono" : ""} ${
          muted ? "text-muted-foreground" : ""
        } ${valueClass ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function CaptureTile({
  icon,
  label,
  status,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-28 rounded-lg border flex flex-col items-center justify-center gap-1 transition-colors ${
        disabled
          ? "bg-panel border-border text-muted-foreground opacity-60 cursor-not-allowed"
          : active
          ? "bg-primary/10 border-primary text-primary"
          : "bg-panel border-border text-foreground hover:bg-panel-2"
      }`}
    >
      {icon}
      <span className="text-xs font-bold tracking-[0.18em] mt-1">{label}</span>
      <span className="text-[10px] text-muted-foreground">{status}</span>
    </button>
  );
}
