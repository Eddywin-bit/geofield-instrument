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

// Process noise in metres per second: how much the holder might plausibly have
// moved between readings. It sets the balance between trusting the estimate and
// trusting the next fix, and no single value serves both cases, because the two
// cases want opposite things. Measured at 2.5s updates:
//
//   q     walking lag (25m acc)   wander while still   60m spike moves dot
//   1.5          large                   1.4m                 1.5m
//   3           16.7m                    2.8m                 2.5m
//   10           5.5m                    8.6m                 9.1m
//
// A fixed 3 was the original mistake: it looked fine against an optimistic 6m
// accuracy but over-damps at the 15 to 40m a phone actually reports under tree
// cover, leaving the dot trailing metres behind a walker. So the caller drives
// it from the same movement detection that drives the poll rate: loose while
// moving so the dot keeps up, tight while still so it sits rock steady and
// swallows spikes. That is where each behaviour is actually wanted.
export const PROCESS_NOISE_MOVING_MPS = 10;
export const PROCESS_NOISE_STILL_MPS = 1.5;

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
  /** Retune between readings as the holder starts and stops moving. */
  setProcessNoiseMps: (mps: number) => void;
};

export function createPositionSmoother(
  initialProcessNoiseMps: number = PROCESS_NOISE_MOVING_MPS,
): PositionSmoother {
  let processNoiseMps = initialProcessNoiseMps;
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
    setProcessNoiseMps: (mps: number) => {
      processNoiseMps = Math.max(0.1, mps);
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
