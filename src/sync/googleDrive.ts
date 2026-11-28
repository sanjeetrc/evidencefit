import { DRIVE_DOC_NAME, DRIVE_FOLDER_NAME, DRIVE_JSON_NAME } from './driveContent';

// ===== Google Drive sync: browser-only (Google Identity Services token flow + Drive REST v3) =====
//
// - No backend, no client secret. Scope drive.file: the app can only see files it created.
// - The access token lives in this module's memory only (never localStorage, never backups) and expires ~1 h.
// - requestAccessToken() must be called synchronously inside a click handler, or Android Chrome blocks the popup.
//   So the GIS script is preloaded (preloadGoogle) before any tap that might need it.

// `?.` keeps this module importable outside Vite (throwaway Node test scripts).
const CLIENT_ID: string = import.meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/** The whole feature is hidden when no client ID was set at build time. */
export const isDriveConfigured = () => CLIENT_ID.length > 0;

// ---- Minimal typings for the parts of GIS we use ----
interface TokenResponse { access_token?: string; expires_in?: number | string; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (overrides?: { prompt?: string }) => void }
interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}
declare global {
  interface Window { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }
}

// ---- Token (memory only) ----
let token: string | null = null;
let tokenExpiresAt = 0;
let tokenClient: TokenClient | null = null;
let gisLoading: Promise<void> | null = null;
let pendingToken: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

export const hasValidToken = () => !!token && Date.now() < tokenExpiresAt - 60_000;
export const isGoogleReady = () => tokenClient !== null;

const settle = (fn: (p: NonNullable<typeof pendingToken>) => void) => {
  const p = pendingToken;
  pendingToken = null;
  if (p) fn(p);
};

/** Load Google Identity Services once and create the token client. Safe to call repeatedly. */
export function preloadGoogle(): Promise<void> {
  if (!isDriveConfigured()) return Promise.reject(new DriveError('not-configured', 'Google Drive sync is not set up in this build.'));
  if (tokenClient) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      const ready = () => {
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) { reject(new DriveError('offline', 'Google sign-in did not load.')); return; }
        tokenClient = oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              settle((p) => p.reject(new DriveError('auth', resp.error_description || resp.error || 'Google sign-in failed.')));
              return;
            }
            token = resp.access_token;
            tokenExpiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
            settle((p) => p.resolve(resp.access_token as string));
          },
          error_callback: (err) => {
            const closed = err?.type === 'popup_closed';
            settle((p) => p.reject(new DriveError('auth', closed ? 'Sign-in window was closed.' : err?.message || 'Google sign-in was blocked.')));
          },
        });
        resolve();
      };
      if (window.google?.accounts?.oauth2) { ready(); return; }
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = ready;
      s.onerror = () => { gisLoading = null; reject(new DriveError('offline', 'Could not load Google sign-in — check your connection.')); };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

/**
 * Ask Google for an access token. MUST be called synchronously from a click/tap handler (before any await),
 * so the popup counts as a user gesture. Rejects with code 'not-ready' if the script hasn't loaded yet.
 */
export function requestTokenFromGesture(): Promise<string> {
  if (!tokenClient) {
    void preloadGoogle().catch(() => {});
    return Promise.reject(new DriveError('not-ready', 'Google sign-in is still loading — tap again in a moment.'));
  }
  settle((p) => p.reject(new DriveError('auth', 'Sign-in was replaced by a newer request.')));
  const promise = new Promise<string>((resolve, reject) => { pendingToken = { resolve, reject }; });
  tokenClient.requestAccessToken({ prompt: '' });
  return promise;
}

/** Revoke the current token (if any) and forget it. */
export function revokeToken(): Promise<void> {
  const t = token;
  token = null;
  tokenExpiresAt = 0;
  const oauth2 = window.google?.accounts?.oauth2;
  if (!t || !oauth2) return Promise.resolve();
  return new Promise((resolve) => oauth2.revoke(t, () => resolve()));
}

