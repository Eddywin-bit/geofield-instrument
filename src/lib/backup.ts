// Cloud backup: manifest + content-addressed media upload (Phase 1) and
// restore (Phase 2) against the user's own Google Drive. Builds on
// backup-auth.ts (sign-in, backup folder) and drive-client.ts (Drive REST +
// native/web HTTP dual path).
import type { LogEntry } from "./logs-store";
import { hydrateLogs, loadLogs, importLogs } from "./logs-store";
import { signInAndGetToken, findOrCreateBackupFolder } from "./backup-auth";
import { getBackupState, setBackupState } from "./backup-state";
import { BACKUP_FOLDER_NAME } from "./backup-config";
import {
  DRIVE_FILES_URL,
  DRIVE_UPLOAD_URL,
  driveError,
  driveRequest,
  downloadFileBase64,
  findFileId,
  findFolderId,
  findOrCreateFolder,
} from "./drive-client";

const MEDIA_FOLDER_NAME = "media";
const MANIFEST_NAME = "manifest.json";
const MANIFEST_VERSION = 1;

export type MediaRef = { hash: string; mime: string };

// LogEntry with its inline media (data URLs) replaced by content-addressed
// references. Everything else about the record is passed through unchanged,
// so the locked LogEntry shape is never altered, only re-expressed for
// storage on Drive.
export type ManifestLogEntry = Omit<LogEntry, "photo" | "photos" | "voice"> & {
  photo?: MediaRef;
  photos?: MediaRef[];
  voice?: MediaRef;
};

export type Manifest = {
  version: typeof MANIFEST_VERSION;
  generatedAt: number;
  logs: ManifestLogEntry[];
};

function parseDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Expected a base64 data URL for photo/voice media.");
  return { mime: match[1], base64: match[2] };
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(base64: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", base64ToBytes(base64));
  return bytesToHex(new Uint8Array(digest));
}

type MediaPayload = { mime: string; base64: string };

// Builds the manifest and the deduped set of media this backup needs. Two
// logs sharing the exact same photo/voice bytes (a duplicate) produce one
// media entry, not two.
export async function buildManifest(
  logs: LogEntry[],
): Promise<{ manifest: Manifest; media: Map<string, MediaPayload> }> {
  const media = new Map<string, MediaPayload>();

  async function ref(dataUrl: string | undefined): Promise<MediaRef | undefined> {
    if (!dataUrl) return undefined;
    const { mime, base64 } = parseDataUrl(dataUrl);
    const hash = await sha256Hex(base64);
    if (!media.has(hash)) media.set(hash, { mime, base64 });
    return { hash, mime };
  }

  const manifestLogs: ManifestLogEntry[] = [];
  for (const log of logs) {
    const { photo, photos, voice, ...rest } = log;
    const photoRefs = photos ? await Promise.all(photos.map(ref)) : undefined;
    manifestLogs.push({
      ...rest,
      photo: await ref(photo),
      photos: photoRefs?.filter((r): r is MediaRef => r !== undefined),
      voice: await ref(voice),
    });
  }

  return {
    manifest: { version: MANIFEST_VERSION, generatedAt: Date.now(), logs: manifestLogs },
    media,
  };
}

// Every file (name -> id) currently in a Drive folder (one page fetch per
// 1000 entries). Backup uses the names to know which content-addressed media
// hashes are already backed up; restore uses the ids to download by hash
// without a lookup per file.
async function listFiles(token: string, folderId: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const q = `'${folderId}' in parents and trashed=false`;
    const url =
      `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent("nextPageToken,files(id,name)")}&pageSize=1000&spaces=drive` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const list = await driveRequest("GET", url, token);
    if (list.status < 200 || list.status >= 300) throw driveError("media list", list);
    const data = list.data as {
      files?: Array<{ id: string; name: string }>;
      nextPageToken?: string;
    } | null;
    for (const f of data?.files ?? []) files.set(f.name, f.id);
    pageToken = data?.nextPageToken;
  } while (pageToken);
  return files;
}

// Uploads one media file via Drive's resumable protocol: a JSON POST to open
// the session (returns a Location header session URI), then a PUT of the raw
// bytes to that URI.
async function uploadMedia(
  token: string,
  mediaFolderId: string,
  hash: string,
  payload: MediaPayload,
): Promise<void> {
  const initUrl = `${DRIVE_UPLOAD_URL}?uploadType=resumable`;
  const init = await driveRequest("POST", initUrl, token, {
    json: { name: `${hash}.bin`, parents: [mediaFolderId], mimeType: payload.mime },
  });
  if (init.status < 200 || init.status >= 300) {
    throw driveError(`media upload init (${hash})`, init);
  }
  const sessionUrl = init.headers["location"] ?? init.headers["Location"];
  if (!sessionUrl) throw new Error(`Drive did not return a resumable session URI for ${hash}.`);

  const put = await driveRequest("PUT", sessionUrl, token, {
    base64Body: payload.base64,
    headers: { "Content-Type": payload.mime },
  });
  if (put.status < 200 || put.status >= 300) throw driveError(`media upload (${hash})`, put);
}

