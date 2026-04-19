// DM Pay — Contas a Pagar (CRUD real Supabase)
// Substitui o mock estatico do contas-a-pagar.html.
// Depende de: window.sb (Supabase client), window.DMPAY_PROFILE, window.DMPAY_COMPANY

(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);
  let PAYABLES = [];
  let FILTRO = 'open';   // open | today | overdue | week | paid
  let BUSCA = '';
  let SUPPLIERS_CACHE = null;

  // ==================== UTILS ====================
  function fmtBRL(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function brDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; }
  function isoToday(){ return new Date().toISOString().split('T')[0]; }
  function diffDays(iso) {
    if (!iso) return 0;
    const d = new Date(iso); d.setHours(0,0,0,0);
    return Math.round((d - HOJE) / 86400000);
  }
  function iniciais(nome){
    const w = (nome||'?').replace(/[^\wÀ-ÿ ]/g,'').trim().split(/\s+/);
    return ((w[0]||'')[0] + (w[1]||'')[0] || (w[0]||'??').slice(0,2)).toUpperCase();
  }
  function tone(nome){
    let h = 0; const s = nome||'';
    for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 5) + 1;
  }
  function statusOf(p) {
    if (p.status === 'paid') return { s:'paid', overdue:0 };
    const dd = diffDays(p.due_date);
    if (dd < 0) return { s:'overdue', overdue:-dd };
    if (dd === 0) return { s:'today', overdue:0 };
    return { s:'open', overdue:0 };
  }

  const BADGE = {
    paid:    { cls:'badge-paid',    label:()=>'pago' },
    open:    { cls:'badge-open',    label:()=>'em aberto' },
    overdue: { cls:'badge-overdue', label:d=>'atrasado '+d+'d' },
    today:   { cls:'badge-today',   label:()=>'vence hoje' }
  };

  // ==================== CARREGAR ====================
  async function loadPayables() {
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const { data, error } = await sb
      .from('payables')
      .select(`*, suppliers(legal_name, trade_name, cnpj), expense_categories(name, color)`)
      .eq('company_id', COMPANY_ID)
      .order('due_date', { ascending: true })
      .limit(500);
    if (error) { console.error('loadPayables', error); return []; }
    PAYABLES = data;
    return data;
  }

  async function loadSuppliers(force) {
    if (SUPPLIERS_CACHE && !force) return SUPPLIERS_CACHE;
    const { data } = await sb.from('suppliers')
      .select('id, legal_name, trade_name, cnpj')
      .order('legal_name')
      .limit(500);
    SUPPLIERS_CACHE = data || [];
    return SUPPLIERS_CACHE;
  }

  // ==================== FILTRO ====================
  function applyFilter(list) {
    let out = list;
    if (FILTRO === 'open') out = out.filter(p => p.status === 'open');
    if (FILTRO === 'today') out = out.filter(p => statusOf(p).s === 'today');
    if (FILTRO === 'overdue') out = out.filter(p => statusOf(p).s === 'overdue');
    if (FILTRO === 'week') out = out.filter(p => {
      const dd = diffDays(p.due_date);
      return p.status === 'open' && dd >= 0 && dd <= 7;
    });
    if (FILTRO === 'paid') out = out.filter(p => p.status === 'paid');
    if (BUSCA) {
      const q = BUSCA.toLowerCase();
      out = out.filter(p =>
        (p.suppliers?.legal_name||'').toLowerCase().includes(q) ||
        (p.description||'').toLowerCase().includes(q)
      );
    }
    return out;
  }

  // ==================== RENDER ====================
  function render() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    const list = applyFilter(PAYABLES);

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="9" style="padding:60px 20px;text-align:center">
          <i data-lucide="inbox" style="width:32px;height:32px;color:var(--text-muted);opacity:.5"></i>
          <div style="margin-top:12px;font-size:14px;color:var(--text-secondary)">Nenhuma conta encontrada${BUSCA ? ' pra essa busca' : ''}</div>
          <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Clique em <b>Nova conta</b> ou <b>Importar histórico</b></div>
        </td></tr>`;
      lucide.createIcons();
      atualizaKPIs();
      atualizaChips(list.length);
      return;
    }

    tbody.innerHTML = list.map(p => {
      const st = statusOf(p);
      const b = BADGE[st.s];
      const sup = p.suppliers?.legal_name || p.description || 'Sem fornecedor';
      const supShort = sup.length > 36 ? sup.slice(0,33)+'…' : sup;
      const cat = p.expense_categories?.name || '—';
      return `
        <tr data-id="${p.id}" onclick="DMPAY_CP.openDrawer('${p.id}')">
          <td><span class="check" data-row="${p.id}" onclick="event.stopPropagation()"></span></td>
          <td><div class="supplier"><span class="supplier-avatar tone-${tone(sup)}">${iniciais(sup)}</span><span class="supplier-name">${supShort}</span></div></td>
          <td class="mono">${p.invoice_id ? '—' : (p.notes ? p.notes.slice(0,12) : '—')}</td>
          <td class="date">${brDate(p.created_at)}</td>
          <td class="date">${brDate(p.due_date)}</td>
          <td>${cat}</td>
          <td class="money">${fmtBRL(p.amount)}</td>
          <td><span class="badge ${b.cls}">${b.label(st.overdue)}</span></td>
          <td><button class="icon-btn" style="width:26px;height:26px;background:transparent;border:none" onclick="event.stopPropagation()"><i data-lucide="more-horizontal" class="icon" style="width:13px;height:13px"></i></button></td>
        </tr>`;
    }).join('');

    lucide.createIcons();
    atualizaKPIs();
    atualizaChips(list.length);
  }

  // ==================== KPIs / CHIPS ====================
  function atualizaKPIs() {
    const opens = PAYABLES.filter(p => p.status === 'open');
    const totalOpen = opens.reduce((s,p) => s + Number(p.amount), 0);
    const semana = opens.filter(p => { const dd = diffDays(p.due_date); return dd >= 0 && dd <= 7; })
      .reduce((s,p) => s + Number(p.amount), 0);
    const atrasado = opens.filter(p => diffDays(p.due_date) < 0)
      .reduce((s,p) => s + Number(p.amount), 0);
    // Pagos no mes
    const ymThis = isoToday().slice(0,7);
    const pagosMes = PAYABLES
      .filter(p => p.status === 'paid' && p.paid_at && p.paid_at.startsWith(ymThis))
      .reduce((s,p) => s + Number(p.amount), 0);

    const ks = document.querySelectorAll('.kpi-value.num');
    if (ks[0]) ks[0].textContent = fmtBRL(totalOpen);
    if (ks[1]) ks[1].textContent = fmtBRL(semana);
    if (ks[2]) ks[2].textContent = fmtBRL(atrasado);
    if (ks[3]) ks[3].textContent = fmtBRL(pagosMes);

    const metas = document.querySelectorAll('.kpi-card .kpi-meta');
    if (metas[0]) metas[0].innerHTML = `<strong>${opens.length}</strong> boletos em aberto`;
    if (metas[1]) metas[1].innerHTML = `próximos <strong>7</strong> dias`;
    if (metas[2]) metas[2].innerHTML = `<strong>${opens.filter(p => diffDays(p.due_date) < 0).length}</strong> em atraso`;
    if (metas[3]) metas[3].innerHTML = `pagos · este mês`;

    const chip = document.querySelector('.count-chip');
    if (chip) chip.textContent = opens.length + ' em aberto';
    const sub = document.querySelector('.hero .sub');
    if (sub) sub.innerHTML = `${window.DMPAY_COMPANY.trade_name || window.DMPAY_COMPANY.legal_name} · dados do banco · hoje ${brDate(isoToday())}`;
  }

  function atualizaChips(visibleCount) {
    const opens = PAYABLES.filter(p => p.status === 'open').length;
    const today = PAYABLES.filter(p => statusOf(p).s === 'today').length;
    const overdue = PAYABLES.filter(p => statusOf(p).s === 'overdue').length;
    const week = PAYABLES.filter(p => { if (p.status !== 'open') return false; const dd = diffDays(p.due_date); return dd >= 0 && dd <= 7; }).length;
    const paid = PAYABLES.filter(p => p.status === 'paid').length;
    const chips = document.querySelectorAll('.filter-chips .chip');
    const counts = { open: opens, today: today, overdue: overdue, week: week, paid: paid };
    chips.forEach(c => {
      const f = c.dataset.filter;
      if (counts[f] !== undefined) {
        const sp = c.querySelector('span'); if (sp) sp.textContent = `(${counts[f]})`;
      }
      c.classList.toggle('active', f === FILTRO);
    });
    const pag = document.querySelector('.pag-info');
    if (pag) pag.innerHTML = `Mostrando <strong>${visibleCount}</strong> de <strong>${PAYABLES.length}</strong>`;
  }

  // ==================== MODAL NOVA CONTA ====================
  async function openCreate(prefill) {
    const suppliers = await loadSuppliers();
    const supOptions = suppliers.map(s => `<option value="${s.id}">${s.legal_name} ${s.cnpj?'· '+s.cnpj:''}</option>`).join('');
    const html = `
      <div class="dmp-modal-back" onclick="DMPAY_CP.closeCreate()">
        <div class="dmp-modal" onclick="event.stopPropagation()" style="max-width:520px">
          <div class="dmp-modal-head">
            <h3>Nova conta a pagar</h3>
            <button onclick="DMPAY_CP.closeCreate()"><i data-lucide="x"></i></button>
          </div>
          <div class="dmp-modal-body">
            <div class="dmp-field">
              <label>Descrição *</label>
              <input id="cp-desc" placeholder="Ex: NF 1234 IMPACTO, Aluguel abril...">
            </div>
            <div class="dmp-field">
              <label>Fornecedor</label>
              <select id="cp-sup"><option value="">— sem fornecedor —</option>${supOptions}</select>
              <div class="dmp-hint">Não tá na lista? Cadastra depois em Fornecedores.</div>
            </div>
            <div class="dmp-row">
              <div class="dmp-field"><label>Valor *</label><input id="cp-val" type="number" step="0.01" placeholder="0,00"></div>
              <div class="dmp-field"><label>Vencimento *</label><input id="cp-due" type="date" value="${(prefill && prefill.due) || isoToday()}"></div>
            </div>
            <div class="dmp-field">
              <label>Forma de pagamento</label>
              <select id="cp-method">
                <option value="boleto">Boleto bancário</option>
                <option value="pix">PIX</option>
                <option value="ted">TED</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao">Cartão</option>
                <option value="debito_automatico">Débito automático</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div class="dmp-field" id="cp-line-wrap">
              <label>Linha digitável (opcional)</label>
              <input id="cp-line" class="mono" placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000">
              <div class="dmp-hint">44, 47 ou 48 dígitos. Boletos válidos só.</div>
            </div>
          </div>
          <div class="dmp-modal-foot">
            <button class="btn btn-ghost" onclick="DMPAY_CP.closeCreate()">Cancelar</button>
            <button class="btn btn-primary" id="cp-save" onclick="DMPAY_CP.saveNew()"><i data-lucide="check"></i> Criar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    lucide.createIcons();
    setTimeout(() => document.getElementById('cp-desc').focus(), 50);
  }
  function closeCreate() { document.querySelectorAll('.dmp-modal-back').forEach(e => e.remove()); }

  async function saveNew() {
    const desc = document.getElementById('cp-desc').value.trim();
    const sup_id = document.getElementById('cp-sup').value || null;
    const valStr = document.getElementById('cp-val').value;
    const due = document.getElementById('cp-due').value;
    const method = document.getElementById('cp-method').value;
    const line = (document.getElementById('cp-line').value||'').replace(/\D/g,'');
    if (!desc) { alert('Descrição obrigatória'); return; }
    if (!valStr || +valStr <= 0) { alert('Valor obrigatório'); return; }
    if (!due) { alert('Vencimento obrigatório'); return; }
    if (method === 'boleto' && line && ![44,47,48].includes(line.length)) {
      alert('Linha digitável inválida (precisa ter 44, 47 ou 48 dígitos)'); return;
    }
    const btn = document.getElementById('cp-save'); btn.disabled = true;
    try {
      const { error } = await sb.from('payables').insert({
        company_id: window.DMPAY_COMPANY.id,
        supplier_id: sup_id,
        description: desc,
        amount: +valStr,
        due_date: due,
        payment_method: method,
        boleto_line: method === 'boleto' && line ? line : null,
        status: 'open'
      });
      if (error) throw error;
      closeCreate();
      await loadPayables();
      render();
    } catch (e) {
      alert('Erro: ' + e.message);
      btn.disabled = false;
    }
  }

  // ==================== DRAWER (detalhe) ====================
  function openDrawer(id) {
    const p = PAYABLES.find(x => x.id === id); if (!p) return;
    const sup = p.suppliers?.legal_name || p.description;
    const st = statusOf(p);
    const b = BADGE[st.s];
    const drawerNF = document.getElementById('drawerNF');
    if (drawerNF) drawerNF.textContent = p.description ? p.description.slice(0,30) : 'Detalhes';
    const body = document.getElementById('drawerBody');
    body.innerHTML = `
      <div class="drawer-section">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <div class="supplier-avatar tone-${tone(sup)}" style="width:44px;height:44px;font-size:15px;border-radius:10px">${iniciais(sup)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:600">${sup}</div>
            <div style="font-size:12px;color:var(--text-muted)">${p.expense_categories?.name || 'Sem categoria'}</div>
          </div>
          <span class="badge ${b.cls}">${b.label(st.overdue)}</span>
        </div>
        <div style="font-size:36px;font-weight:700;letter-spacing:-.025em" class="num">${fmtBRL(p.amount)}</div>
      </div>

      <div class="drawer-section">
        <h4>Dados</h4>
        <div class="field-row"><span class="k">Vencimento</span><span class="v">${brDate(p.due_date)}</span></div>
        <div class="field-row"><span class="k">Forma</span><span class="v">${p.payment_method || '—'}</span></div>
        <div class="field-row"><span class="k">Criado em</span><span class="v">${brDate(p.created_at)}</span></div>
        ${p.paid_at ? `<div class="field-row"><span class="k">Pago em</span><span class="v">${brDate(p.paid_at)}</span></div>` : ''}
        ${p.boleto_line ? `<div class="field-row"><span class="k">Linha digitável</span><span class="v mono" style="font-size:11px">${p.boleto_line}</span></div>` : ''}
      </div>
    `;
    // Substitui botoes do footer
    const foot = document.querySelector('.drawer-footer');
    if (foot) {
      foot.innerHTML = p.status === 'paid'
        ? `<button class="btn btn-ghost btn-sm" onclick="DMPAY_CP.markOpen('${p.id}')"><i data-lucide="undo-2"></i> Desfazer pagamento</button>
           <button class="btn btn-secondary btn-sm" onclick="DMPAY_CP.removePayable('${p.id}')"><i data-lucide="trash-2"></i> Excluir</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="DMPAY_CP.removePayable('${p.id}')"><i data-lucide="trash-2"></i> Excluir</button>
           <button class="btn btn-primary btn-sm" onclick="DMPAY_CP.markPaid('${p.id}')"><i data-lucide="check-circle-2"></i> Marcar como pago</button>`;
    }
    document.getElementById('drawerOverlay').classList.add('open');
    document.getElementById('drawer').classList.add('open');
    lucide.createIcons();
  }
  function closeDrawer() {
    document.getElementById('drawerOverlay')?.classList.remove('open');
    document.getElementById('drawer')?.classList.remove('open');
  }

  async function markPaid(id) {
    const { error } = await sb.from('payables').update({ status:'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert('Erro: '+error.message); return; }
    closeDrawer();
    await loadPayables(); render();
  }
  async function markOpen(id) {
    const { error } = await sb.from('payables').update({ status:'open', paid_at: null }).eq('id', id);
    if (error) { alert('Erro: '+error.message); return; }
    closeDrawer();
    await loadPayables(); render();
  }
  async function removePayable(id) {
    if (!confirm('Excluir essa conta?')) return;
    const { error } = await sb.from('payables').delete().eq('id', id);
    if (error) { alert('Erro: '+error.message); return; }
    closeDrawer();
    await loadPayables(); render();
  }

  // ==================== INIT ====================
  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }

    // Wire chips
    document.querySelectorAll('.filter-chips .chip').forEach((c, i) => {
      const map = ['open','today','overdue','week','paid'];
      c.dataset.filter = map[i] || 'open';
      c.addEventListener('click', e => { FILTRO = c.dataset.filter; render(); });
    });

    // Wire busca
    const searchInput = document.querySelector('.input-with-icon input');
    if (searchInput) {
      let to;
      searchInput.addEventListener('input', e => {
        clearTimeout(to);
        to = setTimeout(() => { BUSCA = e.target.value; render(); }, 200);
      });
    }

    // Wire botão Novo boleto (procura por hero-actions > btn-primary)
    const novoBtn = document.querySelector('.hero-actions .btn-primary');
    if (novoBtn) {
      novoBtn.onclick = () => openCreate();
      novoBtn.innerHTML = '<i data-lucide="plus" class="icon"></i>Nova conta';
    }

    await loadPayables();
    render();
  }

  // Expoe API
  window.DMPAY_CP = {
    openCreate: openCreate,
    closeCreate: closeCreate,
    saveNew: saveNew,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    markPaid: markPaid,
    markOpen: markOpen,
    removePayable: removePayable,
    importHistory: importHistory,
    refresh: () => loadPayables().then(render)
  };

  // Aguarda guard terminar
  if (window.DMPAY_COMPANY) init();
  else window.addEventListener('dmpay-sb-ready', () => setTimeout(init, 100));
  // Também reage quando profile carrega
  let tries = 0;
  const wait = setInterval(() => {
    if (window.DMPAY_COMPANY || tries++ > 50) { clearInterval(wait); init(); }
  }, 100);
})();

