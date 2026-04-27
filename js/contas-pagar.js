// DM Pay — Contas a Pagar (CRUD real Supabase)
// Substitui o mock estatico do contas-a-pagar.html.
// Depende de: window.sb (Supabase client), window.DMPAY_PROFILE, window.DMPAY_COMPANY

(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);
  let PAYABLES = [];
  let FILTRO = 'open';   // open | today | overdue | week | paid
  let BUSCA = '';
  let SUPPLIERS_CACHE = null;
  let CATEGORIES_CACHE = {}; // id -> {name, color}

  // ==================== UTILS ====================
  function isoToday(){ return new Date().toISOString().split('T')[0]; }
  function diffDays(iso) {
    if (!iso) return 0;
    const [y,m,d] = String(iso).slice(0,10).split('-').map(Number);
    return Math.round((new Date(y, m-1, d) - HOJE) / 86400000);
  }
  function iniciais(nome){
    const w = (nome||'?').replace(/[^\wÀ-ÿ ]/g,'').trim().split(/\s+/);
    return ((w[0]||'')[0] + (w[1]||'')[0] || (w[0]||'??').slice(0,2)).toUpperCase();
  }
  const _toneCache = {};
  function tone(nome){
    if (_toneCache[nome] !== undefined) return _toneCache[nome];
    let h = 0; const s = nome||'';
    for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) | 0;
    return (_toneCache[nome] = (Math.abs(h) % 5) + 1);
  }
  function statusOf(p) {
    if (p.status === 'paid') return { s:'paid', overdue:0 };
    // Regra: sáb/dom estende pro próximo dia útil. Só vira "overdue" depois do dia útil efetivo.
    const atrasado = window.DMPAY_DIAUTIL ? window.DMPAY_DIAUTIL.atrasado(p.due_date) : diffDays(p.due_date) < 0;
    if (atrasado) {
      const efetivo = window.DMPAY_DIAUTIL ? window.DMPAY_DIAUTIL.proximo(p.due_date) : new Date(p.due_date);
      const dias = Math.round((new Date(new Date().setHours(0,0,0,0)) - efetivo) / 86400000);
      return { s:'overdue', overdue: Math.max(dias, 1) };
    }
    const dd = diffDays(p.due_date);
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
    // Query simples (sem embed de expense_categories — join ambíguo podia travar).
    // Pegamos abertas + pagas dos últimos 3 meses pra KPI "pago no mês" bater.
    const janela = new Date(HOJE); janela.setMonth(janela.getMonth() - 3);
    const janelaISO = janela.toISOString().slice(0,10);
    const [abertasR, pagasR] = await Promise.all([
      sb.from('payables')
        .select('*, tipo_lancamento, suppliers(legal_name, trade_name, cnpj), invoices(nf_number, series)')
        .eq('company_id', COMPANY_ID)
        .in('status', ['open'])
        .order('due_date', { ascending: true })
        .limit(2000),
      sb.from('payables')
        .select('*, tipo_lancamento, suppliers(legal_name, trade_name, cnpj), invoices(nf_number, series)')
        .eq('company_id', COMPANY_ID)
        .eq('status', 'paid')
        .gte('paid_at', janelaISO)
        .order('paid_at', { ascending: false })
        .limit(1000)
    ]);
    if (abertasR.error || pagasR.error) {
      const err = abertasR.error || pagasR.error;
      console.error('loadPayables', err);
      showLoadError(err.message || 'Erro ao carregar');
      return [];
    }
    warnIfTruncated(abertasR.data, 2000, 'payables open');
    warnIfTruncated(pagasR.data,   1000, 'payables paid');
    PAYABLES = [...(abertasR.data || []), ...(pagasR.data || [])];
    // Carrega categorias à parte e injeta nos payables
    try {
      const cats = await sb.from('expense_categories')
        .select('id, name, color')
        .eq('company_id', COMPANY_ID);
      CATEGORIES_CACHE = {};
      (cats.data || []).forEach(c => CATEGORIES_CACHE[c.id] = c);
      PAYABLES.forEach(p => { p.expense_categories = p.category_id ? CATEGORIES_CACHE[p.category_id] : null; });
    } catch (e) {
      console.warn('categorias não carregaram, seguindo sem', e);
    }
    return PAYABLES;
  }

  function showLoadError(msg) {
    const tbody = document.getElementById('tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="padding:60px 20px;text-align:center;color:var(--danger)">
        <i data-lucide="alert-triangle" style="width:32px;height:32px"></i>
        <div style="margin-top:12px;font-size:14px"><b>Falha ao carregar contas a pagar</b></div>
        <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">${msg}</div>
        <div style="margin-top:12px;font-size:11.5px;color:var(--text-soft)">Atualize a página ou contate o admin.</div>
      </td></tr>`;
      if (window.lucide) lucide.createIcons();
    }
  }

  async function loadSuppliers(force) {
    if (SUPPLIERS_CACHE && !force) return SUPPLIERS_CACHE;
    const { data } = await sb.from('suppliers')
      .select('id, legal_name, trade_name, cnpj')
      .eq('company_id', window.DMPAY_COMPANY?.id)
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
      window.lucide && lucide.createIcons();
      atualizaKPIs();
      atualizaChips(list.length);
      return;
    }

    tbody.innerHTML = list.map(p => {
      const st = statusOf(p);
      const b = BADGE[st.s];
      const _descSup = p.description?.replace(/^NF\s+\S+\s*/i, '') || '';
      const sup = p.suppliers?.legal_name || _descSup || 'Sem fornecedor';
      const supShort = sup.length > 36 ? sup.slice(0,33)+'…' : sup;
      const cat = p.expense_categories?.name || '—';
      return `
        <tr data-id="${p.id}" onclick="DMPAY_CP.openDrawer('${p.id}')">
          <td><span class="check" role="checkbox" aria-checked="false" tabindex="0" data-row="${p.id}" onclick="event.stopPropagation()"></span></td>
          <td><div class="supplier"><span class="supplier-avatar tone-${tone(sup)}">${iniciais(sup)}</span><span class="supplier-name">${supShort}</span></div></td>
          <td><span class="nf-badge">${p.invoices?.nf_number || (p.description?.match(/^NF\s+(\S+)/i)?.[1]) || '—'}</span></td>
          <td class="date">${brDate(p.invoices?.issue_date || p.created_at)}</td>
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
    const supOptions = suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.legal_name)} ${s.cnpj?'· '+esc(s.cnpj):''}</option>`).join('');
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
              <label>Tipo de lançamento *</label>
              <select id="cp-tipo">
                <option value="">— selecione —</option>
                <option value="compra">Compra (mercadoria / NF)</option>
                <option value="despesa">Despesa (luz, FGTS, aluguel…)</option>
              </select>
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
              <label>Linha digitável *</label>
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
    const methodSel = document.getElementById('cp-method');
    const lineWrap  = document.getElementById('cp-line-wrap');
    const toggleLine = () => {
      const isBoleto = methodSel.value === 'boleto';
      lineWrap.style.display = isBoleto ? '' : 'none';
      if (!isBoleto) document.getElementById('cp-line').value = '';
    };
    methodSel.addEventListener('change', toggleLine);
    setTimeout(() => document.getElementById('cp-desc').focus(), 50);
  }
  function closeCreate() { document.querySelectorAll('.dmp-modal-back').forEach(e => e.remove()); }

  async function saveNew() {
    const desc = document.getElementById('cp-desc').value.trim();
    const sup_id = document.getElementById('cp-sup').value || null;
    const valStr = document.getElementById('cp-val').value;
    const due = document.getElementById('cp-due').value;
    const method = document.getElementById('cp-method').value;
    const tipo = document.getElementById('cp-tipo').value;
    const line = (document.getElementById('cp-line').value||'').replace(/\D/g,'');
    const _ui = window.DMPAY_UI;
    if (!desc) { await _ui.alert({ title: 'Descrição obrigatória' }); return; }
    if (!tipo) { await _ui.alert({ title: 'Tipo de lançamento obrigatório', desc: 'Selecione Compra ou Despesa.' }); return; }
    if (!valStr || +valStr <= 0) { await _ui.alert({ title: 'Valor obrigatório' }); return; }
    if (!due) { await _ui.alert({ title: 'Vencimento obrigatório' }); return; }
    if (method === 'boleto' && line && ![44,47,48].includes(line.length)) {
      await _ui.alert({ title: 'Linha digitável inválida', desc: 'Precisa ter 44, 47 ou 48 dígitos.' }); return;
    }
    const btn = document.getElementById('cp-save'); btn.disabled = true;
    if (method === 'boleto' && !line) {
      await _ui.alert({ title: 'Boleto exige linha digitável', desc: 'Cole o código de 44/47/48 dígitos, ou mude a forma de pagamento.' });
      btn.disabled = false; return;
    }
    try {
      const payload = {
        company_id: window.DMPAY_COMPANY.id,
        supplier_id: sup_id,
        description: desc,
        amount: +valStr,
        due_date: due,
        payment_method: method,
        boleto_line: method === 'boleto' && line ? line : null,
        tipo_lancamento: tipo,
        status: 'open'
      };
      const { data, error } = await sb.from('payables').insert(payload).select('id').single();
      if (error) throw error;
      if (window.DMPAY_AUDIT && data?.id) window.DMPAY_AUDIT.create('payable', data.id, payload);
      closeCreate();
      await loadPayables();
      render();
    } catch (e) {
      const code = e.code || e.details;
      let msg = e.message;
      if (code === '23514' || (msg && msg.includes('check constraint'))) {
        msg = (msg && msg.includes('boleto'))
          ? 'Linha digitável do boleto inválida ou ausente.'
          : 'Dado inválido — verifique os campos preenchidos.';
      } else if (code === '23505') {
        msg = 'Registro duplicado.';
      }
      await DMPAY_UI.alert({ title: 'Erro ao criar', desc: msg, danger: true });
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
           <button class="btn btn-secondary btn-sm" onclick="DMPAY_CP.editPayable('${p.id}')"><i data-lucide="pencil"></i> Editar</button>
           <button class="btn btn-primary btn-sm" onclick="DMPAY_CP.markPaid('${p.id}')"><i data-lucide="check-circle-2"></i> Marcar como pago</button>`;
    }
    document.getElementById('drawerOverlay').classList.add('open');
    const _drawerEl = document.getElementById('drawer');
    _drawerEl.classList.add('open');
    lucide.createIcons();
    // Focus trap
    const _prevFocus = document.activeElement;
    setTimeout(function() {
      const first = _drawerEl.querySelector('button:not([disabled]),[tabindex="0"]');
      if (first) first.focus();
    }, 60);
    function _trapFn(e) {
      if (e.key !== 'Tab') return;
      const foc = Array.from(_drawerEl.querySelectorAll('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])'));
      if (!foc.length) return;
      const first = foc[0], last = foc[foc.length-1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault(); (e.shiftKey ? last : first).focus();
      }
    }
    _drawerEl.addEventListener('keydown', _trapFn);
    _drawerEl._trap = { fn: _trapFn, prev: _prevFocus };
  }
  function closeDrawer() {
    document.getElementById('drawerOverlay')?.classList.remove('open');
    const drawer = document.getElementById('drawer');
    drawer?.classList.remove('open');
    if (drawer?._trap) {
      drawer.removeEventListener('keydown', drawer._trap.fn);
      if (drawer._trap.prev) drawer._trap.prev.focus();
      delete drawer._trap;
    }
  }

  async function markPaid(id) {
    const before = PAYABLES.find(x => x.id === id) || null;
    const paid_at = new Date().toISOString();
    const { error } = await sb.from('payables').update({ status:'paid', paid_at }).eq('id', id);
    if (error) { await DMPAY_UI.alert({ title: 'Erro', desc: error.message, danger: true }); return; }
    if (window.DMPAY_AUDIT) window.DMPAY_AUDIT.pay('payable', id,
      before ? { status: before.status, paid_at: before.paid_at } : null,
      { status: 'paid', paid_at });
    closeDrawer();
    await loadPayables(); render();
  }
  async function markOpen(id) {
    const before = PAYABLES.find(x => x.id === id) || null;
    const { error } = await sb.from('payables').update({ status:'open', paid_at: null }).eq('id', id);
    if (error) { await DMPAY_UI.alert({ title: 'Erro', desc: error.message, danger: true }); return; }
    if (window.DMPAY_AUDIT) window.DMPAY_AUDIT.estorno('payable', id,
      before ? { status: before.status, paid_at: before.paid_at } : null,
      { status: 'open', paid_at: null });
    closeDrawer();
    await loadPayables(); render();
  }
  async function removePayable(id) {
    const ok = await DMPAY_UI.confirm({ title: 'Excluir essa conta?', danger: true, okLabel: 'Excluir', cancelLabel: 'Cancelar' });
    if (!ok) return;
    const before = PAYABLES.find(x => x.id === id) || null;
    const { error } = await sb.from('payables').delete().eq('id', id);
    if (error) { await DMPAY_UI.alert({ title: 'Erro ao excluir', desc: error.message, danger: true }); return; }
    if (window.DMPAY_AUDIT) window.DMPAY_AUDIT.delete('payable', id, before);
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

  async function editPayable(id) {
    const p = PAYABLES.find(x => x.id === id);
    if (!p) return;
    if (!window.DMPAY_UI) { alert('UI não carregada'); return; }

    const amountBefore   = p.amount;
    const dueBefore      = (p.due_date || '').split('T')[0];
    const methodBefore   = p.payment_method || 'outro';
    const boletoBefore   = p.boleto_line || '';
    const notesBefore    = p.notes || '';
    const tipoBefore     = p.tipo_lancamento || '';

    const vals = await window.DMPAY_UI.open({
      title: 'Editar lançamento',
      desc: 'Altere vencimento, valor, tipo ou forma de pagamento.',
      fields: [
        { key: 'tipo', label: 'Tipo de lançamento *', options: [
            { value: 'compra',  label: 'Compra (mercadoria / NF)' },
            { value: 'despesa', label: 'Despesa (luz, FGTS, aluguel…)' }
          ], value: tipoBefore },
        { key: 'amount',     label: 'Valor (R$) *',          type: 'number',  value: Number(amountBefore).toFixed(2) },
        { key: 'due_date',   label: 'Vencimento *',           type: 'date',    value: dueBefore },
        { key: 'method',     label: 'Forma de pagamento',     options: [
            { value: 'boleto',   label: 'Boleto' },
            { value: 'pix',      label: 'PIX' },
            { value: 'dinheiro', label: 'À vista / Dinheiro' },
            { value: 'outro',    label: 'Outro' }
          ], value: methodBefore },
        { key: 'boleto_line', label: 'Linha digitável do boleto', multiline: true, value: boletoBefore,
          placeholder: '23793.38128 00000.000000 00000.000000 1 99990000000000',
          hint: '44, 47 ou 48 dígitos. Deixe em branco se não for boleto.' },
        { key: 'notes', label: 'Observação / motivo', multiline: true, value: notesBefore }
      ],
      submitLabel: 'Salvar',
      cancelLabel: 'Cancelar',
      onSubmit: (v) => {
        const n = Number(String(v.amount).replace(',', '.'));
        if (!v.tipo) throw new Error('Tipo de lançamento é obrigatório.');
        if (!isFinite(n) || n <= 0) throw new Error('Valor precisa ser maior que zero.');
        if (!v.due_date) throw new Error('Vencimento é obrigatório.');
        const raw = (v.boleto_line || '').replace(/\D/g, '');
        if (raw && ![44, 47, 48].includes(raw.length)) throw new Error(`Linha digitável com ${raw.length} dígitos (precisa ter 44, 47 ou 48).`);
        if (Math.abs(n - amountBefore) > 0.001 && !(v.notes || '').trim()) throw new Error('Valor alterado — preencha a observação com o motivo.');
        return true;
      }
    });

    if (!vals) return;

    const amount         = Number(String(vals.amount).replace(',', '.'));
    const due_date       = vals.due_date;
    const tipo_lancamento = vals.tipo || null;
    const payment_method = vals.method || null;
    const boleto_line    = payment_method === 'boleto' ? ((vals.boleto_line || '').replace(/\s/g, '') || null) : null;
    const notes          = (vals.notes || '').trim() || null;

    const { error } = await sb.from('payables').update({ amount, due_date, payment_method, boleto_line, notes, tipo_lancamento }).eq('id', id);
    if (error) { await DMPAY_UI.alert({ title: 'Erro ao salvar', desc: error.message, danger: true }); return; }

    if (window.DMPAY_AUDIT) {
      window.DMPAY_AUDIT.update('payable', id,
        { amount: amountBefore, due_date: dueBefore, payment_method: methodBefore, boleto_line: boletoBefore, notes: notesBefore },
        { amount, due_date, payment_method, boleto_line, notes }
      );
    }

    Object.assign(p, { amount, due_date, payment_method, boleto_line, notes });
    closeDrawer();
    await loadPayables(); render();
  }

  // Expoe API
  window.DMPAY_CP = {
    getPayables: () => PAYABLES,
    openCreate: openCreate,
    closeCreate: closeCreate,
    saveNew: saveNew,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    markPaid: markPaid,
    markOpen: markOpen,
    removePayable: removePayable,
    editPayable: editPayable,
    refresh: () => loadPayables().then(render)
  };
  // Alias global pra ESC e overlay onclick do HTML
  window.closeDrawer = closeDrawer;

  // Aguarda guard terminar — guard único evita dupla execução
  let _initDone = false;
  function _tryInit() {
    if (_initDone || !window.DMPAY_COMPANY) return;
    _initDone = true;
    init();
  }
  window.addEventListener('dmpay-sb-ready', _tryInit);
  let _tries = 0;
  const _wait = setInterval(() => {
    _tryInit();
    if (_initDone || _tries++ > 50) clearInterval(_wait);
  }, 100);
})();

