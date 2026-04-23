// DM Pay — Guard de autenticacao + menu do usuario

(async function() {
  const html = document.documentElement;
  html.style.visibility = 'hidden';

  const session = await DMPAY.requireAuth();
  if (!session) return;

  window.DMPAY_USER    = session.user;
  window.DMPAY_PROFILE = session.profile;
  // DMPAY_COMPANY é setado UMA vez, após resolver view-as — evita race condition com páginas

  // ── VIEW-AS: platform admin navegando como tenant ──────────────────
  const _isPa = session.company && session.company.id === window.DMPAY_CONFIG.PLATFORM_COMPANY_ID;
  const _vaRaw = sessionStorage.getItem('dmpay-view-as');
  const _va = _isPa && _vaRaw ? JSON.parse(_vaRaw) : null;

  if (_va) {
    // Busca dados completos do tenant alvo
    const { data: _vaCo } = await sb.from('companies').select('*').eq('id', _va.id).maybeSingle();
    if (_vaCo) {
      // Seta DMPAY_COMPANY como o tenant — páginas que aguardam esse valor verão Mercadinho direto
      window.DMPAY_COMPANY = _vaCo;
      window.DMPAY_VIEW_AS = true;

      // Banner topo em todas as páginas
      const _banner = document.createElement('div');
      _banner.id = 'view-as-banner';
      _banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10002;background:#1e3a5f;border-bottom:2px solid #2d5a8e;padding:8px 20px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#93c5fd;font-family:inherit';
      _banner.innerHTML = `<span>👁 <b style="color:#bfdbfe">${_vaCo.trade_name || _vaCo.legal_name}</b> — modo suporte ativo</span><button onclick="sessionStorage.removeItem('dmpay-view-as');location.href='admin.html'" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;padding:4px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">← Torre de Comando</button>`;
      document.body.prepend(_banner);
      // Empurra conteúdo pra não ficar atrás do banner
      document.body.style.paddingTop = '38px';
    } else {
      // view-as inválido — cai no contexto normal
      window.DMPAY_COMPANY = session.company;
      sessionStorage.removeItem('dmpay-view-as');
    }
  } else {
    // Usuário normal ou admin sem view-as ativo
    window.DMPAY_COMPANY = session.company;
  }

  const initials = (session.profile.name || session.user.email || '?')
    .split(' ').map(function(p){return p[0];}).slice(0,2).join('').toUpperCase();

  // CSS do dropdown
  if (!document.getElementById('dmp-usermenu-css')) {
    const s = document.createElement('style');
    s.id = 'dmp-usermenu-css';
    s.textContent = `
      .avatar { cursor: pointer !important; }
      .dmp-usermenu { position: fixed; top: 50px; right: 20px; background: var(--bg-card,var(--bg-surface,#fff)); border: 1px solid var(--border,#e5e7eb); border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.15); z-index: 9998; min-width: 240px; overflow: hidden; opacity: 0; pointer-events: none; transform: translateY(-4px); transition: .15s; }
      .dmp-usermenu.open { opacity: 1; pointer-events: auto; transform: translateY(0); }
      .dmp-usermenu-head { padding: 14px 16px; border-bottom: 1px solid var(--border,#e5e7eb); }
      .dmp-usermenu-name { font-size: 14px; font-weight: 600; color: var(--text,var(--text-primary,#111)); }
      .dmp-usermenu-email { font-size: 12px; color: var(--text-muted,#6b7280); margin-top: 2px; word-break: break-all; }
      .dmp-usermenu-comp { font-size: 11px; color: var(--text-soft,#9ca3af); margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border,#e5e7eb); }
      .dmp-usermenu-comp b { color: var(--text,var(--text-primary,#111)); font-weight: 600; }
      .dmp-usermenu-item { padding: 10px 16px; font-size: 13px; color: var(--text,var(--text-primary,#111)); cursor: pointer; display: flex; align-items: center; gap: 10px; background: none; border: none; width: 100%; font-family: inherit; text-align: left; }
      .dmp-usermenu-item:hover { background: var(--bg-hover,var(--bg-elevated,#f3f4f6)); }
      .dmp-usermenu-item svg { width: 14px; height: 14px; color: var(--text-muted,#6b7280); }
      .dmp-usermenu-item.danger { color: #DC2626; }
      .dmp-usermenu-item.danger svg { color: #DC2626; }
      .dmp-pa-badge { display: inline-block; font-size: 9px; font-weight: 700; background: #7C3AED; color: white; padding: 2px 6px; border-radius: 4px; margin-left: 6px; letter-spacing: .04em; text-transform: uppercase; }
    `;
    document.head.appendChild(s);
  }

  const isPlatformAdmin = _isPa;
  const displayCompany = window.DMPAY_COMPANY; // já sobrescrito se view-as ativo

  // Cria dropdown
  const menu = document.createElement('div');
  menu.className = 'dmp-usermenu';
  menu.innerHTML = `
    <div class="dmp-usermenu-head">
      <div class="dmp-usermenu-name">${session.profile.name || '—'}${isPlatformAdmin ? '<span class="dmp-pa-badge">master</span>' : ''}</div>
      <div class="dmp-usermenu-email">${session.user.email}</div>
      <div class="dmp-usermenu-comp">${_va ? '👁 suporte: ' : 'empresa: '}<b>${displayCompany?.trade_name || displayCompany?.legal_name || '—'}</b></div>
    </div>
    ${isPlatformAdmin ? `<button class="dmp-usermenu-item" onclick="sessionStorage.removeItem('dmpay-view-as');location.href='admin.html'" style="color:var(--accent,#7C3AED)">
      <i data-lucide="shield"></i> Torre de Comando
    </button>` : ''}
    ${!_va ? `<button class="dmp-usermenu-item" onclick="location.href='configuracoes.html'">
      <i data-lucide="settings"></i> Configurações
    </button>
    <button class="dmp-usermenu-item" onclick="location.href='meu-plano.html'">
      <i data-lucide="credit-card"></i> Meu Plano
    </button>
    <button class="dmp-usermenu-item" onclick="location.href='equipe.html'">
      <i data-lucide="users"></i> Equipe
    </button>` : ''}
    <button class="dmp-usermenu-item danger" onclick="DMPAY.signOut()">
      <i data-lucide="log-out"></i> Sair da conta
    </button>
  `;
  document.body.appendChild(menu);

  // Wire avatares
  document.querySelectorAll('.avatar').forEach(function(el) {
    if (!el.dataset.fixed) el.textContent = initials;
    el.style.cursor = 'pointer';
    el.title = 'Menu do usuário';
    el.onclick = function(e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    };
  });

  // Fecha ao clicar fora
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.dmp-usermenu') && !e.target.closest('.avatar')) {
      menu.classList.remove('open');
    }
  });

  if (window.lucide) lucide.createIcons();
  html.style.visibility = '';
})();
