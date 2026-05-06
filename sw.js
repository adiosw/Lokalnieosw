/* ═══════════════════════════════════════════════════════════════
   LokalnieOSW v2.1 – Service Worker
   Strategy: Cache-first for static assets, Network-first for API
   ═══════════════════════════════════════════════════════════════ */

const CACHE_VERSION  = 'osw-v2.1.0';
const STATIC_CACHE   = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE  = `${CACHE_VERSION}-dynamic`;
const API_CACHE      = `${CACHE_VERSION}-api`;

/* Assets to precache on install */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/animations.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/map.js',
  '/js/reservations.js',
  '/js/chat.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Nunito:wght@400;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
];

/* ── INSTALL ──────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(
        PRECACHE_ASSETS.filter(url => !url.startsWith('https://fonts.googleapis'))
      ).catch(err => console.warn('[SW] Precache partial failure:', err));
    })
  );
});

/* ── ACTIVATE ────────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ───────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET and chrome-extension requests */
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  /* API requests → Network-first, fallback to cache */
  if (url.pathname.startsWith('/tables/') || url.hostname.includes('nominatim')) {
    event.respondWith(networkFirst(request, API_CACHE, 8000));
    return;
  }

  /* Tile server requests → Cache-first (tiles rarely change) */
  if (url.hostname.includes('carto.com') || url.hostname.includes('tile.openstreetmap')) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  /* CDN assets (fonts, icons, leaflet) → Cache-first */
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  /* App shell → Stale-while-revalidate */
  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

/* ── STRATEGIES ──────────────────────────────────────────────── */

/** Cache-first: serve from cache, fetch if not cached */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch(_) {
    return offlineFallback(request);
  }
}

/** Network-first with timeout fallback to cache */
async function networkFirst(request, cacheName, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch(_) {
    clearTimeout(timer);
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ data: [], total: 0, offline: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/** Stale-while-revalidate: serve cached immediately, update in background */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || offlineFallback(request);
}

/** Offline fallback page */
function offlineFallback(request) {
  const url = new URL(request.url);
  if (request.destination === 'document') {
    return caches.match('/index.html');
  }
  return new Response('', { status: 503, statusText: 'Service Unavailable' });
}

/* ── BACKGROUND SYNC ─────────────────────────────────────────── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

async function syncPendingMessages() {
  try {
    const db = await openDB();
    const pending = await db.getAll('pending-messages');
    for (const msg of pending) {
      await fetch('/tables/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
      await db.delete('pending-messages', msg.id);
    }
  } catch(_) {}
}

/* ── PUSH NOTIFICATIONS ──────────────────────────────────────── */
self.addEventListener('push', event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); }
  catch(_) { data = { title: 'LokalnieOSW', body: event.data.text() }; }

  const options = {
    body:    data.body || 'Masz nową wiadomość',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag:     data.tag || 'osw-notification',
    renotify: true,
    data:    { url: data.url || '/' },
    actions: [
      { action: 'open',    title: '👀 Otwórz' },
      { action: 'dismiss', title: '✖ Zamknij' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'LokalnieOSW', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

/* ── SIMPLE IDB HELPER ───────────────────────────────────────── */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('osw-db', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending-messages')) {
        db.createObjectStore('pending-messages', { keyPath: 'id' });
      }
    };
    req.onsuccess = e => {
      const db = e.target.result;
      resolve({
        getAll: store => new Promise((res, rej) => {
          const tx = db.transaction(store, 'readonly');
          const req = tx.objectStore(store).getAll();
          req.onsuccess = () => res(req.result);
          req.onerror  = () => rej(req.error);
        }),
        delete: (store, id) => new Promise((res, rej) => {
          const tx = db.transaction(store, 'readwrite');
          const req = tx.objectStore(store).delete(id);
          req.onsuccess = () => res();
          req.onerror  = () => rej(req.error);
        }),
      });
    };
    req.onerror = () => reject(req.error);
  });
}
