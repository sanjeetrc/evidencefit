import type { Dispatch, SetStateAction } from 'react';
import type { AppState } from '../types';
import { formatDateISO } from './dates';
import { downloadFile } from './download';
import { exportSafeState } from './storage';

/** Download the JSON backup (API keys stripped by exportSafeState) and record when it was taken. */
export function downloadBackup(state: AppState, setState: Dispatch<SetStateAction<AppState | null>>): void {
  const safe = exportSafeState(state); // never exports API keys (shared with the Drive copy)
  downloadFile(JSON.stringify(safe, null, 2), `evidencefit-backup-${formatDateISO()}.json`, 'application/json');
  setState((prev) => (prev ? { ...prev, lastBackupAt: new Date().toISOString() } : prev));
}
