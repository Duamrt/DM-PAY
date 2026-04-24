#!/bin/bash
# DM Pay deploy — atualiza versao + commit + push
set -e

MSG="${1:-update}"
VERSION="v$(date +%m%d%H%M)"

# Atualiza sw.js — novo CACHE_NAME força browser a baixar tudo de novo
sed -i "s/dmpay-mobile-v[^']*/dmpay-mobile-${VERSION}/" sw.js

# Atualiza dmpay-version.js
cat > dmpay-version.js <<EOF
// DM Pay · versao atual
window.DMPAY_VERSION = '${VERSION}';
(function() {
  var el = document.createElement('div');
  el.id = 'dmpay-version-badge';
  el.textContent = window.DMPAY_VERSION;
  el.style.cssText = 'position:fixed;bottom:8px;right:10px;font:10px/1 monospace;padding:3px 7px;border-radius:4px;z-index:9999;pointer-events:none;user-select:none';
  function applyTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    el.style.background = dark ? 'rgba(17,20,24,.8)' : 'rgba(255,255,255,.7)';
    el.style.color = dark ? '#9CA3AF' : '#6B7280';
    el.style.border = dark ? '1px solid rgba(255,255,255,.08)' : '1px solid rgba(0,0,0,.1)';
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  (document.body || document.documentElement).appendChild(el);
})();
EOF

git add -A
git commit -m "${VERSION} ${MSG}"
git push

echo "✓ ${VERSION} no ar · https://duamrt.github.io/DM-PAY/dashboard.html"
