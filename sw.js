// DM Pay · Service Worker com precache de shell crítico + offline fallback.
// Bumpe o CACHE quando alterar arquivos do shell.
const CACHE = 'dmpay-mobile-v05120706';

// Shell mínimo pro app abrir mesmo sem rede.
const PRECACHE = [
  '/',
  '/mobile.html',
  '/login.html',
  '/offline.html',
  '/manifest.json',
  '/dmpay-version.js',
  '/dmpay-mobile.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
  '/apple-touch-icon.png',
  '/js/sentry-init.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/auth-guard.js',
  '/js/mfa.js',
  '/js/theme.js',
  '/js/posthog.js',
  '/js/ui-esc.js',
  '/js/ui-modal.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(err => {
      // Se algum item falhar, ainda assim instala — não bloqueia ativação.
      console.warn('[sw] precache parcial:', err);
    }))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;

  // Só GET passa pelo SW (POST/PUT/DELETE direto na rede)
  if (req.method !== 'GET') return;

  // Bypass: chamadas que NÃO devem ser cacheadas
  if (url.includes('supabase.co')) return;          // API/realtime
  if (url.includes('googleapis.com')) return;       // fonts CSS dinâmico
  if (url.includes('gstatic.com')) return;          // fonts arquivos
  if (url.includes('hcaptcha.com')) return;         // captcha dinâmico
  if (url.includes('sentry.io')) return;            // ingest de eventos
  if (url.includes('sentry-cdn.com')) return;       // SDK do Sentry
  if (url.includes('asaas.com')) return;            // billing
  if (url.includes('brasilapi.com.br')) return;     // CNPJ lookup

  // Documento (HTML): network-first com fallback pra cache, e offline.html como último recurso
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(()=>{});
          }
          return res;
        })
        .catch(() => caches.match(req).then(m => m || caches.match('/offline.html')))
    );
    return;
  }

  // Demais GETs (JS, CSS, imagens): cache-first com network update em background (stale-while-revalidate)
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchAndUpdate = fetch(req).then(res => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(()=>{});
        }
        return res;
      }).catch(() => cached);
      return cached || fetchAndUpdate;
    })
  );
});
