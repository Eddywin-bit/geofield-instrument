import { useEffect, useState } from "react";
import { Loader2, Check, X, UploadCloud, DownloadCloud } from "lucide-react";
import { isBackupConfigured } from "../lib/backup-config";
import {
  backupNow,
  findBackup,
  getLastBackupStatus,
  restoreNow,
  type BackupInfo,
  type BackupProgress,
  type BackupResult,
  type RestoreProgress,
  type RestoreResult,
} from "../lib/backup";

// Manual "Back up now", uploading the observation manifest and any new
// photos/voice notes to the Drive backup folder.
type BackupState =
  | { status: "idle" }
  | { status: "running"; progress: BackupProgress }
  | { status: "ok"; result: BackupResult }
  | { status: "error"; message: string };

function progressLabel(progress: BackupProgress): string {
  switch (progress.phase) {
    case "signin":
      return "Signing in…";
    case "folders":
      return "Preparing your Drive folder…";
    case "hashing":
      return "Checking your observations…";
    case "uploading":
      return progress.total > 0
        ? `Uploading photos and voice notes… ${progress.uploaded}/${progress.total}`
        : "Uploading…";
    case "manifest":
      return "Saving your observation list…";
  }
}

// Check whether a signed-in account has a backup, then restore it in
// batches, showing progress as each batch is fetched and committed.
type RestoreState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; info: BackupInfo }
  | { status: "none" }
  | { status: "restoring"; progress: RestoreProgress }
  | { status: "done"; result: RestoreResult }
  | { status: "error"; message: string };

function restoreProgressLabel(progress: RestoreProgress): string {
  switch (progress.phase) {
    case "signin":
      return "Signing in…";
    case "locating":
      return "Looking for your backup…";
    case "manifest":
      return "Reading your observation list…";
    case "restoring":
      return progress.total > 0
        ? `Restoring your observations… ${progress.restored}/${progress.total}`
        : "Restoring…";
  }
}

