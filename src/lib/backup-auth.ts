// Phase 0 of cloud backup: Google Sign-In in isolation.
//
// Scope of this file for now: sign in with a personal Google account, obtain a
// drive.file access token, and create (or find) the "GeoField Backups" folder in
// the user's own Drive, reading its id back. No manifest, no media, no restore.
// Those come in later phases once this is proven on the signed release APK.
//
// Every native plugin is loaded with a dynamic import, matching the rest of the
// app (report.ts, MapView.tsx), so the web build and SSR do not eagerly pull in
// Capacitor native code.
import { GOOGLE_WEB_CLIENT_ID, DRIVE_SCOPES, BACKUP_FOLDER_NAME } from "./backup-config";
import { findOrCreateFolder } from "./drive-client";

let initialized = false;

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

// Signs in (shows the account picker the first time, silent afterwards) and
// returns a fresh access token plus the account email. We initialize Google in
// "online" mode (see ensureInitialized), so the login response is always the
// GoogleLoginResponseOnline branch of the plugin's GoogleLoginResponse union;
// the responseType check below narrows to it instead of casting.
export async function signInAndGetToken(): Promise<{ accessToken: string; email: string | null }> {
  await ensureInitialized();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
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

// Finds the existing backup folder or creates it, returning its id. Uses the
// user's own Drive; drive.file only exposes files this app created.
export async function findOrCreateBackupFolder(
  token: string,
): Promise<{ id: string; created: boolean }> {
  return findOrCreateFolder(token, BACKUP_FOLDER_NAME);
}

export type AuthSelfTestResult = {
  email: string | null;
  folderId: string;
  folderCreated: boolean;
};

// Phase 0 end-to-end check: sign in, get a token, ensure the backup folder, and
// report its id. This is the only thing the Phase 0 UI runs, so it can be
// verified on the signed release APK before any backup/restore code exists.
export async function runAuthSelfTest(): Promise<AuthSelfTestResult> {
  const { accessToken, email } = await signInAndGetToken();
  const folder = await findOrCreateBackupFolder(accessToken);
  return { email, folderId: folder.id, folderCreated: folder.created };
}
