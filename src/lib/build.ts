// Which build is running. vite.config.ts injects __APP_BUILD__ and writes the same values to /version.json.

export interface BuildInfo { time: string; source: string; commit?: string | null }

/** Undefined under Vitest and other tools that don't run the Vite define. */
export const BUILD: BuildInfo | null = typeof __APP_BUILD__ !== 'undefined' && __APP_BUILD__ ? __APP_BUILD__ : null;

/** "26 Nov 2026, 4:12 pm · commit 3ede062 · source 3f9a1c2b7e" — what Settings shows. */
export function buildLabel(b: BuildInfo | null = BUILD): string {
  if (!b) return 'Development build';
  const t = new Date(b.time);
  const when = Number.isNaN(t.getTime())
    ? b.time
    : t.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${when}${b.commit ? ` · commit ${b.commit}` : ''} · source ${b.source}`;
}
