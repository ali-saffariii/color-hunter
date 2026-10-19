/* Color Hunter — offline cache.
 *
 * Two rules drive this file:
 *  1. A new worker never takes over a running session on its own. The page is
 *     told an update is ready and swaps only when the user asks. Hot-swapping
 *     files underneath a measurement is how people end up with half of one
 *     version and half of another.
 *  2. The app shell is revalidated in the background on every load, so a stale
 *     copy can never outlive one visit, and a cache that turns out to be broken
 *     falls through to the network instead of serving a dead page.
 */
const VERSION = '2.1.0';
const CACHE = 'color-hunter-' + VERSION;
const CORE = [
  './', './index.html', './workspace.css',
  './color-engine.js', './i18n.js', './storage.js', './projects.js', './studio.js', './exporter.js', './sheets.js',
  './pro.js', './pro-config.js', './ui.js', './ws-data.js', './ws.js', './ws-projects.js', './ws-studio.js', './ws-export.js', './ws-pro.js',
  './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'
];
// The interface fonts (fa.* and en.*) are deliberately NOT precached. The page
// offers four formats per language and the browser requests only the ones it
// needs, so precaching the list would fetch files that are not there on every
// install. Whatever the page does load is cached by the runtime handler below
// and is then available offline.

self.addEventListener('install', e => {
  // Each file is added on its own: one missing icon must not void the whole
  // precache and leave the app with no offline shell at all.
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))
  ));
  // deliberately no skipWaiting(): the page decides when to switch
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(n => n !== CACHE && n.startsWith('color-hunter-')).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
});

function fromNetwork(req) {
  return fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigations: network first, cache as the offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fromNetwork(req).catch(() =>
        caches.match(req).then(m => m || caches.match('./index.html')).then(m => m || caches.match('./'))
          .then(m => m || new Response(
            '<!doctype html><meta charset="utf-8"><title>Color Hunter</title>' +
            '<body style="font:16px/1.6 system-ui;padding:28px;background:#000;color:#fff">' +
            '<h1 style="font-size:20px">Color Hunter is offline</h1>' +
            '<p>The app could not be loaded from this device\'s cache. Reconnect once and it will work offline again. Your saved colours are untouched.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
      )
    );
    return;
  }

  // Same-origin assets: serve the cached copy at once, refresh it in the
  // background. The next load gets the new file; this load stays instant.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fromNetwork(req).catch(() => null);
        if (hit) { e.waitUntil(net); return hit; }
        return net.then(res => res || new Response('', { status: 504, statusText: 'offline' }));
      })
    );
    return;
  }

  // Cross-origin (fonts): cache first, network as fallback.
  e.respondWith(
    caches.match(req).then(hit => hit || fromNetwork(req).catch(() =>
      new Response('', { status: 504, statusText: 'offline' })))
  );
});
