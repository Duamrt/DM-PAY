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

  async function fetchPayablesAudit(ano, mes) {
    const { ini, prox } = monthRange(ano, mes);
    const { data } = await sb.from('payables')
      .select('amount,status,description,due_date,expense_categories(name)')
      .eq('company_id', CID)
      .gte('due_date', ini).lt('due_date', prox);
    return data || [];
  }

  async function fetchTaxes(ano, mes) {
    const { data } = await sb.from('dre_taxes')
      .select('icms_net,pis_net,cofins_net,devolucoes,notes,updated_at')
      .eq('company_id', CID).eq('year', ano).eq('month', mes).maybeSingle();
    return data || null;
  }

  async function fetchTaxesAvg() {
    const { data } = await sb.from('dre_taxes')
      .select('icms_net,pis_net,cofins_net')
      .eq('company_id', CID)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(6);
    if (!data || data.length === 0) return null;
    const avg = f => data.reduce((s,r) => s + Number(r[f]||0), 0) / data.length;
    return { icms_net: avg('icms_net'), pis_net: avg('pis_net'), cofins_net: avg('cofins_net') };
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
    const [sales, salesAnt, invs, pays, taxes, cardFees, cmvRealData, taxesAvg, paysAudit] = await Promise.all([
      fetchSales(ANO, MES),
      fetchSales(prev.ano, prev.mes),
      fetchInvoices(ANO, MES),
      fetchPayables(ANO, MES),
      fetchTaxes(ANO, MES),
      fetchCardFees(ANO, MES),
      fetchCmvReal(ANO, MES),
      fetchTaxesAvg(),
      fetchPayablesAudit(ANO, MES),
    ]);
    cardFees_cache = cardFees;
    sales_cache = sales;
    pays_cache = pays;
    taxes_cache = taxes;
    taxesAvg_cache = taxesAvg;
    taxReal_cache = taxes !== null;
    pays_audit_cache = paysAudit;
    cmvEhReal_cache = !!cmvRealData;

    const rb    = sales.reduce((s,r) => s + Number(r.amount), 0);
    const rbAnt = salesAnt.reduce((s,r) => s + Number(r.amount), 0);

    set('v-rb', fmt(rb), 1); setClass('v-rb','cas-val plus');
    set('p-rb', '—', 1);

    // Impostos: real (contador) → média histórica → fallback alíquota estimada
    const taxReal = taxes !== null;
    const icmsV = taxReal ? Number(taxes.icms_net)    : taxesAvg ? Number(taxesAvg.icms_net)    : rb * ICMS_EST;
    const pisV  = taxReal ? Number(taxes.pis_net)     : taxesAvg ? Number(taxesAvg.pis_net)     : rb * PIS_EST;
    const cofV  = taxReal ? Number(taxes.cofins_net)  : taxesAvg ? Number(taxesAvg.cofins_net)  : rb * COF_EST;
    const devV  = taxReal ? Number(taxes.devolucoes)  : 0;

    const tag = taxReal ? '' : (taxesAvg ? ' est. média' : ' est.');
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
    const lblTipo = document.getElementById('lbl-cmv-tipo');
    if (lblTipo) lblTipo.textContent = cmvEhReal ? '(custo do vendido)' : '(NF-e de compras)';
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
    updateAuditBadge();
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
      const getV = (t) => key==='icms' ? Number(t.icms_net) : key==='pis' ? Number(t.pis_net) : Number(t.cofins_net);
      if (taxReal_cache && taxes_cache) {
        items = [
          { name: 'Valor real (lançado pelo contador)', val: fmt(getV(taxes_cache)) },
          { name: 'Regime: Lucro Real não-cumulativo', val: '' },
          { name: taxes_cache.notes || '', val: '' }
        ].filter(i => i.name);
      } else if (taxesAvg_cache) {
        const rb = Number($v('v-rb')?.textContent?.replace(/\./g,'').replace(',','.')) || 0;
        const v = getV(taxesAvg_cache);
        const aliq = rb > 0 ? ((v / rb) * 100).toFixed(2) : '—';
        items = [
          { name: 'Estimativa — média dos meses reais anteriores', val: '' },
          { name: `Alíquota efetiva média`, val: `${aliq}%` },
          { name: 'Valor', val: fmt(v) },
          { name: '⚠️ Lance os impostos do mês para usar dados reais', val: '' }
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
    } else if (['op-vendas','op-adm','op-gerais','despvar','desp-fin','folha','maq','prolabore','contador','aluguel','internet'].includes(key)) {
      const kwMap = {
        'op-vendas' : ['folha','salário','salario','funcionário','funcionario','trabalhista','holerite','inss','fgts','encargo','guia das','simples nacional','maquininha','cielo','stone','rede','getnet','mensalidade maquina','aluguel maquina'],
        'op-adm'    : ['pro-labore','pró-labore','prolabore','sócio','socio','retirada','contador','contabilidade','software','sistema'],
        'op-gerais' : ['aluguel','energia','água','agua','condomínio','condominio','internet','segurança','seguranca','limpeza','telefone'],
        'despvar'   : ['despesa variável','despesa variavel','variável','variavel'],
        'desp-fin'  : ['juros','multa','antecip','iof'],
        'folha'     : ['folha','salário','salario','funcionário','funcionario','trabalhista','holerite','inss','fgts','encargo','guia das','simples nacional'],
        'maq'       : ['maquininha','cielo','stone','rede','getnet','mensalidade maquina','aluguel maquina'],
        'prolabore' : ['pro-labore','pró-labore','prolabore','sócio','socio','retirada'],
        'contador'  : ['contador','contabilidade','software','sistema'],
        'aluguel'   : ['aluguel','energia','água','agua','condomínio','condominio'],
        'internet'  : ['internet','segurança','seguranca','limpeza','telefone'],
      };
      const kws = kwMap[key] || [];
      const filtered = (pays_cache||[]).filter(p => {
        const cat = (p.expense_categories?.name || '').toLowerCase();
        return kws.some(kw => cat.includes(kw.toLowerCase()));
      }).sort((a,b) => Number(b.amount||0) - Number(a.amount||0));

      if (filtered.length === 0) {
        items = [{ name: 'Nenhum lançamento encontrado nesta categoria', val: '—' }];
      } else {
        items = filtered.map(p => ({
          name: p.description || p.expense_categories?.name || 'Sem descrição',
          val: fmt(Number(p.amount||0))
        }));
        const total = filtered.reduce((s,p) => s + Number(p.amount||0), 0);
        items.push({ name: '─────────────', val: '' });
        items.push({ name: `${filtered.length} lançamento${filtered.length>1?'s':''} · Total`, val: fmt(total) });
      }
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
  let pays_cache = [];
  let taxes_cache = null;
  let taxesAvg_cache = null;
  let taxReal_cache = false;
  let pays_audit_cache = [];
  let cmvEhReal_cache = false;

  // ── Checklist de Fechamento ───────────────────────────────────────────────
  const FOLHA_KWS    = ['folha','salário','salario','funcionário','funcionario','trabalhista','holerite','inss','fgts','encargo','guia das','simples nacional'];
  const PRO_KWS      = ['pro-labore','pró-labore','prolabore','sócio','socio','retirada'];
  const CONTADOR_KWS = ['contador','contabilidade'];
  const ALUGUEL_KWS  = ['aluguel','energia','água','agua','condomínio','condominio'];

  function catMatch(p, kws) {
    const cat = (p.expense_categories?.name || '').toLowerCase();
    return kws.some(kw => cat.includes(kw.toLowerCase()));
  }

  function buildAuditItems() {
    const pays = pays_audit_cache;
    const items = [];

    // 1. Impostos
    items.push({
      ok: taxReal_cache,
      label: 'Impostos (ICMS · PIS · COFINS)',
      detail: taxReal_cache
        ? 'Valores reais lançados pelo contador'
        : 'Usando estimativa — aguardando contador',
      action: taxReal_cache ? null : 'DMPAY_DRE.lancarImpostos()',
      actionLabel: 'Lançar agora →'
    });

    // 2. Folha de pagamento
    const folhaPays  = pays.filter(p => catMatch(p, FOLHA_KWS));
    const folhaPaga  = folhaPays.some(p => p.status === 'paid');
    const folhaLanc  = folhaPays.length > 0;
    const folhaTotal = folhaPays.reduce((s, p) => s + Number(p.amount || 0), 0);
    items.push({
      ok: folhaPaga,
      warn: folhaLanc && !folhaPaga,
      label: 'Folha de pagamento',
      detail: folhaPaga
        ? `${folhaPays.filter(p => p.status === 'paid').length} lançamento(s) pago(s) — R$ ${fmt(folhaTotal)}`
        : folhaLanc
          ? `Lançada mas não confirmada — R$ ${fmt(folhaTotal)}`
          : 'Não encontrada neste mês — lance nas despesas'
    });

    // 3. Pró-labore
    const proPays  = pays.filter(p => catMatch(p, PRO_KWS));
    const proPago  = proPays.some(p => p.status === 'paid');
    const proTotal = proPays.reduce((s, p) => s + Number(p.amount || 0), 0);
    items.push({
      ok: proPago,
      warn: proPays.length > 0 && !proPago,
      label: 'Pró-labore',
      detail: proPago
        ? `Confirmado — R$ ${fmt(proTotal)}`
        : proPays.length > 0
          ? `Lançado mas não confirmado — R$ ${fmt(proTotal)}`
          : 'Não encontrado neste mês'
    });

    // 4. Contador
    const contPays = pays.filter(p => catMatch(p, CONTADOR_KWS));
    const contPago = contPays.some(p => p.status === 'paid');
    if (contPays.length > 0) {
      items.push({
        ok: contPago,
        warn: !contPago,
        label: 'Contador / Contabilidade',
        detail: contPago
          ? `Confirmado — R$ ${fmt(contPays.reduce((s, p) => s + Number(p.amount || 0), 0))}`
          : `Lançado mas não confirmado — R$ ${fmt(contPays.reduce((s, p) => s + Number(p.amount || 0), 0))}`
      });
    }

    // 5. Contas em aberto (exceto categorias já auditadas acima)
    const SKIP_KWS = [...FOLHA_KWS, ...PRO_KWS, ...CONTADOR_KWS, ...ALUGUEL_KWS];
    const abertas  = pays.filter(p => !catMatch(p, SKIP_KWS) && (p.status === 'open' || p.status === 'overdue'));
    if (abertas.length > 0) {
      const totalAb = abertas.reduce((s, p) => s + Number(p.amount || 0), 0);
      items.push({
        ok: false,
        warn: true,
        label: `${abertas.length} conta(s) sem baixa`,
        detail: `Despesas lançadas no mês aguardando pagamento — R$ ${fmt(totalAb)}`
      });
    }

    // 6. CMV
    items.push({
      ok: cmvEhReal_cache,
      warn: !cmvEhReal_cache,
      label: 'CMV — Custo das Mercadorias',
      detail: cmvEhReal_cache
        ? 'Custo real importado do PDV'
        : 'Usando NF-e de compras (aproximação)'
    });

    return items;
  }

  function updateAuditBadge() {
    const items     = buildAuditItems();
    const pendentes = items.filter(i => !i.ok).length;
    const badge     = document.getElementById('audit-badge');
    const btn       = document.getElementById('btn-checklist');
    if (badge) {
      badge.textContent    = pendentes;
      badge.style.display  = pendentes > 0 ? '' : 'none';
    }
    if (btn) {
      btn.style.borderColor = pendentes > 0 ? 'var(--warn)' : 'var(--success)';
      btn.style.color       = pendentes > 0 ? 'var(--warn)' : 'var(--success)';
    }
  }

  function showAudit() {
    const items     = buildAuditItems();
    const pendentes = items.filter(i => !i.ok).length;
    const mesLabel  = `${MESES_LONGO[MES - 1]} / ${ANO}`;

    document.getElementById('drillTitle').innerHTML = '<i data-lucide="clipboard-list"></i> Checklist de Fechamento';
    document.getElementById('drillCode').textContent = mesLabel;

    const valEl        = document.getElementById('drillValue');
    valEl.textContent  = pendentes === 0 ? 'Pronto para fechar ✓' : `${pendentes} pendente${pendentes > 1 ? 's' : ''}`;
    valEl.style.color  = pendentes === 0 ? 'var(--success)' : 'var(--warn)';

    document.getElementById('drillDesc').textContent = pendentes === 0
      ? 'Todos os itens confirmados — DRE completo'
      : 'Itens que precisam ser lançados ou confirmados antes de fechar';

    const list = document.getElementById('drillList');
    list.innerHTML = items.map(item => {
      const color = item.ok ? 'var(--success)' : item.warn ? 'var(--warn)' : 'var(--danger)';
      const icon  = item.ok
        ? `<i data-lucide="check-circle"  style="width:15px;height:15px;color:var(--success);flex-shrink:0;margin-top:2px"></i>`
        : item.warn
          ? `<i data-lucide="alert-circle" style="width:15px;height:15px;color:var(--warn);flex-shrink:0;margin-top:2px"></i>`
          : `<i data-lucide="x-circle"     style="width:15px;height:15px;color:var(--danger);flex-shrink:0;margin-top:2px"></i>`;
      const actionHtml = item.action
        ? `<br><a href="#" onclick="${item.action};closeDrill();return false" style="color:var(--warn);font-size:11px;font-weight:600;text-decoration:none">${item.actionLabel}</a>`
        : '';
      return `
        <div class="drill-item" style="align-items:flex-start;padding:11px 0;gap:10px">
          ${icon}
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px;color:${color};line-height:1.3">${item.label}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;line-height:1.4">${item.detail}${actionHtml}</div>
          </div>
        </div>`;
    }).join('<div style="border-top:1px solid var(--border);margin:0"></div>');

    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
    if (window.lucide) lucide.createIcons();
  }

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

    document.querySelector('.btn[data-action="exportar"]')?.addEventListener('click', async () => {
      const empresa = window.DMPAY_COMPANY?.trade_name || window.DMPAY_COMPANY?.name || '';
      const periodo = `${MESES_LONGO[MES-1]} / ${ANO}`;
      const modo    = document.querySelector('.mode-toggle button.active')?.textContent?.trim() || 'Competência';
      const gerado  = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
      const v = (id) => (document.getElementById(id)?.textContent || '—').trim();

      const { ini: cmvIni, prox: cmvProx } = monthRange(ANO, MES);
      const { data: cmvInvs } = await sb.from('invoices')
        .select('total,suppliers(legal_name,trade_name)')
        .eq('company_id', CID).gte('issue_date', cmvIni).lt('issue_date', cmvProx)
        .order('total', { ascending: false }).limit(15);
      const topFornecedores = (cmvInvs||[]).map(i => ({
        nome: i.suppliers?.legal_name || i.suppliers?.trade_name || 'Fornecedor',
        val: Number(i.total||0)
      }));

      const linhas = [
        { label:'Receita Bruta de Vendas', val:v('v-rb'), pct:v('p-rb'), tipo:'total' },
        { label:'(−) ICMS s/ vendas',      val:v('v-icms'),   pct:v('p-icms'),   tipo:'ded' },
        { label:'(−) PIS s/ vendas',       val:v('v-pis'),    pct:v('p-pis'),    tipo:'ded' },
        { label:'(−) COFINS s/ vendas',    val:v('v-cofins'), pct:v('p-cofins'), tipo:'ded' },
        { label:'(−) Devoluções',           val:v('v-dev'),    pct:v('p-dev'),    tipo:'ded' },
        { label:'= Receita Líquida',        val:v('v-rl'),     pct:'100,0%',      tipo:'subtotal' },
        { label:'(−) CMV (custo do vendido)', val:v('v-cmv'), pct:v('p-cmv'),    tipo:'ded' },
        { label:'= Lucro Bruto',            val:v('v-lb'),     pct:v('p-lb'),     tipo:'subtotal' },
        { label:'Despesas com Vendas',      val:v('v-dv'),     pct:v('p-dv'),     tipo:'grupo' },
        { label:'  Folha operacional',      val:v('v-folha'),  pct:'',            tipo:'item' },
        { label:'  Maquininhas',            val:v('v-maq'),    pct:'',            tipo:'item' },
        { label:'  Taxas Cielo',            val:v('v-cielo'),  pct:'',            tipo:'item' },
        { label:'Despesas Administrativas', val:v('v-dadm'),   pct:v('p-dadm'),   tipo:'grupo' },
        { label:'  Pró-labore sócios',      val:v('v-prolabore'), pct:'',         tipo:'item' },
        { label:'  Contador + software',    val:v('v-contador'),  pct:'',         tipo:'item' },
        { label:'Despesas Gerais',          val:v('v-dger'),   pct:v('p-dger'),   tipo:'grupo' },
        { label:'  Aluguel + Energia + Água', val:v('v-aluguel'), pct:'',         tipo:'item' },
        { label:'  Internet + Segurança + Limpeza', val:v('v-internet'), pct:'', tipo:'item' },
        { label:'Despesas Variáveis',       val:v('v-despvar'),pct:v('p-despvar'),tipo:'grupo' },
        { label:'= Resultado Operacional (EBIT)', val:v('v-ebit'), pct:v('p-ebit'), tipo:'subtotal' },
        { label:'Receitas Financeiras',     val:v('v-rf'),     pct:v('p-rf'),     tipo:'grupo' },
        { label:'Despesas Financeiras',     val:v('v-df'),     pct:v('p-df'),     tipo:'grupo' },
        { label:'= Resultado Financeiro Líq.', val:v('v-resfin'), pct:v('p-resfin'), tipo:'subtotal' },
        { label:'Outras Receitas e Despesas', val:v('v-outras'), pct:v('p-outras'), tipo:'grupo' },
        { label:'= Resultado antes dos Impostos (EBT)', val:v('v-ebt'), pct:v('p-ebt'), tipo:'subtotal' },
        { label:'(−) IRPJ (15%)',           val:v('v-irpj'),   pct:'',            tipo:'ded' },
        { label:'(−) IRPJ adicional (10%)', val:v('v-irpjad'), pct:'',            tipo:'ded' },
        { label:'(−) CSLL (9%)',            val:v('v-csll'),   pct:'',            tipo:'ded' },
        { label:'LUCRO LÍQUIDO DO PERÍODO', val:v('v-ll'),     pct:v('p-ll'),     tipo:'grand' },
      ];

      const parsePct = s => parseFloat((s||'0').replace(',','.').replace('%','').replace('—','0')) || 0;
      const parseVal = s => parseFloat((s||'0').replace(/\./g,'').replace(',','.').replace('—','0').replace(/[^\d.\-]/g,'')) || 0;

      const rows = linhas.map(l => {
        const isNeg  = l.val.startsWith('-');
        const isItem = l.tipo === 'item';
        const isGrand = l.tipo === 'grand';
        const isSub  = l.tipo === 'subtotal' || l.tipo === 'total';
        const isGrupo = l.tipo === 'grupo';
        const displayVal = l.val === '—' && isItem ? '' : l.val;
        const emptyRow = !displayVal && !l.pct;

        let bg = '', fontW = '', border = '', labelColor = '#1a1a1a', valColor = '#1a1a1a', fontSize = '11.5px';
        if (isGrand) {
          bg = isNeg ? '#1a1a1a' : '#1a1a1a';
          fontW = '700'; border = 'border-top: 2.5px solid #000;';
          valColor = labelColor = isNeg ? '#ff4444' : '#00cc66';
          fontSize = '12.5px';
        } else if (isSub) {
          bg = '#f0f0f0'; fontW = '700'; border = 'border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;';
          valColor = isNeg ? '#cc0000' : '#000';
        } else if (isGrupo) {
          bg = '#fafafa'; fontW = '600'; fontSize = '11px';
          valColor = isNeg ? '#cc0000' : '#555';
          labelColor = '#333';
        } else if (isItem) {
          fontSize = '11px'; labelColor = '#555'; valColor = '#444';
        } else {
          valColor = l.tipo === 'ded' ? '#cc0000' : '#222';
        }

        const negBox = isNeg && displayVal && (isSub || isGrand) ?
          `style="display:inline-block;${isGrand ? 'color:#ff4444;' : 'color:#cc0000;'}font-weight:700"` : '';

        return `<tr style="background:${bg};${border}">
          <td style="padding:${isItem?'4px 8px 4px 24px':'5.5px 8px'};font-size:${fontSize};color:${labelColor};font-weight:${fontW||'400'};border-right:1px solid #ddd;text-transform:${isGrand?'uppercase':'none'}">${isGrand ? `<span style="color:${isNeg?'#ff4444':'#00cc66'}">${l.label}</span>` : l.label}</td>
          <td style="padding:5.5px 10px;text-align:right;font-size:${fontSize};color:${isGrand?(isNeg?'#ff4444':'#00cc66'):valColor};font-weight:${fontW||'400'};border-right:1px solid #ddd;font-variant-numeric:tabular-nums;white-space:nowrap">${isGrand && displayVal ? `<span ${negBox}>${displayVal}</span>` : (emptyRow ? '' : displayVal)}</td>
          <td style="padding:5.5px 8px;text-align:right;font-size:10px;color:#888;white-space:nowrap">${l.pct}</td>
        </tr>`;
      }).join('');

      const mbColor  = v('v-mb').startsWith('-')  ? '#DC2626' : '#16a34a';
      const mopColor = v('v-mop').startsWith('-') ? '#DC2626' : '#16a34a';
      const mlColor  = v('v-ml').startsWith('-')  ? '#DC2626' : '#16a34a';

      const parseMargem = s => parseFloat((s||'0').replace(',','.').replace('%','')) || 0;
      const mbNum  = parseMargem(v('v-mb'));
      const mopNum = parseMargem(v('v-mop'));
      const mlNum  = parseMargem(v('v-ml'));
      const rlNum  = parseVal(v('v-rl'));
      const llNum  = parseVal(v('v-ll'));

      const barMb  = Math.min(Math.max(mbNum  / 35 * 100, 0), 100).toFixed(1);
      const barMop = Math.min(Math.max(mopNum / 15 * 100, 0), 100).toFixed(1);
      const barMl  = Math.min(Math.max(mlNum  /  8 * 100, 0), 100).toFixed(1);

      const insightMb  = mbNum >= 35 ? `✓ Margem bruta ${v('v-mb')} — acima do benchmark varejista (25–35%). Excelente controle de custo.`
                       : mbNum >= 25 ? `~ Margem bruta ${v('v-mb')} — dentro do benchmark varejista (25–35%).`
                       : `⚠ Margem bruta ${v('v-mb')} — abaixo do benchmark (25–35%). Revisar política de preços ou CMV.`;
      const insightMop = mopNum >= 5  ? `✓ Resultado operacional ${v('v-mop')} — positivo e acima do benchmark (5–15%). Despesas controladas.`
                       : mopNum >= 0  ? `~ Resultado operacional ${v('v-mop')} — dentro do benchmark mínimo. Despesas merecem atenção.`
                       : `⚠ Resultado operacional ${v('v-mop')} — negativo. Despesas operacionais superam o Lucro Bruto.`;
      const insightLl  = llNum >= 0   ? `✓ Período positivo — R$ ${fmt(llNum)} de Lucro Líquido após tributos.`
                       : `⚠ Período com prejuízo — R$ ${fmt(Math.abs(llNum))} de perda líquida após tributos.`;

      const qrData = encodeURIComponent(`DM Pay|${empresa}|DRE ${periodo}|RL:${v('v-rl')}|LL:${v('v-ll')}`);
      const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}&bgcolor=ffffff&color=0a1628&margin=4`;

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>DRE — ${empresa} — ${periodo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #0a1628; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .watermark { position: fixed; top: 46%; left: 50%; transform: translate(-50%,-50%) rotate(-35deg); font-family: 'JetBrains Mono', monospace; font-size: 88px; font-weight: 800; color: rgba(10,22,40,0.045); letter-spacing: 0.12em; white-space: nowrap; pointer-events: none; z-index: 0; user-select: none; }

  .content { position: relative; z-index: 1; }

  /* ── HEADER PLACA ── */
  .header-placa { background: #0a1628; color: white; padding: 13px 22px 11px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e3a8a; }
  .placa-left { display: flex; align-items: center; gap: 14px; }
  .placa-logo { background: linear-gradient(135deg, #2563EB 0%, #60A5FA 100%); border-radius: 10px; color: #fff; font-weight: 800; font-size: 14px; padding: 8px 13px; letter-spacing: 0.04em; flex-shrink: 0; box-shadow: 0 4px 14px -2px rgba(59,130,246,.45); }
  .placa-sys  { font-size: 8px; font-weight: 500; color: #475569; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 3px; }
  .placa-title { font-size: 17px; font-weight: 800; letter-spacing: 0.02em; color: #f8fafc; text-transform: uppercase; }
  .placa-sub  { font-size: 8.5px; color: #64748b; margin-top: 2px; letter-spacing: 0.04em; }
  .placa-right { text-align: right; }
  .placa-flag  { font-size: 26px; line-height: 1; margin-bottom: 3px; }
  .placa-empresa { font-size: 11.5px; font-weight: 700; color: #e2e8f0; letter-spacing: 0.01em; }
  .placa-periodo { font-size: 9px; color: #64748b; margin-top: 2px; letter-spacing: 0.06em; }
  .placa-badge { display: inline-block; background: #0f2040; border: 1px solid #1e3a8a; color: #60a5fa; font-size: 8px; font-weight: 700; padding: 2px 7px; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 5px; }

  /* ── META BAR ── */
  .meta-bar { background: #f1f5f9; border-bottom: 2px solid #0a1628; padding: 5px 22px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #64748b; letter-spacing: 0.05em; }
  .meta-bar b { color: #0a1628; font-weight: 700; }
  .meta-accent { color: ${mlColor}; font-weight: 700; }

  /* ── BODY ── */
  .body { padding: 14px 22px 14px; }

  /* ── TABLE ── */
  .tbl-wrap { border: 2px solid #0a1628; margin-bottom: 12px; }
  .tbl-head { background: #0a1628; color: #f8fafc; display: grid; grid-template-columns: 1fr 136px 76px; padding: 7px 10px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
  .tbl-head span:not(:first-child) { text-align: right; }
  table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; }

  /* ── MARGENS GRID ── */
  .margens-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
  .mcard { border: 2px solid #0a1628; padding: 10px 12px; }
  .mcard-title { font-size: 8px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
  .mcard-val   { font-size: 22px; font-weight: 800; line-height: 1.1; margin-bottom: 1px; }
  .mcard-bench { font-size: 7.5px; color: #94a3b8; margin-bottom: 7px; }
  .bar-track   { background: #e2e8f0; height: 5px; position: relative; overflow: hidden; }
  .bar-fill    { height: 5px; position: absolute; left: 0; top: 0; transition: width .3s; }
  .bar-labels  { display: flex; justify-content: space-between; margin-top: 3px; }
  .bar-lbl     { font-size: 7px; color: #94a3b8; }

  /* ── INSIGHTS ── */
  .insights { border: 2px solid #0a1628; padding: 9px 14px; margin-bottom: 12px; background: #f8fafc; }
  .insights-title { font-size: 8px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #0a1628; margin-bottom: 7px; padding-bottom: 5px; border-bottom: 1px solid #cbd5e1; }
  .insight-line { font-size: 9px; color: #1e293b; line-height: 1.6; }

  /* ── NOTA ── */
  .nota { font-size: 8px; color: #64748b; border-left: 3px solid #0a1628; padding: 5px 10px; background: #f8fafc; line-height: 1.55; }

  /* ── FOOTER ── */
  .footer-bar { background: #0a1628; color: #475569; padding: 8px 22px; display: flex; justify-content: space-between; align-items: center; font-size: 8px; letter-spacing: 0.06em; border-top: 3px solid #1e3a8a; margin-top: 14px; }
  .footer-engine { color: #3b82f6; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  .footer-right  { display: flex; align-items: center; gap: 14px; }
  .footer-meta   { text-align: right; }
  .qr-box { background: white; padding: 4px; display: inline-block; border: 1px solid #1e3a8a; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .footer-bar { margin-top: 14px; }
  }
</style></head>
<body>
<div class="watermark">DM PAY</div>
<div class="content">

<div class="header-placa">
  <div class="placa-left">
    <div style="display:flex;align-items:center;gap:8px;margin-right:6px">
      <div class="placa-logo">DM</div>
      <div style="font-size:13px;font-weight:800;color:#60a5fa;letter-spacing:0.04em">Pay</div>
    </div>
    <div style="border-left:1px solid #1e3a8a;padding-left:14px">
      <div class="placa-sys">Sistema DM Pay · ERP Integration · iCommerce</div>
      <div class="placa-title">DRE Gerencial</div>
      <div class="placa-sub">Demonstrativo do Resultado do Exercício</div>
    </div>
  </div>
  <div class="placa-right">
    <div class="placa-empresa">${empresa}</div>
    <div class="placa-periodo">${periodo}</div>
    <div class="placa-badge">${modo}</div>
  </div>
</div>

<div class="meta-bar">
  <div>GERADO EM <b>${gerado}</b> &nbsp;·&nbsp; REGIME <b>${modo.toUpperCase()}</b> &nbsp;·&nbsp; FONTE <b>DM PAY ENGINE v2.0</b></div>
  <div>REC. BRUTA <b>${v('v-rb')}</b> &nbsp;·&nbsp; REC. LÍQUIDA <b>${v('v-rl')}</b> &nbsp;·&nbsp; LUC. LÍQUIDO <span class="meta-accent">${v('v-ll')}</span></div>
</div>

<div class="body">

  <div class="tbl-wrap">
    <div class="tbl-head">
      <span>LINHA DO DRE</span><span>VALOR (R$)</span><span>% RL</span>
    </div>
    <table>${rows}</table>
  </div>

  <div class="margens-grid">
    <div class="mcard">
      <div class="mcard-title">Margem Bruta</div>
      <div class="mcard-val" style="color:${mbColor}">${v('v-mb')}</div>
      <div class="mcard-bench">Benchmark 25–35%</div>
      <div class="bar-track"><div class="bar-fill" style="width:${barMb}%;background:${mbColor}"></div></div>
      <div class="bar-labels"><span class="bar-lbl">0%</span><span class="bar-lbl">▲25%</span><span class="bar-lbl">35%</span></div>
    </div>
    <div class="mcard">
      <div class="mcard-title">Margem Operacional</div>
      <div class="mcard-val" style="color:${mopColor}">${v('v-mop')}</div>
      <div class="mcard-bench">Benchmark 5–15%</div>
      <div class="bar-track"><div class="bar-fill" style="width:${barMop}%;background:${mopColor}"></div></div>
      <div class="bar-labels"><span class="bar-lbl">0%</span><span class="bar-lbl">▲5%</span><span class="bar-lbl">15%</span></div>
    </div>
    <div class="mcard">
      <div class="mcard-title">Margem Líquida</div>
      <div class="mcard-val" style="color:${mlColor}">${v('v-ml')}</div>
      <div class="mcard-bench">Benchmark 3–8%</div>
      <div class="bar-track"><div class="bar-fill" style="width:${barMl}%;background:${mlColor}"></div></div>
      <div class="bar-labels"><span class="bar-lbl">0%</span><span class="bar-lbl">▲3%</span><span class="bar-lbl">8%</span></div>
    </div>
  </div>

  ${topFornecedores.length ? `<div class="tbl-wrap" style="margin-bottom:12px">
    <div class="tbl-head" style="grid-template-columns:1fr 130px 76px">
      <span>TOP FORNECEDORES — COMPOSIÇÃO DO CMV</span><span>VALOR (R$)</span><span>% CMV</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-family:'JetBrains Mono',monospace">
      ${topFornecedores.map((f,i) => {
        const pct = rlNum ? (f.val / parseVal(v('v-cmv')) * 100).toFixed(1) : '—';
        const bg  = i % 2 === 0 ? '#fff' : '#f8fafc';
        return `<tr style="background:${bg};border-bottom:1px solid #e2e8f0">
          <td style="padding:5px 10px;font-size:10px;color:#1e293b;border-right:1px solid #e2e8f0"><span style="color:#94a3b8;margin-right:8px;font-size:9px">${String(i+1).padStart(2,'0')}</span>${f.nome}</td>
          <td style="padding:5px 10px;text-align:right;font-size:10px;font-weight:600;color:#0a1628;border-right:1px solid #e2e8f0;font-variant-numeric:tabular-nums">${fmt(f.val)}</td>
          <td style="padding:5px 10px;text-align:right;font-size:9px;color:#64748b">${pct}%</td>
        </tr>`;
      }).join('')}
    </table>
  </div>` : ''}

  <div class="insights">
    <div class="insights-title">// AUTO INSIGHTS — ANÁLISE AUTOMÁTICA DM PAY</div>
    <div class="insight-line">${insightMb}</div>
    <div class="insight-line">${insightMop}</div>
    <div class="insight-line">${insightLl}</div>
  </div>

  <div class="nota">⚠ Deduções fiscais estimadas — confirme alíquotas reais com seu contador. CMV calculado via custo do vendido no PDV (iCommerce). Despesas dependem de categorias cadastradas no DM Pay.</div>

</div>

<div class="footer-bar">
  <span class="footer-engine">⚙ PROCESSADO VIA DM PAY ENGINE v2.0</span>
  <div class="footer-right">
    <div class="footer-meta">
      <div>${empresa} · ${periodo}</div>
      <div style="color:#1e3a8a">dmpayapp.com.br</div>
    </div>
    <div class="qr-box"><img src="${qrUrl}" width="52" height="52" alt="QR DRE"></div>
  </div>
</div>

</div><script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
</body></html>`;

      const win = window.open('', '_blank', 'width=900,height=700');
      win.document.write(html);
      win.document.close();
    });

    await buildMonthSelect();
    await dreLoad();
  }

  window.DMPAY_DRE = { lancarImpostos, drill, showAudit };
  window.drill = (key, title) => window.DMPAY_DRE.drill(key, title);
  window.closeDrill = () => {
    document.getElementById('drawer')?.classList.remove('open');
    document.getElementById('drawerBg')?.classList.remove('open');
  };

  init();
})();
