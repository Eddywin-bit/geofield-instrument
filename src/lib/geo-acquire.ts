// Convergence-based GPS acquisition built on watchPosition.
// Settles on: accuracy <= 10m, or no >2m improvement across last 5 readings,
// or 60s elapsed. Reports every live reading; resets state per cycle.

export type AcquireCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type AcquireHandlers = {
  onUpdate: (accuracy: number, coords: AcquireCoords) => void;
  onSettle: (best: AcquireCoords) => void;
  onError: (err: GeolocationPositionError | Error) => void;
};

export type Acquisition = { stop: () => void };

export function acquireFix(h: AcquireHandlers): Acquisition {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    h.onError(new Error("Geolocation not available"));
    return { stop: () => {} };
  }

  let best: AcquireCoords | null = null;
  const recent: number[] = []; // last 5 accuracies
  const started = Date.now();
  let watchId: number | null = null;
  let settled = false;

  const stop = () => {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  };

  const settle = () => {
    if (settled || !best) return;
    settled = true;
    stop();
    h.onSettle(best);
  };

  // Hard 60s ceiling
  const ceiling = setTimeout(() => {
    if (best) settle();
    else {
      stop();
      h.onError(new Error("GPS timed out"));
    }
  }, 60_000);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const c: AcquireCoords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      if (!best || c.accuracy < best.accuracy) best = c;

      h.onUpdate(c.accuracy, c);

      // Good fix
      if (c.accuracy <= 10) {
        clearTimeout(ceiling);
        settle();
        return;
      }

      // Plateau detection across last 5 readings
      recent.push(c.accuracy);
      if (recent.length > 5) recent.shift();
      if (recent.length === 5) {
        const max = Math.max(...recent);
        const min = Math.min(...recent);
        if (max - min <= 2) {
          clearTimeout(ceiling);
          settle();
          return;
        }
      }

      // Safety: also honor 60s elapsed inline
      if (Date.now() - started >= 60_000) {
        clearTimeout(ceiling);
        settle();
      }
    },
    (err) => {
      clearTimeout(ceiling);
      stop();
      if (best) {
        settled = true;
        h.onSettle(best);
      } else {
        h.onError(err);
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );

  return {
    stop: () => {
      clearTimeout(ceiling);
      stop();
    },
  };
}

export function accuracyTone(a: number | null): "muted" | "good" | "ok" | "bad" {
  if (a === null) return "muted";
  if (a <= 10) return "good";
  if (a <= 30) return "ok";
  return "bad";
}

