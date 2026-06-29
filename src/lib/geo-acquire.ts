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
      return "text-warning";
    case "bad":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}
