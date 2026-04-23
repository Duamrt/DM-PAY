// DM Pay — Dashboard real (saldo + a pagar + a receber + lucro snapshot)
(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);

  // fmtBRL = KPI agregado (sem centavos). fmtBRLfull = valor individual (sempre 2 casas)
  function fmtBRL(v){ return 'R$ ' + Math.round(Number(v||0)).toLocaleString('pt-BR'); }
  function fmtBRLfull(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function brDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; }
  function diffDays(iso){ if(!iso) return 0; const [y,m,d]=String(iso).slice(0,10).split('-').map(Number); return Math.round((new Date(y,m-1,d)-HOJE)/86400000); }
  // Regra fim de semana: boleto só vira "atrasado" depois do próximo dia útil
  function isOverdue(iso){ return window.DMPAY_DIAUTIL ? window.DMPAY_DIAUTIL.atrasado(iso) : diffDays(iso) < 0; }
  function diasAtraso(iso){
    if (!window.DMPAY_DIAUTIL) return Math.max(-diffDays(iso), 0);
    const efetivo = window.DMPAY_DIAUTIL.proximo(iso);
    return Math.max(Math.round((HOJE - efetivo) / 86400000), 0);
  }
  function ymThis(){ return HOJE.toISOString().slice(0,7); }

  async function init() {
    if (!window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    const profile = window.DMPAY_PROFILE;
    const company = window.DMPAY_COMPANY;
    const isPlatformAdmin = company.id === window.DMPAY_CONFIG.PLATFORM_COMPANY_ID;
    const firstName = (profile.name || profile.email || '').split(' ')[0];
    const empresaNome = company.trade_name || company.legal_name || 'sua empresa';

    // === HERO ===
    const h = new Date().getHours();
    const sauda = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
    const h1 = document.querySelector('.hero h1');
    if (h1) h1.textContent = `${sauda}, ${firstName}`;

    const heroP = document.querySelector('.hero p');
    if (heroP) {
      const dia = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
      const planoTxt = isPlatformAdmin ? '🛡 visão global · todos os tenants' : (company.plan === 'trial' ? `trial até ${new Date(company.trial_until).toLocaleDateString('pt-BR')}` : 'plano ' + company.plan);
      heroP.innerHTML = `<span class="dot-success"></span> <b>${dia}</b> · <b>${esc(empresaNome)}</b> · ${esc(planoTxt)}`;
    }

    // === DADOS DO BANCO ===
    const COMPANY_ID = company.id;
    const fim7 = new Date(HOJE); fim7.setDate(fim7.getDate() + 7);
    const fim30 = new Date(HOJE); fim30.setDate(fim30.getDate() + 30);

    const inicio30 = new Date(HOJE); inicio30.setDate(inicio30.getDate() - 30);
    const inicio30iso = inicio30.toISOString().slice(0,10);

    // Platform admin sem view-as: sem filtro (vê todos os tenants)
    // Com view-as ativo: DMPAY_COMPANY já foi sobrescrito pro tenant — isPlatformAdmin=false, filtra normalmente
    function qPay(q){ return isPlatformAdmin ? q : q.eq('company_id', COMPANY_ID); }

    // Receivables: apenas open/overdue (received não é usado no dashboard),
    // com lookback de 2 anos pra capturar inadimplência antiga sem trazer tudo
    const inicio2y = new Date(HOJE); inicio2y.setFullYear(inicio2y.getFullYear() - 2);
    const inicio2yISO = inicio2y.toISOString().slice(0, 10);

    const [pagsR, recsR, salesR, sangR] = await Promise.all([
      qPay(sb.from('payables').select('id, amount, due_date, paid_at, status, description, suppliers(legal_name)')).limit(2000),
      qPay(sb.from('receivables').select('id, amount, due_date, status')
        .in('status', ['open', 'overdue'])
        .gte('due_date', inicio2yISO)
      ).limit(5000),
      qPay(sb.from('daily_sales').select('sale_date, payment_method, amount').gte('sale_date', inicio30iso)).limit(2000),
      qPay(sb.from('cash_withdrawals').select('withdrawal_date, amount').gte('withdrawal_date', inicio30iso)).limit(500)
    ]);
    const PAGS = pagsR.data || [];
    const RECS = recsR.data || [];
    const SALES = salesR.data || [];
    const SANG = sangR.data || [];

    // Se não tem dados, mostra banner (mantém os mocks visuais como teaser)
    if (PAGS.length === 0 && RECS.length === 0 && SALES.length === 0 && !document.getElementById('demo-banner')) {
      const main = document.querySelector('main');
      if (main) {
        const banner = document.createElement('div');
        banner.id = 'demo-banner';
        banner.style.cssText = 'background:linear-gradient(135deg,#FEF3C7,transparent);border:1px solid #D97706;border-left:4px solid #D97706;border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;gap:12px;align-items:flex-start;font-size:13px;color:#111';
        banner.innerHTML = `
          <i data-lucide="info" style="width:18px;height:18px;color:#D97706;flex-shrink:0;margin-top:2px"></i>
          <div style="flex:1">
            <b style="display:block;margin-bottom:2px">Você está vendo dados de demonstração</b>
            <span style="color:#6B7280">Os números abaixo são exemplos. Pra ver seus dados reais, vá em
              <a href="contas-a-pagar.html" style="color:#2563EB;font-weight:600;text-decoration:none">Contas a Pagar</a>
              e clique em <b>Importar histórico</b>.</span>
          </div>
          <button onclick="document.getElementById('demo-banner').remove()" style="background:transparent;border:none;color:#6B7280;cursor:pointer;padding:4px"><i data-lucide="x" style="width:14px;height:14px"></i></button>`;
        main.insertBefore(banner, main.firstChild);
        lucide.createIcons();
      }
      return; // mantém mocks
    }

    // === KPIs REAIS ===
    // Saldo: salvo manual no localStorage (mesma chave do fluxo)
    const saldoStr = localStorage.getItem('dmpay-saldo-' + COMPANY_ID);
    const saldoInicial = saldoStr ? parseFloat(saldoStr) : 0;

    const opens = PAGS.filter(p => p.status === 'open');
    const totalOpen = opens.reduce((s,p) => s + Number(p.amount), 0);
    const a_pagar_7d = opens.filter(p => { const dd = diffDays(p.due_date); return dd >= 0 && dd <= 7; }).reduce((s,p) => s + Number(p.amount), 0);
    const a_pagar_hoje = opens.filter(p => diffDays(p.due_date) === 0).reduce((s,p) => s + Number(p.amount), 0);
    const atrasado = opens.filter(p => isOverdue(p.due_date)).reduce((s,p) => s + Number(p.amount), 0);

    // Em aberto = open + overdue (atrasadas continuam pendentes de cobrança)
    const recsOpen = RECS.filter(r => r.status === 'open' || r.status === 'overdue');
    const totalReceber = recsOpen.reduce((s,r) => s + Number(r.amount), 0);
    const receber_7d = recsOpen.filter(r => { const dd = diffDays(r.due_date); return dd >= 0 && dd <= 7; }).reduce((s,r) => s + Number(r.amount), 0);

    // Saldo projetado 30d = saldo + receitas previstas 30d - saídas previstas 30d
    const recv30d = recsOpen.filter(r => diffDays(r.due_date) >= 0 && diffDays(r.due_date) <= 30).reduce((s,r)=>s+Number(r.amount), 0);
    const pag30d = opens.filter(p => diffDays(p.due_date) >= 0 && diffDays(p.due_date) <= 30).reduce((s,p)=>s+Number(p.amount), 0);
    const saldoProjetado = saldoInicial + recv30d - pag30d;

    // === VENDAS REAIS (daily_sales agregado) ===
    const ontem = new Date(HOJE); ontem.setDate(ontem.getDate() - 1);
    const ontemIso = ontem.toISOString().slice(0,10);
    const inicioSemana = new Date(HOJE); inicioSemana.setDate(inicioSemana.getDate() - 7);
    const inicioSemanaIso = inicioSemana.toISOString().slice(0,10);
    const inicioMes = new Date(HOJE.getFullYear(), HOJE.getMonth(), 1).toISOString().slice(0,10);

    const vendeuOntem = SALES.filter(s => s.sale_date === ontemIso).reduce((s,v) => s + Number(v.amount), 0);
    const vendeuSemana = SALES.filter(s => s.sale_date >= inicioSemanaIso).reduce((s,v) => s + Number(v.amount), 0);
    const vendeuMes = SALES.filter(s => s.sale_date >= inicioMes).reduce((s,v) => s + Number(v.amount), 0);

    // Forma top de ontem (pra delta)
    const formasOntem = {};
    SALES.filter(s => s.sale_date === ontemIso).forEach(s => {
      formasOntem[s.payment_method] = (formasOntem[s.payment_method] || 0) + Number(s.amount);
    });
    const formaTop = Object.entries(formasOntem).sort((a,b) => b[1] - a[1])[0];

    // KPI 1: Saldo (manual)
    // KPI 2: Vendeu ontem (real, do iCommerce)
    // KPI 3: A pagar 7d
    // KPI 4: Saldo projetado 30d
    const ks = document.querySelectorAll('.kpi-value');
    if (ks[0]) ks[0].textContent = fmtBRL(saldoInicial);
    if (ks[1]) ks[1].textContent = fmtBRL(vendeuOntem);
    if (ks[2]) ks[2].textContent = fmtBRL(a_pagar_7d);
    if (ks[3]) ks[3].textContent = fmtBRL(saldoProjetado);

    const labels = document.querySelectorAll('.kpi-label');
    if (labels[1]) labels[1].textContent = 'Vendeu ontem';

    const deltas = document.querySelectorAll('.kpi-delta');
    if (deltas[0]) deltas[0].innerHTML = `<a href="#" onclick="DMPAY_DASH.editSaldo();return false" style="color:var(--accent);font-size:11.5px;text-decoration:none">editar saldo inicial</a>`;
    if (deltas[1]) {
      if (formaTop) {
        deltas[1].innerHTML = `<b>${esc(formaTop[0])}</b> liderou (${fmtBRL(formaTop[1])}) · semana <b>${fmtBRL(vendeuSemana)}</b>`;
      } else {
        deltas[1].innerHTML = `sem vendas ontem · semana <b>${fmtBRL(vendeuSemana)}</b>`;
      }
    }
    if (deltas[2]) deltas[2].innerHTML = a_pagar_hoje > 0 ? `<span class="down">▼ ${fmtBRL(a_pagar_hoje)} hoje</span> · ${opens.length} boletos` : `${opens.length} boletos em aberto`;
    if (deltas[3]) deltas[3].innerHTML = saldoProjetado < 0 ? `<b style="color:var(--danger)">⚠ negativo</b> em 30d` : `mês: <b>${fmtBRL(vendeuMes)}</b> em vendas`;

    // Cor da quarta KPI baseada em projeção
    const kpiCards = document.querySelectorAll('.kpi');
    if (kpiCards[3]) {
      kpiCards[3].querySelector('.kpi-value').style.color = saldoProjetado < 0 ? 'var(--danger)' : (saldoProjetado < 5000 ? 'var(--warn)' : 'var(--text)');
    }

    // === ALERTAS REAIS ===
    const alertCards = document.querySelectorAll('.alert-card');
    if (alertCards[0]) {
      const title = alertCards[0].querySelector('.ac-title');
      const text = alertCards[0].querySelector('.ac-text');
      if (atrasado > 0) {
        if (title) title.textContent = `${opens.filter(p => isOverdue(p.due_date)).length} boletos em atraso totalizam ${fmtBRLfull(atrasado)}`;
        if (text) text.innerHTML = `Liquidar urgente — taxas e juros corroem margem. <a href="contas-a-pagar.html?filter=overdue" style="color:var(--accent);text-decoration:underline">Ver atrasados</a>`;
        alertCards[0].href = 'contas-a-pagar.html';
      } else if (saldoProjetado < 0) {
        if (title) title.textContent = `Saldo projetado negativo em 30 dias`;
        if (text) text.innerHTML = `Total de saídas (${fmtBRL(pag30d)}) maior que entradas (${fmtBRL(recv30d + saldoInicial)}) na janela de 30 dias.`;
      } else {
        if (title) title.textContent = `${opens.length} contas a pagar em aberto`;
        if (text) text.innerHTML = `Total <b>${fmtBRL(totalOpen)}</b>. Vencendo nos próximos 7 dias: <b>${fmtBRL(a_pagar_7d)}</b>.`;
      }
    }
    if (alertCards[1]) {
      const title = alertCards[1].querySelector('.ac-title');
      const text = alertCards[1].querySelector('.ac-text');
      if (totalReceber > 0) {
        const overdueRecv = recsOpen.filter(r => diffDays(r.due_date) < 0).reduce((s,r)=>s+Number(r.amount), 0);
        if (title) title.textContent = `${fmtBRL(totalReceber)} a receber de clientes`;
        if (text) text.innerHTML = `${recsOpen.length} contas em aberto · <b style="color:var(--danger)">${fmtBRL(overdueRecv)}</b> em atraso. <a href="contas-a-receber.html" style="color:var(--accent);text-decoration:underline">Cobrar agora</a>`;
        alertCards[1].href = 'contas-a-receber.html';
      } else {
        if (title) title.textContent = 'Sem contas a receber cadastradas';
        if (text) text.innerHTML = `Cadastre fiado de cliente em <a href="contas-a-receber.html" style="color:var(--accent);text-decoration:underline">Contas a Receber</a> pra ver projeção real de caixa.`;
      }
    }

    // === PRÓXIMOS VENCIMENTOS REAIS ===
    const proximos = opens
      .filter(p => p.due_date)
      .sort((a,b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5);
    const vencRows = document.querySelectorAll('.venc-row');
    vencRows.forEach((row, i) => {
      const p = proximos[i];
      if (!p) { row.style.display = 'none'; return; }
      row.style.display = '';
      const [y,m,d] = p.due_date.split('-');
      const dt = new Date(p.due_date + 'T00:00:00');
      const dateEl = row.querySelector('.venc-date');
      const dNum = dateEl?.querySelector('.d');
      const dMes = dateEl?.querySelector('.m');
      if (dNum) dNum.textContent = d;
      if (dMes) {
        const diasNomes = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
        const mesAbr = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1];
        dMes.textContent = `${mesAbr} · ${diasNomes[dt.getDay()]}`;
      }
      const dd = diffDays(p.due_date);
      const atrasado = isOverdue(p.due_date);
      dateEl?.classList.remove('today','soon');
      if (dd === 0) dateEl?.classList.add('today');
      else if (dd <= 2 && dd >= 0) dateEl?.classList.add('soon');
      const sup = p.suppliers?.legal_name || p.description || '—';
      const name = row.querySelector('.venc-info .name');
      const meta = row.querySelector('.venc-info .meta');
      const val = row.querySelector('.venc-val');
      if (name) name.textContent = sup.length > 40 ? sup.slice(0,37)+'…' : sup;
      if (meta) meta.innerHTML = `<i data-lucide="receipt"></i> ${atrasado ? 'atrasado' : (dd === 0 ? 'vence hoje' : (dd < 0 ? 'vence seg' : 'pendente'))}`;
      if (val) {
        const atr = diasAtraso(p.due_date);
        const tagTxt = atrasado ? `${atr}d atraso` : (dd === 0 ? 'Hoje' : (dd < 0 ? 'Seg' : (dd === 1 ? 'Amanhã' : `${dd} dias`)));
        val.innerHTML = fmtBRLfull(p.amount) + `<span class="tag">${tagTxt}</span>`;
      }
    });

    // === ENTRADAS X SAÍDAS CHART (real, últimos 30 dias) ===
    if (typeof Chart !== 'undefined' && document.getElementById('chart-entradas-saidas')) {
      // Histórico real dos últimos 30 dias — entrada = vendas (daily_sales) + receivables recebidos; saída = payables pagos + sangrias
      const labels30 = []; const ent30 = []; const sai30 = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(HOJE); d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0,10);
        labels30.push(d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}));
        const vendasDia = SALES.filter(s => s.sale_date === iso).reduce((s,v)=>s+Number(v.amount), 0);
        const recebDia = RECS.filter(r => r.received_at?.slice(0,10) === iso).reduce((s,r)=>s+Number(r.amount), 0);
        const ent = vendasDia + recebDia;
        const pagDia = PAGS.filter(p => p.paid_at?.slice(0,10) === iso || (p.due_date === iso && p.status === 'paid')).reduce((s,p)=>s+Number(p.amount), 0);
        const sangDia = SANG.filter(w => w.withdrawal_date === iso).reduce((s,w)=>s+Number(w.amount), 0);
        const sai = pagDia + sangDia;
        ent30.push(ent / 1000);
        sai30.push(sai / 1000);
      }
      const totE = ent30.reduce((a,b)=>a+b, 0);
      const totS = sai30.reduce((a,b)=>a+b, 0);
      const totEEl = document.getElementById('tot-entradas');
      const totSEl = document.getElementById('tot-saidas');
      const saldoEl = document.getElementById('saldo-periodo');
      if (totEEl) totEEl.textContent = 'Entradas R$ ' + Math.round(totE) + 'k';
      if (totSEl) totSEl.textContent = 'Saídas R$ ' + Math.round(totS) + 'k';
      const saldoP = totE - totS;
      if (saldoEl) {
        saldoEl.textContent = (saldoP >= 0 ? '+' : '−') + 'R$ ' + Math.round(Math.abs(saldoP)) + 'k';
        saldoEl.style.color = saldoP >= 0 ? 'var(--success)' : 'var(--danger)';
        const cvs = document.getElementById('chart-entradas-saidas');
        if (cvs) cvs.setAttribute('aria-label', `Gráfico de entradas e saídas — Entradas R$ ${Math.round(totE)}k, Saídas R$ ${Math.round(totS)}k, Saldo ${(saldoP >= 0 ? '+' : '-')}R$ ${Math.round(Math.abs(saldoP))}k`);
      }
      // Re-renderiza o chart com os dados reais (substitui os mocks DATA_*)
      if (window.DATA_LABELS) {
        DATA_LABELS.length = 0; DATA_LABELS.push(...labels30);
        DATA_ENTRADAS.length = 0; DATA_ENTRADAS.push(...ent30);
        DATA_SAIDAS.length = 0; DATA_SAIDAS.push(...sai30);
        if (typeof renderChart === 'function') setTimeout(renderChart, 50);
      }
    }

    // === DRE SNAPSHOT (esconde se não tem como calcular ainda) ===
    // Remove o NaN do IRPJ
    document.querySelectorAll('.dre-line .v').forEach(el => {
      if (el.textContent.includes('NaN')) el.textContent = '—';
    });
  }

  function editSaldo() {
    const v = prompt('Saldo bancário inicial (R$):', localStorage.getItem('dmpay-saldo-' + window.DMPAY_COMPANY.id) || '0');
    if (v === null) return;
    const n = parseFloat(String(v).replace(',','.'));
    if (isNaN(n)) return;
    localStorage.setItem('dmpay-saldo-' + window.DMPAY_COMPANY.id, n);
    location.reload();
  }

  window.DMPAY_DASH = { editSaldo: editSaldo };
  init();
})();
