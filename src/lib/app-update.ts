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

// Raw bytes per Filesystem write. Kept small (about 1.3 MB as base64 per bridge
// call) so a large single write cannot truncate the file, the failure that made
// Android reject the downloaded APK with "problem parsing the package".
const WRITE_CHUNK = 1_000_000;

/**
 * True only where the native install path exists: an Android Capacitor build.
 * On the web PWA (and any non-Android platform) the banner falls back to the
 * plain browser-download link.
 */
export function canInAppInstall(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const res = typeof reader.result === "string" ? reader.result : "";
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Streams the APK from `url` (the geofield-assets Pages mirror) to the Cache
 * directory, reporting 0-100 as it goes. GitHub Pages sends Content-Length and
 * Access-Control-Allow-Origin: * (the same reason update-check.ts can read
 * version.json cross-origin), so the byte count and body are both available.
 * Returns the relative path to hand to installUpdate.
 */
export async function downloadUpdate(
  url: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const total = Number(res.headers.get("Content-Length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.length;
    // Cap streamed progress at 99; the writeFile below is the final step.
    if (total > 0) onProgress?.(Math.min(99, Math.floor((received / total) * 100)));
  }

  const blob = new Blob(chunks as BlobPart[], {
    type: "application/vnd.android.package-archive",
  });

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  // Write in small slices, not one big call. A single writeFile of the whole
  // ~12 MB base64 string overruns the Capacitor bridge on mid-range phones and
  // lands a TRUNCATED file, which Android then rejects with "problem parsing
  // the package". This mirrors the basemap downloader's proven chunked append:
  // each slice is encoded and written on its own, so peak memory and bridge
  // payload stay around one small chunk. The first writeFile overwrites any
  // leftover from a cancelled earlier attempt; the rest append.
  for (let offset = 0, first = true; offset < blob.size; offset += WRITE_CHUNK, first = false) {
    const slice = blob.slice(offset, Math.min(offset + WRITE_CHUNK, blob.size));
    const b64 = await blobToBase64(slice);
    if (first) {
      await Filesystem.writeFile({ path: APK_PATH, data: b64, directory: Directory.Cache });
    } else {
      await Filesystem.appendFile({ path: APK_PATH, data: b64, directory: Directory.Cache });
    }
  }

  // Guard against a short write. If the file on disk is not exactly what we
  // downloaded, it is a corrupt APK, so delete it and fail loudly (the banner
  // shows Retry) rather than handing the installer a truncated file and getting
  // the cryptic parse error.
  const stat = await Filesystem.stat({ path: APK_PATH, directory: Directory.Cache });
  if (typeof stat.size === "number" && stat.size !== received) {
    try {
      await Filesystem.deleteFile({ path: APK_PATH, directory: Directory.Cache });
    } catch {
      /* ignore */
    }
    throw new Error(`update write size mismatch: got ${stat.size}, expected ${received}`);
  }

  onProgress?.(100);
  return APK_PATH;
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
