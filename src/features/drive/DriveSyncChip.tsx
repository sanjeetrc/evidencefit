import { CloudOff, RefreshCw } from 'lucide-react';
import { useDrive } from '../../sync/useDriveSync';

/** Small "Not synced — tap to retry" chip. Renders nothing unless Drive sync is on and a sync is pending. */
export default function DriveSyncChip() {
  const drive = useDrive();
  if (!drive.enabled) return null;
  if (drive.status === 'syncing') {
    return (
      <p role="status" className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-full bg-slate-100 text-slate-800 text-base font-semibold">
        <RefreshCw className="w-4 h-4 animate-spin" aria-hidden /> Syncing to Drive…
      </p>
    );
  }
  if (!drive.settings?.pendingSync) return null;
  return (
    <button type="button" onClick={drive.syncNow} title={drive.lastError ?? undefined}
      className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-amber-100 border-2 border-amber-400 text-amber-950 text-base font-bold">
      <CloudOff className="w-5 h-5" aria-hidden /> Not synced — tap to retry
    </button>
  );
}
