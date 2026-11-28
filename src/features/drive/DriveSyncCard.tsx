import { useEffect } from 'react';
import { Cloud } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui';
import { DRIVE_DOC_NAME, DRIVE_FOLDER_NAME } from '../../sync/driveContent';
import { useDrive } from '../../sync/useDriveSync';

const when = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';

/** Settings → "Google Drive sync". Hidden entirely when the build has no Google client ID. */
export default function DriveSyncCard() {
  const drive = useDrive();
  const { configured, preload } = drive;

  // Load Google's sign-in script now, so tapping Connect can open the popup straight away (Android needs that).
  useEffect(() => { if (configured) preload(); }, [configured, preload]);

  if (!configured) return null;

  const s = drive.settings;
  const statusText = !drive.enabled
    ? 'Not connected.'
    : drive.status === 'syncing'
      ? 'Syncing now…'
      : s?.pendingSync
        ? `Not synced — ${drive.lastError ?? 'tap Sync now to retry.'}`
        : `Connected. Last synced: ${when(s?.lastSyncAt)}.`;

  const btn = 'min-h-[48px] px-4 rounded-xl text-base font-bold';
  return (
    <Card>
      <CardHeader icon={<Cloud className="w-5 h-5" />} title="Google Drive sync"
        subtitle="Lets Claude read your training log through its Google Drive connector." />
      <div className="space-y-3">
        <p className="text-base font-semibold">
          Your workout, protein and health-flag data will be saved to your own Google Drive.
        </p>
        <p role="status" aria-live="polite"
          className={`text-base rounded-lg px-3 py-2 border ${drive.enabled && !s?.pendingSync ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : s?.pendingSync ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
          {statusText}
        </p>
        <div className="flex flex-wrap gap-2">
          {!drive.enabled ? (
            <button type="button" onClick={drive.connect} disabled={drive.status === 'syncing'} className={`${btn} bg-emerald-700 text-white disabled:opacity-50`}>
              Connect Google Drive
            </button>
          ) : (
            <>
              <button type="button" onClick={drive.syncNow} disabled={drive.status === 'syncing'} className={`${btn} bg-emerald-700 text-white disabled:opacity-50`}>
                Sync now
              </button>
              <button type="button" onClick={() => { if (window.confirm('Stop syncing to Google Drive? The files already in your Drive stay there.')) drive.disconnect(); }}
                className={`${btn} bg-white border-2 border-slate-300 text-slate-900`}>
                Disconnect
              </button>
            </>
          )}
        </div>
        <p className="text-sm text-slate-600">
          Files go to Google Drive → <strong>{DRIVE_FOLDER_NAME}</strong> folder: the <strong>{DRIVE_DOC_NAME}</strong> document
          (last 8 weeks, for Claude) and a data copy. The app can only see files it created. After each saved workout or safety
          check it syncs by itself; Google asks you to sign in again about once an hour.
        </p>
      </div>
    </Card>
  );
}
