/**
 * One-click restore from Google Drive (web app only).
 * Uses Google Identity Services to get a short-lived, read-only Drive token in the browser,
 * finds the newest `evidencefit-data.json`, downloads it, then revokes the token.
 * No server and no stored Google credentials. The OAuth client ID is public by design.
 */

export const DRIVE_FILE_NAME = 'evidencefit-data.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID_KEY = 'evidencefit_google_client_id';

/** The app's own OAuth Web client ID (public by design; allowed origin: the GitHub Pages site). */
export const DEFAULT_CLIENT_ID = '911891516673-ebnqcbm5so459ouimcsorcl16ru7dfc6.apps.googleusercontent.com';

/** Build-time override, else the built-in default, else one pasted in Settings on this device. */
export function getClientId(): string {
  const built = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID;
  if (built) return built;
  try { return localStorage.getItem(CLIENT_ID_KEY) ?? ''; } catch { return ''; }
}
export const hasBuiltInClientId = () => Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID);
export const isValidClientId = (id: string) => /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id.trim());
export function saveClientId(id: string) {
  try { if (id) localStorage.setItem(CLIENT_ID_KEY, id.trim()); else localStorage.removeItem(CLIENT_ID_KEY); } catch { /* ignore */ }
}

interface TokenResponse { access_token?: string; error?: string; error_description?: string }
interface GoogleOAuth2 {
  initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string; message?: string }) => void }): { requestAccessToken(o?: { prompt?: string }): void };
  revoke(token: string, done?: () => void): void;
}
declare global { interface Window { google?: { accounts?: { oauth2?: GoogleOAuth2 } } } }

let gisPromise: Promise<GoogleOAuth2> | null = null;
function loadGis(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => { gisPromise = null; reject(new Error('Could not reach Google. Check the internet connection.')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function getToken(oauth: GoogleOAuth2, clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error_description || r.error || 'Google sign-in was not completed.'))),
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'The Google window was closed before signing in.' : e.type === 'popup_failed_to_open' ? 'The browser blocked the Google window. Allow pop-ups for this site and try again.' : e.message || 'Google sign-in failed.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export interface DriveBackup { raw: unknown; modifiedTime: string; sizeBytes: number }

/** Signs in, fetches the newest evidencefit-data.json, revokes access. Never throws raw errors to the UI. */
export async function fetchDriveBackup(clientId: string, fetchImpl: typeof fetch = fetch): Promise<DriveBackup> {
  const oauth = await loadGis();
  const token = await getToken(oauth, clientId);
  try {
    const auth = { Authorization: `Bearer ${token}` };
    const q = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`);
    const list = await fetchImpl(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=5&fields=files(id,modifiedTime,size)`, { headers: auth });
    if (!list.ok) throw new Error(list.status === 403 ? 'Google Drive refused access. Allow "see your Google Drive files" when asked.' : `Google Drive error ${list.status}.`);
    const files = ((await list.json()) as { files?: { id: string; modifiedTime: string; size?: string }[] }).files ?? [];
    if (!files.length) throw new Error(`No file named ${DRIVE_FILE_NAME} was found in your Google Drive.`);
    const f = files[0];
    const size = Number(f.size ?? 0);
    if (size > 10_000_000) throw new Error('That Drive file is too large to be an EvidenceFit backup.');
    const res = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media`, { headers: auth });
    if (!res.ok) throw new Error(`Could not download the file (error ${res.status}).`);
    let raw: unknown;
    try { raw = JSON.parse(await res.text()); } catch { throw new Error('The Drive file is not valid JSON.'); }
    return { raw, modifiedTime: f.modifiedTime, sizeBytes: size };
  } finally {
    try { oauth.revoke(token); } catch { /* best effort */ }
  }
}
