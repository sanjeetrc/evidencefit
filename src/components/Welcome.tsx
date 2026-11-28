import { useState } from 'react';
import { Activity } from 'lucide-react';

export default function Welcome({ onStart }: { onStart: (n: string, a: number, kg: number) => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [kg, setKg] = useState('');
  const valid = name.trim() && Number(age) >= 18 && Number(age) <= 110 && Number(kg) >= 30 && Number(kg) <= 250;
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Activity className="w-7 h-7 text-emerald-700" /> EvidenceFit</h1>
        <p className="mt-2 text-sm text-slate-700">Log your own circuit freely. Get muscles worked, approx. calories, benefits, and tomorrow's suggestion automatically.</p>
        <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) onStart(name.trim(), Number(age), Number(kg)); }}>
          <label className="block text-sm font-semibold">Your name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-slate-300" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">Age<input type="number" value={age} onChange={(e) => setAge(e.target.value)} className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-slate-300" /></label>
            <label className="block text-sm font-semibold">Weight (kg)<input type="number" value={kg} onChange={(e) => setKg(e.target.value)} className="mt-1 w-full min-h-[44px] px-3 rounded-lg border border-slate-300" /></label>
          </div>
          <button type="submit" disabled={!valid} className="w-full min-h-[48px] rounded-xl bg-emerald-700 text-white font-bold disabled:opacity-40">Start</button>
        </form>
      </div>
    </main>
  );
}
