/* ============================================================
   SAGERO CREATIONS — Service Worker
   ============================================================
   Strategy:
   - The app shell (HTML/CSS/JS/images/manifest) is precached on
     install, so the app opens instantly and keeps working through
     a flaky connection.
   - Navigations (loading a page) go network-first, falling back to
     the cached copy only if you're actually offline — so you always
     get the latest version when you have a connection.
   - Anything going to Supabase (*.supabase.co) is NEVER intercepted
     or cached here. That's your real, live data — production
     counts, attendance, messages, payroll. Showing a cached/stale
     copy of any of that would be actively misleading, not helpful.
   - Bump CACHE_VERSION any time you ship a real update, so old
     cached files get cleared out and everyone gets the new version.
============================================================ */

const CACHE_VERSION = 'sagero-v1';
const PRECACHE_URLS = [
  'accessories.html',
  'attendance.html',
  'audit.html',
  'batches.html',
  'devices.html',
  'help.html',
  'index.html',
  'login.html',
  'messages.html',
  'orders.html',
  'payroll.html',
  'quality.html',
  'reports.html',
  'roles.html',
  'settings.html',
  'warehouse.html',
  'workers.html',
  'workflow.html',
  'assets/css/style.css',
  'assets/js/accessories.js',
  'assets/js/app.js',
  'assets/js/attendance.js',
  'assets/js/audit.js',
  'assets/js/batches.js',
  'assets/js/dashboard.js',
  'assets/js/devices.js',
  'assets/js/help.js',
  'assets/js/messages.js',
  'assets/js/orders.js',
  'assets/js/payroll.js',
  'assets/js/quality.js',
  'assets/js/reports.js',
  'assets/js/roles.js',
  'assets/js/settings.js',
  'assets/js/shift-status.js',
  'assets/js/supabase-client.js',
  'assets/js/warehouse.js',
  'assets/js/workers.js',
  'assets/js/workflow.js',
  'assets/img/favicon-16.png',
  'assets/img/favicon-180.png',
  'assets/img/favicon-32.png',
  'assets/img/favicon-48.png',
  'assets/img/favicon-64.png',
  'assets/img/favicon.png',
  'assets/img/icon-192.png',
  'assets/img/icon-512.png',
  'assets/img/icon-maskable-192.png',
  'assets/img/icon-maskable-512.png',
  'assets/img/logo-full.png',
  'assets/img/logo-mark.png',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never touch Supabase — real data must always come straight from the network.
  if(url.hostname.endsWith('supabase.co')) return;

  // Only handle GET requests — everything else (POST/PATCH/DELETE to
  // Supabase or anywhere else) passes straight through untouched.
  if(event.request.method !== 'GET') return;

  // Page navigations: network-first, so you always get the current
  // version when online. Falls back to the cached shell if offline.
  if(event.request.mode === 'navigate'){
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('index.html')))
    );
    return;
  }

  // Everything else (CSS/JS/images/fonts, including CDN libraries):
  // cache-first for speed, filling in from network and caching the
  // result for next time if it's not already there.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if(cached) return cached;
      return fetch(event.request).then((response) => {
        if(response.ok){
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached); // if network fails and nothing cached, this just fails naturally
    })
  );
});
