// DM Pay · responsivo — desktop >1280 / tablet 768-1280 / mobile <768
(function() {
  if (!document.querySelector('.sidebar')) return;

  var page = location.pathname.split('/').pop() || 'dashboard.html';
  var isAdmin = page === 'admin.html';
  var sidebar = document.querySelector('.sidebar');

  var TABS = [
    { href: 'dashboard.html',        icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', label: 'Início' },
    { href: 'contas-a-pagar.html',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', label: 'A Pagar' },
    { href: 'contas-a-receber.html', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', label: 'A Receber' },
    { href: 'vendas.html',           icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', label: 'Vendas' },
    { href: 'calendario.html',       icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Agenda' },
  ];

  function svg(d, size) {
    size = size || 22;
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+d+'"/></svg>';
  }

  // ── CSS ──────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    /* ---- oculta sidebar em tablet e mobile ---- */
    '@media(max-width:1280px){',
    '  body>.sidebar,.app>.sidebar{display:none!important;}',
    '  body{grid-template-columns:1fr!important;}',
    '  .app{grid-template-columns:1fr!important;}',
    '}',

    /* ---- hamburger (tablet 768-1280) ---- */
    '#dmp-ham{display:none;position:fixed;top:12px;left:12px;z-index:400;',
    '  width:44px;height:44px;border-radius:10px;border:1px solid var(--border,#1e2536);',
    '  background:var(--bg-card,#161b28);color:var(--text,#fff);cursor:pointer;',
    '  align-items:center;justify-content:center;}',
    '#dmp-ham:active{opacity:.7;}',
    '@media(min-width:768px)and(max-width:1280px){#dmp-ham{display:flex;}}',

    /* ---- sidebar drawer (tablet) ---- */
    '#dmp-drawer-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:410;}',
    '#dmp-drawer-overlay.open{display:block;}',
    '#dmp-drawer{position:fixed;top:0;left:0;height:100vh;width:260px;',
    '  background:var(--bg-soft,#1a1d24);border-right:1px solid var(--border,#1e2536);',
    '  z-index:420;transform:translateX(-100%);transition:transform .22s ease;',
    '  display:flex;flex-direction:column;overflow-y:auto;}',
    '#dmp-drawer.open{transform:translateX(0);}',

    /* ---- topbar offset no tablet ---- */
    '@media(min-width:768px)and(max-width:1280px){',
    '  .topbar{padding-left:68px!important;}',
    '  main,.main{padding-top:8px;}',
    '}',

    /* ---- bottom tab bar (mobile <768) ---- */
    '#dmp-bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;z-index:400;',
    '  height:64px;background:var(--bg-card,#161b28);border-top:1px solid var(--border,#1e2536);',
    '  box-shadow:0 -4px 24px rgba(0,0,0,.25);}',
    '@media(max-width:767px){',
    '  #dmp-bottom-nav{display:flex;}',
    '  body{padding-bottom:64px!important;}',
    '  main,.main{padding-bottom:64px!important;}',
    '  #dmpay-version-badge{bottom:72px!important;}',
    '}',
    '.dmp-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;',
    '  gap:3px;text-decoration:none;min-height:44px;min-width:44px;',
    '  color:var(--text-muted,#6b7280);font-size:10px;font-weight:600;',
    '  font-family:inherit;background:none;border:none;cursor:pointer;',
    '  transition:color .15s;padding:4px 2px;letter-spacing:.02em;}',
    '.dmp-tab.active{color:var(--accent,#7C3AED);}',
    '.dmp-tab svg{width:22px;height:22px;flex-shrink:0;}',

    /* ---- bottom sheet menu (mobile) ---- */
    '#dmp-sheet-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:450;}',
    '#dmp-sheet-overlay.open{display:block;}',
    '#dmp-sheet{position:fixed;bottom:64px;left:0;right:0;max-height:70vh;',
    '  background:var(--bg-soft,#1a1d24);border-radius:16px 16px 0 0;',
    '  border-top:1px solid var(--border,#1e2536);z-index:460;',
    '  overflow-y:auto;transform:translateY(100%);transition:transform .22s ease;}',
    '#dmp-sheet.open{transform:translateY(0);}',
  ].join('');
  document.head.appendChild(style);

  // ── TABLET: Hamburger + Drawer ────────────────────────────────────────
  var ham = document.createElement('button');
  ham.id = 'dmp-ham';
  ham.setAttribute('aria-label', 'Menu');
  ham.innerHTML = svg('M3 6h18M3 12h18M3 18h18', 20);

  var drawerOverlay = document.createElement('div');
  drawerOverlay.id = 'dmp-drawer-overlay';

  var drawer = document.createElement('div');
  drawer.id = 'dmp-drawer';
  // clona a sidebar original pro drawer
  drawer.innerHTML = sidebar.innerHTML;

  function openDrawer() {
    drawer.classList.add('open');
    drawerOverlay.classList.add('open');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
  }

  ham.addEventListener('click', function(e) { e.stopPropagation(); openDrawer(); });
  drawerOverlay.addEventListener('click', closeDrawer);
  drawer.addEventListener('click', function(e) { if (e.target.closest('a[href]')) closeDrawer(); });

  document.body.appendChild(drawerOverlay);
  document.body.appendChild(drawer);
  document.body.appendChild(ham);

  // ── MOBILE: Bottom Tab Bar ────────────────────────────────────────────
  if (!isAdmin) {
    var nav = document.createElement('nav');
    nav.id = 'dmp-bottom-nav';

    TABS.forEach(function(t) {
      var a = document.createElement('a');
      a.className = 'dmp-tab' + (page === t.href ? ' active' : '');
      a.href = t.href;
      a.innerHTML = svg(t.icon) + '<span>' + t.label + '</span>';
      nav.appendChild(a);
    });

    // Botão "Menu" abre bottom sheet com o resto da navegação
    var moreBtn = document.createElement('button');
    moreBtn.className = 'dmp-tab';
    moreBtn.innerHTML = svg('M3 6h18M3 12h18M3 18h18') + '<span>Menu</span>';

    var sheetOverlay = document.createElement('div');
    sheetOverlay.id = 'dmp-sheet-overlay';

    var sheet = document.createElement('div');
    sheet.id = 'dmp-sheet';
    sheet.innerHTML = sidebar.innerHTML;

    function openSheet() {
      sheet.classList.add('open');
      sheetOverlay.classList.add('open');
    }
    function closeSheet() {
      sheet.classList.remove('open');
      sheetOverlay.classList.remove('open');
    }

    moreBtn.addEventListener('click', function(e) { e.stopPropagation(); openSheet(); });
    sheetOverlay.addEventListener('click', closeSheet);
    sheet.addEventListener('click', function(e) { if (e.target.closest('a[href]')) closeSheet(); });

    nav.appendChild(moreBtn);
    document.body.appendChild(sheetOverlay);
    document.body.appendChild(sheet);
    document.body.appendChild(nav);
  }
})();
