import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Camera, Mic, MicOff, Check, MapPin } from "lucide-react";
import { addLog, formatCoord, formatTime } from "../lib/logs-store";

export const Route = createFileRoute("/log")({
  head: () => ({ meta: [{ title: "GeoField — Log Observation" }] }),
  component: LogScreen,
});

function LogScreen() {
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [recording, setRecording] = useState(false);
  const [hasVoice, setHasVoice] = useState(false);
  const [saving, setSaving] = useState(false);

  // simulated current context
  const ctx = {
    unit: "Tarkwaian Banket Series",
    belt: "Ashanti Belt",
    lat: 6.3361,
    lng: -2.0042,
    accuracy: 4.2,
    timestamp: Date.now(),
  };

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
      hasVoice,
    });
    setTimeout(() => navigate({ to: "/my-logs" }), 500);
  };

  return (
    <AppLayout>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Log Observation</h1>
          <span className="label-instrument">SCREEN 02</span>
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
          <Row label="Position" value={`${formatCoord(ctx.lat)} N · ${formatCoord(ctx.lng)} W`} mono />
          <Row label="Accuracy" value={`± ${ctx.accuracy.toFixed(1)} m`} mono />
          <Row label="Time" value={formatTime(ctx.timestamp)} mono />
        </div>
      </div>

      {/* Capture actions */}
      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <CaptureTile
          active={hasPhoto}
          onClick={() => setHasPhoto((v) => !v)}
          icon={<Camera className="h-7 w-7" strokeWidth={2.2} />}
          label="PHOTO"
          status={hasPhoto ? "Captured" : "Tap to capture"}
        />
        <CaptureTile
          active={hasVoice}
          onClick={() => {
            if (recording) {
              setRecording(false);
              setHasVoice(true);
            } else {
              setRecording(true);
              setTimeout(() => {
                setRecording(false);
                setHasVoice(true);
              }, 1500);
            }
          }}
          icon={
            recording ? (
              <MicOff className="h-7 w-7 animate-pulse" strokeWidth={2.2} />
            ) : (
              <Mic className="h-7 w-7" strokeWidth={2.2} />
            )
          }
          label={recording ? "RECORDING" : "VOICE"}
          status={hasVoice ? "0:08 saved" : recording ? "Tap to stop" : "Tap to record"}
        />
      </div>

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
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="label-instrument">{label}</span>
      </div>
      <span className={`text-sm font-semibold text-right truncate ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}

function CaptureTile({
  icon,
  label,
  status,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-28 rounded-lg border flex flex-col items-center justify-center gap-1 transition-colors ${
        active
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
