// In-app update check. Compares the running app version against version.json,
// published to the same public GitHub Pages site (geofield-assets) that hosts
// the downloadable APK. GitHub Releases can't be used for this check: the
// source repo is private, so the Releases API requires a signed-in,
// authorized GitHub account, same reason geofield.apk itself is mirrored to
// Pages instead of only being a Release asset.
import { APP_VERSION } from "./app-version";

const VERSION_URL = "https://eddywin-bit.github.io/geofield-assets/version.json";
const DISMISSED_KEY = "geofield.update-dismissed-version";

export type UpdateInfo = { version: string; url: string };

function parseVersion(v: string): number[] {
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote: string, current: string): boolean {
  const r = parseVersion(remote);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const rv = r[i] ?? 0;
    const cv = c[i] ?? 0;
    if (rv !== cv) return rv > cv;
  }
  return false;
}

async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  try {
    const resp = await fetch(VERSION_URL, { cache: "no-store" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { version?: string; url?: string };
    if (!data.version || !data.url) return null;
    if (!isNewer(data.version, APP_VERSION)) return null;
    return { version: data.version, url: data.url };
  } catch {
    // Offline-first app: no network, a blocked host, or a malformed
    // response all just mean "no update to report", never an error surface.
    return null;
  }
}

// Fetched once per app session (module-level cache): every AppLayout mount
// (i.e. every navigation, since AppLayout isn't a persistent route wrapper)
// reuses the same result instead of re-fetching version.json.
let cached: Promise<UpdateInfo | null> | null = null;
export function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!cached) cached = fetchUpdateInfo();
  return cached;
}

export async function getDismissedVersion(): Promise<string | null> {
  const { Preferences } = await import("@capacitor/preferences");
  const { value } = await Preferences.get({ key: DISMISSED_KEY });
  return value ?? null;
}

export async function dismissVersion(version: string): Promise<void> {
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key: DISMISSED_KEY, value: version });
}
