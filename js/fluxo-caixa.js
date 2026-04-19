// DM Pay — Fluxo de caixa com dados reais (payables + receivables)
(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);
  let DIAS_FUTURO = 30;  // projeção pra frente
  let DIAS_PASSADO = 15; // histórico pra trás
  let SALDO_INICIAL = 0;
  let PAGS = [];
  let RECS = [];
  let SALES = [];        // daily_sales histórico (entrada real)
  let SANG = [];         // cash_withdrawals (saída real)
  let CHART = null;

  function fmtBRL(v){ const s = Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); return (v < 0 ? '-' : '') + 'R$ ' + s.replace('-',''); }
  function fmtBRLshort(v){ return 'R$ ' + Math.round(Number(v||0)).toLocaleString('pt-BR'); }
  function brDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; }
  function isoDay(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
  function addDays(base, n){ const d = new Date(base); d.setDate(d.getDate() + n); return d; }
  function sameDay(a, b){ return isoDay(a) === isoDay(b); }

  async function load() {
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const fim = isoDay(addDays(HOJE, DIAS_FUTURO));
    const inicio = isoDay(addDays(HOJE, -DIAS_PASSADO));

    const [pags, recs, sales, sang] = await Promise.all([
      sb.from('payables').select('amount, due_date, paid_at, status, description, suppliers(legal_name)').eq('company_id', COMPANY_ID).gte('due_date', inicio).lte('due_date', fim).limit(5000),
      sb.from('receivables').select('amount, due_date, received_at, status, description, customers(name)').eq('company_id', COMPANY_ID).gte('due_date', inicio).lte('due_date', fim).limit(5000),
      sb.from('daily_sales').select('sale_date, payment_method, amount').eq('company_id', COMPANY_ID).gte('sale_date', inicio).limit(2000),
      sb.from('cash_withdrawals').select('withdrawal_date, amount').eq('company_id', COMPANY_ID).gte('withdrawal_date', inicio).limit(500)
    ]);
    PAGS = pags.data || [];
    RECS = recs.data || [];
    SALES = sales.data || [];
    SANG = sang.data || [];

    const saldoStored = localStorage.getItem('dmpay-saldo-' + COMPANY_ID);
    SALDO_INICIAL = saldoStored ? parseFloat(saldoStored) : 0;
  }

  function buildSeries() {
    // Série: DIAS_PASSADO atrás até DIAS_FUTURO à frente
    // Passado (< HOJE): realizado (daily_sales + receivables recebidas − sangrias − payables pagos)
    // Futuro (>= HOJE): projeção (receivables por due_date − payables por due_date)
    const labels = [];
    const series = [];
    let saldo = SALDO_INICIAL;
    for (let i = -DIAS_PASSADO; i <= DIAS_FUTURO; i++) {
      const dia = addDays(HOJE, i);
      const diaIso = isoDay(dia);
      const isPassado = i < 0;

      let entrada = 0, saida = 0;
      if (isPassado) {
        // Realizado
        entrada += SALES.filter(s => s.sale_date === diaIso).reduce((a,s) => a + Number(s.amount), 0);
        entrada += RECS.filter(r => r.status === 'received' && (r.received_at||'').slice(0,10) === diaIso).reduce((a,r) => a + Number(r.amount), 0);
        saida += SANG.filter(w => w.withdrawal_date === diaIso).reduce((a,w) => a + Number(w.amount), 0);
        saida += PAGS.filter(p => p.status === 'paid' && (p.paid_at||'').slice(0,10) === diaIso).reduce((a,p) => a + Number(p.amount), 0);
      } else {
        // Projeção
        entrada = RECS.filter(r => r.due_date === diaIso && r.status !== 'cancelled' && r.status !== 'received').reduce((a,r) => a + Number(r.amount), 0);
        saida = PAGS.filter(p => p.due_date === diaIso && p.status !== 'cancelled' && p.status !== 'paid').reduce((a,p) => a + Number(p.amount), 0);
      }

      saldo = saldo + entrada - saida;
      labels.push(dia.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }));
      series.push({ dia, diaIso, entrada, saida, saldo, criticoNeg: saldo < 0, isPassado });
    }
    return { labels, series };
  }

  function render() {
    const { labels, series } = buildSeries();
    drawChart(labels, series);
    drawTable(series);
    drawKPIs(series);
    drawCriticos(series);
  }

  function drawChart(labels, series) {
    const ctx = document.getElementById('fluxoChart');
    if (!ctx) return;
    if (CHART) CHART.destroy();
    // Também destrói chart criado pelo script inline do HTML
    const existing = Chart.getChart(ctx);
    if (existing) existing.destroy();
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue('--text-muted').trim();
    const grid = css.getPropertyValue('--border').trim();
    const accent = css.getPropertyValue('--accent').trim();
    const danger = css.getPropertyValue('--danger').trim();
    const saldoData = series.map(s => s.saldo);
    const pointColors = series.map(s => s.criticoNeg ? danger : accent);

    CHART = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo projetado',
          data: saldoData,
          borderColor: accent,
          backgroundColor: 'transparent',
          tension: 0.25,
          pointBackgroundColor: pointColors,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => fmtBRL(c.parsed.y) } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: text, font: { size: 10.5 }, autoSkip: true, maxRotation: 0 } },
          y: { grid: { color: grid }, border: { display: false }, ticks: { color: text, font: { size: 10.5 }, callback: v => 'R$ ' + Math.round(v/1000) + 'k' } }
        }
      }
    });
  }

  function drawTable(series) {
    const tb = document.getElementById('flowBody');
    if (!tb) return;
    tb.innerHTML = series.map(s => {
      const isHoje = sameDay(s.dia, HOJE);
      const isWk = s.dia.getDay() === 0 || s.dia.getDay() === 6;
      const trCls = (isHoje ? 'today ' : '') + (isWk ? 'weekend ' : '') + (s.criticoNeg ? 'critical ' : '');
      const tag = isHoje ? '<span class="tag-hoje">HOJE</span>' : (s.criticoNeg ? '<span class="tag-critico">CRÍTICO</span>' : '');
      return `
        <tr class="${trCls.trim()}">
          <td>${s.dia.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' })} ${tag}</td>
          <td class="num pos">${s.entrada > 0 ? fmtBRL(s.entrada) : '—'}</td>
          <td class="num neg">${s.saida > 0 ? fmtBRL(-s.saida) : '—'}</td>
          <td class="num saldo ${s.criticoNeg ? 'neg' : ''}">${fmtBRL(s.saldo)}</td>
        </tr>`;
    }).join('');
  }

  function drawKPIs(series) {
    const ks = document.querySelectorAll('.kpi-value');
    // HOJE está em series[DIAS_PASSADO] (se i=-15...30, HOJE está em índice 15)
    const idxHoje = series.findIndex(s => sameDay(s.dia, HOJE));
    const saldoHoje = idxHoje >= 0 ? series[idxHoje].saldo : SALDO_INICIAL;
    const saldoFinal = series[series.length-1]?.saldo ?? saldoHoje;
    const futuro = series.filter(s => !s.isPassado);
    const piorDia = futuro.reduce((min, s) => s.saldo < min.saldo ? s : min, futuro[0] || { saldo: 0, dia: HOJE });
    const diasComMargemBaixa = futuro.filter(s => s.saldo < 5000).length;

    if (ks[0]) ks[0].textContent = fmtBRLshort(saldoHoje);
    if (ks[1]) ks[1].textContent = fmtBRLshort(saldoFinal);
    if (ks[2]) ks[2].textContent = (piorDia.saldo < 0 ? '−' : '') + fmtBRLshort(Math.abs(piorDia.saldo));
    if (ks[3]) ks[3].textContent = diasComMargemBaixa;

    const subs = document.querySelectorAll('.kpi-sub');
    if (subs[0]) subs[0].innerHTML = `Inicial: <b>${fmtBRLshort(SALDO_INICIAL)}</b> · <a href="#" onclick="DMPAY_FX.editSaldo();return false" style="color:var(--accent);font-size:11px">editar</a>`;
    if (subs[1]) subs[1].innerHTML = `em ${DIAS_FUTURO} dias`;
    if (subs[2]) subs[2].innerHTML = piorDia.saldo < 0 ? `<b style="color:var(--danger)">${piorDia.dia.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</b>` : 'sem dias negativos';
    if (subs[3]) subs[3].innerHTML = `saldo abaixo de R$ 5k`;
  }

  function drawCriticos(series) {
    const lista = document.getElementById('criticosList');
    if (!lista) return;
    const criticos = series.filter(s => s.criticoNeg && !s.isPassado).slice(0, 5);
    if (criticos.length === 0) {
      lista.innerHTML = `<div style="padding:18px;color:var(--text-muted);font-size:12.5px;text-align:center">Nenhum dia crítico nos próximos ${DIAS_FUTURO} dias 🎉</div>`;
      return;
    }
    lista.innerHTML = criticos.map(s => `
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600;font-size:13px">${s.dia.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'long'})}</div>
          <div style="font-size:11.5px;color:var(--text-muted)">saída ${fmtBRL(s.saida)} · entrada ${fmtBRL(s.entrada)}</div>
        </div>
        <div style="font-family:'Geist Mono',monospace;font-weight:700;color:var(--danger)">${fmtBRL(s.saldo)}</div>
      </div>`).join('');
  }

  function editSaldo() {
    const v = prompt('Saldo bancário inicial (R$):', SALDO_INICIAL);
    if (v === null) return;
    const n = parseFloat(String(v).replace(',','.'));
    if (isNaN(n)) return;
    SALDO_INICIAL = n;
    localStorage.setItem('dmpay-saldo-' + window.DMPAY_COMPANY.id, n);
    render();
  }

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    await load(); render();
  }

  window.DMPAY_FX = { editSaldo: editSaldo, refresh: () => load().then(render) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
