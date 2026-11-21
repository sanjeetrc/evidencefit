import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, History, Sparkles, Trash2, TrendingUp, Zap } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Audit } from '../domain/engine';
import { shortDateLabel } from '../domain/dates';
import { Profile } from '../domain/types';
import { Card, CardHeader, TierBadge } from './common';

interface Props {
  profile: Profile;
  audit: Audit;
  isDemoLoaded: boolean;
  onClearDemo: () => void;
  updateProfile: (fn: (p: Profile) => Partial<Profile>) => void;
  confirm: (o: { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }) => void;
}

const axis = { fontSize: 12, fill: '#475569' };

export function TrendsTab({ profile, audit, isDemoLoaded, onClearDemo, updateProfile, confirm }: Props) {
  const [showAll, setShowAll] = useState(false);
  const chart = useMemo(
    () =>
      audit.sortedWorkouts.slice(-12).map((w) => {
        const sets = w.exercises.filter((e) => e.unit === 'reps').flatMap((e) => e.sets);
        const rpes = sets.map((s) => s.rpe).filter((r): r is number => r !== null);
        return {
          label: shortDateLabel(w.date),
          sets: sets.length,
          avgRpe: rpes.length ? Number((rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1)) : null,
          sleep: w.sleepHours,
        };
      }),
    [audit.sortedWorkouts]
  );
  const history = [...audit.sortedWorkouts].reverse();
  const shown = showAll ? history : history.slice(0, 8);
  const aerobicPct = Math.min(100, Math.round((audit.aerobicMinutes7d / 150) * 100));

  return (
    <div className="space-y-6">
      {isDemoLoaded && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-sky-950">
          <span className="flex items-center gap-2"><Sparkles className="w-5 h-5" aria-hidden /> You are looking at demo data.</span>
          <button type="button" onClick={onClearDemo} className="px-3 min-h-[40px] rounded-lg bg-sky-800 text-white font-semibold">Clear demo and start fresh</button>
        </div>
      )}

      {audit.deloadRecommended && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 flex items-start gap-3" role="status">
          <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0" aria-hidden />
          <div className="text-sm text-amber-950">
            <h2 className="text-base font-bold">Take a deload week</h2>
            <ul className="mt-1 list-disc list-inside">{audit.deloadReasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="mt-2">For one week: cut sets by 40–50%, keep loads moderate to high, keep every set at RPE 7 or below. Reduced training beats complete rest. <TierBadge tier="Coaching Convention" /></p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader icon={<TrendingUp className="w-5 h-5" />} title="Ready to progress" subtitle="Top of range at or under target RPE, 2 sessions running" />
          {audit.progressionReady.length === 0 ? (
            <p className="text-sm text-slate-700">Nothing yet. Keep logging; a lift qualifies after 2 sessions with every set at the top of its range.</p>
          ) : (
            <ul className="space-y-2">{audit.progressionReady.map((p) => (
              <li key={p.name} className="text-sm p-2.5 rounded-lg bg-emerald-50 border border-emerald-200"><strong>{p.name}</strong>: {p.suggestion}</li>
            ))}</ul>
          )}
        </Card>
        <Card>
          <CardHeader icon={<Zap className="w-5 h-5" />} title="Consistency and aerobic base" />
          <p className={`text-sm p-2.5 rounded-lg border ${audit.rampBack.level === 'ontrack' ? 'bg-emerald-50 border-emerald-200' : audit.rampBack.level === 'none' ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
            <strong>{audit.rampBack.label}.</strong> {audit.rampBack.advice}
          </p>
          <div className="mt-3 text-sm">
            <div className="flex justify-between font-semibold"><span>Aerobic minutes, last 7 days</span><span className="tabular-nums">{audit.aerobicMinutes7d} / 150+</span></div>
            <div className="mt-1 h-2.5 bg-slate-100 rounded-full overflow-hidden" aria-hidden><div className="h-full bg-teal-600" style={{ width: `${aerobicPct}%` }} /></div>
          </div>
          {audit.mealsMeetingPerMealMin && (
            <p className="mt-3 text-sm">Meals with at least {audit.protein.perMealMinG} g protein: <strong>{audit.mealsMeetingPerMealMin.hit} of {audit.mealsMeetingPerMealMin.total}</strong> logged this week.</p>
          )}
        </Card>
      </div>

      {!audit.protein.isRenalRestricted && (
        <Card>
          <CardHeader icon={<BarChart3 className="w-5 h-5" />} title="Protein, last 7 days" subtitle={`Average ${audit.avgProtein7d} g on logged days; target met on ${audit.daysHitProtein} of 7`} />
          <div className="h-56" role="img" aria-label={`Protein per day for the last 7 days. Average ${audit.avgProtein7d} grams.`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={audit.last7DaysProtein} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={axis} /><YAxis tick={axis} />
                <Tooltip />
                <ReferenceLine y={profile.proteinTargetG} stroke="#047857" strokeDasharray="4 4" />
                <Bar dataKey="grams" name="Protein (g)" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader icon={<BarChart3 className="w-5 h-5" />} title="Training load and sleep" subtitle="Strength sets per session, average RPE, hours slept" />
        {chart.length === 0 ? <p className="text-sm text-slate-600 text-center py-8">Log sessions to see trends.</p> : (
          <div className="h-64" role="img" aria-label="Sets, RPE and sleep for recent sessions">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={axis} />
                <YAxis yAxisId="l" tick={axis} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 10]} tick={axis} />
                <Tooltip />
                <ReferenceLine yAxisId="r" y={6} stroke="#b45309" strokeDasharray="4 4" />
                <Bar yAxisId="l" dataKey="sets" name="Sets" fill="#0d9488" radius={[6, 6, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="avgRpe" name="Avg RPE" stroke="#b45309" strokeWidth={2.5} connectNulls />
                <Line yAxisId="r" type="monotone" dataKey="sleep" name="Sleep (h)" stroke="#4f46e5" strokeWidth={2.5} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader icon={<History className="w-5 h-5" />} title="Session history" subtitle="Delete a session logged by mistake so it does not skew the rules" />
        {history.length === 0 ? <p className="text-sm text-slate-600">No sessions yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {shown.map((w) => (
              <li key={w.id} className="py-2.5 flex items-start justify-between gap-2">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">{shortDateLabel(w.date)} · {w.title}</p>
                  <p className="text-slate-700">{w.exercises.map((e) => `${e.name} ${e.sets.length}×`).join(', ')}</p>
                  {(w.sleepHours !== null || w.notes) && <p className="text-slate-600">{w.sleepHours !== null ? `Sleep ${w.sleepHours} h. ` : ''}{w.notes}</p>}
                </div>
                <button type="button" aria-label={`Delete session ${w.title} on ${w.date}`} className="p-2.5 text-slate-500 hover:text-rose-700"
                  onClick={() => confirm({ title: 'Delete this session?', message: `${w.title} on ${shortDateLabel(w.date)} will be removed permanently.`, confirmLabel: 'Delete', danger: true,
                    onConfirm: () => updateProfile((p) => ({ workouts: p.workouts.filter((x) => x.id !== w.id) })) })}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {history.length > 8 && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm font-semibold text-emerald-800 min-h-[40px]">
            {showAll ? 'Show fewer' : `Show all ${history.length}`}
          </button>
        )}
      </Card>
    </div>
  );
}
