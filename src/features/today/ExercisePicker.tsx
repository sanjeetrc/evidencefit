import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  EXERCISE_CATEGORIES, EXERCISE_LIBRARY, entrySummary, searchExercises,
  type ExerciseCategory, type HistoryExercise,
} from '../../domain/exerciseLibrary';

interface Props {
  history: HistoryExercise[];
  onPick: (name: string) => void;
  /** Controlled search text (Guided mode reuses its answer box). Omit to show a built-in search box. */
  query?: string;
  /** Show last-time values under "Your exercises" chips (useful in Quick-Add). */
  showLastValues?: boolean;
  tone?: 'amber' | 'slate';
  maxRecent?: number;
}

/**
 * Exercise chooser: search results while typing; otherwise "Your exercises" (from history, most
 * recent first) plus the full library by category.
 */
export default function ExercisePicker({ history, onPick, query, showLastValues = false, tone = 'slate', maxRecent = 8 }: Props) {
  const [ownQuery, setOwnQuery] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const q = (query ?? ownQuery).trim();
  const results = q ? searchExercises(q, history, 12) : [];

  const chip = tone === 'amber'
    ? 'bg-white border-2 border-amber-300 text-amber-950 hover:bg-amber-100'
    : 'bg-slate-100 border border-slate-200 text-slate-900 hover:bg-emerald-100';
  const chipCls = `min-h-[44px] px-3 rounded-lg text-base font-semibold text-left ${chip}`;
  const heading = 'text-sm font-bold uppercase tracking-wide text-slate-700';

  const pick = (name: string) => {
    onPick(name);
    setOwnQuery('');
  };

  return (
    <div className="space-y-3">
      {query === undefined && (
        <label className="flex items-center gap-2 min-h-[44px] px-3 rounded-lg border-2 border-slate-300 bg-white focus-within:border-emerald-600">
          <Search className="w-5 h-5 text-slate-500 shrink-0" aria-hidden />
          <input value={ownQuery} onChange={(e) => setOwnQuery(e.target.value)} placeholder="Search exercises (e.g. row, squat, plank)…"
            aria-label="Search exercises" className="flex-1 min-w-0 py-2 text-base bg-transparent outline-none" />
        </label>
      )}

      {q ? (
        <div className="space-y-1.5">
          <p className={heading}>{results.length ? 'Matches' : 'No match — use what you typed'}</p>
          <div className="flex flex-wrap gap-2">
            {results.map((name) => (
              <button key={name} type="button" onClick={() => pick(name)} className={chipCls}>{name}</button>
            ))}
            {query === undefined && (
              <button type="button" onClick={() => pick(q.charAt(0).toUpperCase() + q.slice(1))}
                className={`${chipCls} border-dashed`}>+ Add “{q}”</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {history.length > 0 && (
            <div className="space-y-1.5">
              <p className={heading}>Your exercises</p>
              <div className="flex flex-wrap gap-2">
                {history.slice(0, maxRecent).map((h) => (
                  <button key={h.name} type="button" onClick={() => pick(h.name)} className={chipCls}>
                    <span className="block leading-tight">{h.name}</span>
                    {showLastValues && <span className="block text-sm font-normal text-slate-600 leading-tight">last: {entrySummary(h.last)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <p className={heading}>All exercises — pick a group</p>
            <div className="flex flex-wrap gap-1.5">
              {EXERCISE_CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(category === c ? null : c)} aria-pressed={category === c}
                  className={`min-h-[40px] px-3 rounded-full text-sm font-bold border-2 ${category === c ? 'bg-emerald-700 border-emerald-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}>
                  {c}
                </button>
              ))}
            </div>
            {category && (
              <div className="flex flex-wrap gap-2 pt-1">
                {EXERCISE_LIBRARY.filter((x) => x.category === category).map((x) => (
                  <button key={x.name} type="button" onClick={() => pick(x.name)} className={chipCls}>{x.name}</button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
