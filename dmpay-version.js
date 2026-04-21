// DM Pay · versao atual
window.DMPAY_VERSION = 'v04211219';
console.log('%cDM Pay ' + window.DMPAY_VERSION, 'background:#2563EB;color:white;padding:4px 8px;border-radius:4px;font-weight:600;font-family:monospace');
(function() {
  var el = document.createElement('div');
  el.textContent = window.DMPAY_VERSION;
  el.style.cssText = 'position:fixed;bottom:8px;right:10px;font:10px/1 monospace;color:#9CA3AF;background:rgba(255,255,255,.6);padding:3px 7px;border-radius:4px;z-index:9999;pointer-events:none;user-select:none';
  if (document.documentElement.getAttribute('data-theme') === 'dark') {
    el.style.background = 'rgba(17,20,24,.7)';
    el.style.color = '#6B7280';
  }
  (document.body || document.documentElement).appendChild(el);
})();
