// Convergence-based GPS acquisition.
// Settles on: accuracy <= 10m, or no >2m improvement across last 5 readings,
// or 60s elapsed. Reports every live reading; resets state per cycle.
//
// The convergence rule is field-tested and unchanged: keep the single best fix
// rather than averaging correlated readings.

import { Capacitor } from "@capacitor/core";

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

export type PositionWatch = { stop: () => void };

/**
 * The only place in the app that decides where position readings come from.
 *
 * Native: @capacitor/geolocation, which on Android is Google Play Services'
 * FusedLocationProviderClient at PRIORITY_HIGH_ACCURACY. It fuses GNSS, wifi,
 * cell and motion sensors, so a reading arrives within seconds, indoors or out.
 *
 * Web: navigator.geolocation, unchanged. In a real browser this is backed by
 * the network location service, so the PWA keeps behaving exactly as before.
 *
 * Do NOT use navigator.geolocation on native. The Android WebView exposes no
 * network-location fallback, so enableHighAccuracy binds to the raw satellite
 * provider alone and times out indoors. That was the bug this replaces.
 */
export function startPositionWatch(
  onReading: (coords: AcquireCoords) => void,
  onError: (err: GeolocationPositionError | Error) => void,
): PositionWatch {
  if (Capacitor.isNativePlatform()) {
    let stopped = false;
    let release: (() => void) | null = null;

    void (async () => {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 60_000, maximumAge: 0 },
          (pos, err) => {
            if (err) {
              onError(err as unknown as Error);
              return;
            }
            if (!pos) return;
            onReading({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          },
        );
        if (stopped) {
          void Geolocation.clearWatch({ id });
          return;
        }
        release = () => void Geolocation.clearWatch({ id });
      } catch (err) {
        onError(err as Error);
      }
    })();

    return {
      stop: () => {
        stopped = true;
        release?.();
        release = null;
      },
    };
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError(new Error("Geolocation not available"));
    return { stop: () => {} };
  }

  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onReading({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
    (err) => onError(err),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );

  return {
    stop: () => navigator.geolocation.clearWatch(id),
  };
}

export function acquireFix(h: AcquireHandlers): Acquisition {
  let best: AcquireCoords | null = null;
  const recent: number[] = []; // last 5 accuracies
  const started = Date.now();
  let settled = false;
  let watch: PositionWatch | null = null;

  const stop = () => {
    watch?.stop();
    watch = null;
  };

  const settle = () => {
    if (settled || !best) return;
    settled = true;
    stop();
    h.onSettle(best);
  };

  // Hard 60s ceiling. On native this is the only timeout: the fused provider
  // streams readings and does not time out on its own.
  const ceiling = setTimeout(() => {
    if (best) settle();
    else {
      stop();
      h.onError(new Error("GPS timed out"));
    }
  }, 60_000);

  watch = startPositionWatch(
    (c) => {
      if (settled) return;
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
      if (settled) return;
      clearTimeout(ceiling);
      stop();
      if (best) {
        settled = true;
        h.onSettle(best);
      } else {
        h.onError(err);
      }
    },
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
