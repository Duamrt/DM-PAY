// DM Pay · sidebar colapsável — botão na base da sidebar
(function() {
  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  var KEY = 'dmpay-sidebar-collapsed';
  var isMobile = window.innerWidth < 768;

  // padrão: mobile começa recolhido, desktop/tablet começa aberto
  var stored = localStorage.getItem(KEY);
  var collapsed = stored !== null ? stored === 'true' : isMobile;

  function svgIcon(d, size) {
    size = size || 16;
    return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+d+'"/></svg>';
  }

  // ── CSS ──────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    /* anula qualquer hide do sidebar em breakpoints menores */
    'body>.sidebar,div.app>.sidebar{display:flex!important;}',
    /* garante que grid não perde a coluna da sidebar */
    'body{grid-template-columns:var(--sb-w,240px) 1fr!important;}',
    'div.app{grid-template-columns:var(--sb-w,240px) 1fr!important;}',

    /* sidebar transition */
    '.sidebar{width:var(--sb-w,240px)!important;min-width:0;overflow:hidden;transition:width .2s ease;}',

    /* estado recolhido */
    '.sidebar.dmp-col{--sb-w:52px;}',
    '.dmp-col .sidebar-label{display:none!important;}',
    '.dmp-col .brand-name{display:none!important;}',
    '.dmp-col .nav-badge{display:none!important;}',
    '.dmp-col .nav-item{justify-content:center!important;padding:8px 0!important;overflow:hidden;white-space:nowrap;}',
    '.dmp-col .brand{justify-content:center!important;}',
    '.dmp-col #dmp-toggle-label{display:none;}',

    /* botão recolher */
    '#dmp-col-btn{display:flex;align-items:center;justify-content:flex-start;gap:8px;',
    '  margin-top:auto;padding:12px 14px;border:none;',
    '  background:none;color:var(--text-muted,#6b7280);cursor:pointer;',
    '  width:100%;font-family:inherit;font-size:12px;font-weight:500;',
    '  border-top:1px solid var(--border,#1e2536);transition:color .15s;}',
    '#dmp-col-btn:hover{color:var(--text,#e5e7eb);}',
    '.dmp-col #dmp-col-btn{justify-content:center;}',
  ].join('');
  document.head.appendChild(style);

  // ── Botão ─────────────────────────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'dmp-col-btn';
  btn.setAttribute('aria-label', 'Recolher menu');
  sidebar.appendChild(btn);

  // ── Aplicar estado ────────────────────────────────────────────────────
  function apply(col) {
    collapsed = col;
    localStorage.setItem(KEY, col);

    // anula a CSS var na sidebar via inline style
    var w = col ? '52px' : '240px';
    document.documentElement.style.setProperty('--sb-w', w);
    sidebar.style.width = w;

    // toggle class no container da grid (body ou .app)
    var app = document.querySelector('.app') || document.body;
    if (col) {
      sidebar.classList.add('dmp-col');
      app.classList.add('dmp-col');
      document.body.classList.add('dmp-col');
    } else {
      sidebar.classList.remove('dmp-col');
      app.classList.remove('dmp-col');
      document.body.classList.remove('dmp-col');
    }

    btn.innerHTML = col
      ? svgIcon('M13 5l7 7-7 7')
      : svgIcon('M11 5l-7 7 7 7') + '<span id="dmp-toggle-label"> Recolher</span>';
  }

  apply(collapsed);
  btn.addEventListener('click', function() { apply(!collapsed); });
})();