async function ensureManifestFile(
  token: string,
  backupFolderId: string,
): Promise<{ id: string; created: boolean }> {
  const cached = (await getBackupState()).manifestFileId;
  if (cached) return { id: cached, created: false };

  const existing = await findFileId(token, MANIFEST_NAME, backupFolderId);
  if (existing) return { id: existing, created: false };

  const create = await driveRequest("POST", DRIVE_FILES_URL, token, {
    json: { name: MANIFEST_NAME, parents: [backupFolderId], mimeType: "application/json" },
  });
  if (create.status < 200 || create.status >= 300) throw driveError("manifest create", create);
  const id = (create.data as { id?: string } | null)?.id;
  if (!id) throw new Error("manifest.json was created but no id was returned.");
  return { id, created: true };
}

async function uploadManifest(
  token: string,
  manifestFileId: string,
  manifest: Manifest,
): Promise<void> {
  const url = `${DRIVE_UPLOAD_URL}/${manifestFileId}?uploadType=media`;
  const resp = await driveRequest("PATCH", url, token, { json: manifest });
  if (resp.status < 200 || resp.status >= 300) throw driveError("manifest upload", resp);
}

async function downloadManifest(token: string, manifestFileId: string): Promise<Manifest> {
  const resp = await driveRequest("GET", `${DRIVE_FILES_URL}/${manifestFileId}?alt=media`, token);
  if (resp.status < 200 || resp.status >= 300) throw driveError("manifest download", resp);
  return resp.data as Manifest;
}

// Combines whatever is already backed up with what this device just built,
// keyed by log id. A device with fewer local logs than the existing remote
// manifest (a partial restore, a second phone that was never synced) can
// then never erase observations that only exist in the remote manifest.
// Local wins on an id collision.
function mergeManifestLogs(
  remote: ManifestLogEntry[],
  local: ManifestLogEntry[],
): ManifestLogEntry[] {
  const byId = new Map<string, ManifestLogEntry>();
  for (const entry of remote) byId.set(entry.id, entry);
  for (const entry of local) byId.set(entry.id, entry);
  return [...byId.values()];
}

// Every media file name referenced by a set of manifest logs, so pruning can
// tell which Drive files are still needed and which are orphaned.
function collectMediaNames(logs: ManifestLogEntry[]): Set<string> {
  const names = new Set<string>();
  for (const entry of logs) {
    if (entry.photo) names.add(`${entry.photo.hash}.bin`);
    if (entry.photos) for (const p of entry.photos) names.add(`${p.hash}.bin`);
    if (entry.voice) names.add(`${entry.voice.hash}.bin`);
  }
  return names;
}

async function deleteFile(token: string, fileId: string): Promise<void> {
  const resp = await driveRequest("DELETE", `${DRIVE_FILES_URL}/${fileId}`, token);
  if (resp.status < 200 || resp.status >= 300) throw driveError("media delete", resp);
}

export type BackupProgress =
  | { phase: "signin" | "folders" | "hashing" | "manifest" }
  | { phase: "uploading"; uploaded: number; total: number }
  | { phase: "pruning"; pruned: number; total: number };

export type BackupResult = { count: number; uploadedMedia: number; prunedMedia: number };

export async function backupNow(onProgress?: (p: BackupProgress) => void): Promise<BackupResult> {
  onProgress?.({ phase: "signin" });
  const { accessToken } = await signInAndGetToken();

  onProgress?.({ phase: "folders" });
  const backupFolder = await findOrCreateBackupFolder(accessToken);
  const mediaFolder = await findOrCreateFolder(accessToken, MEDIA_FOLDER_NAME, backupFolder.id);
  const manifestFile = await ensureManifestFile(accessToken, backupFolder.id);

  onProgress?.({ phase: "hashing" });
  await hydrateLogs();
  const logs = loadLogs();
  const { manifest: localManifest, media } = await buildManifest(logs);

  let remoteManifest: Manifest | null = null;
  if (!manifestFile.created) {
    try {
      remoteManifest = await downloadManifest(accessToken, manifestFile.id);
    } catch {
      // Treat an unreadable existing manifest (e.g. a previous run crashed
      // between creating the file and writing its content) as if there were
      // none, rather than blocking this backup.
      remoteManifest = null;
    }
  }
  const mergedLogs = mergeManifestLogs(remoteManifest?.logs ?? [], localManifest.logs);
  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    generatedAt: Date.now(),
    logs: mergedLogs,
  };

  const existing = await listFiles(accessToken, mediaFolder.id);
  const missing = [...media.entries()].filter(([hash]) => !existing.has(`${hash}.bin`));

  onProgress?.({ phase: "uploading", uploaded: 0, total: missing.length });
  let uploaded = 0;
  for (const [hash, payload] of missing) {
    await uploadMedia(accessToken, mediaFolder.id, hash, payload);
    uploaded++;
    onProgress?.({ phase: "uploading", uploaded, total: missing.length });
  }

  const needed = collectMediaNames(mergedLogs);
  const orphaned = [...existing.entries()].filter(([name]) => !needed.has(name));
  onProgress?.({ phase: "pruning", pruned: 0, total: orphaned.length });
  let pruned = 0;
  for (const [, fileId] of orphaned) {
    await deleteFile(accessToken, fileId);
    pruned++;
    onProgress?.({ phase: "pruning", pruned, total: orphaned.length });
  }

  onProgress?.({ phase: "manifest" });
  await uploadManifest(accessToken, manifestFile.id, manifest);

  const lastBackup = { timestamp: Date.now(), count: mergedLogs.length };
  await setBackupState({
    folderId: backupFolder.id,
    mediaFolderId: mediaFolder.id,
    manifestFileId: manifestFile.id,
    lastBackup,
  });

  return { count: mergedLogs.length, uploadedMedia: uploaded, prunedMedia: pruned };
}

