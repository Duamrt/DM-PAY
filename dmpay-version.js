// DM Pay · versao atual + auto-update
window.DMPAY_VERSION = 'v05031716';
(function() {
  // ------- Badge de versao no canto -------
  var el = document.createElement('div');
  el.id = 'dmpay-version-badge';
  el.textContent = window.DMPAY_VERSION;
  el.style.cssText = 'position:fixed;bottom:8px;right:10px;font:10px/1 monospace;padding:3px 7px;border-radius:4px;z-index:9999;pointer-events:none;user-select:none';
  function applyTheme() {
    var dark = localStorage.getItem('dmpay-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'dark';
    el.style.background = dark ? 'rgba(17,20,24,.85)' : 'rgba(240,242,245,.9)';
    el.style.color = dark ? '#9CA3AF' : '#6B7280';
    el.style.border = dark ? '1px solid rgba(255,255,255,.1)' : '1px solid rgba(0,0,0,.12)';
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  (document.body || document.documentElement).appendChild(el);

  // ------- Auto-update silencioso -------
  var current = window.DMPAY_VERSION;
  var reloading = false;

  function showUpdateToast(newVer) {
    if (document.getElementById('dmpay-update-toast')) return;
    var t = document.createElement('div');
    t.id = 'dmpay-update-toast';
    t.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#34D399;margin-right:8px;vertical-align:middle;animation:dmp-pulse 1.4s infinite"></span>Nova versão · atualizando…';
    t.style.cssText = 'position:fixed;bottom:50px;right:10px;background:linear-gradient(135deg,#3B82F6,#60A5FA);color:#fff;padding:10px 14px;border-radius:10px;font:12px/1.4 system-ui,sans-serif;font-weight:500;z-index:999999;box-shadow:0 8px 28px rgba(59,130,246,.4),inset 0 1px 0 rgba(255,255,255,.2)';
    var s = document.createElement('style');
    s.textContent = '@keyframes dmp-pulse{0%,100%{opacity:1}50%{opacity:.4}}';
    document.head.appendChild(s);
    document.body.appendChild(t);
  }

  function forceReload() {
    if (reloading) return;
    reloading = true;
    var done = function() { location.reload(); };
    try {
      if ('caches' in window) {
        caches.keys().then(function(keys) {
          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
        }).then(done, done);
      } else done();
    } catch (e) { done(); }
  }

  function checkUpdate() {
    if (reloading) return;
    fetch('dmpay-version.js?_=' + Date.now(), { cache: 'no-store' })
      .then(function(r) { return r.text(); })
      .then(function(txt) {
        var m = txt.match(/DMPAY_VERSION\s*=\s*['"]([^'"]+)/);
        if (m && m[1] && m[1] !== current) {
          showUpdateToast(m[1]);
          setTimeout(forceReload, 1800);
        }
      })
      .catch(function() {});
  }

  // Checa a cada 60s
  setInterval(checkUpdate, 60000);
  // Checa quando aba volta a ficar visivel
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') checkUpdate();
  });
  // Checa logo ao carregar (delay 5s pra nao competir com primeiro paint)
  setTimeout(checkUpdate, 5000);
})();