export function BackupPanel() {
  const [backupState, setBackupState] = useState<BackupState>({ status: "idle" });
  const [lastBackup, setLastBackup] = useState<{ timestamp: number; count: number } | null>(null);
  const [restoreState, setRestoreState] = useState<RestoreState>({ status: "idle" });
  const configured = isBackupConfigured();

  useEffect(() => {
    void getLastBackupStatus().then(setLastBackup);
  }, []);

  const runBackup = async () => {
    if (backupState.status === "running") return;
    setBackupState({ status: "running", progress: { phase: "signin" } });
    try {
      const result = await backupNow((progress) => setBackupState({ status: "running", progress }));
      setBackupState({ status: "ok", result });
      setLastBackup(await getLastBackupStatus());
    } catch (err) {
      setBackupState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const checkForBackup = async () => {
    if (restoreState.status === "checking" || restoreState.status === "restoring") return;
    setRestoreState({ status: "checking" });
    try {
      const info = await findBackup();
      setRestoreState(info ? { status: "found", info } : { status: "none" });
    } catch (err) {
      setRestoreState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const runRestore = async () => {
    if (restoreState.status === "restoring") return;
    setRestoreState({ status: "restoring", progress: { phase: "signin" } });
    try {
      const result = await restoreNow((progress) =>
        setRestoreState({ status: "restoring", progress }),
      );
      setRestoreState({ status: "done", result });
      setLastBackup(await getLastBackupStatus());
    } catch (err) {
      setRestoreState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="pb-28">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Backup &amp; Restore</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Save your observations to your own Google Drive so they survive a lost or reset phone.
        </p>
      </div>

      <div className="px-4 space-y-3">
        {!configured && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive leading-snug">
            Backup is not configured in this build yet. Sign-in will not work until the Google
            client ID is set. See the setup notes in the pull request.
          </div>
        )}

        {/* Back up now card */}
        <div className="rounded-2xl bg-panel shadow-md shadow-black/5 p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-full bg-primary/35 flex items-center justify-center shrink-0">
              <UploadCloud className="h-5 w-5 text-foreground" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Back up now</div>
              <div className="text-[11px] text-muted-foreground">
                Upload your observations to your Drive backup folder
              </div>
            </div>
          </div>

          {lastBackup && (
            <p className="text-xs text-foreground/85">
              Last backed up: {lastBackup.count} observation{lastBackup.count === 1 ? "" : "s"},{" "}
              {new Date(lastBackup.timestamp).toLocaleString()}
            </p>
          )}

          <button
            type="button"
            onClick={() => void runBackup()}
            disabled={!configured || backupState.status === "running"}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-black/10 text-sm font-bold tracking-[0.06em] flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-70"
          >
            {backupState.status === "running" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {progressLabel(backupState.progress)}
              </>
            ) : (
              <>
                <UploadCloud className="h-5 w-5" strokeWidth={2.4} />
                Back up now
              </>
            )}
          </button>

          {backupState.status === "ok" && (
            <div className="rounded-xl bg-success/10 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-success">
                <Check className="h-4 w-4" strokeWidth={3} />
                Backed up
              </div>
              <div className="text-xs text-foreground/85">
                {backupState.result.count} observation{backupState.result.count === 1 ? "" : "s"}{" "}
                saved. {backupState.result.uploadedMedia} new photo/voice file
                {backupState.result.uploadedMedia === 1 ? "" : "s"} uploaded.
              </div>
            </div>
          )}

          {backupState.status === "error" && (
            <div className="rounded-xl bg-destructive/10 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <X className="h-4 w-4" strokeWidth={3} />
                Backup failed
              </div>
              <p className="text-xs text-destructive/90 leading-snug break-words">
                {backupState.message}
              </p>
            </div>
          )}
        </div>

        {/* Restore card */}
        <div className="rounded-2xl bg-panel shadow-md shadow-black/5 p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-full bg-primary/35 flex items-center justify-center shrink-0">
              <DownloadCloud className="h-5 w-5 text-foreground" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Restore observations</div>
              <div className="text-[11px] text-muted-foreground">
                Bring your observations back from your Drive backup
              </div>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-foreground/85">
            Use this after reinstalling GeoField or on a new phone. Observations already on this
            device are kept; only missing ones are added.
          </p>

          {restoreState.status === "found" && (
            <div className="rounded-xl bg-panel-2 p-3 text-xs text-foreground/85">
              Found a backup: {restoreState.info.count} observation
              {restoreState.info.count === 1 ? "" : "s"} from{" "}
              {new Date(restoreState.info.timestamp).toLocaleString()}.
            </div>
          )}

          {restoreState.status === "none" && (
            <div className="rounded-xl bg-panel-2 p-3 text-xs text-foreground/85">
              No backup found for this Google account.
            </div>
          )}

          <button
            type="button"
            onClick={() => void (restoreState.status === "found" ? runRestore() : checkForBackup())}
            disabled={
              !configured ||
              restoreState.status === "checking" ||
              restoreState.status === "restoring"
            }
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-black/10 text-sm font-bold tracking-[0.06em] flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-70"
          >
            {restoreState.status === "checking" && (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking…
              </>
            )}
            {restoreState.status === "restoring" && (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {restoreProgressLabel(restoreState.progress)}
              </>
            )}
            {restoreState.status !== "checking" && restoreState.status !== "restoring" && (
              <>
                <DownloadCloud className="h-5 w-5" strokeWidth={2.4} />
                {restoreState.status === "found" ? "Restore now" : "Check for backup"}
              </>
            )}
          </button>

          {restoreState.status === "done" && (
            <div className="rounded-xl bg-success/10 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-success">
                <Check className="h-4 w-4" strokeWidth={3} />
                Restored
              </div>
              <div className="text-xs text-foreground/85">
                {restoreState.result.count} observation{restoreState.result.count === 1 ? "" : "s"}{" "}
                restored. Check My Logs.
              </div>
            </div>
          )}

          {restoreState.status === "error" && (
            <div className="rounded-xl bg-destructive/10 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <X className="h-4 w-4" strokeWidth={3} />
                Restore failed
              </div>
              <p className="text-xs text-destructive/90 leading-snug break-words">
                {restoreState.message}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