export type LastBackupStatus = { timestamp: number; count: number } | null;

export async function getLastBackupStatus(): Promise<LastBackupStatus> {
  const state = await getBackupState();
  return state.lastBackup ?? null;
}

export type BackupInfo = { count: number; timestamp: number };

// Read-only: signs in and reports what backup (if any) exists for this Google
// account, without creating a folder or any file. Used to ask "restore your
// N observations from <date>?" before touching local data.
export async function findBackup(): Promise<BackupInfo | null> {
  const { accessToken } = await signInAndGetToken();
  const folderId = await findFolderId(accessToken, BACKUP_FOLDER_NAME);
  if (!folderId) return null;
  const manifestFileId = await findFileId(accessToken, MANIFEST_NAME, folderId);
  if (!manifestFileId) return null;
  const manifest = await downloadManifest(accessToken, manifestFileId);
  return { count: manifest.logs.length, timestamp: manifest.generatedAt };
}

async function refToDataUrl(
  token: string,
  mediaIndex: Map<string, string>,
  ref: MediaRef,
): Promise<string> {
  const fileId = mediaIndex.get(`${ref.hash}.bin`);
  if (!fileId) throw new Error(`Backup is missing media file ${ref.hash}.bin`);
  const base64 = await downloadFileBase64(token, fileId);
  return `data:${ref.mime};base64,${base64}`;
}

async function inlineLog(
  token: string,
  mediaIndex: Map<string, string>,
  entry: ManifestLogEntry,
): Promise<LogEntry> {
  const { photo, photos, voice, ...rest } = entry;
  return {
    ...rest,
    photo: photo ? await refToDataUrl(token, mediaIndex, photo) : undefined,
    photos: photos
      ? await Promise.all(photos.map((r) => refToDataUrl(token, mediaIndex, r)))
      : undefined,
    voice: voice ? await refToDataUrl(token, mediaIndex, voice) : undefined,
  };
}

// Logs restored per batch: fetched, inlined, and committed to the local store
// before the next batch starts, so a large backup never holds more than a
// handful of decoded photos/voice notes in memory at once.
const RESTORE_BATCH_SIZE = 10;

export type RestoreProgress =
  | { phase: "signin" | "locating" | "manifest" }
  | { phase: "restoring"; restored: number; total: number };

export type RestoreResult = { count: number };

export async function restoreNow(
  onProgress?: (p: RestoreProgress) => void,
): Promise<RestoreResult> {
  onProgress?.({ phase: "signin" });
  const { accessToken } = await signInAndGetToken();

  onProgress?.({ phase: "locating" });
  const folderId = await findFolderId(accessToken, BACKUP_FOLDER_NAME);
  if (!folderId) throw new Error("No backup was found for this Google account.");
  const manifestFileId = await findFileId(accessToken, MANIFEST_NAME, folderId);
  if (!manifestFileId) throw new Error("No backup was found for this Google account.");
  const mediaFolderId = await findFolderId(accessToken, MEDIA_FOLDER_NAME, folderId);
  if (!mediaFolderId) throw new Error("This backup's media folder is missing.");

  onProgress?.({ phase: "manifest" });
  const manifest = await downloadManifest(accessToken, manifestFileId);
  const mediaIndex = await listFiles(accessToken, mediaFolderId);

  const total = manifest.logs.length;
  onProgress?.({ phase: "restoring", restored: 0, total });

  let restored = 0;
  for (let i = 0; i < total; i += RESTORE_BATCH_SIZE) {
    const batchEntries = manifest.logs.slice(i, i + RESTORE_BATCH_SIZE);
    const batch: LogEntry[] = [];
    for (const entry of batchEntries) {
      batch.push(await inlineLog(accessToken, mediaIndex, entry));
    }
    importLogs(batch, { merge: true });
    restored += batch.length;
    onProgress?.({ phase: "restoring", restored, total });
  }

  await setBackupState({
    folderId,
    mediaFolderId,
    manifestFileId,
    lastBackup: { timestamp: manifest.generatedAt, count: total },
  });

  return { count: total };
}
