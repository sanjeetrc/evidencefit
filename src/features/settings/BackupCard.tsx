import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { CloudDownload, Database, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui';
import { formatDateISO } from '../../lib/dates';
import { downloadBackup } from '../../lib/backup';
import { csvCell, downloadFile } from '../../lib/download';
import { requestPersistentStorage, type PersistStatus } from '../../lib/persist';
import { hasPreRestoreSnapshot, normalizeState, PRE_RESTORE_KEY } from '../../lib/storage';
import type { AppState, Profile, ShowToast } from '../../types';
import { fetchDriveBackup, isDriveRestoreConfigured, preloadDriveRestore } from '../../sync/driveRestore';

const MAX_BACKUP_BYTES = 10_000_000;

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState | null>>;
  profile: Profile;
  showToast: ShowToast;
}

const summarize = (s: AppState) =>
  `${s.profiles.length} profile(s), ${s.profiles.reduce((n, p) => n + p.circuitLogs.length, 0)} saved circuit(s)`;

export default function BackupCard({ state, setState, profile, showToast }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [canUndoRestore, setCanUndoRestore] = useState(hasPreRestoreSnapshot);
  const today = formatDateISO();
  const [persist, setPersist] = useState<PersistStatus | null>(null);
  useEffect(() => { void requestPersistentStorage().then(setPersist); }, []);

  const exportBackup = () => {
    downloadBackup(state, setState);
    showToast('Backup downloaded. It contains health info — store it privately.');
  };

  const importBackup = (file: File) => {
    if (file.size > MAX_BACKUP_BYTES) { showToast('That file is too large to be an EvidenceFit backup.'); return; }
    const reader = new FileReader();
    reader.onerror = () => showToast('Could not read that file.');
    reader.onload = () => {
      let restored: AppState | null = null;
      try { restored = normalizeState(JSON.parse(String(reader.result))); } catch { /* handled below */ }
      if (!restored) { showToast('Could not read that backup file.'); return; }
      applyRestore(restored, 'this backup', 'Backup restored.');
    };
    reader.readAsText(file);
  };

  /** Confirm, keep an undo copy, then replace the data (this device's AI key and Drive connection stay). */
  const applyRestore = (next: AppState, what: string, done: string) => {
    if (!window.confirm(`Replace ALL current data with ${what}?\n\nBackup: ${summarize(next)}\nCurrent: ${summarize(state)}\n\nYour current data is kept as an undo copy.`)) return;
    try {
      localStorage.setItem(PRE_RESTORE_KEY, JSON.stringify(state));
      setCanUndoRestore(true);
    } catch { /* storage full — restore anyway, user confirmed */ }
    setState((prev) => ({ ...next, aiCoach: prev?.aiCoach ?? next.aiCoach, driveSync: prev?.driveSync ?? next.driveSync }));
    showToast(done);
  };

  const driveRestoreOn = isDriveRestoreConfigured();
  const [driveBusy, setDriveBusy] = useState(false);
  useEffect(() => { if (driveRestoreOn) void preloadDriveRestore().catch(() => { /* retried on tap */ }); }, [driveRestoreOn]);
  const restoreFromDrive = async () => {
    if (driveBusy) return;
    setDriveBusy(true);
    try {
      const { raw, modifiedTime } = await fetchDriveBackup();
      const restored = normalizeState(raw);
      if (!restored) { showToast('The Drive file is not an EvidenceFit backup.'); return; }
      const saved = new Date(modifiedTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      applyRestore(restored, `the Google Drive copy (saved ${saved})`, 'Restored from Google Drive.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not restore from Google Drive.');
    } finally {
      setDriveBusy(false);
    }
  };

  const undoRestore = () => {
    let snapshot: AppState | null = null;
    try { snapshot = normalizeState(JSON.parse(localStorage.getItem(PRE_RESTORE_KEY) ?? 'null')); } catch { /* handled below */ }
    if (!snapshot) { showToast('No undo copy available.'); setCanUndoRestore(false); return; }
    const prevData = snapshot;
    if (!window.confirm(`Go back to your data from before the last restore?\n\n${summarize(prevData)}`)) return;
    setState((prev) => ({ ...prevData, aiCoach: prev?.aiCoach ?? prevData.aiCoach, driveSync: prev?.driveSync ?? prevData.driveSync }));
    try { localStorage.removeItem(PRE_RESTORE_KEY); } catch { /* ignore */ }
    setCanUndoRestore(false);
    showToast('Previous data restored.');
  };

  const exportCsv = () => {
    const rows = ['Date,Location,Exercise,Sets,Load,Unit,RepsOrDur,Measure,ToFailRIR,Pain,SpeedKmh,InclinePct,EstSessionKcal,Muscles'];
    for (const w of profile.circuitLogs) {
      w.entries.forEach((e, i) => {
        rows.push([
          w.date, w.location, e.name, e.sets, e.load ?? '', e.loadUnit, e.reps, e.unit, e.rir ?? '', e.pain, e.speedKmh ?? '', e.inclinePct ?? '',
          i === 0 ? w.estKcal : '', i === 0 ? w.muscles.join('; ') : '',
        ].map(csvCell).join(','));
      });
    }
    downloadFile(rows.join('\n'), `evidencefit-circuits-${today}.csv`, 'text/csv');
  };

  return (
    <Card>
      <CardHeader icon={<Database className="w-5 h-5" />} title="Backup & Export"
        subtitle={state.lastBackupAt ? `Last backup: ${new Date(state.lastBackupAt).toLocaleDateString()}` : 'No backup yet — data lives only in this browser.'} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button type="button" onClick={exportBackup} className="flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-emerald-700 text-white text-sm font-semibold"><Download className="w-4 h-4" /> Backup JSON</button>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-slate-300 text-sm font-semibold"><Upload className="w-4 h-4" /> Restore JSON</button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ''; }} />
        <button type="button" onClick={exportCsv} className="flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-slate-300 text-sm font-semibold"><FileSpreadsheet className="w-4 h-4" /> Export CSV</button>
      </div>
      {driveRestoreOn && (
        <button type="button" onClick={() => void restoreFromDrive()} disabled={driveBusy}
          className="mt-2.5 w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-sky-700 text-white text-sm font-semibold disabled:opacity-60">
          <CloudDownload className="w-4 h-4" /> {driveBusy ? 'Opening Google Drive…' : 'Restore from Google Drive'}
        </button>
      )}
      {canUndoRestore && (
        <button type="button" onClick={undoRestore} className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:underline">
          <RotateCcw className="w-4 h-4" /> Undo last restore
        </button>
      )}
      {persist && (
        <p className={`mt-3 text-base ${persist === 'persisted' ? 'text-emerald-800' : 'text-amber-900'}`}>
          {persist === 'persisted'
            ? 'Storage protection: on ✓ — Chrome won’t clear this data to free up space.'
            : persist === 'not-persisted'
              ? 'Storage protection: not yet. In Chrome, tap ⋮ → “Add to Home screen” (Install) and open the app from there — Chrome then protects its data. Keep making backups too.'
              : 'Storage protection isn’t available in this browser — keep making backups.'}
        </p>
      )}
      <p className="mt-2.5 text-xs text-slate-500">Backups include health conditions and medications but never your API key. Unsaved circuit drafts are not included.</p>
    </Card>
  );
}
