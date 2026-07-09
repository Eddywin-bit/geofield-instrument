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

export type LocationReadiness =
  | { ok: true }
  | { ok: false; reason: "services-off" | "permission-denied" };

/**
 * Pre-flight probe run BEFORE acquireFix.
 *
 * When the phone's master location toggle is off, navigator.geolocation
 * .watchPosition never fires a success or an error callback: it simply hangs
 * until geo-acquire.ts hits its 60s ceiling and reports "GPS timed out". The
 * Capacitor Geolocation plugin throws immediately in that state, so we use it
 * as a probe. geo-acquire.ts remains the only thing that acquires a fix.
 */
export async function checkLocationReadiness(): Promise<LocationReadiness> {
  if (!Capacitor.isNativePlatform()) return { ok: true };
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    let status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      status = await Geolocation.requestPermissions();
    }
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      return { ok: false, reason: "permission-denied" };
    }
    return { ok: true };
  } catch {
    // checkPermissions / requestPermissions throw when system location
    // services are disabled.
    return { ok: false, reason: "services-off" };
  }
}

/** Opens the Android system location screen so the user can switch GPS on. */
export async function openLocationSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import(
      "capacitor-native-settings"
    );
    await NativeSettings.open({
      optionAndroid: AndroidSettings.Location,
      optionIOS: IOSSettings.App,
    });
  } catch (err) {
    console.warn("[native] openLocationSettings failed", err);
  }
}

/** Opens this app's own permission screen. */
export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { NativeSettings, AndroidSettings, IOSSettings } = await import(
      "capacitor-native-settings"
    );
    await NativeSettings.open({
      optionAndroid: AndroidSettings.ApplicationDetails,
      optionIOS: IOSSettings.App,
    });
  } catch (err) {
    console.warn("[native] openAppSettings failed", err);
  }
}
