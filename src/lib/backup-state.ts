// Small cache of cloud-backup bookkeeping: Drive ids so a re-backup is a
// lookup instead of a full folder/file search, plus the last-backup status
// shown in the UI. No tokens live here (access tokens are minted per backup
// run from the cached Google session, never stored). Loaded with a dynamic
// import, matching the rest of the app's native-plugin usage.
const KEY = "geofield.backup-state.v1";

export type BackupState = {
  folderId?: string;
  mediaFolderId?: string;
  manifestFileId?: string;
  lastBackup?: { timestamp: number; count: number };
};

export async function getBackupState(): Promise<BackupState> {
  const { Preferences } = await import("@capacitor/preferences");
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return {};
  try {
    return JSON.parse(value) as BackupState;
  } catch {
    return {};
  }
}

export async function setBackupState(patch: Partial<BackupState>): Promise<BackupState> {
  const current = await getBackupState();
  const next: BackupState = { ...current, ...patch };
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key: KEY, value: JSON.stringify(next) });
  return next;
}
