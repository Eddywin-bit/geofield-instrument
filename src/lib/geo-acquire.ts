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
  // Instantaneous ground speed in m/s, when the platform reports one (GNSS
  // Doppler-derived on native/most browsers). Null when unavailable, never
  // estimated here so callers can tell "known stationary" from "unknown".
  speed: number | null;
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
 * Native: @capacitor/geolocation (Play Services fused provider). The location
 * permission is resolved HERE, before the watch starts, and `onStarted` fires
 * only once the watch is live. Field-tested failure this prevents: on first
 * run the permission dialog used to appear while acquireFix's 60s ceiling was
 * already counting, so LOCATE ME timed out during the dialog.
 *
 * Web: navigator.geolocation, unchanged.
 */
export function startPositionWatch(
  onReading: (coords: AcquireCoords) => void,
  onError: (err: GeolocationPositionError | Error) => void,
  onStarted?: () => void,
  opts?: { pump?: boolean },
): PositionWatch {
  if (Capacitor.isNativePlatform()) {
    let stopped = false;
    let release: (() => void) | null = null;
    let pumpTimer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");

        let perm = await Geolocation.checkPermissions();
        const granted = () =>
          perm.location === "granted" || perm.coarseLocation === "granted";
        if (!granted()) {
          perm = await Geolocation.requestPermissions();
        }
        if (stopped) return;
        if (!granted()) {
          const err = new Error(
            "Location permission denied. Allow location for GeoField and try again.",
          );
          (err as unknown as { code: number }).code = 1;
          onError(err);
          return;
        }

        // Instant seed: the phone's cached last-known position, which the
        // fused provider returns in well under a second. Field requirement:
        // LOCATE must show something immediately, and if the fresh watch
        // yields nothing before the ceiling, settling on this seed beats
        // erroring. A coarse seed cannot false-settle convergence: settle
        // needs <=10m accuracy or a 5-reading plateau.
        void Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          maximumAge: 5 * 60_000,
          timeout: 8_000,
        })
          .then((pos) => {
            if (stopped || !pos) return;
            onReading({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed,
            });
          })
          .catch(() => {
            /* no cached fix; the watch carries it */
          });

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
              speed: pos.coords.speed,
            });
          },
        );
        if (stopped) {
          void Geolocation.clearWatch({ id });
          return;
        }
        release = () => void Geolocation.clearWatch({ id });
        onStarted?.();

        // The Android plugin's watch delivers roughly one reading every 10s,
        // which starves the convergence: five readings for a plateau takes
        // ~50s. During an active LOCATE cycle, pump one-shot high-accuracy
        // requests every 2.5s into the same stream. Bounded at 90s and torn
        // down with the watch, so it can never become a battery drain.
        if (opts?.pump) {
          const pumpStarted = Date.now();
          let inFlight = false;
          pumpTimer = setInterval(() => {
            if (stopped || inFlight) return;
            if (Date.now() - pumpStarted > 90_000) {
              if (pumpTimer !== null) clearInterval(pumpTimer);
              pumpTimer = null;
              return;
            }
            inFlight = true;
            Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 9_000,
              maximumAge: 0,
            })
              .then((pos) => {
                if (stopped || !pos) return;
                onReading({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy,
                  speed: pos.coords.speed,
                });
              })
              .catch(() => {
                /* single missed poll; the watch continues */
              })
              .finally(() => {
                inFlight = false;
              });
          }, 2_500);
        }
      } catch (err) {
        onError(err as Error);
      }
    })();

    return {
      stop: () => {
        stopped = true;
        if (pumpTimer !== null) {
          clearInterval(pumpTimer);
          pumpTimer = null;
        }
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
        speed: pos.coords.speed,
      }),
    (err) => onError(err),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
  onStarted?.();

  return {
    stop: () => navigator.geolocation.clearWatch(id),
  };
}

export type CompassWatch = { stop: () => void };

/**
 * Device magnetometer heading (0-360, clockwise from true/magnetic north),
 * for when GPS course is unreliable at walking pace or below. Best-effort:
 * many WebViews and devices have no compass, so a silent no-op watch (never
 * calling onHeading) is a valid outcome, not an error.
 *
 * iOS Safari/WKWebView exposes `webkitCompassHeading` directly on the
 * `deviceorientation` event. Everything else is asked for
 * `deviceorientationabsolute` and derives heading from `alpha`, which is only
 * meaningful when the event reports `absolute: true` (device-frame rotation
 * with no fixed relationship to true/magnetic north otherwise).
 */
export function startCompassWatch(onHeading: (headingDeg: number) => void): CompassWatch {
  if (typeof window === "undefined" || typeof window.DeviceOrientationEvent === "undefined") {
    return { stop: () => {} };
  }

  let stopped = false;
  const handleOrientation = (e: Event) => {
    if (stopped) return;
    const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    if (typeof ev.webkitCompassHeading === "number" && Number.isFinite(ev.webkitCompassHeading)) {
      onHeading(ev.webkitCompassHeading);
      return;
    }
    if (ev.absolute && typeof ev.alpha === "number") {
      onHeading((360 - ev.alpha) % 360);
    }
  };

  const attach = () => {
    if (stopped) return;
    window.addEventListener("deviceorientationabsolute", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation);
  };

  // iOS 13+ requires an explicit, user-gesture-gated permission prompt before
  // any orientation event fires. The request function only exists there.
  const requestPermission = (
    window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    }
  ).requestPermission;
  if (typeof requestPermission === "function") {
    requestPermission()
      .then((state) => {
        if (state === "granted") attach();
      })
      .catch(() => {
        /* permission denied or prompt unavailable; no compass this session */
      });
  } else {
    attach();
  }

  return {
    stop: () => {
      stopped = true;
      window.removeEventListener("deviceorientationabsolute", handleOrientation);
      window.removeEventListener("deviceorientation", handleOrientation);
    },
  };
}

export function acquireFix(h: AcquireHandlers): Acquisition {
  let best: AcquireCoords | null = null;
  const recent: number[] = []; // last 5 accuracies
  let started = Date.now();
  let settled = false;
  let watch: PositionWatch | null = null;
  let ceiling: ReturnType<typeof setTimeout> | null = null;

  const clearCeiling = () => {
    if (ceiling !== null) {
      clearTimeout(ceiling);
      ceiling = null;
    }
  };

  const stop = () => {
    watch?.stop();
    watch = null;
  };

  const settle = () => {
    if (settled || !best) return;
    settled = true;
    clearCeiling();
    stop();
    h.onSettle(best);
  };

  // Armed only once the watch is live (permission resolved, provider
  // subscribed), so time spent on Android's permission dialog does not
  // count against the fix.
  const armCeiling = () => {
    if (settled || ceiling !== null) return;
    started = Date.now();
    ceiling = setTimeout(() => {
      ceiling = null;
      if (best) settle();
      else {
        stop();
        h.onError(new Error("GPS timed out"));
      }
    }, 60_000);
  };

  watch = startPositionWatch(
    (c) => {
      if (settled) return;
      if (!best || c.accuracy < best.accuracy) best = c;

      h.onUpdate(c.accuracy, c);

      // Good fix
      if (c.accuracy <= 10) {
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
          settle();
          return;
        }
      }

      // Safety: also honor 60s elapsed inline
      if (Date.now() - started >= 60_000) {
        settle();
      }
    },
    (err) => {
      if (settled) return;
      clearCeiling();
      stop();
      if (best) {
        settled = true;
        h.onSettle(best);
      } else {
        h.onError(err);
      }
    },
    armCeiling,
    { pump: true },
  );

  return {
    stop: () => {
      clearCeiling();
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
