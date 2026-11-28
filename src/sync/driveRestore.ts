import { DRIVE_JSON_NAME } from './driveContent';

// ===== One-click restore from Google Drive =====
// Read-only scope, so it also finds evidencefit-data.json files that an earlier build (another
// client or upload) created. The token is used for one download and revoked straight away.

const CLIENT_ID: string = import.meta.env?.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const MAX_BYTES = 10_000_000;

interface TokenResponse { access_token?: string; error?: string; error_description?: string }
interface OAuth2 {
  initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string; message?: string }) => void }): { requestAccessToken(o?: { prompt?: string }): void };
  revoke(token: string, done?: () => void): void;
}
const oauth2 = (): OAuth2 | undefined => (window as unknown as { google?: { accounts?: { oauth2?: OAuth2 } } }).google?.accounts?.oauth2;

export const isDriveRestoreConfigured = () => CLIENT_ID.length > 0;

let gisPromise: Promise<OAuth2> | null = null;
/** Loads Google sign-in ahead of the tap, so the popup opens straight from the click (Android Chrome). */
export function preloadDriveRestore(): Promise<OAuth2> {
  const ready = oauth2();
  if (ready) return Promise.resolve(ready);
  gisPromise ??= new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const s = existing ?? document.createElement('script');
    const done = () => { const o = oauth2(); if (o) resolve(o); else { gisPromise = null; reject(new Error('Google sign-in did not load.')); } };
    s.addEventListener('load', done);
    s.addEventListener('error', () => { gisPromise = null; reject(new Error('Could not reach Google. Check the internet connection.')); });
    if (!existing) { s.src = GIS_SRC; s.async = true; document.head.appendChild(s); }
    else if (oauth2()) done();
  });
  return gisPromise;
}

function getToken(o: OAuth2): Promise<string> {
  return new Promise((resolve, reject) => {
    o.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error_description || r.error || 'Google sign-in was not completed.'))),
      error_callback: (e) => reject(new Error(
        e.type === 'popup_closed' ? 'The Google window was closed before signing in.'
          : e.type === 'popup_failed_to_open' ? 'The browser blocked the Google window. Allow pop-ups for this site and try again.'
            : e.message || 'Google sign-in failed.')),
    }).requestAccessToken({ prompt: '' });
  });
}

export interface DriveBackup { raw: unknown; modifiedTime: string }

/** Signs in (read-only), downloads the newest evidencefit-data.json, then revokes the access. */
export async function fetchDriveBackup(fetchImpl: typeof fetch = fetch): Promise<DriveBackup> {
  if (!isDriveRestoreConfigured()) throw new Error('Google Drive is not set up in this build.');
  const o = await preloadDriveRestore();
  const token = await getToken(o);
  try {
    const auth = { Authorization: `Bearer ${token}` };
    const q = encodeURIComponent(`name = '${DRIVE_JSON_NAME}' and trashed = false`);
    const list = await fetchImpl(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=5&fields=files(id,modifiedTime,size)`, { headers: auth });
    if (!list.ok) throw new Error(list.status === 403 ? 'Google Drive refused access. Allow "see your Google Drive files" when asked.' : `Google Drive error ${list.status}.`);
    const files = ((await list.json()) as { files?: { id: string; modifiedTime: string; size?: string }[] }).files ?? [];
    if (!files.length) throw new Error(`No file named ${DRIVE_JSON_NAME} was found in your Google Drive.`);
    const f = files[0];
    if (Number(f.size ?? 0) > MAX_BYTES) throw new Error('That Drive file is too large to be an EvidenceFit backup.');
    const res = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media`, { headers: auth });
    if (!res.ok) throw new Error(`Could not download the file (error ${res.status}).`);
    try { return { raw: JSON.parse(await res.text()), modifiedTime: f.modifiedTime }; } catch { throw new Error('The Drive file is not valid JSON.'); }
  } finally {
    try { o.revoke(token); } catch { /* best effort */ }
  }
}
