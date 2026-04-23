// DM Pay — Torre de Comando (platform admin only)
(async function () {
  const PLATFORM_ID = window.DMPAY_CONFIG.PLATFORM_COMPANY_ID;

  const session = await DMPAY.requireAuth();
  if (!session) return;

  const isPlatformAdmin = session.company && session.company.id === PLATFORM_ID;
  if (!isPlatformAdmin) { location.replace('dashboard.html'); return; }

  // Datas
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const ago24 = new Date(now.getTime() - 86400000).toISOString();
  const ago26h = new Date(now.getTime() - 26 * 3600000);
  const ago72h = new Date(now.getTime() - 72 * 3600000);

  function fmtBRL(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function fmtAgo(isoStr) {
    if (!isoStr) return 'nunca';
    const diff = now - new Date(isoStr);
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'há < 1h';
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    return `há ${d}d`;
  }
  function syncStatus(lastSyncStr) {
    if (!lastSyncStr) return { dot: 'red', label: 'Sem sync' };
    const t = new Date(lastSyncStr);
    if (t >= ago26h) return { dot: 'green', label: 'Online' };
    if (t >= ago72h) return { dot: 'yellow', label: 'Atrasado' };
    return { dot: 'red', label: 'Offline' };
  }

  // Fetch paralelo
  const [companiesR, syncsR, salesR, sensitiveR] = await Promise.all([
    sb.from('companies').select('id,legal_name,trade_name,plan,status,trial_until,city,state,created_at,asaas_customer_id,dias_atraso,bloqueado_em')
      .neq('id', PLATFORM_ID).order('legal_name'),
    sb.from('sync_state').select('company_id,entity,last_sync_at,rows_synced'),
    sb.from('daily_sales').select('company_id,amount').eq('sale_date', todayISO),
    sb.from('audit_log').select('company_id,action,created_at')
      .in('action', ['delete', 'estorno']).gte('created_at', ago24)
  ]);

  const companies  = companiesR.data  || [];
  const syncs      = syncsR.data      || [];
  const sales      = salesR.data      || [];
  const sensitive  = sensitiveR.data  || [];

  // Índices
  const syncMap = {};
  for (const s of syncs) {
    if (!syncMap[s.company_id] || s.last_sync_at > syncMap[s.company_id]) {
      syncMap[s.company_id] = s.last_sync_at;
    }
  }
  const salesMap = {};
  for (const s of sales) salesMap[s.company_id] = (salesMap[s.company_id] || 0) + Number(s.amount);
  const sensMap = {};
  for (const a of sensitive) sensMap[a.company_id] = (sensMap[a.company_id] || 0) + 1;

  // KPIs globais
  const totalHoje = sales.reduce((acc, s) => acc + Number(s.amount), 0);
  const onlineCount = companies.filter(c => new Date(syncMap[c.id] || 0) >= ago26h).length;
  const saudePct = companies.length ? Math.round((onlineCount / companies.length) * 100) : 0;
  const totalSensitive = sensitive.length;

  // Render KPIs
  document.getElementById('kpi-faturamento').textContent = fmtBRL(totalHoje);
  document.getElementById('kpi-saude').textContent = saudePct + '%';
  document.getElementById('kpi-saude').style.color = saudePct >= 75 ? 'var(--success)' : saudePct >= 25 ? 'var(--warn)' : 'var(--danger)';
  document.getElementById('kpi-sensivel').textContent = totalSensitive;
  document.getElementById('kpi-sensivel').style.color = totalSensitive > 0 ? 'var(--warn)' : 'var(--text)';
  document.getElementById('kpi-tenants').textContent = companies.length;

  // Render tabela
  const tbody = document.getElementById('tenants-tbody');
  if (!companies.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum tenant encontrado</td></tr>';
  } else {
    tbody.innerHTML = companies.map(c => {
      const lastSync = syncMap[c.id] || null;
      const st = syncStatus(lastSync);
      const dotColor = st.dot === 'green' ? 'var(--success)' : st.dot === 'yellow' ? 'var(--warn)' : 'var(--danger)';
      const vendasHoje = fmtBRL(salesMap[c.id] || 0);
      const acoesSens = sensMap[c.id] || 0;
      const planBadge = {
        trial: 'var(--warn)',
        essencial: 'var(--accent)',
        pro: '#7C3AED',
        rede: '#0D9488',
        admin: '#374151',
        expirado: 'var(--danger)'
      }[c.plan] || 'var(--text-muted)';
      const nome = c.trade_name || c.legal_name;
      const cidade = c.city ? `${c.city}${c.state ? '/' + c.state : ''}` : '—';

      const trialInfo = c.trial_until
        ? new Date(c.trial_until) < now
          ? `<div style="font-size:10px;color:var(--danger)">trial expirado</div>`
          : `<div style="font-size:10px;color:var(--text-muted)">até ${new Date(c.trial_until).toLocaleDateString('pt-BR')}</div>`
        : '';

      return `<tr class="tenant-row">
        <td>
          <div style="font-weight:600;font-size:13px">${nome}</div>
          <div style="font-size:11px;color:var(--text-muted)">${cidade}</div>
        </td>
        <td>
          <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${planBadge}22;color:${planBadge}">${c.plan}</span>
          ${trialInfo}
        </td>
        <td>
          <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:${c.status === 'ativa' ? 'var(--success-soft)' : 'var(--warn-soft)'};color:${c.status === 'ativa' ? 'var(--success)' : 'var(--warn)'}">${c.status}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};display:inline-block;flex-shrink:0"></span>
            <span style="font-size:12.5px">${st.label}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${fmtAgo(lastSync)}</div>
        </td>
        <td style="font-family:'Geist Mono',monospace;font-weight:600;font-size:13px">${vendasHoje}</td>
        <td style="text-align:center">
          ${acoesSens > 0
            ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:var(--warn-soft);color:var(--warn)">${acoesSens}</span>`
            : '<span style="color:var(--text-soft);font-size:12px">—</span>'}
        </td>
        <td style="display:flex;gap:6px;align-items:center">
          <button class="btn-gerenciar" onclick="openDrawer(${JSON.stringify(c).replace(/"/g,'&quot;')})">Gerenciar</button>
          <button class="btn-gerenciar" style="background:var(--accent-soft);color:var(--accent);border-color:var(--accent)" onclick="(function(){sessionStorage.setItem('dmpay-view-as',JSON.stringify({id:'${c.id}',name:'${(c.trade_name||c.legal_name||'').replace(/'/g,'\\\'').replace(/"/g,'&quot;')}'}));location.href='dashboard.html'})()">Entrar →</button>
        </td>
      </tr>`;
    }).join('');
  }

  if (window.lucide) lucide.createIcons();
})();

// ── Drawer de controle ──────────────────────────────────────────────
let _drawerCompany = null;

function openDrawer(c) {
  _drawerCompany = c;
  document.getElementById('drawer-title').textContent = c.trade_name || c.legal_name;
  document.getElementById('d-id').textContent = c.id;
  document.getElementById('d-city').textContent = c.city ? `${c.city}${c.state ? '/' + c.state : ''}` : '—';
  document.getElementById('d-created').textContent = c.created_at
    ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—';
  document.getElementById('d-asaas').textContent = c.asaas_customer_id || '—';
  const atrasoEl = document.getElementById('d-atraso');
  atrasoEl.textContent = c.dias_atraso || '0';
  atrasoEl.style.color = (c.dias_atraso > 7) ? 'var(--danger)' : 'var(--text)';

  document.getElementById('d-plan').value = c.plan || 'trial';
  document.getElementById('d-status').value = c.status || 'trial';

  if (c.trial_until) {
    const dt = new Date(c.trial_until);
    // formato datetime-local: YYYY-MM-DDTHH:MM
    const pad = n => String(n).padStart(2,'0');
    document.getElementById('d-trial-until').value =
      `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  } else {
    document.getElementById('d-trial-until').value = '';
  }

  document.getElementById('drawer-overlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
  if (window.lucide) lucide.createIcons();
}

