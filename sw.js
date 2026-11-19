/* Pounce service worker: offline shell + lock screen nags. */
const VERSION = 'pounce-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'finds.json',
  'icon-180.png', 'icon-192.png', 'besley-latin-wght-normal.woff2', 'besley-latin-wght-italic.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'pounce-cfg').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first so updates show up right away, cache when there is no signal.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 'no-cache' makes the browser check with the server every time, so a new version shows up at once.
  e.respondWith(fetch(req.url, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

// The push arrives empty. Ask the backend what the pet wants to say.
async function showNag() {
  let cfg = {};
  try {
    const c = await caches.open('pounce-cfg');
    const r = await c.match('cfg.json');
    if (r) cfg = await r.json();
  } catch (err) { /* use defaults */ }
  let title = cfg.pet || 'Pounce';
  let body = 'Your list is waiting. So am I.';
  if (cfg.backend && cfg.key) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(cfg.backend, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'nag', key: cfg.key }), signal: ctl.signal
      });
      clearTimeout(timer);
      const j = await r.json();
      if (j && j.ok) { title = j.title || title; body = j.body || body; }
    } catch (err) { /* fall back to the generic line */ }
  }
  await self.registration.showNotification(title, {
    body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'pounce-nag', renotify: true,
    data: { url: self.registration.scope }
  });
}

self.addEventListener('push', e => { e.waitUntil(showNag()); });

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
