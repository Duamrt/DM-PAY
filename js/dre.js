// js/dre.js — DRE Gerencial real
(function () {
  // Alíquotas de fallback (estimativa enquanto contador não lançar os valores reais)
  const ICMS_EST = 0.085;
  const PIS_EST  = 0.0165;
  const COF_EST  = 0.076;
  const IRPJ = 0.15;
  const IRPJ_AD_BASE = 20000;
  const CSLL = 0.09;

  const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const MESES_LONGO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  let CID, ANO, MES, MODO = 'competencia';

  const fmt  = v => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pctS = (v,base) => base ? (v/base*100).toFixed(1).replace('.',',')+'%' : '—';

  function $v(id) { return document.getElementById(id); }
  function set(id, txt, opacity) {
    const el = $v(id); if (!el) return;
    el.textContent = txt;
    if (opacity !== undefined) el.style.opacity = String(opacity);
  }
  function setClass(id, cls) { const el = $v(id); if (el) el.className = 'cas-val ' + cls; }
  function setMargemVal(id, v, low, high) {
    const el = $v(id); if (!el) return;
    const pct = (v*100).toFixed(1).replace('.',',') + '%';
    el.textContent = pct;
    el.className = 'margem-val ' + (v >= high ? 'good' : v >= low ? 'warn' : 'bad');
  }

  function zeroAll() {
    ['v-rb','v-icms','v-pis','v-cofins','v-dev','v-rl',
     'v-cmv','v-lb',
     'v-dv','v-folha','v-maq','v-cielo',
     'v-dadm','v-prolabore','v-contador',
     'v-dger','v-aluguel','v-internet',
     'v-despvar',
     'v-ebit',
     'v-rf','v-descontos','v-rendimento',
     'v-df','v-tarifas','v-juros','v-antecip',
     'v-resfin','v-outras','v-ebt',
     'v-irpj','v-irpjad','v-csll','v-ll'
    ].forEach(id => { set(id,'—',0.4); });
    ['p-rb','p-icms','p-pis','p-cofins','p-dev','p-rl',
     'p-cmv','p-lb','p-dv','p-dadm','p-dger','p-despvar','p-ebit',
     'p-rf','p-df','p-resfin','p-outras','p-ebt','p-ll'
    ].forEach(id => { set(id,'—',0.4); });
  }

  function monthRange(ano, mes) {
    const ini = `${ano}-${String(mes).padStart(2,'0')}-01`;
    const prox = mes === 12 ? `${ano+1}-01-01` : `${ano}-${String(mes+1).padStart(2,'0')}-01`;
    return { ini, prox };
  }
  function prevMonth(ano, mes) {
    return mes === 1 ? { ano: ano-1, mes: 12 } : { ano, mes: mes-1 };
  }

  async function fetchSales(ano, mes) {
    const { ini, prox } = monthRange(ano, mes);
    const { data } = await sb.from('daily_sales').select('amount,payment_method')
      .eq('company_id', CID).gte('sale_date', ini).lt('sale_date', prox);
    return data || [];
  }

  async function fetchInvoices(ano, mes) {
    const { ini, prox } = monthRange(ano, mes);
    const { data } = await sb.from('invoices').select('total,supplier_id,suppliers(legal_name,trade_name)')
      .eq('company_id', CID).gte('issue_date', ini).lt('issue_date', prox);
    return data || [];
  }

  async function fetchPayables(ano, mes) {
    const { ini, prox } = monthRange(ano, mes);
    const dateField = MODO === 'caixa' ? 'paid_at' : 'due_date';
    const { data } = await sb.from('payables')
      .select('amount,status,category_id,description,expense_categories(name)')
      .eq('company_id', CID)
      .gte(dateField, ini).lt(dateField, prox);
    return data || [];
  }

  async function fetchCardFees(ano, mes) {
    const { ini, prox } = monthRange(ano, mes);
    const { data } = await sb.from('daily_card_fees')
      .select('fee_amount,card_brand,card_type,total_amount,transaction_count')
      .eq('company_id', CID)
      .gte('fee_date', ini).lt('fee_date', prox);
    return data || [];
  }

  async function fetchTaxes(ano, mes) {
    const { data } = await sb.from('dre_taxes')
      .select('icms_net,pis_net,cofins_net,devolucoes,notes,updated_at')
      .eq('company_id', CID).eq('year', ano).eq('month', mes).maybeSingle();
    return data || null;
  }

  async function fetchCmvReal(ano, mes) {
    const mesStr = `${ano}-${String(mes).padStart(2,'0')}-01`;
    const { data } = await sb.from('dre_cmv_real')
      .select('cmv_real,qtd_cupons,qtd_itens')
      .eq('company_id', CID).eq('mes', mesStr).maybeSingle();
    return data || null;
  }

  // ── Lançar impostos (modal DMPAY_UI) ─────────────────────────────────────
  async function lancarImpostos() {
    if (!window.DMPAY_UI) { alert('UI não carregada.'); return; }

    const current = await fetchTaxes(ANO, MES);
    const mesLabel = `${MESES_LONGO[MES-1]} / ${ANO}`;

    const vals = await window.DMPAY_UI.open({
      title: `Impostos — ${mesLabel}`,
      desc: 'Valores LÍQUIDOS após abatimento de créditos (conforme guias do contador). ICMS, PIS e COFINS não-cumulativos = débito s/ vendas − crédito s/ compras.',
      fields: [
        { key: 'icms',    label: 'ICMS líquido (R$) *',    type: 'number', value: current ? Number(current.icms_net).toFixed(2)   : '', placeholder: '0,00' },
        { key: 'pis',     label: 'PIS líquido (R$) *',     type: 'number', value: current ? Number(current.pis_net).toFixed(2)    : '', placeholder: '0,00' },
        { key: 'cofins',  label: 'COFINS líquido (R$) *',  type: 'number', value: current ? Number(current.cofins_net).toFixed(2) : '', placeholder: '0,00' },
        { key: 'dev',     label: 'Devoluções (R$)',         type: 'number', value: current ? Number(current.devolucoes).toFixed(2) : '0', placeholder: '0,00' },
        { key: 'notes',   label: 'Observação (opcional)', multiline: false, value: current?.notes || '', placeholder: 'Ex: guia DARF 25/04, regime não-cumulativo' }
      ],
      submitLabel: 'Salvar',
      cancelLabel: 'Cancelar',
      onSubmit: (v) => {
        const n = (k) => Number(String(v[k]||'0').replace(/[^\d,]/g,'').replace(',','.'));
        if (isNaN(n('icms')) || isNaN(n('pis')) || isNaN(n('cofins'))) throw new Error('Preencha os valores de ICMS, PIS e COFINS.');
        return true;
      }
    });

    if (!vals) return;

    const parse = (k) => Number(String(vals[k]||'0').replace(/[^\d,]/g,'').replace(',','.')) || 0;
    const userId = window.DMPAY_COMPANY?._userId || null;

    const payload = {
      company_id:  CID,
      year:        ANO,
      month:       MES,
      icms_net:    parse('icms'),
      pis_net:     parse('pis'),
      cofins_net:  parse('cofins'),
      devolucoes:  parse('dev'),
      notes:       (vals.notes||'').trim() || null,
      updated_by:  userId,
      updated_at:  new Date().toISOString()
    };

    const { error } = await sb.from('dre_taxes')
      .upsert(payload, { onConflict: 'company_id,year,month' });

    if (error) { alert('Erro ao salvar: ' + error.message); return; }

    await dreLoad();
  }

  // ── Render principal ──────────────────────────────────────────────────────
  async function dreLoad() {
    zeroAll();
    set('dre-mes-titulo', `${MESES_LONGO[MES-1]} / ${ANO}`);
    try {
    const prev = prevMonth(ANO, MES);
    const [sales, salesAnt, invs, pays, taxes, cardFees, cmvRealData] = await Promise.all([
      fetchSales(ANO, MES),
      fetchSales(prev.ano, prev.mes),
      fetchInvoices(ANO, MES),
      fetchPayables(ANO, MES),
      fetchTaxes(ANO, MES),
      fetchCardFees(ANO, MES),
      fetchCmvReal(ANO, MES),
    ]);
    cardFees_cache = cardFees;
    sales_cache = sales;

    const rb    = sales.reduce((s,r) => s + Number(r.amount), 0);
    const rbAnt = salesAnt.reduce((s,r) => s + Number(r.amount), 0);

    set('v-rb', fmt(rb), 1); setClass('v-rb','cas-val plus');
    set('p-rb', '—', 1);

    // Impostos: real (contador) ou estimativa
    const taxReal = taxes !== null;
    const icmsV = taxReal ? Number(taxes.icms_net)   : rb * ICMS_EST;
    const pisV  = taxReal ? Number(taxes.pis_net)    : rb * PIS_EST;
    const cofV  = taxReal ? Number(taxes.cofins_net) : rb * COF_EST;
    const devV  = taxReal ? Number(taxes.devolucoes) : 0;

    const tag = taxReal ? '' : ' est.';
    set('v-icms',   fmt(icmsV), 1); set('p-icms',   pctS(icmsV,rb) + tag, 1);
    set('v-pis',    fmt(pisV),  1); set('p-pis',    pctS(pisV,rb)  + tag, 1);
    set('v-cofins', fmt(cofV),  1); set('p-cofins', pctS(cofV,rb)  + tag, 1);
    if (devV > 0) { set('v-dev', fmt(devV), 1); set('p-dev', pctS(devV,rb), 1); }
    else          { set('v-dev','—',0.4); set('p-dev','—',0.4); }

    const rl = rb - icmsV - pisV - cofV - devV;
    set('v-rl', fmt(rl), 1); setClass('v-rl','cas-val total');
    set('p-rl', '100,0%', 1);

    // CMV: custo real do PDV se disponível, senão soma de compras (NF-e)
    const cmvCompras = invs.reduce((s,r) => s + Number(r.total||0), 0);
    const cmvEhReal  = !!cmvRealData;
    const cmv        = cmvEhReal ? Number(cmvRealData.cmv_real) : cmvCompras;
    if (cmv > 0) {
      set('v-cmv', fmt(cmv), 1); setClass('v-cmv','cas-val minus');
      set('p-cmv', pctS(cmv,rl), 1);
    }

    const lb = rl - cmv;
    set('v-lb', cmv > 0 ? fmt(lb) : fmt(rl)+' *', 1);
    setClass('v-lb', 'cas-val ' + (lb >= 0 ? 'total' : 'minus'));
    set('p-lb', cmv > 0 ? pctS(lb,rl) : '— *', 1);

    // Despesas por categoria (palavras-chave)
    const byCat = {};
    pays.forEach(p => {
      const cat = p.expense_categories?.name || 'sem-categoria';
      byCat[cat] = (byCat[cat]||0) + Number(p.amount||0);
    });
    function sumCats(...kws) {
      return Object.entries(byCat).filter(([k]) =>
        kws.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
      ).reduce((s,[,v]) => s+v, 0);
    }

    const folha     = sumCats('folha','salário','salario','funcionário','funcionario','trabalhista','holerite','inss','fgts','encargo','guia das','simples nacional');
    const maqTaxas  = sumCats('maquininha','cielo','stone','rede','getnet','mensalidade maquina','aluguel maquina');
    const prolabore = sumCats('pro-labore','pró-labore','prolabore','sócio','socio','retirada');
    const contador  = sumCats('contador','contabilidade','software','sistema');
    const aluguel   = sumCats('aluguel','energia','água','agua','condomínio','condominio');
    const internet  = sumCats('internet','segurança','seguranca','limpeza','telefone');

    const despVar   = sumCats('despesa variável','despesa variavel','variável');
    const cieloV    = cardFees.reduce((s,r) => s + Number(r.fee_amount||0), 0);
    const dvTotal   = folha + maqTaxas + cieloV;
    const dadmTotal = prolabore + contador;
    const dgerTotal = aluguel + internet;
    const despOp    = dvTotal + dadmTotal + dgerTotal + despVar;

    // Despesas Financeiras (não usa 'taxa'/'tarifa' — já estão em maqTaxas)
    const dfJuros   = sumCats('juros', 'multa');
    const dfAntecip = sumCats('antecip');
    const dfIof     = sumCats('iof');
    const despFin   = dfJuros + dfAntecip + dfIof;

    function setDesp(idVal, idPct, v) {
      if (v > 0) {
        set(idVal, fmt(v), 1); setClass(idVal,'cas-val minus');
        if (idPct) set(idPct, pctS(v,rl), 1);
      }
    }
    setDesp('v-dv','p-dv', dvTotal);
    setDesp('v-folha',null, folha);
    setDesp('v-maq',null, maqTaxas);
    setDesp('v-cielo',null, cieloV);
    setDesp('v-dadm','p-dadm', dadmTotal);
    setDesp('v-prolabore',null, prolabore);
    setDesp('v-contador',null, contador);
    setDesp('v-dger','p-dger', dgerTotal);
    setDesp('v-aluguel',null, aluguel);
    setDesp('v-internet',null, internet);
    setDesp('v-despvar','p-despvar', despVar);
    setDesp('v-df','p-df', despFin);
    setDesp('v-juros',null, dfJuros);
    setDesp('v-antecip',null, dfAntecip);

    const ebitV = (cmv > 0 ? lb : rl) - despOp;
    if (despOp > 0 || cmv > 0 || despFin > 0) {
      set('v-ebit', fmt(ebitV), 1);
      setClass('v-ebit','cas-val ' + (ebitV >= 0 ? 'total' : 'minus'));
      set('p-ebit', pctS(ebitV,rl), 1);

      const ebtV    = ebitV - despFin;
      const irpjV   = ebtV > 0 ? ebtV * IRPJ : 0;
      const irpjAdV = ebtV > IRPJ_AD_BASE ? (ebtV - IRPJ_AD_BASE) * 0.10 : 0;
      const csllV   = ebtV > 0 ? ebtV * CSLL : 0;
      const ll      = ebtV - irpjV - irpjAdV - csllV;

      set('v-ebt', fmt(ebtV), 1); setClass('v-ebt','cas-val total');
      set('p-ebt', pctS(ebtV,rl), 1);
      set('v-irpj',   fmt(irpjV),   1);
      set('v-irpjad', fmt(irpjAdV), 1);
      set('v-csll',   fmt(csllV),   1);
      set('v-ll', fmt(ll), 1); setClass('v-ll','cas-val grand');
      set('p-ll', pctS(ll,rl) + (cmv === 0 ? ' *' : ''), 1);

      if (rl > 0) {
        const lbCalc = cmv > 0 ? lb : rl;
        setMargemVal('v-mb',  lbCalc/rl, 0.25, 0.35);
        setMargemVal('v-mop', ebitV/rl,  0.05, 0.15);
        setMargemVal('v-ml',  ll/rl,     0.03, 0.08);
      }
    } else if (rl > 0) {
      setMargemVal('v-mb', rl/rb, 0.15, 0.25);
    }

    if (rbAnt > 0) {
      const dRb  = (rb - rbAnt) / rbAnt;
      const dRbA = rb - rbAnt;
      set('delta-rb-p', (dRb >= 0 ? '+' : '') + (dRb*100).toFixed(1).replace('.',',') + '%', 1);
      set('delta-rb-a', (dRbA >= 0 ? '+' : '') + 'R$ ' + fmt(Math.abs(dRbA)), 1);
      const cls = dRb >= 0 ? 'margem-val good' : 'margem-val bad';
      if ($v('delta-rb-p')) $v('delta-rb-p').className = cls;
    }

    // Atualiza disclaimer e botão
    const disc = document.querySelector('.disclaimer div');
    if (disc) {
      const taxNote = taxReal
        ? `Deduções fiscais <b>reais</b> (lançadas pelo contador${taxes.notes ? ' — ' + taxes.notes : ''}).`
        : `Deduções fiscais <b>estimadas</b> — ICMS ${(ICMS_EST*100).toFixed(1)}% · PIS ${(PIS_EST*100).toFixed(2)}% · COFINS ${(COF_EST*100).toFixed(1)}%. <a href="#" onclick="DMPAY_DRE.lancarImpostos();return false" style="color:var(--warn);font-weight:600">Lançar valores reais →</a>`;
      const cmvNote = cmv > 0
        ? `CMV: <b>R$ ${fmt(cmv)}</b>${cmvEhReal ? ' <span style="color:var(--ok);font-size:0.85em">● custo do vendido (PDV)</span>' : ' · compras do período'}.`
        : 'CMV: <b>—</b> (importe NF-e de compras).';
      disc.innerHTML = `<b>Dados reais onde disponível.</b> ${taxNote} ${cmvNote}`;
    }

    // Badge no botão
    const btn = document.getElementById('btn-lancar-impostos');
    if (btn) {
      btn.innerHTML = taxReal
        ? '<i data-lucide="check-circle" style="width:14px;height:14px"></i> Impostos lançados'
        : '<i data-lucide="calculator" style="width:14px;height:14px"></i> Lançar impostos';
      btn.style.borderColor = taxReal ? 'var(--success)' : 'var(--warn)';
      btn.style.color       = taxReal ? 'var(--success)' : 'var(--warn)';
      if (window.lucide) lucide.createIcons();
    }

    await renderChart(taxReal);
    } catch(e) {
      console.error('dreLoad error', e);
      const el = document.querySelector('.dre-wrap');
      if (el) el.insertAdjacentHTML('afterbegin','<div style="color:var(--danger);padding:16px;text-align:center">Erro ao carregar DRE. Verifique sua conexão.</div>');
    }
  }

  // ── Drill-down ───────────────────────────────────────────────────────────
  async function drill(key, title) {
    const idMap = {
      'receita-bruta': 'rb', 'icms': 'icms', 'pis': 'pis', 'cofins': 'cofins',
      'dev': 'dev', 'cmv': 'cmv', 'op-vendas': 'dv', 'op-adm': 'dadm',
      'op-gerais': 'dger', 'despvar': 'despvar', 'rec-fin': 'rf', 'desp-fin': 'df', 'outras': 'outras'
    };
    const valEl = $v('v-' + (idMap[key] || key));
    const val = valEl ? valEl.textContent : '—';

    document.getElementById('drillTitle').innerHTML = '<i data-lucide="bar-chart-3"></i> ' + title;
    document.getElementById('drillCode').textContent = `${MESES_LONGO[MES-1]} / ${ANO}`;
    document.getElementById('drillValue').textContent = val !== '—' ? val : '—';
    document.getElementById('drillDesc').textContent = val !== '—' ? '% da Receita Líquida' : 'Sem dados para este mês';

    let items = [];

    if (key === 'cmv') {
      const { ini, prox } = monthRange(ANO, MES);
      const { data: invs } = await sb.from('invoices')
        .select('total,suppliers(legal_name,trade_name)')
        .eq('company_id', CID).gte('issue_date', ini).lt('issue_date', prox)
        .order('total', { ascending: false });
      items = (invs||[]).map(i => ({
        name: i.suppliers?.legal_name || i.suppliers?.trade_name || 'Fornecedor',
        val: fmt(i.total)
      }));
    } else if (key === 'receita-bruta') {
      const rows = sales_cache || [];
      const byPm = {};
      const pmLabel = { dinheiro:'Dinheiro', pix:'PIX', debito:'Débito', credito:'Crédito', faturado:'Fiado/Faturado', outros:'Outros' };
      rows.forEach(r => { byPm[r.payment_method] = (byPm[r.payment_method]||0) + Number(r.amount); });
      items = Object.entries(byPm).sort(([,a],[,b])=>b-a).map(([pm,v]) => ({ name: pmLabel[pm]||pm, val: fmt(v) }));
    } else if (['icms','pis','cofins'].includes(key)) {
      const taxes = await fetchTaxes(ANO, MES);
      if (taxes) {
        items = [
          { name: 'Valor líquido (após créditos)', val: fmt(key==='icms'?taxes.icms_net:key==='pis'?taxes.pis_net:taxes.cofins_net) },
          { name: 'Regime: Lucro Real não-cumulativo', val: '' },
          { name: 'Obs', val: taxes.notes || '—' }
        ];
      } else {
        const rb = Number($v('v-rb')?.textContent?.replace(/\./g,'').replace(',','.')) || 0;
        const rate = key==='icms'?ICMS_EST:key==='pis'?PIS_EST:COF_EST;
        items = [
          { name: 'Estimativa sobre Receita Bruta', val: `${(rate*100).toFixed(2)}%` },
          { name: 'Valor estimado', val: fmt(rb * rate) },
          { name: '⚠️ Clique em "Lançar impostos" para usar valores reais', val: '' }
        ];
      }
    } else if (key === 'cielo') {
      const byBrand = {};
      cardFees_cache.forEach(r => {
        const k = `${r.card_brand} (${r.card_type})`;
        byBrand[k] = (byBrand[k]||0) + Number(r.fee_amount||0);
      });
      items = Object.entries(byBrand).sort(([,a],[,b])=>b-a)
        .map(([k,v]) => ({ name: k, val: fmt(v) }));
      const totalTxn = cardFees_cache.reduce((s,r) => s + Number(r.transaction_count||0), 0);
      const totalVenda = cardFees_cache.reduce((s,r) => s + Number(r.total_amount||0), 0);
      if (items.length) items.push({ name: '────────────', val: '' });
      items.push({ name: `${totalTxn} transações · vendas R$ ${fmt(totalVenda)}`, val: '' });
    } else {
      items = [{ name: 'Detalhamento disponível em breve', val: '—' }];
    }

    const list = document.getElementById('drillList');
    if (items.length === 0) {
      list.innerHTML = '<div class="drill-item"><span class="drill-item-name">Sem dados este mês</span><span class="drill-item-val">—</span></div>';
    } else {
      list.innerHTML = items.map(i => `
        <div class="drill-item">
          <span class="drill-item-name">${i.name}</span>
          <span class="drill-item-val">${i.val}</span>
        </div>`).join('');
    }

    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
    if (window.lucide) lucide.createIcons();
  }

  let sales_cache = [];
  let cardFees_cache = [];

  // ── Chart ────────────────────────────────────────────────────────────────
  let dreChart;
  async function renderChart(taxReal) {
    const { data: allSales } = await sb.from('daily_sales').select('sale_date,amount')
      .eq('company_id', CID).order('sale_date', { ascending: true }).limit(5000);

    const { data: allInvs } = await sb.from('invoices').select('issue_date,total')
      .eq('company_id', CID).order('issue_date', { ascending: true });

    const { data: allCmvReal } = await sb.from('dre_cmv_real')
      .select('mes,cmv_real').eq('company_id', CID);
    const cmvRealByMes = {};
    (allCmvReal||[]).forEach(r => { cmvRealByMes[r.mes.slice(0,7)] = Number(r.cmv_real); });

    // Busca impostos reais de todos os meses (usa quando disponível, senão estimado)
    const { data: allTaxes } = await sb.from('dre_taxes')
      .select('year,month,icms_net,pis_net,cofins_net,devolucoes')
      .eq('company_id', CID);
    const taxByMes = {};
    (allTaxes||[]).forEach(t => {
      const k = `${t.year}-${String(t.month).padStart(2,'0')}`;
      taxByMes[k] = Number(t.icms_net||0) + Number(t.pis_net||0) + Number(t.cofins_net||0) + Number(t.devolucoes||0);
    });

    const byMes = {}, invByMes = {};
    (allSales||[]).forEach(r => {
      const d = new Date(r.sale_date + 'T12:00:00');
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      byMes[k] = (byMes[k]||0) + Number(r.amount);
    });
    (allInvs||[]).forEach(r => {
      if (!r.issue_date) return;
      const d = new Date(r.issue_date + 'T12:00:00');
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      invByMes[k] = (invByMes[k]||0) + Number(r.total||0);
    });

    const keys = Object.keys(byMes).sort().slice(-12);
    const labels = keys.map(k => { const [a,m]=k.split('-'); return `${MESES_CURTO[+m-1]}/${String(a).slice(2)}`; });
    const rbData = keys.map(k => Math.round((byMes[k]||0)/1000));
    // Receita Líquida: usa imposto REAL se houver no mês, senão estimado
    const rlData = keys.map((k, i) => {
      const rbReal = byMes[k] || 0;
      if (taxByMes[k] != null && taxByMes[k] > 0) {
        return Math.round((rbReal - taxByMes[k]) / 1000);
      }
      return Math.round(rbData[i] * (1 - ICMS_EST - PIS_EST - COF_EST));
    });
    const lbData = keys.map((k,i) => {
      const cmvK = cmvRealByMes[k] ?? invByMes[k] ?? 0;
      if (!cmvK) return null;
      return Math.round((rlData[i]*1000 - cmvK)/1000);
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tColor = isDark ? '#9CA3AF' : '#6B7280';
    const gColor = isDark ? '#222832' : '#E5E7EB';

    if (dreChart) dreChart.destroy();
    dreChart = new Chart(document.getElementById('dreChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Receita Bruta', data:rbData, borderColor: isDark?'#3B82F6':'#2563EB', backgroundColor:'transparent', tension:0.35, borderWidth:2.5, pointRadius:3, pointHoverRadius:6 },
          { label:'Receita Líquida', data:rlData, borderColor: isDark?'#FBBF24':'#D97706', backgroundColor:'transparent', tension:0.35, borderWidth:2, pointRadius:2, pointHoverRadius:5, borderDash:[4,3] },
          { label:'Lucro Bruto', data:lbData, borderColor:'#10B981', backgroundColor:'transparent', tension:0.35, borderWidth:2, pointRadius:2, pointHoverRadius:5 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ display:false },
          tooltip:{
            backgroundColor: isDark?'#1A1F27':'#111827', titleColor:'#F3F4F6', bodyColor:'#F3F4F6', padding:10,
            callbacks:{ label: ctx => ctx.dataset.label + ': R$ ' + (ctx.parsed.y != null ? ctx.parsed.y.toLocaleString('pt-BR')+'k' : '—') }
          }
        },
        scales:{
          x:{ grid:{display:false}, ticks:{color:tColor,font:{family:'Geist Mono',size:10}} },
          y:{ grid:{color:gColor}, ticks:{color:tColor,font:{family:'Geist Mono',size:10},callback: v => 'R$'+v+'k'} }
        }
      }
    });
  }

  // ── month select ──────────────────────────────────────────────────────────
  async function buildMonthSelect() {
    const { data: minRow } = await sb.from('daily_sales').select('sale_date')
      .eq('company_id', CID).order('sale_date', {ascending: true}).limit(1).single();

    const now = new Date();
    const oldest = minRow ? new Date(minRow.sale_date + 'T12:00:00') : now;
    const inicio2026 = new Date(2026, 0, 1);
    const meses = [];
    let cur = new Date(Math.max(oldest.getTime(), inicio2026.getTime()));
    cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cur <= end) {
      meses.push(`${cur.getFullYear()}-${cur.getMonth()+1}`);
      cur.setMonth(cur.getMonth() + 1);
    }
    meses.reverse();

    const sel = document.getElementById('dre-mes-sel');
    if (!sel) return;
    sel.innerHTML = '';
    meses.forEach((m, i) => {
      const [a, ms] = m.split('-').map(Number);
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${MESES_LONGO[ms-1]} / ${a}`;
      if (i === 0) { opt.selected = true; ANO = a; MES = ms; }
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      const [a, m] = sel.value.split('-').map(Number);
      ANO = a; MES = m; dreLoad();
    });
  }

  // ── init ──────────────────────────────────────────────────────────────────
  async function init() {
    let tries = 0;
    while ((!window.sb || !window.DMPAY_COMPANY) && tries++ < 80)
      await new Promise(r => setTimeout(r, 100));
    if (!window.sb || !window.DMPAY_COMPANY) return;

    CID = window.DMPAY_COMPANY.id;

    document.querySelectorAll('.mode-toggle button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.mode-toggle button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        MODO = b.dataset.mode;
        dreLoad();
      });
    });

    document.getElementById('btn-lancar-impostos')?.addEventListener('click', lancarImpostos);

    document.querySelector('.btn[data-action="exportar"]')?.addEventListener('click', () => {
      alert('Exportar PDF: em construção. Os dados reais já estão na tela para copiar.');
    });

    await buildMonthSelect();
    await dreLoad();
  }

  window.DMPAY_DRE = { lancarImpostos, drill };
  window.drill = (key, title) => window.DMPAY_DRE.drill(key, title);
  window.closeDrill = () => {
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('drawerBg')?.classList.remove('open');
  };

  init();
})();