function closeDrawer() {
  document.getElementById('drawer-overlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
  _drawerCompany = null;
}

function showToast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = isError ? '#dc2626' : '#1e293b';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function extendTrial(days) {
  const el = document.getElementById('d-trial-until');
  const base = el.value ? new Date(el.value) : new Date();
  if (base < new Date()) base.setTime(new Date().getTime());
  base.setDate(base.getDate() + days);
  const pad = n => String(n).padStart(2,'0');
  el.value = `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
  document.getElementById('d-status').value = 'trial';
  document.getElementById('d-plan').value = 'trial';
  showToast(`Trial estendido +${days} dias — clique Salvar para confirmar`);
}

function activatePlan(plan) {
  document.getElementById('d-plan').value = plan;
  document.getElementById('d-status').value = 'ativa';
  showToast(`Plano ${plan} selecionado — clique Salvar para confirmar`);
}

function blockCompany() {
  document.getElementById('d-status').value = 'bloqueada';
  showToast('Empresa marcada como bloqueada — clique Salvar para confirmar');
}

function unblockCompany() {
  document.getElementById('d-status').value = 'ativa';
  document.getElementById('d-plan').value = document.getElementById('d-plan').value === 'trial' ? 'trial' : document.getElementById('d-plan').value;
  showToast('Empresa desbloqueada — clique Salvar para confirmar');
}

async function deleteCompany() {
  if (!_drawerCompany) return;
  const nome = _drawerCompany.trade_name || _drawerCompany.legal_name;
  const confirm1 = await DMPAY_UI.confirm({
    title: `Excluir "${nome}"?`,
    desc: 'Todos os dados serão deletados permanentemente. Isso não pode ser desfeito.',
    danger: true, okLabel: 'Sim, excluir', cancelLabel: 'Cancelar'
  });
  if (!confirm1) return;
  const confirm2 = await DMPAY_UI.confirm({
    title: 'Confirmar exclusão definitiva',
    desc: `Digite "excluir ${nome}" no campo abaixo para confirmar.`,
    danger: true, okLabel: 'Excluir para sempre', cancelLabel: 'Cancelar',
    fields: [{ key: 'confirmacao', label: 'Confirmação', placeholder: `excluir ${nome}` }],
    onSubmit: (v) => {
      if (v.confirmacao.toLowerCase() !== `excluir ${nome.toLowerCase()}`)
        throw new Error('Texto não confere — exclusão cancelada');
    }
  });
  if (!confirm2) return;
  const { error } = await sb.from('companies').delete().eq('id', _drawerCompany.id);
  if (error) { showToast('Erro ao excluir: ' + error.message, true); return; }
  showToast('✓ Empresa excluída');
  closeDrawer();
  setTimeout(() => location.reload(), 1200);
}

function viewAsTenant() {
  if (!_drawerCompany) return;
  sessionStorage.setItem('dmpay-view-as', JSON.stringify({
    id: _drawerCompany.id,
    name: _drawerCompany.trade_name || _drawerCompany.legal_name
  }));
  location.href = 'dashboard.html';
}

async function saveCompany() {
  if (!_drawerCompany) return;
  const plan = document.getElementById('d-plan').value;
  const status = document.getElementById('d-status').value;
  const trialRaw = document.getElementById('d-trial-until').value;
  const trial_until = trialRaw ? new Date(trialRaw).toISOString() : null;

  const { error } = await sb.from('companies').update({
    plan,
    status,
    trial_until,
    updated_at: new Date().toISOString()
  }).eq('id', _drawerCompany.id);

  if (error) {
    showToast('Erro ao salvar: ' + error.message, true);
    return;
  }

  showToast('✓ Alterações salvas com sucesso');
  closeDrawer();
  setTimeout(() => location.reload(), 1200);
}
