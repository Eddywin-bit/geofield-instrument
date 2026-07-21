// Phase 1 of cloud backup: manifest + content-addressed media upload to the
// user's own Google Drive. Builds on backup-auth.ts (sign-in, backup folder)
// and drive-client.ts (Drive REST + native/web HTTP dual path). No restore
// yet; that is Phase 2.
import type { LogEntry } from "./logs-store";
import { hydrateLogs, loadLogs } from "./logs-store";
import { signInAndGetToken, findOrCreateBackupFolder } from "./backup-auth";
import { getBackupState, setBackupState } from "./backup-state";
import {
  DRIVE_FILES_URL,
  DRIVE_UPLOAD_URL,
  driveError,
  driveRequest,
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

// Every file's name currently in a Drive folder (one page fetch per 1000
// entries), so we know which content-addressed media hashes are already
// backed up and skip re-uploading them.
async function listFileNames(token: string, folderId: string): Promise<Set<string>> {
  const names = new Set<string>();
  let pageToken: string | undefined;
  do {
    const q = `'${folderId}' in parents and trashed=false`;
    const url =
      `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent("nextPageToken,files(name)")}&pageSize=1000&spaces=drive` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const list = await driveRequest("GET", url, token);
    if (list.status < 200 || list.status >= 300) throw driveError("media list", list);
    const data = list.data as { files?: Array<{ name: string }>; nextPageToken?: string } | null;
    for (const f of data?.files ?? []) names.add(f.name);
    pageToken = data?.nextPageToken;
  } while (pageToken);
  return names;
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

async function ensureManifestFile(token: string, backupFolderId: string): Promise<string> {
  const cached = (await getBackupState()).manifestFileId;
  if (cached) return cached;

  const q = `name='${MANIFEST_NAME}' and '${backupFolderId}' in parents and trashed=false`;
  const listUrl =
    `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}` +
    `&fields=${encodeURIComponent("files(id)")}&spaces=drive`;
  const list = await driveRequest("GET", listUrl, token);
  if (list.status < 200 || list.status >= 300) throw driveError("manifest lookup", list);
  const existing = (list.data as { files?: Array<{ id: string }> } | null)?.files ?? [];
  if (existing.length > 0 && existing[0]?.id) return existing[0].id;

  const create = await driveRequest("POST", DRIVE_FILES_URL, token, {
    json: { name: MANIFEST_NAME, parents: [backupFolderId], mimeType: "application/json" },
  });
  if (create.status < 200 || create.status >= 300) throw driveError("manifest create", create);
  const id = (create.data as { id?: string } | null)?.id;
  if (!id) throw new Error("manifest.json was created but no id was returned.");
  return id;
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

export type BackupProgress =
  | { phase: "signin" | "folders" | "hashing" | "manifest" }
  | { phase: "uploading"; uploaded: number; total: number };

export type BackupResult = { count: number; uploadedMedia: number };

export async function backupNow(onProgress?: (p: BackupProgress) => void): Promise<BackupResult> {
  onProgress?.({ phase: "signin" });
  const { accessToken } = await signInAndGetToken();

  onProgress?.({ phase: "folders" });
  const backupFolder = await findOrCreateBackupFolder(accessToken);
  const mediaFolder = await findOrCreateFolder(accessToken, MEDIA_FOLDER_NAME, backupFolder.id);

  onProgress?.({ phase: "hashing" });
  await hydrateLogs();
  const logs = loadLogs();
  const { manifest, media } = await buildManifest(logs);

  const existingNames = await listFileNames(accessToken, mediaFolder.id);
  const missing = [...media.entries()].filter(([hash]) => !existingNames.has(`${hash}.bin`));

  onProgress?.({ phase: "uploading", uploaded: 0, total: missing.length });
  let uploaded = 0;
  for (const [hash, payload] of missing) {
    await uploadMedia(accessToken, mediaFolder.id, hash, payload);
    uploaded++;
    onProgress?.({ phase: "uploading", uploaded, total: missing.length });
  }

  onProgress?.({ phase: "manifest" });
  const manifestFileId = await ensureManifestFile(accessToken, backupFolder.id);
  await uploadManifest(accessToken, manifestFileId, manifest);

  const lastBackup = { timestamp: Date.now(), count: logs.length };
  await setBackupState({
    folderId: backupFolder.id,
    mediaFolderId: mediaFolder.id,
    manifestFileId,
    lastBackup,
  });

  return { count: logs.length, uploadedMedia: uploaded };
}

export type LastBackupStatus = { timestamp: number; count: number } | null;

export async function getLastBackupStatus(): Promise<LastBackupStatus> {
  const state = await getBackupState();
  return state.lastBackup ?? null;
}
