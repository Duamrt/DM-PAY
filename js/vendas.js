// DM Pay — Vendas com dados reais (daily_sales)
(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);
  let MES = HOJE.getMonth();
  let ANO = HOJE.getFullYear();
  let MES_NUM = MES + 1;
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function fmtBRL(v){ return 'R$ ' + Math.round(Number(v||0)).toLocaleString('pt-BR'); }
  function fmtBRLfull(v){ return Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function diasNoMes(y,m){ return new Date(y, m+1, 0).getDate(); }

  async function nav(delta) {
    MES += delta;
    if (MES < 0) { MES = 11; ANO--; }
    else if (MES > 11) { MES = 0; ANO++; }
    MES_NUM = MES + 1;
    await init();
  }
  function navHoje() {
    MES = HOJE.getMonth(); ANO = HOJE.getFullYear(); MES_NUM = MES + 1;
    init();
  }
  // Cache do último fechamento pra drawer
  let _ultimoFiadoItens = [];
  let _ultimoSangriaItens = [];
  let _ultimaDataFechamento = null;
  // Cache pra navegação de data
  let _COMPANY_ID = null;
  let _porDia = {};
  let _porDiaForma = {};
  let _diasOrdenados = []; // ISO, ordem crescente, só dias com venda

  function renderFormasPagamento(dataIso) {
    if (!dataIso) return;
    const formas = _porDiaForma[dataIso] || {};
    const totalDia = _porDia[dataIso] || 0;
    const troco = Number(formas.troco || 0);
    const valoresBrutos = {
      dinheiro: Number(formas.dinheiro || 0),
      credito: Number(formas.credito || 0),
      debito: Number(formas.debito || 0),
      pix: Number(formas.pix || 0),
      a_prazo: Number(formas.a_prazo || 0)
    };
    const rows = document.querySelectorAll('.pay-card .pay-row');
    ['dinheiro','credito','debito','pix','a_prazo'].forEach((k, i) => {
      if (!rows[i]) return;
      const v = valoresBrutos[k];
      const pct = totalDia > 0 ? (v/totalDia * 100) : 0;
      const valMain = rows[i].querySelector('.pay-val-main');
      const valPct = rows[i].querySelector('.pay-val-pct');
      const barFill = rows[i].querySelector('.pay-bar-fill');
      if (valMain) valMain.textContent = 'R$ ' + fmtBRLfull(v);
      if (valPct) valPct.textContent = pct.toFixed(1) + '%';
      if (barFill) barFill.style.width = Math.max(pct, 0) + '%';
      if (k === 'dinheiro') {
        const nameEl = rows[i].querySelector('.pay-name');
        if (nameEl) nameEl.textContent = 'Dinheiro';
      }
    });
    const trocoRow = document.getElementById('pay-row-troco');
    if (trocoRow) {
      if (troco < 0) {
        trocoRow.style.display = '';
        const pct = totalDia > 0 ? (troco/totalDia * 100) : 0;
        const valMain = trocoRow.querySelector('.pay-val-main');
        const valPct = trocoRow.querySelector('.pay-val-pct');
        const barFill = trocoRow.querySelector('.pay-bar-fill');
        if (valMain) valMain.textContent = '− R$ ' + fmtBRLfull(-troco);
        if (valPct) valPct.textContent = pct.toFixed(1) + '%';
        if (barFill) barFill.style.width = Math.abs(pct) + '%';
      } else {
        trocoRow.style.display = 'none';
      }
    }
    const totalBox = document.querySelector('.pay-card .pay-total');
    if (totalBox) {
      const [y,m,d] = dataIso.split('-');
      totalBox.querySelector('span:first-child').textContent = `Total · ${d}/${m}`;
      totalBox.querySelector('.pay-total-val').textContent = 'R$ ' + fmtBRLfull(totalDia);
    }
  }

  function abrirDrawer(titulo, sub, itens, totalStr) {
    const bg = document.getElementById('drawer-bg');
    const dr = document.getElementById('drawer');
    const tt = document.getElementById('drawer-title');
    const ss = document.getElementById('drawer-sub');
    const bd = document.getElementById('drawer-body');
    const tot = document.getElementById('drawer-total');
    if (!bg || !dr || !bd) return;
    tt.textContent = titulo;
    ss.textContent = sub;
    tot.textContent = totalStr;
    if (!itens.length) {
      bd.innerHTML = '<div class="drawer-empty">Sem registros nesse dia.</div>';
    } else {
      bd.innerHTML = itens.map(it => `
        <div class="drawer-row">
          <div>
            <div class="drawer-row-name">${it.nome}</div>
            <div class="drawer-row-meta">${it.meta}</div>
          </div>
          <div class="drawer-row-val">R$ ${fmtBRLfull(it.valor)}</div>
        </div>
      `).join('');
    }
    bg.classList.add('open');
    dr.classList.add('open');
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function fecharDrawer() {
    document.getElementById('drawer-bg')?.classList.remove('open');
    document.getElementById('drawer')?.classList.remove('open');
  }

  function abrirFiado() {
    const dt = _ultimaDataFechamento ? _ultimaDataFechamento.split('-').reverse().join('/') : '';
    const total = _ultimoFiadoItens.reduce((s,i)=>s+Number(i.valor||0),0);
    abrirDrawer(
      'Clientes que quitaram fiado',
      `${_ultimoFiadoItens.length} cliente${_ultimoFiadoItens.length!==1?'s':''} quitou${_ultimoFiadoItens.length!==1?'ram':''} fiado em ${dt}`,
      _ultimoFiadoItens,
      'R$ ' + fmtBRLfull(total)
    );
  }

  function abrirSangria() {
    const dt = _ultimaDataFechamento ? _ultimaDataFechamento.split('-').reverse().join('/') : '';
    const total = _ultimoSangriaItens.reduce((s,i)=>s+Number(i.valor||0),0);
    abrirDrawer(
      'Sangrias do dia',
      `${_ultimoSangriaItens.length} retirada${_ultimoSangriaItens.length!==1?'s':''} em ${dt}`,
      _ultimoSangriaItens,
      'R$ ' + fmtBRLfull(total)
    );
  }

  async function selectarData(iso) {
    if (!iso || !_COMPANY_ID) return;
    renderFormasPagamento(iso);
    await carregarFechamentoDia(_COMPANY_ID, iso, _porDia[iso] || 0);
    if (window.DMPAY_CAIXAS) window.DMPAY_CAIXAS.carregar(iso);
    // destaca cell do heatmap
    document.querySelectorAll('.hm-cell.selected').forEach(c => c.classList.remove('selected'));
    const cell = document.querySelector(`.hm-cell[data-iso="${iso}"]`);
    if (cell) cell.classList.add('selected');
  }

  function onPickDate(iso) {
    if (iso) selectarData(iso);
  }

  function prevDia() {
    if (!_ultimaDataFechamento || !_diasOrdenados.length) return;
    const idx = _diasOrdenados.indexOf(_ultimaDataFechamento);
    // se data atual não está na lista, pega o imediato anterior
    if (idx < 0) {
      const menor = _diasOrdenados.filter(d => d < _ultimaDataFechamento).pop();
      if (menor) selectarData(menor);
      return;
    }
    if (idx > 0) selectarData(_diasOrdenados[idx - 1]);
  }

  function nextDia() {
    if (!_ultimaDataFechamento || !_diasOrdenados.length) return;
    const idx = _diasOrdenados.indexOf(_ultimaDataFechamento);
    if (idx < 0) {
      const maior = _diasOrdenados.find(d => d > _ultimaDataFechamento);
      if (maior) selectarData(maior);
      return;
    }
    if (idx >= 0 && idx < _diasOrdenados.length - 1) selectarData(_diasOrdenados[idx + 1]);
  }

  window.DMPAY_VENDAS = { nav, navHoje, abrirFiado, abrirSangria, fecharDrawer, selectarData, prevDia, nextDia, onPickDate };

  async function init() {
    if (!window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    _COMPANY_ID = COMPANY_ID;
    const periodoEl = document.getElementById('vendas-periodo');
    if (periodoEl) periodoEl.textContent = `${MESES[MES]} / ${String(ANO).slice(2)}`;

    const inicioMes = `${ANO}-${String(MES_NUM).padStart(2,'0')}-01`;
    const fimMes = `${ANO}-${String(MES_NUM).padStart(2,'0')}-${String(diasNoMes(ANO, MES)).padStart(2,'0')}`;
    const inicioMesPassadoComp = `${ANO-1}-${String(MES_NUM).padStart(2,'0')}-01`;
    const fimMesPassadoComp = `${ANO-1}-${String(MES_NUM).padStart(2,'0')}-${String(diasNoMes(ANO-1, MES)).padStart(2,'0')}`;

    // 2 queries cirúrgicas: mês atual + mesmo mês do ano anterior (para o comparativo do gráfico)
    // Antes: 1 query com ano inteiro (.limit 10000). Agora: ~60 registros cada.
    const [salesAtualR, salesPassadoR] = await Promise.all([
      sb.from('daily_sales').select('sale_date, payment_method, amount')
        .eq('company_id', COMPANY_ID)
        .gte('sale_date', inicioMes).lte('sale_date', fimMes)
        .limit(1500),
      sb.from('daily_sales').select('sale_date, payment_method, amount')
        .eq('company_id', COMPANY_ID)
        .gte('sale_date', inicioMesPassadoComp).lte('sale_date', fimMesPassadoComp)
        .limit(1500)
    ]);
    const error = salesAtualR.error || salesPassadoR.error;
    if (error) { console.error('vendas sales error', error); return; }
    const sales = [...(salesAtualR.data || []), ...(salesPassadoR.data || [])];

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
    _porDia = porDia;
    _porDiaForma = porDiaForma;
    _diasOrdenados = Object.keys(porDia).sort();

    // === KPIs ===
    // fimMes, inicioMesPassadoComp, fimMesPassadoComp já declarados acima (reutilizados da query)
    const mesAtual = Object.keys(porDia).filter(d => d >= inicioMes && d <= fimMes);
    const totalMes = mesAtual.reduce((s,d) => s + porDia[d], 0);
    const diasComVenda = mesAtual.length;

    const mesAnoPassado = Object.keys(porDia).filter(d => d >= inicioMesPassadoComp && d <= fimMesPassadoComp);
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
      renderFormasPagamento(ultimoDia);
      const payTitle = document.querySelector('.pay-card h3');
      if (payTitle) {
        const [yU, mU, dU] = ultimoDia.split('-');
        const dtLabel = `${dU}/${mU}`;
        const hojeIso = HOJE.toISOString().slice(0,10);
        const isHoje = ultimoDia === hojeIso;
        const sufixo = isHoje ? `<span style="color:var(--text-soft);font-weight:500">hoje · ${dtLabel}</span>` : `<span style="color:var(--warn);font-weight:500">último dia com venda · ${dtLabel}</span>`;
        payTitle.innerHTML = `<i data-lucide="wallet"></i> Formas de pagamento — ${sufixo} <span class="auto-tag"><i data-lucide="zap"></i>Auto · ${window._DMPAY_ERP_LABEL || 'iCommerce'}</span>`;
      }
      // Banner se último dia ≠ hoje (indica gap de sincronização / caixa fechado)
      const hojeIso = HOJE.toISOString().slice(0,10);
      if (ultimoDia !== hojeIso) {
        const diffMs = new Date(hojeIso + 'T00:00:00') - new Date(ultimoDia + 'T00:00:00');
        const diffDias = Math.floor(diffMs / 86400000);
        let bannerGap = document.getElementById('vendas-gap-banner');
        if (!bannerGap) {
          bannerGap = document.createElement('div');
          bannerGap.id = 'vendas-gap-banner';
          bannerGap.style.cssText = 'display:flex;align-items:flex-start;gap:12px;padding:12px 16px;background:var(--warn-soft,#FEF3C7);border:1px solid var(--warn,#D97706);border-radius:10px;margin:0 0 14px;font-size:13px;color:var(--text);line-height:1.5';
          const kpiGrid = document.querySelector('.kpi-grid');
          if (kpiGrid && kpiGrid.parentNode) kpiGrid.parentNode.insertBefore(bannerGap, kpiGrid);
        }
        const [yU, mU, dU] = ultimoDia.split('-');
        const dtLabel = `${dU}/${mU}`;
        bannerGap.innerHTML = `<i data-lucide="alert-triangle" style="width:18px;height:18px;color:var(--warn);flex-shrink:0;margin-top:1px"></i><div style="flex:1"><b style="color:var(--warn)">Sem vendas registradas há ${diffDias} dia${diffDias>1?'s':''}.</b> A última venda é de <b>${dtLabel}</b>. Verifique se o caixa foi aberto ou se a sincronização com o ${window._DMPAY_ERP_LABEL || 'ERP'} travou.</div>`;
      } else {
        const bannerGap = document.getElementById('vendas-gap-banner');
        if (bannerGap) bannerGap.remove();
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
        cell.setAttribute('data-iso', iso);
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
          cell.title = `Clique pra ver o fechamento de ${String(d).padStart(2,'0')}/${String(MES_NUM).padStart(2,'0')}`;
          cell.addEventListener('click', () => selectarData(iso));
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
      const existing = Chart.getChart(canvas);
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

      // Reutiliza instância existente em vez de destroy+recreate (evita lag na navegação de mês)
      if (existing) {
        existing.data.labels = labels;
        existing.data.datasets[0].data = dPassado;
        existing.data.datasets[1].data = dAtual;
        existing.update('none');
      } else new Chart(canvas, {
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

    // Banner sync: atualiza label ERP baseado no source_system real
    const { data: syncStateRows } = await sb.from('sync_state')
      .select('source_system').eq('company_id', COMPANY_ID).limit(1);
    const sourceSystem = syncStateRows?.[0]?.source_system || 'icommerce';
    const erpLabel = sourceSystem === 'omsys' ? 'OMSYS' : 'iCommerce';
    const autoTagHtml = `<span class="auto-tag"><i data-lucide="zap"></i>Auto · ${erpLabel}</span>`;
    // Atualiza todos os badges estáticos da página
    document.querySelectorAll('.auto-tag').forEach(el => {
      el.innerHTML = `<i data-lucide="zap"></i>Auto · ${erpLabel}`;
    });
    const syncTitle = document.querySelector('.sync-title b');
    if (syncTitle) syncTitle.textContent = `Integração ${erpLabel} ativa.`;
    window._DMPAY_ERP_LABEL = erpLabel;
    window._DMPAY_AUTO_TAG_HTML = autoTagHtml;

    // === Fechamento do dia: Recebimentos de Fiado + Sangrias + Caixa líquido ===
    await carregarFechamentoDia(COMPANY_ID, ultimoDia, porDia[ultimoDia] || 0);

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  async function carregarFechamentoDia(companyId, dataIso, totalVendasDia) {
    if (!dataIso) return;
    _ultimaDataFechamento = dataIso;
    const [y,m,d] = dataIso.split('-');
    const dtLabel = `${d}/${m}/${y}`;
    const reconData = document.getElementById('recon-data');
    if (reconData) reconData.textContent = dtLabel;
    const picker = document.getElementById('recon-date-picker');
    if (picker) picker.value = dataIso;
    // destaca heatmap cell
    document.querySelectorAll('.hm-cell.selected').forEach(c => c.classList.remove('selected'));
    const cell = document.querySelector(`.hm-cell[data-iso="${dataIso}"]`);
    if (cell) cell.classList.add('selected');
    // desabilita setas de navegação se não houver dias anterior/posterior
    const idx = _diasOrdenados.indexOf(dataIso);
    const btnPrev = document.getElementById('recon-prev');
    const btnNext = document.getElementById('recon-next');
    if (btnPrev) btnPrev.disabled = idx <= 0;
    if (btnNext) btnNext.disabled = idx < 0 || idx >= _diasOrdenados.length - 1;

    // Dados vêm do iCommerce como CRD_DATA_PGTO em 00:00:00 e o Supabase grava
    // como timestamptz UTC. Pra filtrar o "dia lógico do iCommerce" a gente usa
    // range [dia 00:00Z, próximo dia 00:00Z) — pega exatamente as quitações desse dia.
    const proxDia = (() => { const d = new Date(dataIso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); })();
    const inicio = dataIso + 'T00:00:00Z';
    const fim    = proxDia + 'T00:00:00Z';

    // 1) Recebimentos de fiado: parcelas com received_at no dia (iCommerce)
    //    Fallback: daily_sales payment_method='recebimento' (OMSYS/Ducal)
    const { data: recs, error: errR } = await sb.from('receivables')
      .select('id, amount, received_at, description, customer_id, customers(name)')
      .eq('company_id', companyId)
      .gte('received_at', inicio)
      .lt('received_at', fim)
      .not('received_at', 'is', null)
      .limit(5000);
    if (errR) { console.error('fechamento fiado', errR); }

    // Agrupa por cliente: soma valores e concatena descrições
    const fiadoMap = new Map();
    for (const r of (recs || [])) {
      const nome = (r.customers && r.customers.name) || 'Cliente sem nome';
      const valor = Number(r.amount || 0);
      const desc = r.description || '—';
      // Horário: só mostra se não for meia-noite UTC (dado do OMSYS sem hora real)
      const dt = new Date(r.received_at);
      const horaStr = (dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0)
        ? 'OMSYS' : dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      if (fiadoMap.has(nome)) {
        const ex = fiadoMap.get(nome);
        ex.valor += valor;
        ex.parcelas++;
        ex.meta = `${ex.parcelas} parcelas · ${horaStr}`;
      } else {
        fiadoMap.set(nome, { nome, valor, parcelas: 1, meta: `${desc} · ${horaStr}` });
      }
    }
    const fiadoRows = [...fiadoMap.values()];
    _ultimoFiadoItens = fiadoRows;

    let totalFiado = fiadoRows.reduce((s,i)=>s+i.valor, 0);
    let qtdFiado = fiadoRows.length;

    // Fallback OMSYS: se não há receivables, usa daily_sales 'recebimento'
    if (totalFiado === 0) {
      const { data: recDS } = await sb.from('daily_sales')
        .select('amount')
        .eq('company_id', companyId)
        .eq('sale_date', dataIso)
        .eq('payment_method', 'recebimento')
        .limit(1);
      if (recDS && recDS.length > 0) {
        totalFiado = recDS.reduce((s,r) => s + Number(r.amount || 0), 0);
        if (totalFiado > 0) {
          _ultimoFiadoItens = [{ nome: 'Recebimentos do dia (caixa)', meta: 'Total consolidado pelo ERP', valor: totalFiado }];
          qtdFiado = 1;
        }
      }
    }

    const fiadoValEl = document.getElementById('fiado-valor');
    const fiadoDetEl = document.getElementById('fiado-detalhe');
    const fiadoAlertEl = document.getElementById('fiado-alerta');
    const btnFiado = document.getElementById('btn-fiado-detalhes');
    if (fiadoValEl) fiadoValEl.textContent = 'R$ ' + fmtBRLfull(totalFiado);
    if (fiadoDetEl) fiadoDetEl.textContent = qtdFiado === 0
      ? 'Nenhum recebimento registrado neste dia.'
      : fiadoRows.length > 0
        ? `${qtdFiado} cliente${qtdFiado!==1?'s':''} quitou${qtdFiado!==1?'ram':''} fiado`
        : 'Total consolidado pelo ERP';
    if (btnFiado) btnFiado.disabled = qtdFiado === 0;

    // Alerta operacional: iCommerce só permite marcar DINHEIRO/PIX/PIX-POS na quitação.
    // Sem integração com maquininha, 100% vem marcado como dinheiro e o fechamento não bate.
    // Mostramos o alerta quando há recebimento mas sem outra forma registrada.
    if (fiadoAlertEl) {
      if (qtdFiado >= 3) {
        fiadoAlertEl.style.display = 'flex';
        fiadoAlertEl.innerHTML = `<i data-lucide="alert-triangle"></i><span>Verifique como o caixa marcou a forma. Cliente que paga fiado via PIX ou cartão costuma ser registrado como "Dinheiro" por hábito.</span>`;
      } else {
        fiadoAlertEl.style.display = 'none';
      }
    }

    // 2) Sangrias: cash_withdrawals com withdrawal_date = dia
    const { data: sangs, error: errS } = await sb.from('cash_withdrawals')
      .select('amount, operator, notes, withdrawal_date')
      .eq('company_id', companyId)
      .eq('withdrawal_date', dataIso)
      .limit(500);
    if (errS) { console.error('fechamento sangria', errS); }

    const sangRows = (sangs || []).map(s => {
      const notas = (s.notes || '').replace(/\r?\n/g, ' ').split('|').map(x=>x.trim()).filter(Boolean);
      const resumo = notas.length ? notas.join(' · ') : 'sem descrição';
      const isNumerico = /^\d+$/.test((s.operator || '').trim());
      const nomeOp = isNumerico
        ? `Operador #${s.operator}`
        : (s.operator || 'Retirada de caixa');
      const sufixo = notas.length ? ` — ${notas.length} item${notas.length !== 1 ? 's' : ''}` : '';
      return {
        nome: nomeOp + sufixo,
        meta: resumo.slice(0, 110),
        valor: Number(s.amount || 0)
      };
    });
    _ultimoSangriaItens = sangRows;
    const totalSangria = sangRows.reduce((s,i)=>s+i.valor, 0);
    const qtdSangria = sangRows.length;

    const sangValEl = document.getElementById('sangria-valor');
    const sangDetEl = document.getElementById('sangria-detalhe');
    const btnSang = document.getElementById('btn-sangria-detalhes');
    if (sangValEl) sangValEl.textContent = 'R$ ' + fmtBRLfull(totalSangria);
    if (sangDetEl) sangDetEl.textContent = qtdSangria === 0
      ? 'Nenhuma sangria neste dia.'
      : `${qtdSangria} retirada${qtdSangria!==1?'s':''} do caixa`;
    if (btnSang) btnSang.disabled = qtdSangria === 0;

    // 3) Caixa líquido esperado = vendas + fiado recebido − sangrias
    const liquido = Number(totalVendasDia || 0) + totalFiado - totalSangria;
    const liqValEl = document.getElementById('liquido-valor');
    const liqDetEl = document.getElementById('liquido-detalhe');
    if (liqValEl) liqValEl.textContent = 'R$ ' + fmtBRLfull(liquido);
    if (liqDetEl) {
      liqDetEl.innerHTML = `<span style="font-family:'Geist Mono',monospace;font-size:11px">${fmtBRLfull(totalVendasDia)} + ${fmtBRLfull(totalFiado)} − ${fmtBRLfull(totalSangria)}</span>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// === Por Caixa ===
window.DMPAY_CAIXAS = (() => {
  let _data = null; // YYYY-MM-DD
  const fmtD = iso => { const [y,m,d] = iso.split('-'); return `${d}/${m}`; };
  const fmt  = v => 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});

  async function carregar(iso) {
    _data = iso;
    const label = document.getElementById('caixasDateLabel');
    if (label) label.textContent = fmtD(iso);
    const body = document.getElementById('caixasBody');
    if (!body) return;
    body.innerHTML = '<div class="caixas-empty">Carregando…</div>';

    const sb = window.sb;
    const companyId = window.DMPAY_COMPANY && window.DMPAY_COMPANY.id;
    if (!sb || !companyId) { body.innerHTML = '<div class="caixas-empty">Sem conexão.</div>'; return; }

    const { data, error } = await sb
      .from('register_sessions')
      .select('pdv_id,pdv_nome,operador_id,operador_nome,total_vendas,total_cupons')
      .eq('company_id', companyId)
      .eq('session_date', iso)
      .order('pdv_id');

    if (error || !data || data.length === 0) {
      body.innerHTML = '<div class="caixas-empty">Nenhum dado de caixa para este dia.</div>';
      return;
    }

    // Agrupa por PDV, depois por operador — evita duplicatas de sessão
    const pdvs = {};
    data.forEach(r => {
      if (!pdvs[r.pdv_id]) pdvs[r.pdv_id] = { nome: r.pdv_nome || `PDV ${r.pdv_id}`, total: 0, cupons: 0, ops: {} };
      const opKey = r.operador_id || r.operador_nome || 'desconhecido';
      if (!pdvs[r.pdv_id].ops[opKey]) {
        pdvs[r.pdv_id].ops[opKey] = { nome: r.operador_nome || `Op #${r.operador_id}`, total: 0, cupons: 0 };
      }
      pdvs[r.pdv_id].ops[opKey].total  += Number(r.total_vendas);
      pdvs[r.pdv_id].ops[opKey].cupons += Number(r.total_cupons);
      pdvs[r.pdv_id].total  += Number(r.total_vendas);
      pdvs[r.pdv_id].cupons += Number(r.total_cupons);
    });
    // Converte ops de objeto para array
    Object.values(pdvs).forEach(p => { p.ops = Object.values(p.ops); });

    body.innerHTML = Object.entries(pdvs).map(([pdvId, p], i) => `
      <div class="pdv-row" onclick="DMPAY_CAIXAS.toggle('ops-${pdvId}')">
        <div class="pdv-row-head">
          <div class="pdv-badge">${i+1}</div>
          <div class="pdv-nome">${p.nome}</div>
          <div class="pdv-cupons">${p.cupons} cupons</div>
          <div class="pdv-total">${fmt(p.total)}</div>
        </div>
      </div>
      <div class="pdv-ops" id="ops-${pdvId}">
        ${p.ops.sort((a,b) => b.total - a.total).map(op => `
          <div class="pdv-op-row">
            <div class="pdv-op-nome">${op.nome}</div>
            <div class="pdv-op-cupons">${op.cupons} cupons</div>
            <div class="pdv-op-val">${fmt(op.total)}</div>
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  function toggle(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  }

  function navDia(delta) {
    if (!_data) return;
    const [y,m,d] = _data.split('-').map(Number);
    const dt = new Date(y, m-1, d + delta);
    const iso = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
    carregar(iso);
  }

  // Inicializa com hoje quando a página carregar
  document.addEventListener('DOMContentLoaded', () => {
    const hoje = new Date();
    const iso = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0') + '-' + String(hoje.getDate()).padStart(2,'0');
    setTimeout(() => carregar(iso), 800);
  });

  return { carregar, toggle, navDia };
})();
