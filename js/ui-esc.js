// DM Pay — ESC fecha qualquer modal/drawer/overlay aberto (global)
(function() {
  const SELECTORS = [
    '.dmp-modal-bg',                    // modal padrão DMPAY_UI
    '.drawer.open',                     // drawers das telas
    '.drawer-overlay.open',             // overlay dos drawers
    '.modal.open', '.modal-bg.open',    // modais antigos (despesas, vendas)
    '.modal-overlay.open',              // overlays
    '#payModal.open',                   // modal de pagamento
    '#modal.open', '#modalImport.open', // modais antigos por ID
  ];

  function closeAll() {
    // Modal DMPAY_UI: remove o elemento do DOM
    document.querySelectorAll('.dmp-modal-bg').forEach(el => el.remove());
    // Drawers e modais com classe "open": remove a classe
    document.querySelectorAll('.drawer.open, .drawer-overlay.open, .modal.open, .modal-bg.open, .modal-overlay.open').forEach(el => el.classList.remove('open'));
    // Modais por ID com "active"
    document.querySelectorAll('.modal.active, .modal-overlay.active').forEach(el => el.classList.remove('active'));
    return true;
  }

  function hasOpen() {
    if (document.querySelector('.dmp-modal-bg')) return true;
    if (document.querySelector('.drawer.open, .modal.open, .modal-bg.open, .modal-overlay.open, .drawer-overlay.open')) return true;
    if (document.querySelector('.modal.active, .modal-overlay.active')) return true;
    return false;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Não interferir em inputs com selects/autocomplete nativos
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
      // Deixa o ESC limpar o input primeiro; se já estiver vazio OU não for blur-target, fecha modal
      if (t.value) { /* permite ação default */ }
    }
    if (hasOpen()) {
      e.preventDefault();
      e.stopPropagation();
      closeAll();
    }
  }, true); // captura antes de listeners de outros scripts

  window.DMPAY_ESC = { closeAll, hasOpen };
})();
