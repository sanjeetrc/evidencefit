import { useState } from 'react';
import { BarChart3, Zap } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CollapsibleCard } from '../../components/ui';
import { buildTomorrowSuggestion } from '../../domain/suggestion';
import { RANGES, buildProteinSeries, bucketWord, muscleBalance, type RangeKey } from '../../domain/progressSeries';
import { formatDateISO } from '../../lib/dates';
import type { Profile, UpdateProfile } from '../../types';
import ProteinDiary from './ProteinDiary';
import WorkoutDiary from './WorkoutDiary';

interface Props {
  profile: Profile;
  updateProfile: UpdateProfile;
}

const RANGE_KEY = 'evidencefit_progress_range';
const readRange = (): RangeKey => {
  try { const v = localStorage.getItem(RANGE_KEY); if (RANGES.some((r) => r.key === v)) return v as RangeKey; } catch { /* storage blocked */ }
  return '4w';
};

function RangePicker({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div role="group" aria-label="Time range" className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 mb-3">
      {RANGES.map((r) => (
        <button key={r.key} type="button" aria-pressed={value === r.key} onClick={() => onChange(r.key)}
          className={`min-h-[44px] rounded-lg text-base font-bold ${value === r.key ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-700'}`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

export default function ProgressTab({ profile, updateProfile }: Props) {
  const today = formatDateISO();
  const tomorrow = buildTomorrowSuggestion(profile.circuitLogs, today);
  const [range, setRangeState] = useState<RangeKey>(readRange);
  const setRange = (r: RangeKey) => { setRangeState(r); try { localStorage.setItem(RANGE_KEY, r); } catch { /* ignore */ } };
  const rangeLabel = RANGES.find((r) => r.key === range)!.label;

  const target = profile.proteinTargetG;
  const series = buildProteinSeries(profile.proteinLogs, today, range, target);
  const balance = muscleBalance(profile.circuitLogs, today, range);

  const proteinHeadline = series.avg === null
    ? `Nothing logged in ${rangeLabel === 'All' ? 'the log' : `the last ${rangeLabel}`} · target ${target} g`
    : `${rangeLabel}: ${series.avg} g/day average · target met on ${series.daysMet} of ${series.loggedDays} logged days`;
  const top = balance.muscles.slice(0, 2).map(([m, c]) => `${m} ×${c}`).join(', ');
  const balanceHeadline = balance.sessions === 0
    ? `No sessions in ${rangeLabel === 'All' ? 'the log' : `the last ${rangeLabel}`}`
    : `${balance.sessions} session${balance.sessions === 1 ? '' : 's'} · most: ${top}${tomorrow.neglectedMuscles.length ? ` · not hit this week: ${tomorrow.neglectedMuscles.length}` : ''}`;

  return (
    <>
      {/* What was done on which day — first, because it's what people look for most. */}
      <WorkoutDiary profile={profile} updateProfile={updateProfile} />

      {/* What was eaten, day by day. */}
      <ProteinDiary profile={profile} />

      <CollapsibleCard icon={<BarChart3 className="w-5 h-5" />} title="Protein trend" headline={proteinHeadline}>
        <RangePicker value={range} onChange={setRange} />
        <p className="text-sm text-slate-700 mb-2">
          {series.bucket === 'day' ? 'Grams per day.' : `Each bar is a ${bucketWord(series.bucket)} of the days you logged.`} Dashed line: target {target} g.
        </p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, (max: number) => Math.ceil(Math.max(max, target) * 1.1 / 10) * 10]} />
              <Tooltip formatter={(v) => [`${v} g`, series.bucket === 'day' ? 'Protein' : 'Average per logged day']} />
              <ReferenceLine y={target} stroke="#047857" strokeDasharray="4 4" />
              <Bar dataKey="grams" name="Protein (g)" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CollapsibleCard>

      <CollapsibleCard icon={<Zap className="w-5 h-5" />} title="Muscle & fitness balance" headline={balanceHeadline}>
        <RangePicker value={range} onChange={setRange} />
        {balance.muscles.length === 0 ? (
          <p className="text-sm text-slate-600">No sessions in this range. Save a circuit on the Today tab to see your muscle balance.</p>
        ) : (
          <>
            <p className="text-sm text-slate-700 mb-2">Sessions that worked each area ({rangeLabel === 'All' ? 'whole log' : `last ${rangeLabel}`}).</p>
            <div className="flex flex-wrap gap-2">
              {balance.muscles.map(([m, c]) => (
                <span key={m} className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-bold text-emerald-950">
                  {m} <span className="text-emerald-700">×{c}</span>
                </span>
              ))}
            </div>
          </>
        )}
        {tomorrow.neglectedMuscles.length > 0 && (
          <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            <strong>Not hit in the last 7 days:</strong> {tomorrow.neglectedMuscles.join(', ')}
          </p>
        )}
      </CollapsibleCard>
    </>
  );
}
