// DM Pay — Contas a Receber (CRUD real Supabase)

(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);
  let RECVS = [];
  let CUSTOMERS_CACHE = null;
  let FILTRO = 'open';
  let BUSCA = '';

  function fmtBRL(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function brDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; }
  function isoToday(){ return new Date().toISOString().split('T')[0]; }
  function diffDays(iso){ if(!iso) return 0; const d = new Date(iso); d.setHours(0,0,0,0); return Math.round((d - HOJE)/86400000); }
  function iniciais(n){ const w = (n||'?').trim().split(/\s+/); return ((w[0]||'')[0]+(w[1]||'')[0]||(w[0]||'??').slice(0,2)).toUpperCase(); }
  function tone(n){ let h=0; const s=n||''; for (let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; const cores=['#DC2626','#D97706','#7C3AED','#2563EB','#EA580C','#0891B2','#10B981','#4B5563']; return cores[Math.abs(h)%cores.length]; }

  function statusOf(r) {
    if (r.status === 'received') return { s:'received', overdue:0 };
    if (r.status === 'cancelled') return { s:'cancelled', overdue:0 };
    const dd = diffDays(r.due_date);
    if (dd < 0) return { s:'overdue', overdue:-dd };
    if (dd === 0) return { s:'today', overdue:0 };
    return { s:'open', overdue:0 };
  }

  const STATUS_LABEL = {
    received: 'Recebido',
    open:     'Em aberto',
    today:    'Vence hoje',
    overdue:  'Atrasado',
    cancelled:'Cancelado'
  };
  const STATUS_COLOR = {
    received: 'success',
    open:     'muted',
    today:    'warn',
    overdue:  'danger',
    cancelled:'muted'
  };

  async function load() {
    // Abertas (open + overdue) sem limite prático + recebidas dos últimos 3 meses
    const inicioJanela = new Date(HOJE); inicioJanela.setMonth(inicioJanela.getMonth() - 3);
    const inicioISO = inicioJanela.toISOString().slice(0,10);
    const COMPANY_ID = window.DMPAY_COMPANY.id;

    const [abertasR, recebidasR] = await Promise.all([
      sb.from('receivables')
        .select(`*, customers(name, cpf_cnpj)`)
        .eq('company_id', COMPANY_ID)
        .in('status', ['open','overdue'])
        .order('due_date', { ascending: true })
        .limit(2000),
      sb.from('receivables')
        .select(`*, customers(name, cpf_cnpj)`)
        .eq('company_id', COMPANY_ID)
        .eq('status', 'received')
        .gte('received_at', inicioISO)
        .order('received_at', { ascending: false })
        .limit(1000)
    ]);
    if (abertasR.error || recebidasR.error) {
      console.error('CR load error', abertasR.error || recebidasR.error);
      return;
    }
    RECVS = [...(abertasR.data||[]), ...(recebidasR.data||[])];
  }

  async function loadCustomers(force) {
    if (CUSTOMERS_CACHE && !force) return CUSTOMERS_CACHE;
    const { data } = await sb.from('customers')
      .select('id, name, cpf_cnpj, phone')
      .eq('company_id', window.DMPAY_COMPANY.id)
      .order('name')
      .limit(500);
    CUSTOMERS_CACHE = data || [];
    return CUSTOMERS_CACHE;
  }

  function applyFilter(list) {
    let out = list;
    // "Em aberto" agrupa open + overdue (vencidas que ainda não pagaram continuam em aberto)
    if (FILTRO === 'open') out = out.filter(r => r.status === 'open' || r.status === 'overdue');
    if (FILTRO === 'overdue') out = out.filter(r => statusOf(r).s === 'overdue');
    if (FILTRO === 'received') out = out.filter(r => r.status === 'received');
    if (FILTRO === 'today') out = out.filter(r => statusOf(r).s === 'today');
    if (BUSCA) {
      const q = BUSCA.toLowerCase();
      out = out.filter(r =>
        (r.customers?.name||'').toLowerCase().includes(q) ||
        (r.description||'').toLowerCase().includes(q)
      );
    }
    return out;
  }

  function render() {
    const tbody = document.getElementById('cr-tbody');
    if (!tbody) return;
    const list = applyFilter(RECVS);

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" style="padding:60px 20px;text-align:center">
          <i data-lucide="hand-coins" style="width:32px;height:32px;color:var(--text-soft);opacity:.5"></i>
          <div style="margin-top:12px;font-size:14px;color:var(--text-muted)">Nenhuma conta a receber${BUSCA?' pra essa busca':''}</div>
          <div style="margin-top:6px;font-size:12px;color:var(--text-soft)">Clique em <b>Nova conta a receber</b> pra cadastrar fiado</div>
        </td></tr>`;
      lucide.createIcons();
      atualizaKPIs(); atualizaChips();
      return;
    }

    tbody.innerHTML = list.map(r => {
      const st = statusOf(r);
      const hasCustomer = !!r.customers?.name;
      const genericDesc = r.description && /^Doc\s+.*parc\s+\d+$/i.test(r.description.trim());
      const cliente = hasCustomer ? r.customers.name : (genericDesc ? 'Cliente não identificado' : (r.description || 'Sem cliente'));
      const meta = hasCustomer
        ? (r.description || (r.origin === 'sale' ? 'Venda fiado' : 'Lançamento manual'))
        : (genericDesc ? `Fiado importado sem cliente · ${r.description}` : (r.origin === 'sale' ? 'Venda fiado' : 'Lançamento manual'));
      const labelDate = st.s === 'overdue' ? `${st.overdue}d atraso` : (st.s === 'today' ? 'Hoje' : '');
      return `
        <tr onclick="DMPAY_CR.openDrawer('${r.id}')" style="cursor:pointer">
          <td>
            <div class="cr-cell">
              <div class="cr-avatar" style="background:${tone(cliente)}${hasCustomer ? '' : ';opacity:.5'}">${hasCustomer ? iniciais(cliente) : '?'}</div>
              <div>
                <div class="cr-name" ${hasCustomer ? '' : 'style="color:var(--text-muted);font-style:italic"'}>${cliente}</div>
                <div class="cr-meta">${meta}</div>
              </div>
            </div>
          </td>
          <td class="num">${fmtBRL(r.amount)}</td>
          <td>
            <div>${brDate(r.due_date)}</div>
            ${labelDate ? `<div class="tiny" style="color:var(--${STATUS_COLOR[st.s] === 'danger' ? 'danger' : 'warn'});font-weight:600">${labelDate}</div>` : ''}
          </td>
          <td>${r.payment_method ? cap(r.payment_method) : '—'}</td>
          <td><span class="badge badge-${STATUS_COLOR[st.s]}">${STATUS_LABEL[st.s]}</span></td>
          <td>${r.received_at ? brDate(r.received_at) : '—'}</td>
          <td><i data-lucide="chevron-right" style="color:var(--text-soft)"></i></td>
        </tr>`;
    }).join('');
    lucide.createIcons();
    atualizaKPIs(); atualizaChips();
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  function atualizaKPIs() {
    const abertas = RECVS.filter(r => r.status === 'open' || r.status === 'overdue');
    const totalOpen = abertas.reduce((s,r)=>s+Number(r.amount), 0);
    const atrasadas = abertas.filter(r => diffDays(r.due_date) < 0);
    const overdue = atrasadas.reduce((s,r)=>s+Number(r.amount), 0);
    const next7 = abertas.filter(r => { const dd = diffDays(r.due_date); return dd >= 0 && dd <= 7; }).reduce((s,r)=>s+Number(r.amount), 0);
    const ymThis = isoToday().slice(0,7);
    const recvMes = RECVS.filter(r => r.status === 'received' && r.received_at && r.received_at.startsWith(ymThis)).reduce((s,r)=>s+Number(r.amount), 0);

    const ks = document.querySelectorAll('.kpi-value');
    if (ks[0]) ks[0].textContent = fmtBRL(totalOpen);
    if (ks[1]) ks[1].textContent = fmtBRL(next7);
    if (ks[2]) ks[2].textContent = fmtBRL(overdue);
    if (ks[3]) ks[3].textContent = fmtBRL(recvMes);

    const subs = document.querySelectorAll('.kpi-sub');
    if (subs[0]) subs[0].innerHTML = `<b>${abertas.length}</b> em aberto`;
    if (subs[1]) subs[1].innerHTML = `próximos <b>7</b> dias`;
    if (subs[2]) subs[2].innerHTML = `<b style="color:var(--danger)">${atrasadas.length}</b> em atraso`;
    if (subs[3]) subs[3].innerHTML = `recebido este mês`;

    const heroSub = document.querySelector('.hero p');
    if (heroSub) heroSub.innerHTML = `${window.DMPAY_COMPANY.trade_name || window.DMPAY_COMPANY.legal_name} · controle de fiado e cartão a receber · hoje ${brDate(isoToday())}`;
  }

  function atualizaChips() {
    const counts = {
      open: RECVS.filter(r => r.status === 'open' || r.status === 'overdue').length,
      today: RECVS.filter(r => statusOf(r).s === 'today').length,
      overdue: RECVS.filter(r => r.status === 'overdue').length,
      received: RECVS.filter(r => r.status === 'received').length
    };
    document.querySelectorAll('.status-chip').forEach(c => {
      const f = c.dataset.filter;
      if (counts[f] !== undefined) {
        const sp = c.querySelector('.cnt');
        if (sp) sp.textContent = counts[f];
      }
      c.classList.toggle('active', f === FILTRO);
    });
  }

  // ============== MODAL CRIAR ==============
  async function openCreate(prefill) {
    const customers = await loadCustomers();
    const opts = customers.map(c => `<option value="${c.id}">${c.name} ${c.cpf_cnpj ? '· '+c.cpf_cnpj : ''}</option>`).join('');
    const html = `
      <div class="dmp-modal-back" onclick="DMPAY_CR.closeCreate()">
        <div class="dmp-modal" onclick="event.stopPropagation()" style="max-width:520px">
          <div class="dmp-modal-head">
            <h3>Nova conta a receber</h3>
            <button onclick="DMPAY_CR.closeCreate()"><i data-lucide="x"></i></button>
          </div>
          <div class="dmp-modal-body">
            <div class="dmp-field">
              <label>Cliente</label>
              <select id="cr-cust">
                <option value="">— sem cliente cadastrado —</option>
                ${opts}
                <option value="__new">+ Cadastrar novo cliente</option>
              </select>
              <div class="dmp-hint">Pode pular e descrever no campo abaixo.</div>
            </div>
            <div id="cr-newcust-wrap" style="display:none">
              <div class="dmp-field">
                <label>Nome do novo cliente *</label>
                <input id="cr-newcust-name" placeholder="Ex: João da Silva">
              </div>
              <div class="dmp-row">
                <div class="dmp-field"><label>CPF/CNPJ</label><input id="cr-newcust-doc" placeholder="opcional"></div>
                <div class="dmp-field"><label>Telefone</label><input id="cr-newcust-phone" placeholder="opcional"></div>
              </div>
            </div>
            <div class="dmp-field">
              <label>Descrição</label>
              <input id="cr-desc" placeholder="Ex: Compra do dia 10/04, Cartão Cielo lote 123">
            </div>
            <div class="dmp-row">
              <div class="dmp-field"><label>Valor *</label><input id="cr-val" type="number" step="0.01" placeholder="0,00"></div>
              <div class="dmp-field"><label>Vencimento *</label><input id="cr-due" type="date" value="${(prefill && prefill.due) || isoToday()}"></div>
            </div>
            <div class="dmp-row">
              <div class="dmp-field">
                <label>Forma esperada</label>
                <select id="cr-method">
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="cartao">Cartão</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div class="dmp-field">
                <label>Origem</label>
                <select id="cr-origin">
                  <option value="manual">Lançamento manual</option>
                  <option value="sale">Venda no caixa (fiado)</option>
                  <option value="card_settlement">Cartão a liquidar</option>
                </select>
              </div>
            </div>
          </div>
          <div class="dmp-modal-foot">
            <button class="btn btn-ghost" onclick="DMPAY_CR.closeCreate()">Cancelar</button>
            <button class="btn btn-primary" id="cr-save" onclick="DMPAY_CR.saveNew()"><i data-lucide="check"></i> Criar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('cr-cust').addEventListener('change', e => {
      document.getElementById('cr-newcust-wrap').style.display = e.target.value === '__new' ? 'block' : 'none';
    });
    lucide.createIcons();
    setTimeout(() => document.getElementById('cr-desc').focus(), 50);
  }
  function closeCreate(){ document.querySelectorAll('.dmp-modal-back').forEach(e=>e.remove()); }

  async function saveNew() {
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    let cust_id = document.getElementById('cr-cust').value;
    const desc = document.getElementById('cr-desc').value.trim();
    const valStr = document.getElementById('cr-val').value;
    const due = document.getElementById('cr-due').value;
    const method = document.getElementById('cr-method').value;
    const origin = document.getElementById('cr-origin').value;
    if (!valStr || +valStr <= 0) { alert('Valor obrigatório'); return; }
    if (!due) { alert('Vencimento obrigatório'); return; }

    const btn = document.getElementById('cr-save'); btn.disabled = true;
    try {
      // Cria cliente novo se preciso
      if (cust_id === '__new') {
        const nm = document.getElementById('cr-newcust-name').value.trim();
        if (!nm) { alert('Nome do cliente obrigatório'); btn.disabled=false; return; }
        const ins = await sb.from('customers').insert({
          company_id: COMPANY_ID,
          name: nm,
          cpf_cnpj: document.getElementById('cr-newcust-doc').value.trim() || null,
          phone: document.getElementById('cr-newcust-phone').value.trim() || null
        }).select().single();
        if (ins.error) throw ins.error;
        cust_id = ins.data.id;
        CUSTOMERS_CACHE = null; // força recarregar
      }
      if (cust_id === '') cust_id = null;

      const { error } = await sb.from('receivables').insert({
        company_id: COMPANY_ID,
        customer_id: cust_id,
        description: desc || null,
        amount: +valStr,
        due_date: due,
        payment_method: method,
        origin: origin,
        status: 'open'
      });
      if (error) throw error;
      closeCreate();
      await load(); render();
    } catch (e) {
      alert('Erro: ' + e.message);
      btn.disabled = false;
    }
  }

  // ============== DRAWER ==============
  function openDrawer(id) {
    const r = RECVS.find(x => x.id === id); if (!r) return;
    const cliente = r.customers?.name || r.description || 'Sem cliente';
    const st = statusOf(r);
    const html = `
      <div class="dmp-modal-back" onclick="DMPAY_CR.closeDrawer()">
        <div class="dmp-modal" onclick="event.stopPropagation()" style="max-width:480px">
          <div class="dmp-modal-head">
            <h3>Detalhe da conta a receber</h3>
            <button onclick="DMPAY_CR.closeDrawer()"><i data-lucide="x"></i></button>
          </div>
          <div class="dmp-modal-body">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
              <div class="cr-avatar" style="background:${tone(cliente)};width:46px;height:46px;font-size:16px">${iniciais(cliente)}</div>
              <div style="flex:1">
                <div style="font-weight:600;font-size:15px">${cliente}</div>
                ${r.customers?.cpf_cnpj ? `<div style="color:var(--text-muted);font-size:12px;font-family:monospace">${r.customers.cpf_cnpj}</div>` : ''}
              </div>
              <span class="badge badge-${STATUS_COLOR[st.s]}">${STATUS_LABEL[st.s]}</span>
            </div>
            <div style="font-size:32px;font-weight:700;letter-spacing:-.02em;margin-bottom:18px;font-family:'Geist Mono',monospace">${fmtBRL(r.amount)}</div>
            <div class="dmp-field-row"><span>Vencimento</span><b>${brDate(r.due_date)}</b></div>
            <div class="dmp-field-row"><span>Forma esperada</span><b>${r.payment_method ? cap(r.payment_method) : '—'}</b></div>
            <div class="dmp-field-row"><span>Origem</span><b>${{manual:'Manual',sale:'Venda fiado',card_settlement:'Cartão a liquidar'}[r.origin] || '—'}</b></div>
            ${r.received_at ? `<div class="dmp-field-row"><span>Recebido em</span><b>${brDate(r.received_at)}</b></div>` : ''}
            ${r.description ? `<div class="dmp-field-row"><span>Descrição</span><b>${r.description}</b></div>` : ''}
          </div>
          <div class="dmp-modal-foot" style="justify-content:space-between">
            <button class="btn btn-danger" onclick="DMPAY_CR.remove('${r.id}')"><i data-lucide="trash-2"></i> Excluir</button>
            ${r.status === 'received'
              ? `<button class="btn btn-ghost" onclick="DMPAY_CR.markOpen('${r.id}')"><i data-lucide="undo-2"></i> Desfazer recebimento</button>`
              : `<button class="btn btn-primary" onclick="DMPAY_CR.markReceived('${r.id}')"><i data-lucide="check-circle-2"></i> Marcar como recebido</button>`}
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    lucide.createIcons();
  }
  function closeDrawer(){ closeCreate(); }

  async function markReceived(id) {
    const { error } = await sb.from('receivables').update({ status:'received', received_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert(error.message); return; }
    closeDrawer(); await load(); render();
  }
  async function markOpen(id) {
    const { error } = await sb.from('receivables').update({ status:'open', received_at: null }).eq('id', id);
    if (error) { alert(error.message); return; }
    closeDrawer(); await load(); render();
  }
  async function remove(id) {
    if (!confirm('Excluir essa conta a receber?')) return;
    const { error } = await sb.from('receivables').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    closeDrawer(); await load(); render();
  }

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }

    document.querySelectorAll('.status-chip').forEach(c => {
      c.addEventListener('click', () => { FILTRO = c.dataset.filter; render(); });
    });
    const search = document.querySelector('.search input');
    if (search) {
      let to;
      search.addEventListener('input', e => {
        clearTimeout(to);
        to = setTimeout(() => { BUSCA = e.target.value; render(); }, 200);
      });
    }
    const btnNovo = document.getElementById('btn-novo');
    if (btnNovo) btnNovo.onclick = () => openCreate();

    await load(); render();
  }

  window.DMPAY_CR = {
    openCreate: openCreate,
    closeCreate: closeCreate,
    saveNew: saveNew,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    markReceived: markReceived,
    markOpen: markOpen,
    remove: remove
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
