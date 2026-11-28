import type { ReactNode } from 'react';

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 ${className}`}>{children}</section>
);

export const CardHeader = ({ icon, title, subtitle, right }: { icon: ReactNode; title: string; subtitle?: string; right?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0" aria-hidden>{icon}</div>
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
      </div>
    </div>
    {right}
  </div>
);

export function FormattedText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-800">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const isBullet = /^\s*[-*•]\s+/.test(line);
        const clean = isBullet ? line.trim().replace(/^[-*•]\s+/, '') : line;
        const parts = clean.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>
        );
        return isBullet ? (
          <div key={i} className="flex items-start gap-2 pl-1"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /><div>{parts}</div></div>
        ) : <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

/** A card that folds to one line: title plus a headline summary. Tap to open the detail. */
export const CollapsibleCard = ({ icon, title, headline, defaultOpen = false, children }:
  { icon: ReactNode; title: string; headline: ReactNode; defaultOpen?: boolean; children: ReactNode }) => (
  <details open={defaultOpen} className="group bg-white rounded-2xl border border-slate-200 shadow-sm">
    <summary className="list-none cursor-pointer flex items-center gap-2.5 p-4 sm:p-5 min-h-[64px]">
      <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0" aria-hidden>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-bold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-700">{headline}</span>
      </span>
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-500 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </summary>
    <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
  </details>
);
