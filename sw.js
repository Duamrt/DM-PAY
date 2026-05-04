const CACHE = 'dmpay-mobile-v05042152';

self.addEventListener('install', e => {
  // Ativa novo SW imediatamente, sem esperar fechar abas
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
  // Supabase API e CDNs externas — sempre rede
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('googleapis.com')) return;
  if (e.request.url.includes('gstatic.com')) return;

  // Network-first com cache fallback (offline)
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        // Cacheia respostas OK pra fallback offline
        if (res && res.ok && res.type === 'basic') {
          var clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
