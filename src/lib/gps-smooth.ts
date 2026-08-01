// Display-only smoothing for the map's blue dot.
//
// Nothing here touches what gets logged. Observations keep the raw measured
// coordinate from geo-acquire's best-fix convergence, because an observation
// records where the phone said you were, not where a filter guessed. This is
// purely about the dot on the map not lurching around while you walk.
//
// The filter is the standard accuracy-weighted GPS Kalman: one dimension of
// uncertainty (variance, in square metres) tracked alongside the position.
// Between readings the uncertainty grows in proportion to how long it has been
// and how fast the holder might plausibly have moved. On each reading the gain
// k decides how far to step toward the measurement:
//
//   k = variance / (variance + accuracy^2)
//
// so a tight fix (small accuracy) pulls the dot most of the way, while a loose
// fix barely moves it. That is the whole reason to prefer this over averaging
// the last N points: it already knows which readings deserve trust, and the
// phone tells us the accuracy of every single one.

export type SmoothedPosition = { lat: number; lng: number };

// Process noise in metres per second: how far the holder might drift between
// readings. Higher tracks harder and reacts faster, lower is smoother but
// lags. 3 m/s sits above walking pace (~1.4 m/s), which keeps the dot honest
// when you actually move while still absorbing a single wild fix. This is the
// dial to turn if the dot ever feels sluggish or twitchy in the field.
const PROCESS_NOISE_MPS = 3;

// A jump beyond this is not noise, it is a different place: the app was
// resumed across town, or the fused provider handed over from a stale network
// fix to real GNSS. Easing across it would drag a visible line over the map
// and briefly show positions the holder was never at, so restart clean.
const TELEPORT_METRES = 500;

const EARTH_RADIUS_M = 6_371_000;

// Equirectangular approximation. Exact enough well past the teleport
// threshold, and far cheaper than haversine for something run on every fix.
export function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = Math.PI / 180;
  const x = (bLng - aLng) * toRad * Math.cos(((aLat + bLat) / 2) * toRad);
  const y = (bLat - aLat) * toRad;
  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_M;
}

export type PositionSmoother = {
  /** Feed one reading, get the position the dot should move toward. */
  push: (lat: number, lng: number, accuracyM: number, atMs: number) => SmoothedPosition;
  /** Drop all history, so the next reading is taken at face value. */
  reset: () => void;
};

export function createPositionSmoother(
  processNoiseMps: number = PROCESS_NOISE_MPS,
): PositionSmoother {
  let lat = 0;
  let lng = 0;
  // Negative marks "no estimate yet", which is why this is not `null`: it also
  // carries the uncertainty once seeded, in square metres.
  let variance = -1;
  let lastMs = 0;

  const seed = (nextLat: number, nextLng: number, accuracy: number, atMs: number) => {
    lat = nextLat;
    lng = nextLng;
    variance = accuracy * accuracy;
    lastMs = atMs;
  };

  return {
    reset: () => {
      variance = -1;
    },
    push: (nextLat, nextLng, accuracyM, atMs) => {
      // A phone reporting 0 m would make the gain 1 and the filter a no-op;
      // a metre is the floor of what consumer GNSS can actually resolve.
      const accuracy = Math.max(Number.isFinite(accuracyM) ? accuracyM : 50, 1);

      if (variance < 0 || metresBetween(lat, lng, nextLat, nextLng) > TELEPORT_METRES) {
        seed(nextLat, nextLng, accuracy, atMs);
        return { lat, lng };
      }

      const dtMs = atMs - lastMs;
      if (dtMs > 0) {
        // Uncertainty grows with elapsed time: after a long gap the old
        // estimate is worth little and the next reading is trusted more, which
        // is what stops the dot from lagging when readings resume.
        variance += (dtMs * processNoiseMps * processNoiseMps) / 1000;
        lastMs = atMs;
      }

      const k = variance / (variance + accuracy * accuracy);
      lat += k * (nextLat - lat);
      lng += k * (nextLng - lng);
      variance = (1 - k) * variance;
      return { lat, lng };
    },
  };
}
