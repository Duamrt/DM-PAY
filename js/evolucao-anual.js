// js/evolucao-anual.js — Evolução Anual YoY
(function () {
  const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const MESES_LONGO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Paleta de cores por ano — mais recente = azul (accent), anteriores mais suaves
  const PALETA = [
    '#94A3B8', // 2021 — cinza azulado
    '#64748B', // 2022 — cinza
    '#F59E0B', // 2023 — âmbar
    '#10B981', // 2024 — verde
    '#2563EB', // 2025 — azul (accent)
    '#7C3AED', // 2026 — roxo (ano atual)
  ];
  const COR_PROJ = '#2563EB'; // 2027 projeção — azul tracejado

  let chart = null;

  function fmt(v) {
    return 'R$ ' + Math.round(Number(v || 0)).toLocaleString('pt-BR');
  }
  function fmtK(v) {
    const n = Number(v || 0);
    if (n >= 1000000) return 'R$ ' + (n / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1000) return 'R$ ' + Math.round(n / 1000) + 'k';
    return fmt(n);
  }
  function pctStr(v) {
    const s = (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
    return s;
  }

  async function init() {
    await DMPAY.ready();
    const session = await DMPAY.session();
    if (!session || !session.user) return;
    const companyId = session.company && session.company.id;

    // RPC agrega no banco — retorna no máx. 72 linhas (6 anos × 12 meses)
    const { data, error } = await window.sb
      .rpc('get_yoy_sales', { p_company_id: companyId });

    if (error) {
      console.error('[YoY] erro ao buscar daily_sales:', error);
      document.getElementById('kpi-grid').innerHTML =
        '<div class="kpi-card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--danger)">Erro ao carregar dados.</div>';
      return;
    }

    // Constrói mapa a partir dos dados pré-agregados
    const mapa = {}; // { '2024-3': 123456.78 }
    for (const row of data) {
      const key = `${row.ano}-${row.mes}`;
      mapa[key] = parseFloat(row.total || 0);
    }

    // Descobre anos presentes
    const anosSet = new Set();
    for (const key of Object.keys(mapa)) {
      anosSet.add(parseInt(key.split('-')[0]));
    }
    const anos = Array.from(anosSet).sort();
    const anoAtual = new Date().getFullYear();
    const mesAtual = new Date().getMonth() + 1; // 1-based

    // Monta matriz [ano][mes] → valor
    const matriz = {}; // { 2024: [0, v1, v2, ..., v12] } index 1-based
    for (const ano of anos) {
      matriz[ano] = new Array(13).fill(null); // index 0 ignorado
    }
    for (const [key, val] of Object.entries(mapa)) {
      const [y, m] = key.split('-');
      const ano = parseInt(y), mes = parseInt(m);
      if (matriz[ano]) matriz[ano][mes] = val;
    }

    // Calcula crescimento YoY por mês (comparando com ano anterior)
    // Para cada ano, calcula % vs ano anterior nos meses onde ambos têm dado
    function calcGrowth(ano, mes) {
      const vAtual = matriz[ano]?.[mes];
      const vAnterior = matriz[ano - 1]?.[mes];
      if (!vAtual || !vAnterior || vAnterior === 0) return null;
      return ((vAtual - vAnterior) / vAnterior) * 100;
    }

    // Projeção 2027: para cada mês, média do crescimento % dos últimos 3 anos
    function projetar2027(mes) {
      const crescimentos = [];
      for (let ano = 2024; ano <= 2026; ano++) {
        const g = calcGrowth(ano, mes);
        if (g !== null) crescimentos.push(g);
      }
      if (!crescimentos.length) return null;
      const mediaG = crescimentos.reduce((a, b) => a + b, 0) / crescimentos.length;
      const base2026 = matriz[2026]?.[mes];
      if (!base2026) return null;
      return base2026 * (1 + mediaG / 100);
    }

    const proj2027 = new Array(13).fill(null);
    for (let m = 1; m <= 12; m++) {
      proj2027[m] = projetar2027(m);
    }

    // ── KPIs ─────────────────────────────────────────────────────────────
    // Melhor mês histórico, pior mês, crescimento médio YoY, projeção 2027 total
    let melhorMes = { val: 0, label: '—' };
    let piorMes = { val: Infinity, label: '—' };
    let totalYoY = []; // crescimentos anuais completos (todos os meses)

    for (let m = 1; m <= 12; m++) {
      const v2026 = matriz[anoAtual]?.[m] || matriz[2026]?.[m] || 0;
      if (v2026 > melhorMes.val) melhorMes = { val: v2026, label: MESES_LONGO[m - 1] };
      if (v2026 > 0 && v2026 < piorMes.val) piorMes = { val: v2026, label: MESES_LONGO[m - 1] };
    }
    if (piorMes.val === Infinity) piorMes = { val: 0, label: '—' };

    // Crescimento médio 2025→2026 (meses com dados nos dois anos)
    const crescAno = [];
    for (let m = 1; m <= 12; m++) {
      const g = calcGrowth(2026, m);
      if (g !== null) crescAno.push(g);
    }
    const mediaCrescimento = crescAno.length
      ? crescAno.reduce((a, b) => a + b, 0) / crescAno.length
      : null;

    // Total projetado 2027
    const total2027 = proj2027.slice(1).reduce((a, b) => a + (b || 0), 0);
    const total2026 = Object.values(matriz[2026] || []).reduce((a, b) => a + (b || 0), 0);

    renderKPIs(melhorMes, piorMes, mediaCrescimento, total2027, total2026);

    // ── Banner projeção ───────────────────────────────────────────────────
    if (total2027 > 0 && total2026 > 0) {
      const delta = ((total2027 - total2026) / total2026) * 100;
      const banner = document.getElementById('projecao-banner');
      const texto = document.getElementById('projecao-texto');
      texto.innerHTML = `<b>Projeção 2027: ${fmtK(total2027)}</b> — crescimento estimado de ${pctStr(delta)} sobre 2026 (${fmtK(total2026)}). Baseado na média dos últimos 3 anos por mês.`;
      banner.style.display = 'flex';
    }

    // ── Gráfico YoY ──────────────────────────────────────────────────────
    renderChart(anos, matriz, proj2027, anoAtual, mesAtual);

    // ── Tabela ───────────────────────────────────────────────────────────
    renderTabela(anos, matriz, proj2027);

    lucide.createIcons();
  }

  init();

  function renderKPIs(melhorMes, piorMes, mediaCrescimento, total2027, total2026) {
    const grid = document.getElementById('kpi-grid');
    const deltaClass = mediaCrescimento !== null
      ? (mediaCrescimento >= 0 ? 'up' : 'down') : '';
    const deltaStr = mediaCrescimento !== null ? pctStr(mediaCrescimento) : '—';

    grid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label"><i data-lucide="trophy"></i> Melhor mês (2026)</div>
        <div class="kpi-value">${fmtK(melhorMes.val)}</div>
        <div class="kpi-sub">${melhorMes.label}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><i data-lucide="arrow-down"></i> Mês mais fraco (2026)</div>
        <div class="kpi-value">${fmtK(piorMes.val)}</div>
        <div class="kpi-sub">${piorMes.label}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><i data-lucide="percent"></i> Crescimento médio YoY</div>
        <div class="kpi-value">${deltaStr}</div>
        <div class="kpi-sub">2025 → 2026 por mês</div>
        ${mediaCrescimento !== null ? `<div class="kpi-delta ${deltaClass}"><i data-lucide="${mediaCrescimento >= 0 ? 'trending-up' : 'trending-down'}"></i>${deltaStr}</div>` : ''}
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><i data-lucide="crystal-ball"></i> Projeção 2027</div>
        <div class="kpi-value" style="color:var(--accent)">${total2027 > 0 ? fmtK(total2027) : '—'}</div>
        <div class="kpi-sub">${total2026 > 0 ? 'base: ' + fmtK(total2026) + ' em 2026' : 'dados insuficientes'}</div>
      </div>
    `;
  }

  function renderChart(anos, matriz, proj2027, anoAtual, mesAtual) {
    const labels = MESES_CURTO;
    const datasets = [];

    anos.forEach((ano, idx) => {
      const cor = PALETA[idx] || '#94A3B8';
      const isAtual = ano === anoAtual;
      const dados = [];
      for (let m = 1; m <= 12; m++) {
        // Para o ano atual, não mostrar meses futuros
        if (ano === anoAtual && m > mesAtual) {
          dados.push(null);
        } else {
          dados.push(matriz[ano][m] || null);
        }
      }
      datasets.push({
        label: String(ano),
        data: dados,
        borderColor: cor,
        backgroundColor: cor + '18',
        borderWidth: isAtual ? 3 : 2,
        pointRadius: isAtual ? 4 : 3,
        pointHoverRadius: 6,
        tension: 0.35,
        spanGaps: false,
      });
    });

    // Linha de projeção 2027 (tracejada)
    const dadosProj = [];
    for (let m = 1; m <= 12; m++) {
      dadosProj.push(proj2027[m] || null);
    }
    if (dadosProj.some(v => v !== null)) {
      datasets.push({
        label: '2027 (proj.)',
        data: dadosProj,
        borderColor: COR_PROJ,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.35,
        spanGaps: false,
      });
    }

    // Legenda
    const legendEl = document.getElementById('chart-legend');
    legendEl.innerHTML = datasets.map(ds => {
      const isProj = ds.label.includes('proj');
      const dot = isProj
        ? `<span class="legend-dash" style="border-color:${ds.borderColor}"></span>`
        : `<span class="legend-dot" style="background:${ds.borderColor}"></span>`;
      return `<span>${dot}${esc(ds.label)}</span>`;
    }).join('');

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    const textColor = isDark ? '#9CA3AF' : '#6B7280';

    const ctx = document.getElementById('yoyChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? fmtK(ctx.parsed.y) : '—'}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 12 } },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 12 },
              callback: v => fmtK(v),
            },
          },
        },
      },
    });
  }

  function renderTabela(anos, matriz, proj2027) {
    const head = document.getElementById('table-head');
    const body = document.getElementById('table-body');

    // Cabeçalho: Mês | 2021 | 2022 | ... | 2026 | 2027 proj.
    const colsAno = [...anos, '2027 proj.'];
    head.innerHTML = `<div class="col-mes">Mês</div>` +
      colsAno.map(a => `<div class="col-ano">${esc(String(a))}</div>`).join('');

    let html = '';
    for (let m = 1; m <= 12; m++) {
      const isDestaque = m === 6 || m === 12; // São João e Natal
      html += `<div class="table-row" style="${isDestaque ? 'background:var(--warn-soft)' : ''}">`;
      html += `<div class="col-mes">${MESES_LONGO[m - 1]}${isDestaque ? ' 🔥' : ''}</div>`;

      for (const ano of anos) {
        const v = matriz[ano]?.[m];
        const g = calcGrowthTable(ano, m, matriz);
        const gStr = g !== null
          ? `<span class="delta-pill ${g >= 0 ? 'up' : 'down'}">${pctStr(g)}</span>`
          : '';
        html += `<div class="col-ano">${v ? fmtK(v) + gStr : '—'}</div>`;
      }

      // Coluna 2027
      const vProj = proj2027[m];
      html += `<div class="col-ano proj">${vProj ? '~' + fmtK(vProj) : '—'}</div>`;
      html += `</div>`;
    }

    body.innerHTML = html;
  }

  function calcGrowthTable(ano, mes, matriz) {
    const vAtual = matriz[ano]?.[mes];
    const vAnterior = matriz[ano - 1]?.[mes];
    if (!vAtual || !vAnterior || vAnterior === 0) return null;
    return ((vAtual - vAnterior) / vAnterior) * 100;
  }

  function pctStr(v) {
    return (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
  }

  function esc(str) {
    return window.esc ? window.esc(str) : String(str || '');
  }
})();
