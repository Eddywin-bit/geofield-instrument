import { useState } from "react";
import proj4 from "proj4";
import { useBackHandler } from "../lib/back-button";

export type ManualCoords = { latitude: number; longitude: number };

type Format = "DD" | "DDM" | "DMS" | "UTM";

export function ManualCoordsSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (c: ManualCoords) => void;
}) {
  const [format, setFormat] = useState<Format>("DDM");
  const [error, setError] = useState<string | null>(null);

  // DD
  const [ddLat, setDdLat] = useState("");
  const [ddLng, setDdLng] = useState("");

  // DDM
  const [latDeg, setLatDeg] = useState("");
  const [latMin, setLatMin] = useState("");
  const [latHem, setLatHem] = useState<"N" | "S">("N");
  const [lngDeg, setLngDeg] = useState("");
  const [lngMin, setLngMin] = useState("");
  const [lngHem, setLngHem] = useState<"E" | "W">("W");

  // DMS
  const [latDegD, setLatDegD] = useState("");
  const [latMinD, setLatMinD] = useState("");
  const [latSecD, setLatSecD] = useState("");
  const [latHemD, setLatHemD] = useState<"N" | "S">("N");
  const [lngDegD, setLngDegD] = useState("");
  const [lngMinD, setLngMinD] = useState("");
  const [lngSecD, setLngSecD] = useState("");
  const [lngHemD, setLngHemD] = useState<"E" | "W">("W");

  // UTM
  const [utmZone, setUtmZone] = useState<"30" | "31">("30");
  const [easting, setEasting] = useState("");
  const [northing, setNorthing] = useState("");

  // Android hardware back closes the sheet instead of leaving the Locate screen.
  useBackHandler(open, onClose);

  if (!open) return null;

  const parseNum = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const submit = () => {
    setError(null);
    try {
      let lat: number;
      let lng: number;

      if (format === "DD") {
        const a = parseNum(ddLat);
        const b = parseNum(ddLng);
        if (a === null || b === null) throw new Error("Enter numeric latitude and longitude.");
        if (a < -90 || a > 90) throw new Error("Latitude must be between -90 and 90.");
        if (b < -180 || b > 180) throw new Error("Longitude must be between -180 and 180.");
        lat = a;
        lng = b;
      } else if (format === "DDM") {
        // Hemisphere selector encodes sign; degrees/minutes are magnitudes.
        const ld = parseNum(latDeg);
        const lm = parseNum(latMin);
        const gd = parseNum(lngDeg);
        const gm = parseNum(lngMin);
        if (ld === null || lm === null || gd === null || gm === null)
          throw new Error("Enter all degree and minute values.");
        const HEMI_HINT =
          "Enter degrees as a positive number and use the N/S (or E/W) selector to set direction.";
        if (ld < 0 || ld > 90 || gd < 0 || gd > 180) throw new Error(HEMI_HINT);
        if (lm < 0 || lm >= 60 || gm < 0 || gm >= 60)
          throw new Error("Minutes must be between 0 and 60.");
        lat = (Math.abs(ld) + lm / 60) * (latHem === "S" ? -1 : 1);
        lng = (Math.abs(gd) + gm / 60) * (lngHem === "W" ? -1 : 1);
      } else if (format === "DMS") {
        // Hemisphere selector encodes sign; degrees/minutes/seconds are magnitudes.
        const ld = parseNum(latDegD);
        const lm = parseNum(latMinD);
        const ls = parseNum(latSecD);
        const gd = parseNum(lngDegD);
        const gm = parseNum(lngMinD);
        const gs = parseNum(lngSecD);
        if (ld === null || lm === null || ls === null || gd === null || gm === null || gs === null)
          throw new Error("Enter all degree, minute and second values.");
        const HEMI_HINT =
          "Enter degrees as a positive number and use the N/S (or E/W) selector to set direction.";
        if (ld < 0 || ld > 90 || gd < 0 || gd > 180) throw new Error(HEMI_HINT);
        if (lm < 0 || lm >= 60 || gm < 0 || gm >= 60)
          throw new Error("Minutes must be between 0 and 60.");
        if (ls < 0 || ls >= 60 || gs < 0 || gs >= 60)
          throw new Error("Seconds must be between 0 and 60.");
        lat = (Math.abs(ld) + lm / 60 + ls / 3600) * (latHemD === "S" ? -1 : 1);
        lng = (Math.abs(gd) + gm / 60 + gs / 3600) * (lngHemD === "W" ? -1 : 1);
      } else {
        const e = parseNum(easting);
        const n = parseNum(northing);
        if (e === null || n === null) throw new Error("Enter easting and northing.");
        if (e <= 0 || n <= 0) throw new Error("Easting and northing must be positive.");
        const proj = `+proj=utm +zone=${utmZone} +datum=WGS84 +units=m +no_defs`;
        const [outLng, outLat] = proj4(proj, "EPSG:4326", [e, n]) as [number, number];
        lat = outLat;
        lng = outLng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng))
          throw new Error("Could not convert UTM coordinates.");
      }

      onSubmit({ latitude: lat, longitude: lng });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid coordinates.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-panel border-t border-border rounded-t-lg p-4 pb-8 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="label-instrument mb-3">Enter Coordinates Manually</div>

        {/* Format toggle */}
        <div className="grid grid-cols-4 gap-1 rounded-md border border-border bg-panel-2 p-1 mb-4">
          {(["DD", "DDM", "DMS", "UTM"] as Format[]).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFormat(f);
                setError(null);
              }}
              className={`h-9 rounded text-xs font-bold tracking-[0.18em] ${
                format === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {format === "DD" && (
          <div className="space-y-3">
            <Field label="Latitude">
              <NumInput value={ddLat} onChange={setDdLat} placeholder="6.67450" />
            </Field>
            <Field label="Longitude">
              <NumInput value={ddLng} onChange={setDdLng} placeholder="-1.57160" />
            </Field>
          </div>
        )}

        {format === "DDM" && (
          <div className="space-y-3">
            <Field label="Latitude (deg / min / hemi)">
              <div className="grid grid-cols-[1fr_1.3fr_4.5rem] gap-2">
                <NumInput value={latDeg} onChange={(v) => setLatDeg(v.replace(/^-+/, ""))} placeholder="6" />
                <NumInput value={latMin} onChange={setLatMin} placeholder="40.470" />
                <HemiToggle
                  value={latHem}
                  onChange={(v) => setLatHem(v as "N" | "S")}
                  options={["N", "S"]}
                />
              </div>
            </Field>
            <Field label="Longitude (deg / min / hemi)">
              <div className="grid grid-cols-[1fr_1.3fr_4.5rem] gap-2">
                <NumInput value={lngDeg} onChange={(v) => setLngDeg(v.replace(/^-+/, ""))} placeholder="1" />
                <NumInput value={lngMin} onChange={setLngMin} placeholder="34.296" />
                <HemiToggle
                  value={lngHem}
                  onChange={(v) => setLngHem(v as "E" | "W")}
                  options={["E", "W"]}
                />
              </div>
            </Field>
          </div>
        )}

        {format === "DMS" && (
          <div className="space-y-3">
            <Field label="Latitude (deg / min / sec / hemi)">
              <div className="grid grid-cols-[1fr_1fr_1.3fr_4.5rem] gap-2">
                <NumInput value={latDegD} onChange={(v) => setLatDegD(v.replace(/^-+/, ""))} placeholder="6" />
                <NumInput value={latMinD} onChange={setLatMinD} placeholder="40" />
                <NumInput value={latSecD} onChange={setLatSecD} placeholder="42.8" />
                <HemiToggle
                  value={latHemD}
                  onChange={(v) => setLatHemD(v as "N" | "S")}
                  options={["N", "S"]}
                />
              </div>
            </Field>
            <Field label="Longitude (deg / min / sec / hemi)">
              <div className="grid grid-cols-[1fr_1fr_1.3fr_4.5rem] gap-2">
                <NumInput value={lngDegD} onChange={(v) => setLngDegD(v.replace(/^-+/, ""))} placeholder="1" />
                <NumInput value={lngMinD} onChange={setLngMinD} placeholder="33" />
                <NumInput value={lngSecD} onChange={setLngSecD} placeholder="53.7" />
                <HemiToggle
                  value={lngHemD}
                  onChange={(v) => setLngHemD(v as "E" | "W")}
                  options={["E", "W"]}
                />
              </div>
            </Field>
          </div>
        )}

        {format === "UTM" && (
          <div className="space-y-3">
            <Field label="Zone / Hemisphere">
              <div className="grid grid-cols-[1fr_1fr_4.5rem] gap-2">
                <button
                  onClick={() => setUtmZone("30")}
                  className={`h-11 rounded-md border text-sm font-bold mono ${
                    utmZone === "30"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-panel-2 text-foreground"
                  }`}
                >
                  30
                </button>
                <button
                  onClick={() => setUtmZone("31")}
                  className={`h-11 rounded-md border text-sm font-bold mono ${
                    utmZone === "31"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-panel-2 text-foreground"
                  }`}
                >
                  31
                </button>
                <div className="h-11 rounded-md border border-border bg-panel-2 flex items-center justify-center mono text-sm font-bold text-muted-foreground">
                  N
                </div>
              </div>
            </Field>
            <Field label="Easting (m)">
              <NumInput value={easting} onChange={setEasting} placeholder="657820" />
            </Field>
            <Field label="Northing (m)">
              <NumInput value={northing} onChange={setNorthing} placeholder="737540" />
            </Field>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="h-12 rounded-lg border border-border bg-panel-2 text-sm font-semibold tracking-wide hover:bg-panel"
          >
            CANCEL
          </button>
          <button
            onClick={submit}
            className="h-12 rounded-lg bg-primary text-primary-foreground text-sm font-bold tracking-[0.18em] active:scale-[0.99] transition-transform"
          >
            USE COORDINATES
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-instrument mb-1">{label}</div>
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      inputMode="decimal"
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mono w-full h-11 rounded-md bg-panel-2 border border-border px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
    />
  );
}

function HemiToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string];
}) {
  return (
    <div className="grid grid-cols-2 rounded-md border border-border bg-panel-2 overflow-hidden">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`h-11 text-xs font-bold mono ${
            value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
