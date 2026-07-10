import { Capacitor, registerPlugin } from "@capacitor/core";

type EnableLocationNative = {
  request(): Promise<{ status: "enabled" | "prompted" | "unavailable" }>;
};

/**
 * Bridge to a tiny native plugin (injected into MainActivity by the APK
 * workflow) that shows Google Play Services' "turn on location" dialog OVER
 * the app: one tap, no trip to system settings. On web, or in an APK built
 * before the plugin existed, this reports "unavailable" and callers fall back
 * to the settings-button flow.
 */
export async function requestLocationEnable(): Promise<"enabled" | "prompted" | "unavailable"> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  try {
    const plugin = registerPlugin<EnableLocationNative>("EnableLocation");
    const res = await plugin.request();
    return res.status;
  } catch (err) {
    console.warn("[enable-location] native bridge unavailable", err);
    return "unavailable";
  }
}
