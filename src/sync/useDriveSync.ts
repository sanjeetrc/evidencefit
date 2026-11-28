import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppState, DriveSyncSettings } from '../types';
import { buildDriveDocText, buildDriveJson } from './driveContent';
import {
  DriveError, hasValidToken, isDriveConfigured, preloadGoogle, requestTokenFromGesture, revokeToken, syncToDrive,
} from './googleDrive';

// ===== Drive sync state machine (React side) =====
// Saving never waits for Drive: saves bump a counter, and an effect syncs the committed state afterwards.
// With no valid token (it lives in memory only, ~1 h), an automatic sync just marks pendingSync; the
// "Not synced — tap to retry" chip then gets a real tap, which is what the Google popup needs on Android.

export type DriveStatus = 'idle' | 'syncing' | 'error';

export interface DriveSync {
  /** False when the build has no VITE_GOOGLE_CLIENT_ID: hide everything. */
  configured: boolean;
  settings: DriveSyncSettings | undefined;
  enabled: boolean;
  status: DriveStatus;
  lastError: string | null;
  /** Call after a save (circuit, safety check). Never blocks; no-op when sync is off. */
  requestAutoSync: () => void;
  /** Click handlers only (they may open the Google sign-in popup). */
  connect: () => void;
  syncNow: () => void;
  disconnect: () => void;
  /** Load Google's script ahead of a tap (e.g. when the Settings card is shown). */
  preload: () => void;
}

const NOOP_SYNC: DriveSync = {
  configured: false, settings: undefined, enabled: false, status: 'idle', lastError: null,
  requestAutoSync: () => {}, connect: () => {}, syncNow: () => {}, disconnect: () => {}, preload: () => {},
};

export const DriveSyncContext = createContext<DriveSync>(NOOP_SYNC);
export const useDrive = () => useContext(DriveSyncContext);

const activeProfile = (s: AppState) => s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0];

export function useDriveSync(state: AppState | null, setState: Dispatch<SetStateAction<AppState | null>>): DriveSync {
  const configured = isDriveConfigured();
  const settings = state?.driveSync;
  const enabled = configured && !!settings?.enabled;

  const [status, setStatus] = useState<DriveStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const [autoTick, setAutoTick] = useState(0);

  // Latest committed state, for click handlers and the async sync loop (never read during render).
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const busyRef = useRef(false);
  const againRef = useRef(false);

  const patchDrive = useCallback((patch: Partial<DriveSyncSettings>) => {
    setState((prev) => (prev ? { ...prev, driveSync: { enabled: false, ...prev.driveSync, ...patch } } : prev));
  }, [setState]);

  /** Sync the latest state. Coalesces overlapping requests into one follow-up run. */
  const runSync = useCallback(async (forceEnabled = false): Promise<void> => {
    await Promise.resolve(); // always start asynchronously (never inside a render/effect body)
    if (busyRef.current) { againRef.current = true; return; }
    busyRef.current = true;
    try {
      do {
        againRef.current = false;
        const s = stateRef.current;
        if (!s || !(forceEnabled || s.driveSync?.enabled)) return;
        if (!hasValidToken()) {
          patchDrive({ pendingSync: true });
          setStatus('error');
          setLastError('Sign-in needed — tap to sync.');
          return;
        }
        setStatus('syncing');
        try {
          const ids = await syncToDrive(s.driveSync ?? {}, {
            docText: buildDriveDocText(activeProfile(s)),
            json: buildDriveJson(s),
          });
          const lastSyncAt = new Date().toISOString();
          // Only record the result if sync is still on (the user may have tapped Disconnect meanwhile).
          setState((prev) => (prev?.driveSync?.enabled
            ? { ...prev, driveSync: { ...prev.driveSync, ...ids, lastSyncAt, pendingSync: false } }
            : prev));
          setStatus('idle');
          setLastError(null);
        } catch (e) {
          patchDrive({ pendingSync: true });
          setStatus('error');
          setLastError(e instanceof Error ? e.message : String(e));
          return;
        }
        forceEnabled = false;
      } while (againRef.current);
    } finally {
      busyRef.current = false;
    }
  }, [patchDrive, setState]);

  // Automatic sync after saves: runs once the save is committed, so it always sees the saved data.
  useEffect(() => {
    if (autoTick === 0) return;
    void runSync();
  }, [autoTick, runSync]);

  // Keep Google's script warm while sync is on, so a retry tap can open the popup immediately.
  useEffect(() => {
    if (enabled) void preloadGoogle().catch(() => {});
  }, [enabled]);

  const requestAutoSync = useCallback(() => {
    if (stateRef.current?.driveSync?.enabled && isDriveConfigured()) setAutoTick((n) => n + 1);
  }, []);

  /** Get a token from a tap (synchronously starts the popup when needed), then run `after`. */
  const withToken = useCallback((after: () => Promise<void>) => {
    if (hasValidToken()) { void after(); return; }
    const p = requestTokenFromGesture(); // must stay synchronous inside the click handler
    setStatus('syncing');
    p.then(after, (e: unknown) => {
      setStatus('error');
      setLastError(e instanceof DriveError || e instanceof Error ? e.message : String(e));
    });
  }, []);

  const connect = useCallback(() => {
    withToken(async () => {
      patchDrive({ enabled: true });
      await runSync(true);
    });
  }, [withToken, patchDrive, runSync]);

  const syncNow = useCallback(() => {
    withToken(() => runSync());
  }, [withToken, runSync]);

  const disconnect = useCallback(() => {
    void revokeToken();
    setState((prev) => (prev ? { ...prev, driveSync: { enabled: false } } : prev));
    setStatus('idle');
    setLastError(null);
  }, [setState]);

  const preload = useCallback(() => { if (isDriveConfigured()) void preloadGoogle().catch(() => {}); }, []);

  if (!configured) return NOOP_SYNC;
  return { configured, settings, enabled, status, lastError, requestAutoSync, connect, syncNow, disconnect, preload };
}