// CSS dos modais (injeta uma vez)
if (!document.getElementById('dmp-modal-css')) {
  const s = document.createElement('style');
  s.id = 'dmp-modal-css';
  s.textContent = `
    .dmp-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px}
    .dmp-modal{background:var(--bg-surface,#fff);border-radius:14px;width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)}
    .dmp-modal-head{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
    .dmp-modal-head h3{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
    .dmp-modal-head button{background:transparent;border:none;cursor:pointer;color:var(--text-muted);padding:6px;border-radius:6px}
    .dmp-modal-head button:hover{background:var(--bg-elevated);color:var(--text-primary)}
    .dmp-modal-head svg{width:18px;height:18px}
    .dmp-modal-body{padding:22px;overflow-y:auto;flex:1}
    .dmp-modal-foot{padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px}
    .dmp-field{margin-bottom:14px}
    .dmp-field label{display:block;font-size:12.5px;font-weight:500;color:var(--text-muted);margin-bottom:6px}
    .dmp-field input,.dmp-field select{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-surface,#fff);color:var(--text-primary,#111);font-family:inherit;font-size:14px;outline:none}
    .dmp-field input:focus,.dmp-field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
    .dmp-field .mono{font-family:'Geist Mono',monospace;letter-spacing:.02em}
    .dmp-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .dmp-hint{font-size:11.5px;color:var(--text-soft,#9CA3AF);margin-top:5px;line-height:1.5}
  `;
  document.head.appendChild(s);
}
