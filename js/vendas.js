// DM Pay — Vendas com dados reais (daily_sales)
(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);
  const MES = HOJE.getMonth();
  const ANO = HOJE.getFullYear();
  const MES_NUM = MES + 1;

  function fmtBRL(v){ return 'R$ ' + Math.round(Number(v||0)).toLocaleString('pt-BR'); }
  function fmtBRLfull(v){ return Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function diasNoMes(y,m){ return new Date(y, m+1, 0).getDate(); }

  async function init() {
    if (!window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    const COMPANY_ID = window.DMPAY_COMPANY.id;

    const inicioMes = `${ANO}-${String(MES_NUM).padStart(2,'0')}-01`;
    const inicioAnoPassado = `${ANO-1}-01-01`;

    // Pega vendas do mês atual + ano passado inteiro (pro comparativo)
    const { data: sales, error } = await sb.from('daily_sales')
      .select('sale_date, payment_method, amount')
      .eq('company_id', COMPANY_ID)
      .gte('sale_date', inicioAnoPassado)
      .limit(10000);
    if (error) { console.error('vendas sales error', error); return; }

    if (!sales || sales.length === 0) return; // mantém mock

    // Agrega por dia (total líquido = soma de tudo incluindo troco negativo)
    const porDia = {};
    const porDiaForma = {};
    sales.forEach(s => {
      const d = s.sale_date;
      porDia[d] = (porDia[d] || 0) + Number(s.amount);
      if (!porDiaForma[d]) porDiaForma[d] = {};
      porDiaForma[d][s.payment_method] = (porDiaForma[d][s.payment_method] || 0) + Number(s.amount);
    });

    // === KPIs ===
    const mesAtual = Object.keys(porDia).filter(d => d >= inicioMes);
    const totalMes = mesAtual.reduce((s,d) => s + porDia[d], 0);
    const diasComVenda = mesAtual.length;

    // Mês anterior do ano passado (mesmo mês)
    const inicioMesPassado = `${ANO-1}-${String(MES_NUM).padStart(2,'0')}-01`;
    const fimMesPassado = `${ANO-1}-${String(MES_NUM).padStart(2,'0')}-${String(diasNoMes(ANO-1, MES)).padStart(2,'0')}`;
    const mesAnoPassado = Object.keys(porDia).filter(d => d >= inicioMesPassado && d <= fimMesPassado);
    const totalMesPassado = mesAnoPassado.reduce((s,d) => s + porDia[d], 0);
    const deltaPct = totalMesPassado > 0 ? ((totalMes/totalMesPassado - 1) * 100).toFixed(1) : 0;

    // Projeção mês: média * dias totais
    const mediaDia = diasComVenda > 0 ? totalMes / diasComVenda : 0;
    const projecaoMes = mediaDia * diasNoMes(ANO, MES);

    // Melhor dia
    let melhorDia = null, melhorVal = 0;
    mesAtual.forEach(d => { if (porDia[d] > melhorVal) { melhorVal = porDia[d]; melhorDia = d; } });

    const kpis = document.querySelectorAll('.kpi-value');
    if (kpis[0]) kpis[0].textContent = fmtBRL(totalMes);
    if (kpis[1]) kpis[1].textContent = fmtBRL(projecaoMes);
    if (kpis[3]) kpis[3].textContent = fmtBRL(melhorVal);

    const subs = document.querySelectorAll('.kpi-sub');
    if (subs[0]) subs[0].innerHTML = `${diasComVenda} dia${diasComVenda!==1?'s':''}${totalMesPassado > 0 ? ` · <span class="${deltaPct>=0?'up':'down'}">${deltaPct>=0?'+':''}${deltaPct}% vs ${MES_NUM.toString().padStart(2,'0')}/${(ANO-1).toString().slice(2)}</span>` : ''}`;
    if (subs[1]) subs[1].innerHTML = `baseado em média de ${fmtBRL(mediaDia)}/dia`;
    if (subs[2]) subs[2].innerHTML = `ticket médio exige cupons · <a href="#" onclick="return false" style="color:var(--text-soft)">em breve</a>`;
    if (kpis[2]) kpis[2].textContent = '—';
    if (subs[3] && melhorDia) {
      const dtM = new Date(melhorDia + 'T00:00:00');
      const diaSem = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][dtM.getDay()];
      subs[3].textContent = `${diaSem} ${dtM.getDate()}/${String(MES_NUM).padStart(2,'0')}`;
    }

    // === Formas de pagamento — último dia com venda ===
    const ultimoDia = mesAtual.sort().pop();
    if (ultimoDia) {
      const formas = porDiaForma[ultimoDia] || {};
      const totalDia = porDia[ultimoDia];
      const mapClasse = { dinheiro:'dinheiro', credito:'credito', debito:'debito', pix:'pix', a_prazo:'fiado' };
      const labelsMap = { dinheiro:'Dinheiro', credito:'Crédito', debito:'Débito', pix:'PIX', a_prazo:'Fiado (a prazo)' };
      const rows = document.querySelectorAll('.pay-card .pay-row');
      ['dinheiro','credito','debito','pix','a_prazo'].forEach((k, i) => {
        if (!rows[i]) return;
        const v = formas[k] || 0;
        const pct = totalDia > 0 ? (v/totalDia * 100) : 0;
        const valMain = rows[i].querySelector('.pay-val-main');
        const valPct = rows[i].querySelector('.pay-val-pct');
        const barFill = rows[i].querySelector('.pay-bar-fill');
        if (valMain) valMain.textContent = 'R$ ' + fmtBRLfull(v);
        if (valPct) valPct.textContent = pct.toFixed(1) + '%';
        if (barFill) barFill.style.width = Math.max(pct, 0) + '%';
      });
      const totalBox = document.querySelector('.pay-card .pay-total');
      if (totalBox) {
        const [y,m,d] = ultimoDia.split('-');
        totalBox.querySelector('span:first-child').textContent = `Total · ${d}/${m}`;
        totalBox.querySelector('.pay-total-val').textContent = 'R$ ' + fmtBRLfull(totalDia);
      }
      // Atualiza título do card pra refletir o dia exibido
      const payTitle = document.querySelector('.pay-card h3');
      if (payTitle) {
        const firstText = payTitle.childNodes[0];
        if (firstText) firstText.textContent = ' Formas de pagamento — ';
      }
    }

    // === Heatmap do mês atual com dados reais ===
    const hmGrid = document.getElementById('hmGrid');
    if (hmGrid) {
      hmGrid.innerHTML = '';
      const primeiroDow = new Date(ANO, MES, 1).getDay();
      for (let i = 0; i < primeiroDow; i++) {
        const c = document.createElement('div'); c.className = 'hm-cell empty'; hmGrid.appendChild(c);
      }
      const maxVal = Math.max(...mesAtual.map(d => porDia[d]), 1);
      const totDias = diasNoMes(ANO, MES);
      for (let d = 1; d <= totDias; d++) {
        const iso = `${ANO}-${String(MES_NUM).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const val = porDia[iso];
        const cell = document.createElement('div');
        cell.className = 'hm-cell';
        if (iso === HOJE.toISOString().slice(0,10)) cell.classList.add('today');
        if (!val) cell.classList.add('future');
        if (val) {
          const intensity = val/maxVal;
          let bg, opacity;
          if (intensity < 0.55) { bg='var(--accent-soft)'; opacity=0.35+intensity; }
          else if (intensity < 0.75) { bg='var(--accent)'; opacity=0.5+(intensity-0.55); }
          else { bg='var(--accent)'; opacity=0.75+(intensity-0.75); }
          cell.style.background = bg;
          cell.style.opacity = Math.min(opacity,1);
          cell.style.color = intensity > 0.7 ? 'white' : 'var(--text)';
        }
        cell.innerHTML = `<div class="hm-num">${String(d).padStart(2,'0')}</div>` + (val ? `<div class="hm-val">${(val/1000).toFixed(1)}k</div>` : '');
        hmGrid.appendChild(cell);
      }
    }

    // === Tabela últimos 15 fechamentos ===
    const tbody = document.getElementById('recordsTable');
    if (tbody) {
      tbody.innerHTML = '';
      const ordenados = Object.keys(porDia).sort().reverse().slice(0, 15);
      const diasSem = ['dom','seg','ter','qua','qui','sex','sáb'];
      ordenados.forEach(iso => {
        const [y,m,d] = iso.split('-');
        const dt = new Date(iso + 'T00:00:00');
        const f = porDiaForma[iso] || {};
        const total = porDia[iso];
        const dinh = f.dinheiro || 0;
        const cred = f.credito || 0;
        const deb = f.debito || 0;
        const pix = f.pix || 0;
        const fiado = f.a_prazo || 0;
        // mix percentuais
        const base = dinh + cred + deb + pix + fiado;
        const mixPct = v => base > 0 ? (v/base*100).toFixed(1) : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <div class="date-cell">${d}/${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][parseInt(m)-1]}</div>
            <div class="date-day">${diasSem[dt.getDay()]}</div>
          </td>
          <td class="ctr"><span class="status-pill fechado"><span class="status-pill-dot"></span>Fechado</span></td>
          <td>
            <div class="pay-mix">
              <div class="pay-mix-seg dinheiro" style="flex:${mixPct(dinh)}"></div>
              <div class="pay-mix-seg credito" style="flex:${mixPct(cred)}"></div>
              <div class="pay-mix-seg debito" style="flex:${mixPct(deb)}"></div>
              <div class="pay-mix-seg pix" style="flex:${mixPct(pix)}"></div>
              <div class="pay-mix-seg fiado" style="flex:${mixPct(fiado)}"></div>
            </div>
          </td>
          <td class="num">${fmtBRLfull(dinh)}</td>
          <td class="num">${fmtBRLfull(cred)}</td>
          <td class="num">${fmtBRLfull(deb)}</td>
          <td class="num">${fmtBRLfull(pix)}</td>
          <td class="num" style="color:var(--accent)"><b>${fmtBRLfull(total)}</b></td>`;
        tbody.appendChild(tr);
      });
    }

    // === Chart mês atual × mês ano passado ===
    const canvas = document.getElementById('salesChart');
    if (canvas && typeof Chart !== 'undefined') {
      // Destroy existing chart
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#9CA3AF' : '#6B7280';
      const gridColor = isDark ? '#222832' : '#E5E7EB';
      const accent = isDark ? '#3B82F6' : '#2563EB';
      const accentSoft = isDark ? 'rgba(59,130,246,.2)' : 'rgba(37,99,235,.12)';
      const muted = isDark ? 'rgba(156,163,175,.4)' : 'rgba(156,163,175,.6)';

      const totDias = diasNoMes(ANO, MES);
      const labels = [], dAtual = [], dPassado = [];
      for (let d = 1; d <= totDias; d++) {
        labels.push(String(d).padStart(2,'0'));
        const isoA = `${ANO}-${String(MES_NUM).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isoP = `${ANO-1}-${String(MES_NUM).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        dAtual.push(porDia[isoA] || null);
        dPassado.push(porDia[isoP] || null);
      }
      new Chart(canvas, {
        type:'line',
        data:{
          labels,
          datasets:[
            {label:'Ano passado', data:dPassado, borderColor:muted, backgroundColor:'transparent', tension:0.35, borderDash:[4,3], borderWidth:1.5, pointRadius:0},
            {label:'Este mês', data:dAtual, borderColor:accent, backgroundColor:accentSoft, fill:true, tension:0.35, borderWidth:2.5, pointBackgroundColor:accent, pointRadius:2.5, pointHoverRadius:6}
          ]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          interaction:{mode:'index',intersect:false},
          plugins:{
            legend:{display:false},
            tooltip:{ backgroundColor:isDark?'#1A1F27':'#111827', titleColor:'#F3F4F6', bodyColor:'#F3F4F6', padding:10,
              callbacks:{ label: ctx => ctx.dataset.label + ': R$ ' + (ctx.parsed.y || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) } }
          },
          scales:{
            x:{grid:{display:false}, ticks:{color:textColor, font:{family:'Geist Mono', size:10}, maxTicksLimit:15}},
            y:{grid:{color:gridColor}, ticks:{color:textColor, font:{family:'Geist Mono', size:10}, callback: v => 'R$ '+(v/1000)+'k'}}
          }
        }
      });
    }

    // Banner sync: atualiza última sincronização
    const syncTitle = document.querySelector('.sync-title b');
    if (syncTitle) syncTitle.textContent = `Sincronizado com iCommerce`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
