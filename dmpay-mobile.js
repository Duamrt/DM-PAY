// DM Pay · sidebar colapsável
(function() {
  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  var KEY = 'dmpay-sidebar-collapsed';
  var isMobile = window.innerWidth < 768;
  var stored = localStorage.getItem(KEY);
  var collapsed = stored !== null ? stored === 'true' : isMobile;

  // ── Envolve text nodes nos nav-items em <span> para CSS poder ocultar ──
  sidebar.querySelectorAll('.nav-item').forEach(function(item) {
    Array.from(item.childNodes).forEach(function(node) {
      if (node.nodeType === 3 && node.textContent.trim()) {
        var sp = document.createElement('span');
        sp.className = 'nav-label';
        sp.textContent = node.textContent;
        item.replaceChild(sp, node);
      }
    });
  });

  // ── CSS ────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    /* garante sidebar visível sempre, coluna */
    'body>.sidebar,div.app>.sidebar{display:flex!important;flex-direction:column!important;}',

    /* transition suave — só esconde overflow horizontal (não corta scroll vertical) */
    '.sidebar{transition:width .22s ease;overflow-x:hidden!important;overflow-y:auto!important;}',

    /* grid ajusta conforme variável */
    'body{grid-template-columns:var(--dmp-sb,240px) 1fr!important;}',
    'div.app{grid-template-columns:var(--dmp-sb,240px) 1fr!important;}',

    /* estado recolhido */
    '.sidebar.dmp-col{width:52px!important;}',
    '.dmp-col .sidebar-label{display:none!important;}',
    '.dmp-col .brand-name{display:none!important;}',
    '.dmp-col .nav-label{display:none!important;}',
    '.dmp-col .nav-badge,.dmp-col .badge-count,.dmp-col .soon-badge{display:none!important;}',
    '.dmp-col .nav-item{justify-content:center!important;padding:10px 0!important;overflow:hidden;}',
    '.dmp-col .brand,.dmp-col .brand-row{justify-content:center!important;}',

    /* botão toggle */
    '#dmp-col-btn{',
    '  display:flex;align-items:center;gap:8px;',
    '  margin-top:auto;padding:14px 16px;',
    '  border:none;border-top:1px solid var(--border,#1e2536);',
    '  background:none;color:var(--text-muted,#6b7280);',
    '  cursor:pointer;width:100%;font-family:inherit;',
    '  font-size:12px;font-weight:600;letter-spacing:.02em;',
    '  transition:color .15s,background .15s;}',
    '#dmp-col-btn:hover{color:var(--text,#e5e7eb);background:var(--bg-hover,rgba(255,255,255,.04));}',
    '.dmp-col #dmp-col-btn{justify-content:center;padding:14px 0;}',
    '.dmp-col #dmp-col-btn .btn-label{display:none;}',
  ].join('');
  document.head.appendChild(style);

  // ── Botão ──────────────────────────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'dmp-col-btn';
  sidebar.appendChild(btn);

  function chevLeft() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  }
  function chevRight() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  }

  // ── Aplicar estado ─────────────────────────────────────────────────────
  function apply(col) {
    collapsed = col;
    localStorage.setItem(KEY, col);

    var w = col ? '52px' : '240px';
    document.documentElement.style.setProperty('--dmp-sb', w);

    var container = document.querySelector('.app') || document.body;
    if (col) {
      sidebar.classList.add('dmp-col');
      container.classList.add('dmp-col');
    } else {
      sidebar.classList.remove('dmp-col');
      container.classList.remove('dmp-col');
    }

    btn.innerHTML = col
      ? chevRight()
      : chevLeft() + '<span class="btn-label"> Recolher</span>';
  }

  apply(collapsed);
  btn.addEventListener('click', function() { apply(!collapsed); });
})();
