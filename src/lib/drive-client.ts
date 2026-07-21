// Shared low-level Google Drive v3 REST helpers, used by backup-auth.ts (Phase 0
// sign-in) and backup.ts (Phase 1 manifest/media). Every native plugin is loaded
// with a dynamic import, matching the rest of the app.
//
// On Android/iOS, CapacitorHttp only accepts a string or JSON body directly
// (@capacitor/core http.md). Binary bodies must be base64-encoded with
// dataType: "file"; the native layer base64-decodes them before writing the raw
// bytes as the request body (verified against Capacitor's own Android source,
// CapacitorHttpUrlConnection.setRequestBody). Web's fetch has no such
// restriction and takes the decoded bytes directly.

export const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
export const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveResponse = { status: number; data: unknown; headers: Record<string, string> };

export type DriveRequestOptions = {
  headers?: Record<string, string>;
  // Sent as a JSON body; Content-Type: application/json is added automatically.
  json?: unknown;
  // Sent as a raw binary body. Must be a base64 string (the payload half of a
  // data URL works as-is, no re-encoding needed). Caller must set the real
  // Content-Type (e.g. image/jpeg) via `headers`.
  base64Body?: string;
};

export async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function driveRequest(
  method: string,
  url: string,
  token: string,
  opts: DriveRequestOptions = {},
): Promise<DriveResponse> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...opts.headers };
  if (opts.json !== undefined) headers["Content-Type"] ??= "application/json";

  if (await isNative()) {
    const { CapacitorHttp } = await import("@capacitor/core");
    const resp = await CapacitorHttp.request({
      method,
      url,
      headers,
      data: opts.base64Body !== undefined ? opts.base64Body : opts.json,
      dataType: opts.base64Body !== undefined ? "file" : undefined,
    });
    return { status: resp.status, data: resp.data, headers: resp.headers ?? {} };
  }

  const body =
    opts.base64Body !== undefined
      ? base64ToBytes(opts.base64Body)
      : opts.json !== undefined
        ? JSON.stringify(opts.json)
        : undefined;
  const resp = await fetch(url, { method, headers, body });
  const respHeaders: Record<string, string> = {};
  resp.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });
  let data: unknown = null;
  try {
    data = await resp.clone().json();
  } catch {
    data = null;
  }
  return { status: resp.status, data, headers: respHeaders };
}

export function driveError(action: string, resp: DriveResponse): Error {
  const d = resp.data as { error?: { message?: string } } | null;
  const msg = d?.error?.message ? `: ${d.error.message}` : "";
  return new Error(`Drive ${action} failed (HTTP ${resp.status})${msg}`);
}

// Finds a folder by name (optionally scoped to a parent) or creates it,
// returning its id. Uses the user's own Drive; drive.file only exposes files
// this app created.
export async function findOrCreateFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<{ id: string; created: boolean }> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `name='${name}' and mimeType='${FOLDER_MIME}' and trashed=false${parentClause}`;
  const listUrl =
    `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}` +
    `&fields=${encodeURIComponent("files(id,name)")}&spaces=drive`;

  const list = await driveRequest("GET", listUrl, token);
  if (list.status < 200 || list.status >= 300) throw driveError(`folder lookup (${name})`, list);

  const files = (list.data as { files?: Array<{ id: string }> } | null)?.files ?? [];
  if (files.length > 0 && files[0]?.id) {
    return { id: files[0].id, created: false };
  }

  const create = await driveRequest("POST", DRIVE_FILES_URL, token, {
    json: { name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined },
  });
  if (create.status < 200 || create.status >= 300) {
    throw driveError(`folder create (${name})`, create);
  }
  const id = (create.data as { id?: string } | null)?.id;
  if (!id) throw new Error(`Drive folder "${name}" was created but no id was returned.`);
  return { id, created: true };
}
