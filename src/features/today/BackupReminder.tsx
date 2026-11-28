import { useState, type Dispatch, type SetStateAction } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import { downloadBackup } from '../../lib/backup';
import { backupReminderNeeded, daysSince } from '../../lib/persist';
import type { AppState, ShowToast } from '../../types';

// Per-device "remind me later" (a convenience only; losing it just shows the reminder again).
const SNOOZE_KEY = 'evidencefit_backup_snooze_until';
const SNOOZE_DAYS = 3;
const readSnooze = () => { try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch { return 0; } };

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState | null>>;
  showToast: ShowToast;
}

/** Top-of-Today warning: data lives only in this browser and there's no recent backup or Drive copy. */
export default function BackupReminder({ state, setState, showToast }: Props) {
  const [snoozeUntil, setSnoozeUntil] = useState(readSnooze);
  const [now] = useState(() => Date.now());
  if (!backupReminderNeeded(state, now) || now < snoozeUntil) return null;

  const age = daysSince(state.lastBackupAt, now);
  const later = () => {
    const until = Date.now() + SNOOZE_DAYS * 86_400_000;
    try { localStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* still hides for this session */ }
    setSnoozeUntil(until);
  };

  return (
    <section className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 space-y-3" aria-label="Backup reminder">
      <p className="flex items-start gap-2 text-base font-bold text-amber-950">
        <ShieldAlert className="w-6 h-6 shrink-0" aria-hidden />
        Your log is stored only on this phone. {age === null ? 'You have never made a backup.' : `Last backup: ${age} days ago.`}
      </p>
      <p className="text-base text-amber-950">If Chrome's data is cleared or the phone is lost, it's gone. Save a copy (e.g. to Google Drive or email it to yourself).</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={() => { downloadBackup(state, setState); showToast('Backup downloaded. It contains health info — store it privately.'); }}
          className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-amber-700 text-white text-base font-bold">
          <Download className="w-5 h-5" aria-hidden /> Download backup now
        </button>
        <button type="button" onClick={later}
          className="min-h-[48px] px-4 rounded-xl border-2 border-amber-600 bg-white text-base font-bold text-amber-950">
          Remind me in {SNOOZE_DAYS} days
        </button>
      </div>
    </section>
  );
}
