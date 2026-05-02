// DM Pay — Equipe com dado real (profiles da company)
(function() {
  const ROLE_LABELS = { 'dono':'Dono', 'admin':'Admin', 'financeiro':'Financeiro', 'viewer':'Visualizador' };
  const ROLE_COLORS = { 'dono':'#7C3AED', 'admin':'#2563EB', 'financeiro':'#D97706', 'viewer':'#4B5563' };
  const ROLE_ICONS  = { 'dono':'crown', 'admin':'shield', 'financeiro':'calculator', 'viewer':'eye' };

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function iniciais(nome){
    const w = (nome||'').replace(/[^\wÀ-ÿ ]/g,'').trim().split(/\s+/);
    return ((w[0]||'')[0]||'?') + ((w[1]||'')[0]||'') ;
  }

  async function load() {
    const { data, error } = await sb.from('profiles')
      .select('id, name, email, role')
      .eq('company_id', window.DMPAY_COMPANY.id)
      .order('role')
      .order('name');
    if (error) { console.error(error); return []; }
    return data || [];
  }

  function renderKPIs(membros) {
    const total = membros.length;
    const donos = membros.filter(m => m.role === 'dono').length;
    const admins = membros.filter(m => m.role === 'admin').length;
    const ks = document.querySelectorAll('.kpi-value');
    const subs = document.querySelectorAll('.kpi-sub');
    if (ks[0]) ks[0].textContent = total;
    if (subs[0]) subs[0].textContent = `${total} ativo${total>1?'s':''}`;
    if (ks[1]) ks[1].textContent = donos + admins;
    if (subs[1]) subs[1].textContent = 'dono + admin';
    if (ks[2]) ks[2].textContent = '0';
    if (subs[2]) subs[2].textContent = 'sem pendentes';
    if (ks[3]) ks[3].textContent = 'agora';
    if (subs[3]) subs[3].textContent = 'esta sessão';
  }

  function renderLista(membros) {
    // Encontra o container da lista de membros e substitui os cards hardcoded
    // HTML original tem <!-- Reginaldo --> <!-- Mikael (você) --> etc dentro de um wrapper
    const meuEmail = window.DMPAY_PROFILE?.email;
    const container = document.querySelector('.panel-body') ||
                      document.querySelector('.members-list') ||
                      document.querySelector('[data-members]');
    // Estratégia robusta: pegar o primeiro .mbr-avatar e subir até o ancestral comum
    const firstAvatar = document.querySelector('.mbr-avatar');
    if (!firstAvatar) return;
    const card = firstAvatar.closest('[class*="member"], .flex, .dr-member, div');
    // Achar o wrapper que contém TODOS os membros (pai comum dos .mbr-avatar)
    const avatars = document.querySelectorAll('.mbr-avatar');
    if (avatars.length === 0) return;
    // pai direto do primeiro card (o que contém todos os cards)
    let wrapper = avatars[0].parentElement;
    while (wrapper && !Array.from(avatars).every(a => wrapper.contains(a))) {
      wrapper = wrapper.parentElement;
      if (!wrapper || wrapper.tagName === 'BODY') return;
    }
    // Remove apenas os cards de membro (filhos diretos que contêm .mbr-avatar)
    Array.from(wrapper.children).forEach(ch => { if (ch.querySelector('.mbr-avatar')) ch.remove(); });

    membros.forEach(m => {
      const ini = iniciais(m.name).toUpperCase();
      const role = m.role || 'viewer';
      const color = ROLE_COLORS[role] || '#4B5563';
      const label = ROLE_LABELS[role] || role;
      const roleIcon = ROLE_ICONS[role] || 'user';
      const isYou = m.email === meuEmail;
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--border)';
      row.innerHTML = `
        <div class="mbr-avatar" style="background:${color};width:40px;height:40px;border-radius:50%;color:white;display:grid;place-items:center;font-weight:600;font-size:13px;position:relative">${escapeHtml(ini)}<span class="online-dot" style="position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:var(--success);border:2px solid var(--bg-card)"></span></div>
        <div>
          <div class="name" style="font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px">${escapeHtml(m.name || '(sem nome)')} ${isYou ? '<span class="you" style="font-size:10px;background:var(--accent-soft);color:var(--accent);padding:2px 7px;border-radius:999px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Você</span>' : ''}</div>
          <div class="email" style="font-size:12.5px;color:var(--text-muted)">${escapeHtml(m.email || '')}</div>
        </div>
        <div><span style="font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:999px;background:${color}22;color:${color};display:inline-flex;align-items:center;gap:5px"><i data-lucide="${roleIcon}" style="width:11px;height:11px"></i>${label}</span></div>
        <div style="text-align:right;font-size:12px;color:var(--text-muted)">${isYou ? 'esta sessão' : '—'}</div>`;
      wrapper.appendChild(row);
    });
    if (window.lucide) lucide.createIcons();
  }

  function removeConvitePendenteFake() {
    // Remove banner de "Sr. João (contador)" mockado
    document.querySelectorAll('.alert, .alert-text').forEach(el => {
      if (el.textContent.includes('Sr. João') || el.textContent.includes('contador)')) {
        const wrapper = el.closest('.alert, [class*="alert"]') || el.parentElement;
        wrapper?.remove();
      }
    });
  }

  async function enviarConvite() {
    const email  = (document.getElementById('inv-email')?.value || '').trim();
    const nome   = (document.getElementById('inv-nome')?.value  || '').trim();
    const senha  = (document.getElementById('inv-senha')?.value || '').trim();
    const role   = document.querySelector('.role-picker .role-opt.selected')?.dataset?.role || 'viewer';
    const errEl  = document.getElementById('invite-err');

    function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
    errEl.style.display = 'none';

    if (!email) return showErr('E-mail obrigatório');
    if (senha.length < 8) return showErr('Senha deve ter ao menos 8 caracteres');

    const btn = document.getElementById('btn-enviar-convite');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2"></i> Criando...';
    if (window.lucide) lucide.createIcons();

    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(window.DMPAY_CONFIG.SUPABASE_URL + '/functions/v1/criar-membro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ email, name: nome || null, password: senha, role, company_id: window.DMPAY_COMPANY.id }),
      });
      const json = await res.json();
      if (!res.ok) return showErr(json.error || 'Erro ao criar acesso');

      // Fecha drawer e recarrega lista
      document.querySelector('.drawer-backdrop')?.classList.remove('open');
      document.getElementById('drawer')?.classList.remove('open');
      const membros = await load();
      renderKPIs(membros);
      renderLista(membros);
    } catch (e) {
      showErr('Erro de conexão: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send"></i> Criar acesso';
      if (window.lucide) lucide.createIcons();
    }
  }
  window.enviarConvite = enviarConvite;

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    if (!document.querySelector('.mbr-avatar')) return; // não é tela de equipe
    const membros = await load();
    renderKPIs(membros);
    renderLista(membros);
    removeConvitePendenteFake();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
