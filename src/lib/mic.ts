import { Capacitor } from "@capacitor/core";

export type MicPermission =
  | { ok: true }
  | { ok: false; reason: "denied" | "plugin"; detail?: string };

/**
 * Android's manifest declares RECORD_AUDIO, but declaring is not granting.
 * The WebView only approves getUserMedia({audio}) once the app holds the
 * runtime permission, so this asks natively first.
 *
 * The result distinguishes a user denial from a broken native bridge, so the
 * UI can say which one happened. On a phone-only workflow there is no adb
 * logcat; the error message IS the diagnostic.
 */
export async function ensureMicPermission(): Promise<MicPermission> {
  if (!Capacitor.isNativePlatform()) return { ok: true };
  try {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const existing = await VoiceRecorder.hasAudioRecordingPermission();
    if (existing.value) return { ok: true };
    const granted = await VoiceRecorder.requestAudioRecordingPermission();
    if (granted.value === true) return { ok: true };
    return { ok: false, reason: "denied" };
  } catch (err) {
    console.warn("[mic] native permission bridge failed", err);
    return {
      ok: false,
      reason: "plugin",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Opens GeoField's own page in Android Settings, one tap from Permissions. */
export async function openAppSettings(): Promise<void> {
  try {
    const { NativeSettings, AndroidSettings } = await import("capacitor-native-settings");
    await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails });
  } catch (err) {
    console.warn("[mic] could not open app settings", err);
  }
}
