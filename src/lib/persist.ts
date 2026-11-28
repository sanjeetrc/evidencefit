// ===== Data safety: persistent storage, offline shell, backup age =====
import type { AppState } from '../types';

export type PersistStatus = 'persisted' | 'not-persisted' | 'unsupported';

/**
 * Ask the browser not to evict this site's storage under disk pressure.
 * Chrome answers silently. It usually grants this once the app is installed to the home screen or used
 * often, so it's asked again on every start. Never throws.
 */
export async function requestPersistentStorage(): Promise<PersistStatus> {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!s?.persist || !s.persisted) return 'unsupported';
    if (await s.persisted()) return 'persisted';
    return (await s.persist()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'unsupported';
  }
}

/** Register the offline shell (production builds only; dev and HMR stay untouched). */
export function registerServiceWorker(): void {
  if (!import.meta.env?.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* offline shell is optional */ });
  });
}

export const BACKUP_STALE_DAYS = 7;
const DAY_MS = 86_400_000;

/** Whole days since an ISO timestamp, or null if missing/invalid. */
export const daysSince = (iso: string | null | undefined, now = Date.now()): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY_MS)) : null;
};

/**
 * Should Today nag for a backup? Only when there is something to lose and no recent copy anywhere.
 * A copy is either a downloaded backup or a successful Drive sync with nothing pending.
 */
export function backupReminderNeeded(state: AppState, now = Date.now()): boolean {
  const hasData = state.profiles.some((p) => p.circuitLogs.length > 0 || Object.values(p.proteinLogs).some((d) => d.length > 0));
  if (!hasData) return false;
  const backupAge = daysSince(state.lastBackupAt, now);
  if (backupAge !== null && backupAge < BACKUP_STALE_DAYS) return false;
  const d = state.driveSync;
  const driveAge = d?.enabled && !d.pendingSync ? daysSince(d.lastSyncAt, now) : null;
  return !(driveAge !== null && driveAge < BACKUP_STALE_DAYS);
}
