// EvidenceFit offline shell. Same-origin GETs only: AI, Google sign-in and Drive calls are never touched.
// - Pages: network first (always the newest build when online), cached copy when offline.
// - /assets/*: hashed by Vite, so cache first is safe; only the newest MAX_ASSETS files are kept.
// - Other same-origin files (icons, manifest): network first, cache fallback.
// Data is in localStorage, not here; clearing this cache never touches the log.
// The build (vite.config.ts → swPrecache) replaces the two lines below with the build's source hash and its
// full /assets list. So every deploy changes sw.js, the phone installs it, and every tab (even never-opened
// lazy ones) works offline. Unbuilt (dev), they stay as written.
const BUILD = 'dev';
const PRECACHE = [];
const CACHE = `evidencefit-${BUILD}`;
// The site lives under a sub-path on GitHub Pages (/evidencefit/); everything is relative to it.
const BASE = new URL(self.registration.scope).pathname;
const SHELL = [BASE, `${BASE}manifest.webmanifest`, `${BASE}favicon.svg`, `${BASE}icon-192.png`];
const MAX_ASSETS = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([...SHELL, ...PRECACHE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimAssets(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith(`${BASE}assets/`));
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(old);
}

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(cacheKey ?? request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey ?? request);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    await trimAssets(cache);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Every page URL (including /?voicedebug) is the same single-page app.
    event.respondWith(networkFirst(req, BASE));
  } else if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});
