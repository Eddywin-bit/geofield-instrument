// Google Sign-In for cloud backup: sign in with a personal Google account,
// obtain a drive.file access token, and create (or find) the "GeoField
// Backups" folder in the user's own Drive.
//
// Every native plugin is loaded with a dynamic import, matching the rest of the
// app (report.ts, MapView.tsx), so the web build and SSR do not eagerly pull in
// Capacitor native code.
import { GOOGLE_WEB_CLIENT_ID, DRIVE_SCOPES, BACKUP_FOLDER_NAME } from "./backup-config";
import { findOrCreateFolder } from "./drive-client";

let initialized = false;
let pendingAuthorization: Promise<{ accessToken: string; email: string | null }> | null = null;

// Idempotent. Google is initialized in ONLINE mode: we mint a short-lived access
// token from the cached session and hit the Drive REST API directly. No offline
// mode / serverAuthCode, because that needs a client secret or backend and this
// app is serverless.
async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: "online" },
  });
  initialized = true;
}

// Reuse the plugin's validated Google session so checking and then restoring
// a backup does not open the account picker twice. Google asks again only when
// the saved authorization cannot be reused. We initialize Google in
// "online" mode (see ensureInitialized), so the login response is always the
// GoogleLoginResponseOnline branch of the plugin's GoogleLoginResponse union;
// the responseType check below narrows to it instead of casting.
async function getBackupAuthorization(): Promise<{ accessToken: string; email: string | null }> {
  await ensureInitialized();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  try {
    // In online mode, this method validates and returns the saved access token.
    // Its name refers to the plugin API; no server auth-code flow is involved.
    const session = await SocialLogin.getAuthorizationCode({ provider: "google" });
    if (session.accessToken) return { accessToken: session.accessToken, email: null };
  } catch {
    // No usable saved session: continue with the normal Google account picker.
  }
  const { result } = await SocialLogin.login({
    provider: "google",
    options: { scopes: DRIVE_SCOPES },
  });

  if (result.responseType !== "online") {
    // Should be unreachable: we always initialize with mode: "online".
    throw new Error(
      "Google sign-in returned an offline response; expected an online access token.",
    );
  }
  const token = result.accessToken?.token;
  if (!token) {
    throw new Error(
      "Signed in but no Drive access token was returned. Check that the OAuth consent screen requests the drive.file scope and is published to Production.",
    );
  }
  return { accessToken: token, email: result.profile.email };
}

export function signInAndGetToken(): Promise<{ accessToken: string; email: string | null }> {
  // Backup and restore share authorization if their buttons are tapped together.
  if (!pendingAuthorization) {
    pendingAuthorization = getBackupAuthorization().finally(() => {
      pendingAuthorization = null;
    });
  }
  return pendingAuthorization;
}

// Finds the existing backup folder or creates it, returning its id. Uses the
// user's own Drive; drive.file only exposes files this app created.
export async function findOrCreateBackupFolder(
  token: string,
): Promise<{ id: string; created: boolean }> {
  return findOrCreateFolder(token, BACKUP_FOLDER_NAME);
}