// ---- Errors ----
export type DriveErrorCode = 'not-configured' | 'not-ready' | 'auth' | 'offline' | 'server' | 'not-found' | 'http';
export class DriveError extends Error {
  readonly code: DriveErrorCode;
  readonly status?: number;
  constructor(code: DriveErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'DriveError';
    this.code = code;
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Authorized fetch. 401/403-auth → token dropped; 5xx → one retry after a short backoff; 404 → 'not-found'. */
async function driveFetch(url: string, init: RequestInit): Promise<Response> {
  if (!hasValidToken()) throw new DriveError('auth', 'Google sign-in has expired — tap to sign in again.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new DriveError('offline', 'You are offline.');
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } });
    } catch {
      throw new DriveError('offline', 'Network error — check your connection.');
    }
    if (res.ok) return res;
    if (res.status >= 500 && attempt === 0) { await sleep(1500 + Math.random() * 500); continue; }
    if (res.status === 401) { token = null; tokenExpiresAt = 0; throw new DriveError('auth', 'Google sign-in has expired — tap to sign in again.', 401); }
    if (res.status === 404) throw new DriveError('not-found', 'File not found in Drive.', 404);
    if (res.status >= 500) throw new DriveError('server', `Google Drive is busy (HTTP ${res.status}) — will retry.`, res.status);
    let detail = '';
    try { detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? ''; } catch { /* no body */ }
    throw new DriveError('http', `Google Drive refused the request (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`, res.status);
  }
}

const idOf = async (res: Response) => {
  const id = ((await res.json()) as { id?: unknown }).id;
  if (typeof id !== 'string' || !id) throw new DriveError('http', 'Google Drive returned no file ID.');
  return id;
};

async function createFolder(): Promise<string> {
  const res = await driveFetch(`${DRIVE_API}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return idOf(res);
}

/** Multipart create: metadata (name, parent, target mimeType) + content. A Doc target converts the text on upload. */
async function createFile(name: string, parentId: string, targetMime: string, bodyMime: string, body: string): Promise<string> {
  const boundary = `evidencefit-${Math.random().toString(36).slice(2)}`;
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name, parents: [parentId], mimeType: targetMime })}\r\n` +
    `--${boundary}\r\nContent-Type: ${bodyMime}; charset=UTF-8\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await driveFetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  return idOf(res);
}

/** Replace a file's content in place (keeps its ID, so Claude's link to the Doc stays valid). */
async function updateFile(id: string, bodyMime: string, body: string): Promise<void> {
  await driveFetch(`${DRIVE_UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': `${bodyMime}; charset=UTF-8` },
    body,
  });
}

export interface DriveIds { folderId?: string; docId?: string; jsonId?: string }
export interface DriveContent { docText: string; json: string }

const DOC_MIME = 'application/vnd.google-apps.document';

/**
 * Write both files. Creates the folder/files on first run; afterwards updates them in place.
 * A stored ID that returns 404 (deleted in Drive) is recreated. Returns the IDs to store.
 */
export async function syncToDrive(ids: DriveIds, content: DriveContent): Promise<Required<DriveIds>> {
  let folderId = ids.folderId ?? (await createFolder());

  // Create inside the folder; if the folder itself was deleted, recreate it once and retry.
  const createIn = async (name: string, targetMime: string, bodyMime: string, body: string) => {
    try {
      return await createFile(name, folderId, targetMime, bodyMime, body);
    } catch (e) {
      if (e instanceof DriveError && e.code === 'not-found') {
        folderId = await createFolder();
        return createFile(name, folderId, targetMime, bodyMime, body);
      }
      throw e;
    }
  };

  const upsert = async (id: string | undefined, name: string, targetMime: string, bodyMime: string, body: string) => {
    if (id) {
      try {
        await updateFile(id, bodyMime, body);
        return id;
      } catch (e) {
        if (!(e instanceof DriveError && e.code === 'not-found')) throw e;
      }
    }
    return createIn(name, targetMime, bodyMime, body);
  };

  const docId = await upsert(ids.docId, DRIVE_DOC_NAME, DOC_MIME, 'text/plain', content.docText);
  const jsonId = await upsert(ids.jsonId, DRIVE_JSON_NAME, 'application/json', 'application/json', content.json);
  return { folderId, docId, jsonId };
}

/** Test hook: set a token without GIS (used by throwaway scripts only). */
export function __setTokenForTests(t: string | null, expiresInSec = 3600) {
  token = t;
  tokenExpiresAt = t ? Date.now() + expiresInSec * 1000 : 0;
}
