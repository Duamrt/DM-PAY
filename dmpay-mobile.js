// DM Pay · menu mobile — hamburguer + sidebar drawer
(function() {
  if (!document.querySelector('.sidebar')) return;

  var css = '\
  @media (max-width:900px) {\
    body > .sidebar, body > * > .sidebar, .app > .sidebar { display:flex !important; position:fixed !important; top:0; left:0; height:100vh; width:260px; transform:translateX(-100%); transition:transform .25s ease; z-index:200; box-shadow:0 10px 40px rgba(0,0,0,.3); }\
    .sidebar.dmp-open { transform:translateX(0) !important; }\
    .dmp-ham { position:fixed; top:10px; left:10px; z-index:210; width:38px; height:38px; border-radius:8px; background:var(--bg-card,#fff); border:1px solid var(--border,#e5e7eb); display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.1); }\
    .dmp-ham svg { width:18px; height:18px; color:var(--text,#111); }\
    .dmp-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:199; opacity:0; pointer-events:none; transition:opacity .2s; }\
    .dmp-overlay.open { opacity:1; pointer-events:auto; }\
    .topbar { padding-left:58px !important; }\
    main, .main { padding-top:60px !important; }\
    body { grid-template-columns: 1fr !important; }\
    .app { grid-template-columns: 1fr !important; }\
  }\
  @media (min-width:901px) { .dmp-ham, .dmp-overlay { display:none !important; } }\
  ';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var ham = document.createElement('button');
  ham.className = 'dmp-ham';
  ham.setAttribute('aria-label', 'Menu');
  ham.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';

  var overlay = document.createElement('div');
  overlay.className = 'dmp-overlay';

  var sidebar = document.querySelector('.sidebar');

  ham.addEventListener('click', function(e) {
    e.stopPropagation();
    sidebar.classList.toggle('dmp-open');
    overlay.classList.toggle('open');
  });
  overlay.addEventListener('click', function() {
    sidebar.classList.remove('dmp-open');
    overlay.classList.remove('open');
  });
  // fecha ao clicar em qualquer link da sidebar
  sidebar.addEventListener('click', function(e) {
    if (e.target.closest('a[href]')) {
      sidebar.classList.remove('dmp-open');
      overlay.classList.remove('open');
    }
  });

  document.body.appendChild(overlay);
  document.body.appendChild(ham);
})();
