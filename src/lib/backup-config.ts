// Cloud backup configuration.
//
// SETUP (Edwin, one-time, in Google Cloud Console):
//   1. Create a project and enable the Google Drive API.
//   2. OAuth consent screen: External, add scopes drive.file + email + profile,
//      then PUBLISH it to Production. In Testing mode only allow-listed emails can
//      sign in, which would lock out real users.
//   3. Create OAuth client IDs:
//        - Android client: package name com.eondesigns.geofield + the RELEASE
//          keystore SHA-1 (get it with `keytool -list` on the signing keystore).
//        - Web client: its client ID is the value below (it is not a secret).
//   4. Paste the Web client ID into GOOGLE_WEB_CLIENT_ID below and rebuild.
//
// The Web client ID is safe to commit (it is public by design). Sign-in will not
// work until this is set to the real value and the Android client is registered
// against the release keystore SHA-1, which is why Phase 0 must be verified on the
// signed release APK from GitHub Actions, not a debug build.
export const GOOGLE_WEB_CLIENT_ID = "REPLACE_WITH_WEB_CLIENT_ID.apps.googleusercontent.com";

// The Drive scope the app requests. drive.file is non-sensitive: the app can only
// see and manage files it created, so publishing the consent screen does not trigger
// Google's lengthy security assessment.
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file", "email", "profile"];

// Name of the folder created in the user's own Drive to hold their backup.
export const BACKUP_FOLDER_NAME = "GeoField Backups";

export function isBackupConfigured(): boolean {
  return !GOOGLE_WEB_CLIENT_ID.startsWith("REPLACE_WITH_");
}
