import { Component, ReactNode, useEffect, useRef } from 'react';
import { EvidenceTier } from '../domain/types';

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 ${className}`}>{children}</section>
);

export const CardHeader = ({ icon, title, subtitle, right }: { icon: ReactNode; title: string; subtitle?: string; right?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0" aria-hidden>
        {icon}
      </div>
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
      </div>
    </div>
    {right}
  </div>
);

const tierStyle: Record<EvidenceTier, string> = {
  'Strong Consensus': 'bg-emerald-100 text-emerald-900 border-emerald-200',
  'Emerging Evidence': 'bg-sky-100 text-sky-900 border-sky-200',
  'Coaching Convention': 'bg-amber-100 text-amber-900 border-amber-200',
};

export const TierBadge = ({ tier }: { tier: EvidenceTier }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-semibold border ${tierStyle[tier]}`}>{tier}</span>
);

/** Renders **bold**, bullets and [Evidence Tier] tags. Text only: no HTML is ever injected. */
export function FormattedMessage({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-800">
      {text.split('\n').map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="h-1" />;
        const isBullet = /^\s*[-*•]\s+/.test(line);
        const clean = isBullet ? line.trim().replace(/^[-*•]\s+/, '') : line;
        const parts = clean.split(/(\*\*[^*]+\*\*|\[Strong Consensus\]|\[Emerging Evidence\]|\[Coaching Convention\])/g);
        const rendered = parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
          const m = part.match(/^\[(Strong Consensus|Emerging Evidence|Coaching Convention)\]$/);
          if (m) return <TierBadge key={i} tier={m[1] as EvidenceTier} />;
          return <span key={i}>{part}</span>;
        });
        return isBullet ? (
          <div key={idx} className="flex items-start gap-2 pl-1">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
            <div>{rendered}</div>
          </div>
        ) : (
          <p key={idx}>{rendered}</p>
        );
      })}
    </div>
  );
}

export interface ModalState {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
}

export function ConfirmModal({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!state.open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, onClose]);
  if (!state.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
        <h3 id="modal-title" className="text-lg font-bold text-slate-900">{state.title}</h3>
        <p className="mt-2 text-sm text-slate-700 leading-relaxed">{state.message}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { state.onConfirm?.(); onClose(); }}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold text-white ${state.danger ? 'bg-rose-700 hover:bg-rose-800' : 'bg-emerald-700 hover:bg-emerald-800'}`}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Number input that keeps a draft string so users can clear and retype. */
export function NumInput({
  value, onChange, label, min, max, step = 1, className = '', allowEmpty = false, disabled = false,
}: {
  value: number | null; onChange: (v: number | null) => void; label: string; min?: number; max?: number; step?: number;
  className?: string; allowEmpty?: boolean; disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      title={label}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(allowEmpty ? null : 0);
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={(e) => {
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) {
          const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
          if (clamped !== n) onChange(clamped);
        }
      }}
      className={`w-full min-h-[44px] text-sm font-semibold px-2 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100 ${className}`}
    />
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-lg mx-auto p-6 m-6 bg-white rounded-2xl border border-rose-200">
        <h1 className="text-lg font-bold text-rose-800">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-700">
          Your saved data has not been deleted. Reload the page. If this keeps happening, open Settings after reload and download a backup.
        </p>
        <pre className="mt-3 text-xs text-slate-500 whitespace-pre-wrap">{this.state.error.message}</pre>
        <button type="button" className="mt-4 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

export const downloadFile = (content: string, filename: string, mime: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
