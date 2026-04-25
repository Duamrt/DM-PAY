// DM Pay · versao atual
window.DMPAY_VERSION = 'v04251348';
(function() {
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
})();
