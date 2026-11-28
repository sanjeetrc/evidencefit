import { buildCoachBrief } from '../domain/coachBrief';
import { exportSafeState } from '../lib/storage';
import type { AppState, Profile } from '../types';

// ===== What gets written to Google Drive (pure; no network) =====

export const DRIVE_FOLDER_NAME = 'EvidenceFit';
export const DRIVE_DOC_NAME = 'EvidenceFit Coach Log';
export const DRIVE_JSON_NAME = 'evidencefit-data.json';
export const DRIVE_BRIEF_DAYS = 56;

const syncedLabel = (d: Date) =>
  d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Text for the Google Doc: "Last synced …" header, then the coach brief for the last 56 days (health flags
 * included), without the trailing "MY QUESTION:" prompt — in Drive the user asks in Claude instead.
 */
export function buildDriveDocText(profile: Profile, now: Date = new Date(), todayISO?: string): string {
  const brief = buildCoachBrief(profile, { days: DRIVE_BRIEF_DAYS, includeHealth: true, today: todayISO });
  const body = brief.replace(/\s*MY QUESTION:\s*$/, '').trimEnd();
  return `Last synced ${syncedLabel(now)}\n\n${body}\n`;
}

/** JSON copy for Drive: the same key-stripped state as a backup download, minus chat history. */
export function buildDriveJson(state: AppState): string {
  const safe = exportSafeState(state);
  const data = { ...safe, profiles: safe.profiles.map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'chatHistory'))) };
  return JSON.stringify(data, null, 2);
}
