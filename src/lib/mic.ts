import { Capacitor } from "@capacitor/core";

/**
 * Android's manifest declares RECORD_AUDIO, but declaring is not granting.
 *
 * Capacitor's WebChromeClient only approves the WebView's PermissionRequest
 * for audio capture once the app itself holds the runtime permission. Without
 * that, getUserMedia({ audio: true }) rejects with NotAllowedError and
 * MediaRecorder never starts.
 *
 * capacitor-voice-recorder is used here purely as a bridge to the native
 * permission dialog. Recording itself stays on MediaRecorder, so the base64
 * audio already stored in IndexedDB keeps its format and keeps playing.
 *
 * On web this is a no-op: the browser prompts on getUserMedia by itself.
 */
export async function ensureMicPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { VoiceRecorder } = await import("capacitor-voice-recorder");
    const existing = await VoiceRecorder.hasAudioRecordingPermission();
    if (existing.value) return true;
    const granted = await VoiceRecorder.requestAudioRecordingPermission();
    return granted.value === true;
  } catch (err) {
    console.warn("[mic] native permission request failed", err);
    return false;
  }
}
