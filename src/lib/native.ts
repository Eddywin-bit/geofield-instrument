import { Capacitor } from "@capacitor/core";

/**
 * Android requires a RUNTIME permission grant before the WebView's
 * navigator.geolocation will return a fix. Declaring it in the manifest is not
 * enough, and a WebView cannot request it itself. We ask once, on first mount,
 * using the Capacitor Geolocation plugin. The app then continues to use
 * navigator.geolocation via the existing geo-acquire.ts convergence routine,
 * which is untouched.
 *
 * On the web this is a no-op: the browser prompts on first use.
 */
export async function ensureLocationPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      await Geolocation.requestPermissions();
    }
  } catch (err) {
    console.warn("[native] location permission request failed", err);
  }
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}
