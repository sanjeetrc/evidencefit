"""Builds one self-contained EvidenceFit .tsx (React + lucide-react + recharts + Tailwind
classes) in the format of the original prototype, for pasting into Gemini Canvas.

In this build the AI coach uses the key Gemini Canvas injects (an empty `?key=` that
Canvas fills in); a key typed in Settings takes precedence. Usage:
    python3 scripts/make_single_tsx.py <out.tsx>
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'src'
ORDER = ['domain/types.ts', 'domain/units.ts', 'domain/dates.ts', 'domain/program.ts', 'domain/reference.ts',
         'domain/state.ts', 'domain/cardio.ts', 'domain/engine.ts', 'domain/csv.ts', 'ai/coach.ts', 'drive/googleDrive.ts', 'ui/common.tsx', 'ui/Timer.tsx',
         'ui/CardioCard.tsx', 'ui/TodayTab.tsx', 'ui/ProgramTab.tsx', 'ui/TrendsTab.tsx', 'ui/CoachTab.tsx', 'ui/SettingsTab.tsx', 'App.tsx']
EXTERNAL = ('react', 'lucide-react', 'recharts')

def must(src, old, new, where):
    if old not in src:
        sys.exit(f'pattern not found in {where}: {old[:70]}')
    return src.replace(old, new)

ext = {m: set() for m in EXTERNAL}
bodies = []
for rel in ORDER:
    src = (ROOT / rel).read_text()
    # gather and drop imports (single or multi-line)
    for m in re.finditer(r"^import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)';\n", src, re.M):
        if m.group(3) in EXTERNAL:
            ext[m.group(3)].update(n.strip() for n in m.group(2).split(',') if n.strip())
    src = re.sub(r"^import\s+(type\s+)?\{[^}]*\}\s+from\s+'[^']+';\n", '', src, flags=re.M)
    src = re.sub(r"^import\s+[^;]*from\s+'[^']+';\n", '', src, flags=re.M)
    src = re.sub(r"^import\s+'[^']+';\n", '', src, flags=re.M)

    # Gemini Canvas: an empty key is filled in by Canvas, so the coach may run without one.
    if rel == 'ai/coach.ts':
        src = must(src, "if (!settings.enabled || !settings.consentAt || !settings.apiKey.trim()) {",
                   "if (!settings.enabled || !settings.consentAt || (!settings.apiKey.trim() && !USES_CANVAS_KEY)) {", rel)
        src = must(src, "      const res = await doFetch(url, {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey.trim() },",
                   "      const ownKey = settings.apiKey.trim();\n      // Own key in a header; otherwise an empty ?key= that Gemini Canvas fills in.\n"
                   "      const res = await doFetch(ownKey ? url : `${url}?key=${CANVAS_API_KEY}`, {\n        method: 'POST',\n"
                   "        headers: ownKey ? { 'Content-Type': 'application/json', 'x-goog-api-key': ownKey } : { 'Content-Type': 'application/json' },", rel)
        src = must(src, "'check the API key in Settings'", "(settings.apiKey.trim() ? 'check the API key in Settings' : 'outside Gemini Canvas, add your own key in Settings')", rel)
    if rel == 'ui/CoachTab.tsx':
        src = must(src, "const live = settings.enabled && !!settings.consentAt && !!settings.apiKey;",
                   "const live = settings.enabled && !!settings.consentAt && (!!settings.apiKey || USES_CANVAS_KEY);", rel)
    if rel == 'ui/SettingsTab.tsx':
        src = must(src, 'placeholder="Gemini API key"', 'placeholder="Leave blank inside Gemini Canvas"', rel)
    # No Vite build in Canvas: there is no built-in Google client ID.
    src = src.replace("(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''", "''")
    src = src.replace('import.meta.env.VITE_GOOGLE_CLIENT_ID', "''")
    if rel == 'App.tsx':
        src = must(src, 'export default function App(', 'function EvidenceFitApp(', rel)

    # Each module has its own `Props`; give them unique names so they do not merge.
    stem = pathlib.Path(rel).stem
    src = re.sub(r'\bProps\b', f'{stem}Props', src)
    if rel == 'domain/state.ts':
        src = must(src, 'export const todayISO = () => formatDateISO();', '', rel)
    src = re.sub(r'^export (default )?', '', src, flags=re.M)
    bodies.append(f'// ===== {rel} =====\n{src.strip()}\n')

react_names = [f'type {n}' if n in ('ReactNode',) else n for n in sorted(ext['react'])]
header = f"""/**
 * EvidenceFit: evidence-based exercise and protein companion (single-file build for Gemini Canvas).
 * Generated from the EvidenceFit source by scripts/make_single_tsx.py; edit the source, not this file.
 *
 * AI coach: off by default. Turn it on in Settings and accept the consent. Inside Gemini Canvas
 * no key is needed (Canvas supplies it); elsewhere, paste your own Gemini API key in Settings.
 * Data is stored only in this browser (localStorage). Download a backup from Settings.
 */
import React, {{ {', '.join(react_names)} }} from 'react';
import {{ {', '.join(sorted(ext['lucide-react']))} }} from 'lucide-react';
import {{ {', '.join(sorted(ext['recharts']))} }} from 'recharts';

/** Gemini Canvas fills in an empty key at runtime. */
const CANVAS_API_KEY = '';
const USES_CANVAS_KEY = true;

const GLOBAL_CSS = `
html {{ font-size: 112.5%; -webkit-text-size-adjust: 100%; }}
body {{ background: #f8fafc; }}
:focus-visible {{ outline: 3px solid #047857; outline-offset: 2px; }}
@media (prefers-reduced-motion: reduce) {{ * {{ animation: none !important; transition: none !important; scroll-behavior: auto !important; }} }}
`;
"""
footer = """
export default function App() {
  return (
    <React.StrictMode>
      <ErrorBoundary>
        <style>{GLOBAL_CSS}</style>
        <EvidenceFitApp />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
"""
out = header + '\n' + '\n'.join(bodies) + footer
pathlib.Path(sys.argv[1]).write_text(out)
print(f'wrote {sys.argv[1]}: {out.count(chr(10))} lines')
