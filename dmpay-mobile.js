// DM Pay · navegação mobile/tablet — bottom tab bar (≤1280px) + hamburger drawer (fallback)
(function() {
  if (!document.querySelector('.sidebar')) return;

  var page = location.pathname.split('/').pop() || 'dashboard.html';
  var isAdmin = page === 'admin.html';

  // ── TABS de navegação ──────────────────────────────────────────────
  var TABS = [
    { href: 'dashboard.html',       icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: 'Início' },
    { href: 'contas-a-pagar.html',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', label: 'A Pagar' },
    { href: 'contas-a-receber.html',icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', label: 'A Receber' },
    { href: 'vendas.html',          icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', label: 'Vendas' },
    { href: 'calendario.html',      icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Agenda' },
  ];

  var ADMIN_TABS = [
    { href: 'admin.html', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Torre' },
  ];

  var tabs = isAdmin ? ADMIN_TABS : TABS;

  function makeSvg(d) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
  }

  var css = '\
  @media (max-width:1280px) {\
    body > .sidebar, .app > .sidebar { display: none !important; }\
    body { grid-template-columns: 1fr !important; padding-bottom: 68px !important; }\
    .app { grid-template-columns: 1fr !important; }\
    main, .main { padding-bottom: 68px !important; }\
    #dmp-sb-toggle { display: none !important; }\
    #dmpay-version-badge { bottom: 72px !important; }\
  }\
  #dmp-bottom-nav {\
    display: none;\
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 300;\
    background: var(--bg-card, #161b28);\
    border-top: 1px solid var(--border, #1e2536);\
    height: 64px;\
    align-items: stretch;\
    box-shadow: 0 -4px 24px rgba(0,0,0,.25);\
  }\
  @media (max-width:1280px) { #dmp-bottom-nav { display: flex; } }\
  .dmp-tab {\
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;\
    gap: 3px; text-decoration: none;\
    color: var(--text-muted, #6b7280); font-size: 10px; font-weight: 600;\
    font-family: inherit; background: none; border: none; cursor: pointer;\
    transition: color .15s; padding: 6px 4px;\
    letter-spacing: .02em;\
  }\
  .dmp-tab:hover { color: var(--text, #fff); }\
  .dmp-tab.active { color: var(--accent, #7C3AED); }\
  .dmp-tab svg { width: 22px; height: 22px; flex-shrink: 0; }\
  ';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var nav = document.createElement('nav');
  nav.id = 'dmp-bottom-nav';

  tabs.forEach(function(t) {
    var a = document.createElement('a');
    a.className = 'dmp-tab' + (page === t.href ? ' active' : '');
    a.href = t.href;
    a.innerHTML = makeSvg(t.icon) + '<span>' + t.label + '</span>';
    nav.appendChild(a);
  });

  // Tab "Mais" abre sidebar drawer (só nas páginas de tenant)
  if (!isAdmin) {
    var moreBtn = document.createElement('button');
    moreBtn.className = 'dmp-tab';
    moreBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg><span>Menu</span>';

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:350;display:none;';

    var sidebar = document.querySelector('.sidebar');

    function openDrawer() {
      sidebar.style.cssText = 'display:flex !important;position:fixed;bottom:64px;left:0;right:0;height:auto;max-height:70vh;flex-direction:column;z-index:360;overflow-y:auto;border-top:1px solid var(--border,#1e2536);border-radius:16px 16px 0 0;transform:translateY(0);transition:transform .25s ease;padding-bottom:8px;';
      overlay.style.display = 'block';
    }
    function closeDrawer() {
      sidebar.style.display = '';
      overlay.style.display = 'none';
    }

    moreBtn.addEventListener('click', function(e) { e.stopPropagation(); openDrawer(); });
    overlay.addEventListener('click', closeDrawer);
    sidebar.addEventListener('click', function(e) { if (e.target.closest('a[href]')) closeDrawer(); });

    nav.appendChild(moreBtn);
    document.body.appendChild(overlay);
  }

  document.body.appendChild(nav);
})();
