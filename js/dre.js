// js/dre.js — DRE Gerencial real
(function () {
  // Alíquotas estimadas (Lucro Presumido — ajustar com contador)
  const ICMS = 0.085;
  const PIS  = 0.0165;
  const COF  = 0.076;
  const IRPJ = 0.15;
  const IRPJ_AD_BASE = 20000;
  const CSLL = 0.09;

  const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const MESES_LONGO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  let CID, ANO, MES, MODO = 'competencia';

  const fmt  = v => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pctS = (v,base) => base ? (v/base*100).toFixed(1).replace('.',',')+'%' : '—';
  const dp   = (v,base) => base ? ((v-base)/base*100).toFixed(1).replace('.',',')+'%' : '—';

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

  // ── zero ──────────────────────────────────────────────────────────────────
  function zeroAll() {
    ['v-rb','v-icms','v-pis','v-cofins','v-dev','v-rl',
     'v-cmv','v-lb',
     'v-dv','v-folha','v-maq',
     'v-dadm','v-prolabore','v-contador',
     'v-dger','v-aluguel','v-internet',
     'v-ebit',
     'v-rf','v-descontos','v-rendimento',
     'v-df','v-tarifas','v-juros','v-antecip',
     'v-resfin','v-outras','v-ebt',
     'v-irpj','v-irpjad','v-csll','v-ll'
    ].forEach(id => { set(id,'—',0.4); });
    ['p-rb','p-icms','p-pis','p-cofins','p-dev','p-rl',
     'p-cmv','p-lb','p-dv','p-dadm','p-dger','p-ebit',
     'p-rf','p-df','p-resfin','p-outras','p-ebt','p-ll'
    ].forEach(id => { set(id,'—',0.4); });
  }

  // ── fetch ─────────────────────────────────────────────────────────────────
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
    const { data } = await sb.from('invoices').select('total,supplier_id,nf_number')
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

  // ── render ────────────────────────────────────────────────────────────────
  async function dreLoad() {
    zeroAll();
    set('dre-mes-titulo', `${MESES_LONGO[MES-1]} / ${ANO}`);

    const prev = prevMonth(ANO, MES);
    const [sales, salesAnt, invs, pays] = await Promise.all([
      fetchSales(ANO, MES),
      fetchSales(prev.ano, prev.mes),
      fetchInvoices(ANO, MES),
      fetchPayables(ANO, MES),
    ]);

    const rb    = sales.reduce((s,r) => s + Number(r.amount), 0);
    const rbAnt = salesAnt.reduce((s,r) => s + Number(r.amount), 0);

    // ── Receita Bruta ──
    set('v-rb', fmt(rb), 1); setClass('v-rb','cas-val plus');
    set('p-rb', '—', 1);

    // ── Deduções fiscais estimadas ──
    const icmsV = rb * ICMS;
    const pisV  = rb * PIS;
    const cofV  = rb * COF;
    set('v-icms', fmt(icmsV), 1); set('p-icms', pctS(icmsV,rb)+' est.', 1);
    set('v-pis',  fmt(pisV),  1); set('p-pis',  pctS(pisV,rb)+' est.',  1);
    set('v-cofins',fmt(cofV), 1); set('p-cofins',pctS(cofV,rb)+' est.', 1);
    set('v-dev','—',0.4); set('p-dev','—',0.4);

    // ── Receita Líquida ──
    const rl = rb - icmsV - pisV - cofV;
    set('v-rl', fmt(rl), 1); setClass('v-rl','cas-val total');
    set('p-rl', '100,0%', 1);

    // ── CMV ──
    const cmv = invs.reduce((s,r) => s + Number(r.total||0), 0);
    if (cmv > 0) {
      set('v-cmv', fmt(cmv), 1); setClass('v-cmv','cas-val minus');
      set('p-cmv', pctS(cmv,rl), 1);
    }

    // ── Lucro Bruto ──
    const lb = rl - cmv;
    if (cmv > 0 || true) { // sempre calcula
      set('v-lb', cmv > 0 ? fmt(lb) : fmt(rl)+' *', 1);
      setClass('v-lb', 'cas-val ' + (lb >= 0 ? 'total' : 'minus'));
      set('p-lb', cmv > 0 ? pctS(lb,rl) : '— *', 1);
    }

    // ── Despesas por categoria ──
    const byCat = {};
    pays.forEach(p => {
      const cat = p.expense_categories?.name || 'sem-categoria';
      byCat[cat] = (byCat[cat]||0) + Number(p.amount||0);
    });

    // Agrupamento inteligente por palavras-chave no nome da categoria
    function sumCats(...keywords) {
      return Object.entries(byCat).filter(([k]) =>
        keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
      ).reduce((s,[,v]) => s+v, 0);
    }

    const folha     = sumCats('folha','salário','salario','funcionário','funcionario','trabalhista','holerite');
    const maqTaxas  = sumCats('maquininha','cielo','stone','rede','getnet','taxa','tarifa');
    const prolabore = sumCats('pro-labore','pró-labore','prolabore','sócio','socio','retirada');
    const contador  = sumCats('contador','contabilidade','software','sistema');
    const aluguel   = sumCats('aluguel','energia','água','agua','condomínio','condominio');
    const internet  = sumCats('internet','segurança','seguranca','limpeza','telefone');

    const dvTotal   = folha + maqTaxas;
    const dadmTotal = prolabore + contador;
    const dgerTotal = aluguel + internet;
    const despOp    = dvTotal + dadmTotal + dgerTotal;

    function setDesp(idVal, idPct, v) {
      if (v > 0) {
        set(idVal, fmt(v), 1); setClass(idVal,'cas-val minus');
        if (idPct) set(idPct, pctS(v,rl), 1);
      }
    }

    setDesp('v-dv','p-dv', dvTotal);
    setDesp('v-folha',null, folha);
    setDesp('v-maq',null, maqTaxas);
    setDesp('v-dadm','p-dadm', dadmTotal);
    setDesp('v-prolabore',null, prolabore);
    setDesp('v-contador',null, contador);
    setDesp('v-dger','p-dger', dgerTotal);
    setDesp('v-aluguel',null, aluguel);
    setDesp('v-internet',null, internet);

    // ── EBIT ──
    const ebit = lb - despOp;
    if (despOp > 0 || cmv > 0) {
      const ebitV = cmv > 0 ? ebit : rl - despOp;
      set('v-ebit', fmt(ebitV), 1);
      setClass('v-ebit','cas-val ' + (ebitV >= 0 ? 'total' : 'minus'));
      set('p-ebit', pctS(ebitV,rl), 1);
    }

    // ── Resultado financeiro ── sem dados por ora
    // ficam "—"

    // ── EBT, IRPJ, CSLL, Lucro Líquido ── só se tiver EBIT calculado
    if (despOp > 0 || cmv > 0) {
      const ebitV = cmv > 0 ? ebit : rl - despOp;
      const irpjV   = ebitV > 0 ? ebitV * IRPJ : 0;
      const irpjAdV = ebitV > IRPJ_AD_BASE ? (ebitV - IRPJ_AD_BASE) * 0.10 : 0;
      const csllV   = ebitV > 0 ? ebitV * CSLL : 0;
      const ll      = ebitV - irpjV - irpjAdV - csllV;

      set('v-ebt', fmt(ebitV), 1); setClass('v-ebt','cas-val total');
      set('p-ebt', pctS(ebitV,rl), 1);
      set('v-irpj', fmt(irpjV), 1);
      set('v-irpjad', fmt(irpjAdV), 1);
      set('v-csll', fmt(csllV), 1);
      set('v-ll', fmt(ll), 1); setClass('v-ll','cas-val grand');
      set('p-ll', pctS(ll,rl) + (cmv === 0 ? ' *' : ''), 1);

      // ── Margens ──
      if (rl > 0) {
        const lbCalc = cmv > 0 ? lb : rl;
        setMargemVal('v-mb', lbCalc/rl, 0.25, 0.35);
        setMargemVal('v-mop', ebitV/rl, 0.05, 0.15);
        setMargemVal('v-ml', ll/rl, 0.03, 0.08);
      }
    } else if (rl > 0) {
      // Só Receita Líquida disponível
      setMargemVal('v-mb', rl/rb, 0.15, 0.25);
    }

    // ── Vs mês anterior ──
    if (rbAnt > 0) {
      const dRb  = (rb - rbAnt) / rbAnt;
      const dRbA = rb - rbAnt;
      set('delta-rb-p', (dRb >= 0 ? '+' : '') + (dRb*100).toFixed(1).replace('.',',') + '%', 1);
      set('delta-rb-a', (dRbA >= 0 ? '+' : '') + 'R$ ' + fmt(Math.abs(dRbA)), 1);
      const cls = dRb >= 0 ? 'margem-val good' : 'margem-val bad';
      if ($v('delta-rb-p')) $v('delta-rb-p').className = cls;
    }

    // ── Disclaimer ──
    const disc = document.querySelector('.disclaimer div');
    if (disc) {
      const cmvNote = cmv > 0
        ? `CMV de NF-e importadas: <b>R$ ${fmt(cmv)}</b>.`
        : 'CMV: <b>—</b> (importe NF-e de compras para calcular).';
      const catNote = despOp > 0 ? '' : ' <b>Despesas operacionais</b>: configure categorias em <a href="categorias.html" style="color:var(--warn)">Categorias</a> para aparecerem aqui.';
      disc.innerHTML = `<b>Dados reais onde disponível.</b> Deduções fiscais (ICMS/PIS/COFINS) são <b>estimadas</b> — confirme alíquotas com seu contador. ${cmvNote}${catNote}`;
    }

    // ── Chart ──
    await renderChart();
  }

  // ── Chart ────────────────────────────────────────────────────────────────
  let dreChart;
  async function renderChart() {
    const { data: allSales } = await sb.from('daily_sales').select('sale_date,amount')
      .eq('company_id', CID).order('sale_date', { ascending: true }).limit(5000);

    const { data: allInvs } = await sb.from('invoices').select('issue_date,total')
      .eq('company_id', CID).order('issue_date', { ascending: true });

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
    const rlData = rbData.map(v => Math.round(v * (1 - ICMS - PIS - COF)));
    const lbData = keys.map((k,i) => {
      const cmvK = invByMes[k]||0;
      if (!cmvK) return null;
      return Math.round((rlData[i]*1000 - cmvK)/1000);
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tColor = isDark ? '#9CA3AF' : '#6B7280';
    const gColor = isDark ? '#222832' : '#E5E7EB';
    const accent  = isDark ? '#3B82F6' : '#2563EB';
    const warn    = isDark ? '#FBBF24' : '#D97706';
    const success = '#10B981';

    if (dreChart) dreChart.destroy();
    dreChart = new Chart(document.getElementById('dreChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Receita Bruta', data:rbData, borderColor:accent, backgroundColor:'transparent', tension:0.35, borderWidth:2.5, pointRadius:3, pointHoverRadius:6, pointBackgroundColor:accent },
          { label:'Receita Líquida', data:rlData, borderColor:warn, backgroundColor:'transparent', tension:0.35, borderWidth:2, pointRadius:2, pointHoverRadius:5, pointBackgroundColor:warn, borderDash:[4,3] },
          { label:'Lucro Bruto', data:lbData, borderColor:success, backgroundColor:'transparent', tension:0.35, borderWidth:2, pointRadius:2, pointHoverRadius:5, pointBackgroundColor:success }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ display:false },
          tooltip:{
            backgroundColor: isDark ? '#1A1F27' : '#111827', titleColor:'#F3F4F6', bodyColor:'#F3F4F6', padding:10,
            callbacks:{ label: ctx => ctx.dataset.label + ': R$ ' + (ctx.parsed.y != null ? ctx.parsed.y.toLocaleString('pt-BR') + 'k' : '—') }
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
    const { data } = await sb.from('daily_sales').select('sale_date')
      .eq('company_id', CID).order('sale_date',{ascending:false}).limit(500);

    const set_ = new Set();
    (data||[]).forEach(r => {
      const d = new Date(r.sale_date+'T12:00:00');
      set_.add(`${d.getFullYear()}-${d.getMonth()+1}`);
    });
    const now = new Date();
    set_.add(`${now.getFullYear()}-${now.getMonth()+1}`);

    const meses = Array.from(set_).sort((a,b)=>b.localeCompare(a));
    const sel = document.getElementById('dre-mes-sel');
    if (!sel) return;
    sel.innerHTML = '';
    meses.forEach((m,i) => {
      const [a,ms] = m.split('-').map(Number);
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${MESES_LONGO[ms-1]} / ${a}`;
      if (i===0) { opt.selected=true; ANO=a; MES=ms; }
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      const [a,m] = sel.value.split('-').map(Number);
      ANO=a; MES=m; dreLoad();
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

    document.querySelector('.btn[data-action="exportar"]')?.addEventListener('click', () => {
      alert('Exportar PDF: em construção. Os dados reais já estão na tela para copiar.');
    });

    await buildMonthSelect();
    await dreLoad();
  }

  init();
})();