export function accuracyToneClass(a: number | null): string {
  switch (accuracyTone(a)) {
    case "good":
      return "text-success";
    case "ok":
      return "text-primary";
    case "bad":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function accuracyBarClass(a: number | null): string {
  switch (accuracyTone(a)) {
    case "good":
      return "bg-success";
    case "ok":
      return "bg-primary";
    case "bad":
      return "bg-destructive";
    default:
      return "bg-border";
  }
}

// =========================================================================
// High-precision (static averaging) fix.
// Collects samples over a window and combines them with inverse-variance
// weighting. Reports a CONSERVATIVE effective accuracy.
// =========================================================================

export type HighPrecisionResult = {
  latitude: number;
  longitude: number;
  accuracy: number; // effectiveAccuracy, conservative
  sampleCount: number;
  averaged: true;
  lowConfidence?: boolean;
};

export type HighPrecisionProgress = {
  sampleCount: number;
  bestAccuracy: number | null;
  elapsedSec: number;
  runningAccuracy: number | null; // current averaged effective accuracy
};

export type HighPrecisionHandlers = {
  onProgress: (p: HighPrecisionProgress) => void;
  onComplete: (r: HighPrecisionResult) => void;
  onError: (err: GeolocationPositionError | Error) => void;
};

export type HighPrecisionAcquisition = { cancel: () => void };

type Sample = { lat: number; lng: number; accuracy: number };

function computeAveraged(samplesIn: Sample[]): {
  latitude: number;
  longitude: number;
  effectiveAccuracy: number;
  bestAcc: number;
  count: number;
} {
  // Optional outlier removal
  const goodCount = samplesIn.filter((s) => s.accuracy <= 50).length;
  const samples =
    samplesIn.length >= 5 && goodCount >= 5
      ? samplesIn.filter((s) => s.accuracy <= 50)
      : samplesIn;

  let sumW = 0;
  let sumWLat = 0;
  let sumWLng = 0;
  let bestAcc = Infinity;
  for (const s of samples) {
    const w = 1 / (s.accuracy * s.accuracy);
    sumW += w;
    sumWLat += w * s.lat;
    sumWLng += w * s.lng;
    if (s.accuracy < bestAcc) bestAcc = s.accuracy;
  }
  const avgLat = sumWLat / sumW;
  const avgLng = sumWLng / sumW;

  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  let sumD2 = 0;
  for (const s of samples) {
    const dx = (s.lng - avgLng) * mPerDegLng;
    const dy = (s.lat - avgLat) * mPerDegLat;
    sumD2 += dx * dx + dy * dy;
  }
  const scatterRMS = Math.sqrt(sumD2 / samples.length);
  const effectiveAccuracy = Math.max(bestAcc / 2, scatterRMS, 4);

  return {
    latitude: avgLat,
    longitude: avgLng,
    effectiveAccuracy,
    bestAcc,
    count: samples.length,
  };
}

export function acquireHighPrecisionFix(
  h: HighPrecisionHandlers,
  opts?: { windowMs?: number; minSamples?: number },
): HighPrecisionAcquisition {
  const windowMs = opts?.windowMs ?? 60_000;
  const minSamples = opts?.minSamples ?? 30;

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    h.onError(new Error("Geolocation not available"));
    return { cancel: () => {} };
  }

  const started = Date.now();
  const samples: Sample[] = [];
  const recentAvgPositions: { lat: number; lng: number }[] = [];
  let firstSkipped = false;
  let watchId: number | null = null;
  let done = false;

  const stopWatch = () => {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  };

  const finalize = () => {
    if (done) return;
    done = true;
    stopWatch();
    clearTimeout(ceiling);

    if (samples.length === 0) {
      h.onError(new Error("No GPS samples acquired"));
      return;
    }
    if (samples.length < 5) {
      // Fallback: best single sample, low confidence
      const best = samples.reduce((a, b) => (a.accuracy <= b.accuracy ? a : b));
      h.onComplete({
        latitude: best.lat,
        longitude: best.lng,
        accuracy: Math.max(best.accuracy, 4),
        sampleCount: samples.length,
        averaged: true,
        lowConfidence: true,
      });
      return;
    }
    const r = computeAveraged(samples);
    h.onComplete({
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.effectiveAccuracy,
      sampleCount: r.count,
      averaged: true,
    });
  };

  const ceiling = setTimeout(finalize, windowMs);

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (!firstSkipped) {
        firstSkipped = true;
        return;
      }
      const s: Sample = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      samples.push(s);

      let runningAccuracy: number | null = null;
      let bestAcc: number | null = null;
      if (samples.length >= 2) {
        const r = computeAveraged(samples);
        runningAccuracy = r.effectiveAccuracy;
        bestAcc = r.bestAcc;
        recentAvgPositions.push({ lat: r.latitude, lng: r.longitude });
        if (recentAvgPositions.length > 5) recentAvgPositions.shift();
      } else {
        bestAcc = s.accuracy;
      }

      const elapsedSec = (Date.now() - started) / 1000;
      h.onProgress({
        sampleCount: samples.length,
        bestAccuracy: bestAcc,
        elapsedSec,
        runningAccuracy,
      });

      // Early stabilisation: >= minSamples and last several averaged positions
      // moved < 1m total range.
      if (samples.length >= minSamples && recentAvgPositions.length === 5) {
        const lat0 = recentAvgPositions[0].lat;
        const lng0 = recentAvgPositions[0].lng;
        const mPerDegLat = 111320;
        const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
        let maxD = 0;
        for (const p of recentAvgPositions) {
          const dx = (p.lng - lng0) * mPerDegLng;
          const dy = (p.lat - lat0) * mPerDegLat;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > maxD) maxD = d;
        }
        if (maxD < 1) finalize();
      }
    },
    (err) => {
      if (samples.length >= 5) {
        finalize();
      } else {
        done = true;
        stopWatch();
        clearTimeout(ceiling);
        h.onError(err);
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );

  return {
    cancel: () => {
      // Cancel: if we have enough samples, finalize; else abort.
      if (samples.length >= 5) {
        finalize();
      } else {
        done = true;
        stopWatch();
        clearTimeout(ceiling);
      }
    },
  };
}
