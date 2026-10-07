// In-app update download and install (Android only).
//
// GeoField isn't on the Play Store, so there is no Play update path. Until now
// the update banner was a plain link that kicked the user to the browser: the
// browser downloaded the APK, then they had to find it in Downloads and tap it
// themselves. This module keeps the whole flow inside the app, the way
// Telegram's direct-APK build does it: download with a progress readout, then
// hand the file straight to Android's package installer.
//
// The install itself is native. A small injected Capacitor plugin (ApkInstaller,
// see .github/workflows/build-apk.yml) fires the ACTION_VIEW install intent
// through a FileProvider content:// URI, since a file:// URI is rejected from
// Android 7 on. Android still shows its own "install an update?" confirmation at
// the end. That dialog cannot be skipped by a normal app, Telegram gets it too,
// so the seamless part is everything up to it: no browser, no hunting for the
// file, one tap.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface ApkInstallerPlugin {
  // Whether the user has granted this app "install unknown apps". False on
  // Android 8+ until they flip the per-app toggle.
  canInstall(): Promise<{ granted: boolean }>;
  // Fires the install intent. "needs-permission" means the toggle above is off;
  // the plugin has opened the settings screen, so the user grants it and taps
  // Update again. "installing" means Android's install dialog is now showing.
  install(options: { path: string }): Promise<{ status: "installing" | "needs-permission" }>;
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>("ApkInstaller");

// The APK lands in the Filesystem Cache directory (context.getCacheDir() on
// Android), which is exactly what the injected FileProvider's cache-path covers.
// Cache is right for a throwaway installer file: it's consumed seconds after it
// lands, and Android "Clear Cache" won't leave stale APKs sitting around.
const APK_PATH = "geofield-update.apk";

/**
 * True only where the native install path exists: an Android Capacitor build.
 * On the web PWA (and any non-Android platform) the banner falls back to the
 * plain browser-download link.
 */
export function canInAppInstall(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * Download directly to Android's cache. APK bytes stay in native code instead
 * of passing through WebView blobs, base64 conversion, and bridge writes.
 */
export async function downloadUpdate(
  url: string,
  onProgress?: (pct: number | null, bytes: number) => void,
): Promise<string> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  let expectedBytes = 0;
  const listener = await Filesystem.addListener("progress", (event) => {
    if (event.url !== url) return;
    if (event.contentLength > 0) {
      expectedBytes = event.contentLength;
    }
    // Native HTTP responses may omit Content-Length. Still report received
    // bytes so the UI does not sit at 0% throughout a successful download.
    onProgress?.(
      event.contentLength > 0
        ? Math.min(99, Math.floor((event.bytes / event.contentLength) * 100))
        : null,
      event.bytes,
    );
  });
  try {
    await Filesystem.downloadFile({
      url,
      path: APK_PATH,
      directory: Directory.Cache,
      progress: true,
      headers: { "Cache-Control": "no-cache" },
    });
    const stat = await Filesystem.stat({ path: APK_PATH, directory: Directory.Cache });
    if (stat.size <= 0 || (expectedBytes > 0 && stat.size !== expectedBytes)) {
      throw new Error("The update download was incomplete. Please try again.");
    }
    onProgress?.(100, stat.size);
    return APK_PATH;
  } catch (error) {
    try {
      await Filesystem.deleteFile({ path: APK_PATH, directory: Directory.Cache });
    } catch {
      // A failed connection may not have created a file.
    }
    throw error;
  } finally {
    await listener.remove();
  }
}

/**
 * Hands the downloaded APK to Android's installer. Returns "installing" once
 * the system dialog is up, or "needs-permission" if the app first has to be
 * granted "install unknown apps" (the plugin opens that settings screen).
 */
export async function installUpdate(path: string): Promise<"installing" | "needs-permission"> {
  const res = await ApkInstaller.install({ path });
  return res.status;
}

export type UpdatePhase = "idle" | "downloading" | "installing" | "needs-permission" | "error";
export type UpdateState = {
  phase: UpdatePhase;
  pct: number | null;
  bytes?: number;
  error?: string;
};

/**
 * Module-level so a running download outlives the banner. AppLayout (and the
 * banner inside it) remounts on every tab change, since it wraps each route
 * rather than persisting across them. Component-local state would therefore
 * reset the download the instant the user navigates away, which is exactly
 * what happened. This singleton keeps the download running and its progress
 * intact across navigation; the banner just subscribes and reflects it. Same
 * shape as the basemap downloader's module-level controller.
 */
export const updateController = (() => {
  let state: UpdateState = { phase: "idle", pct: 0 };
  const listeners = new Set<(s: UpdateState) => void>();
  let inFlight = false;
  let prepared: { url: string; path: string } | null = null;

  const emit = (next: UpdateState) => {
    state = next;
    for (const l of listeners) l(state);
  };

  return {
    // Stable identities so useSyncExternalStore does not resubscribe each render.
    getSnapshot: (): UpdateState => state,
    subscribe: (fn: (s: UpdateState) => void): (() => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async run(url: string): Promise<void> {
      if (inFlight) return;
      inFlight = true;
      try {
        if (!prepared || prepared.url !== url) {
          prepared = null;
          emit({ phase: "downloading", pct: null, bytes: 0 });
          const path = await downloadUpdate(url, (pct, bytes) =>
            emit({ phase: "downloading", pct, bytes }),
          );
          prepared = { url, path };
        }
        emit({ phase: "installing", pct: 100 });
        const status = await installUpdate(prepared.path);
        // "installing": Android's confirm dialog is up. "needs-permission": the
        // plugin opened the install-unknown-apps screen; prompt a retry.
        emit({
          phase: status === "needs-permission" ? "needs-permission" : "installing",
          pct: 100,
        });
      } catch (error) {
        prepared = null;
        emit({
          phase: "error",
          pct: 0,
          error: error instanceof Error ? error.message : "Update failed. Please try again.",
        });
      } finally {
        inFlight = false;
      }
    },
  };
})();
