// DM Pay — Evolução de Dívidas (2021 → hoje)
(function () {
  const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Cores por ano
  const COR_ANO = {
    2021: '#94A3B8',
    2022: '#64748B',
    2023: '#F59E0B',
    2024: '#10B981',
    2025: '#2563EB',
    2026: '#DC2626',
  };

  let chart = null;

  function fmt(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtK(v) {
    const n = Number(v || 0);
    if (n >= 1_000_000) return 'R$ ' + (n / 1_000_000).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1_000)     return 'R$ ' + Math.round(n / 1_000) + 'k';
    return fmt(n);
  }
  function monthKey(iso) {
    return String(iso || '').slice(0, 7); // 'YYYY-MM'
  }
  function daysOverdue(dueDateISO) {
    if (!dueDateISO) return 0;
    const [y, m, d] = String(dueDateISO).slice(0, 10).split('-').map(Number);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((today - new Date(y, m - 1, d)) / 86400000));
  }
  function isoAddDays(days) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function init() {
    await DMPAY.ready();
    const session = await DMPAY.session();
    if (!session || !session.user) return;
    const companyId = window.DMPAY_COMPANY.id;

    showLoading(true);

    // ── Carrega dados em paralelo ───────────────────────────────────────────
    // overdue dividido em 3 faixas para contornar limite do PostgREST
    const [ov1, ov2, ov3, act2026] = await Promise.all([
      sb.from('receivables')
        .select('id,customer_id,amount,due_date,customers(name,cpf_cnpj)')
        .eq('company_id', companyId)
        .eq('status', 'overdue')
        .gte('due_date', '2021-01-01')
        .lt('due_date', '2023-01-01')
        .order('due_date')
        .limit(1000),
      sb.from('receivables')
        .select('id,customer_id,amount,due_date,customers(name,cpf_cnpj)')
        .eq('company_id', companyId)
        .eq('status', 'overdue')
        .gte('due_date', '2023-01-01')
        .lt('due_date', '2025-01-01')
        .order('due_date')
        .limit(1000),
      sb.from('receivables')
        .select('id,customer_id,amount,due_date,customers(name,cpf_cnpj)')
        .eq('company_id', companyId)
        .eq('status', 'overdue')
        .gte('due_date', '2025-01-01')
        .order('due_date')
        .limit(1000),
      // Atividade em 2026: qualquer título (aberto, recebido, vencido) com due_date em 2026
      sb.from('receivables')
        .select('id,customer_id,amount,due_date,status,customers(name,cpf_cnpj)')
        .eq('company_id', companyId)
        .gte('due_date', '2026-01-01')
        .order('due_date', { ascending: false })
        .limit(2000),
    ]);

    if (ov1.error || ov2.error || ov3.error) {
      console.error('[DívEv] erro ao carregar:', ov1.error || ov2.error || ov3.error);
      showLoading(false, 'Erro ao carregar dados. Tente recarregar a página.');
      return;
    }

    warnIfTruncated(ov1.data, 1000, 'overdue 2021-22');
    warnIfTruncated(ov2.data, 1000, 'overdue 2023-24');
    warnIfTruncated(ov3.data, 1000, 'overdue 2025+');
    warnIfTruncated(act2026.data, 2000, 'atividade 2026');

    const allOverdue = [...(ov1.data || []), ...(ov2.data || []), ...(ov3.data || [])];
    const all2026    = act2026.data || [];

    showLoading(false);

    // ── Monta eixo X: Jan/2021 → mês atual ─────────────────────────────────
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const months = [];
    let cur = new Date(2021, 0, 1);
    while (cur <= today) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      months.push(`${y}-${m}`);
      cur.setMonth(cur.getMonth() + 1);
    }

    // Agrupa overdue por mês de vencimento
    const overdueByMonth = {};
    for (const r of allOverdue) {
      const k = monthKey(r.due_date);
      if (!k || !months.includes(k)) continue;
      overdueByMonth[k] = (overdueByMonth[k] || 0) + parseFloat(r.amount || 0);
    }

    // ── KPIs ────────────────────────────────────────────────────────────────
    const totalOverdue   = allOverdue.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const uniqueDebtors  = new Set(allOverdue.map(r => r.customer_id).filter(Boolean)).size;

    // Clientes comprando em 2026 com +120 dias de atraso
    const cutoffISO = isoAddDays(-120); // 120 dias atrás
    const active2026Ids = new Set(all2026.map(r => r.customer_id).filter(Boolean));

    const riskyMap = {}; // customer_id → { name, cpf, totalDebt, maxDays, count }
    for (const r of allOverdue) {
      const days = daysOverdue(r.due_date);
      if (days < 120) continue;
      if (!active2026Ids.has(r.customer_id)) continue;
      const cid = r.customer_id;
      if (!riskyMap[cid]) {
        riskyMap[cid] = {
          name:    r.customers?.name || 'Sem nome',
          cpf:     r.customers?.cpf_cnpj || '',
          totalDebt: 0,
          maxDays: 0,
          count:   0,
        };
      }
      riskyMap[cid].totalDebt += parseFloat(r.amount || 0);
      riskyMap[cid].maxDays    = Math.max(riskyMap[cid].maxDays, days);
      riskyMap[cid].count++;
    }

    // Soma a movimentação 2026 por cliente de risco
    const mv2026 = {};
    for (const r of all2026) {
      const cid = r.customer_id;
      if (!cid || !riskyMap[cid]) continue;
      mv2026[cid] = (mv2026[cid] || 0) + parseFloat(r.amount || 0);
    }

    const riskyList = Object.entries(riskyMap)
      .map(([id, d]) => ({ ...d, mv2026: mv2026[id] || 0 }))
      .sort((a, b) => b.totalDebt - a.totalDebt);

    // Maior devedor individual (toda a base)
    const debtorTotals = {};
    for (const r of allOverdue) {
      const cid = r.customer_id;
      if (!cid) continue;
      if (!debtorTotals[cid]) debtorTotals[cid] = { name: r.customers?.name || '?', total: 0 };
      debtorTotals[cid].total += parseFloat(r.amount || 0);
    }
    const biggestDebtor = Object.values(debtorTotals).sort((a, b) => b.total - a.total)[0] || null;

    renderKPIs(totalOverdue, uniqueDebtors, riskyList.length, biggestDebtor);
    renderChart(months, overdueByMonth);
    renderRiskyTable(riskyList);

    lucide.createIcons();
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  function renderKPIs(totalOverdue, uniqueDebtors, riskyCount, biggestDebtor) {
    const grid = document.getElementById('kpi-grid');
    grid.innerHTML = `
      <div class="kpi-card danger">
        <div class="kpi-label"><i data-lucide="alert-circle"></i> Total em atraso</div>
        <div class="kpi-value">${fmtK(totalOverdue)}</div>
        <div class="kpi-sub">acumulado desde jan/2021</div>
      </div>
      <div class="kpi-card warn">
        <div class="kpi-label"><i data-lucide="users"></i> Devedores ativos</div>
        <div class="kpi-value">${uniqueDebtors.toLocaleString('pt-BR')}</div>
        <div class="kpi-sub">clientes com título em atraso</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><i data-lucide="trending-up"></i> Maior devedor</div>
        <div class="kpi-value">${biggestDebtor ? fmtK(biggestDebtor.total) : '—'}</div>
        <div class="kpi-sub">${biggestDebtor ? esc(biggestDebtor.name) : '—'}</div>
      </div>
      <div class="kpi-card alert">
        <div class="kpi-label"><i data-lucide="shield-alert"></i> Risco crítico</div>
        <div class="kpi-value">${riskyCount}</div>
        <div class="kpi-sub">comprando em 2026 com +120 dias de atraso</div>
      </div>
    `;
  }

  // ── Gráfico ───────────────────────────────────────────────────────────────
  function renderChart(months, overdueByMonth) {
    // Labels abreviados: mostrar só Jan de cada ano + mês atual
    const labels = months.map((k, i) => {
      const [y, m] = k.split('-');
      const mesIdx = parseInt(m) - 1;
      if (mesIdx === 0) return `Jan/${y.slice(2)}`;     // Jan de cada ano
      if (i === months.length - 1) return MESES_CURTO[mesIdx]; // mês atual
      return MESES_CURTO[mesIdx];
    });

    // Dataset principal: barra por mês
    const values = months.map(k => overdueByMonth[k] || 0);

    // Cor de cada barra conforme o ano
    const barColors = months.map(k => {
      const y = parseInt(k.split('-')[0]);
      return (COR_ANO[y] || '#94A3B8') + 'CC'; // 80% opacidade
    });
    const barBorders = months.map(k => {
      const y = parseInt(k.split('-')[0]);
      return COR_ANO[y] || '#94A3B8';
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor  = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    const textColor  = isDark ? '#9CA3AF' : '#6B7280';

    // Legenda por ano
    const legendEl = document.getElementById('chart-legend');
    legendEl.innerHTML = Object.entries(COR_ANO).map(([yr, cor]) =>
      `<span><span class="legend-dot" style="background:${cor}"></span>${yr}</span>`
    ).join('');

    const ctx = document.getElementById('debtChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Dívida vencida no mês',
          data: values,
          backgroundColor: barColors,
          borderColor: barBorders,
          borderWidth: 1,
          borderRadius: 3,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                const k = months[idx];
                const [y, m] = k.split('-');
                return `${MESES_CURTO[parseInt(m) - 1]}/${y}`;
              },
              label: (item) => ` ${fmtK(item.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 11 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 20,
            },
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

  // ── Tabela de risco ───────────────────────────────────────────────────────
  function renderRiskyTable(riskyList) {
    const container = document.getElementById('risky-body');
    const counter   = document.getElementById('risky-count');

    counter.textContent = riskyList.length;

    if (!riskyList.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i data-lucide="check-circle"></i>
          <p>Nenhum cliente com compras em 2026 e mais de 120 dias de atraso.</p>
        </div>`;
      return;
    }

    container.innerHTML = riskyList.map((r, i) => {
      const daysLabel = r.maxDays >= 365
        ? Math.floor(r.maxDays / 30) + ' meses'
        : r.maxDays + ' dias';
      const riskClass = r.maxDays >= 365 ? 'critical' : r.maxDays >= 180 ? 'high' : 'medium';
      const riskLabel = r.maxDays >= 365 ? 'Crítico' : r.maxDays >= 180 ? 'Alto' : 'Médio';

      return `
        <div class="risky-row">
          <div class="risky-rank">${i + 1}</div>
          <div class="risky-info">
            <div class="risky-name">${esc(r.name)}</div>
            ${r.cpf ? `<div class="risky-cpf">${esc(r.cpf)}</div>` : ''}
          </div>
          <div class="risky-debt">
            <div class="risky-value danger">${fmtK(r.totalDebt)}</div>
            <div class="risky-sub">${r.count} título${r.count > 1 ? 's' : ''} em atraso</div>
          </div>
          <div class="risky-days">
            <div class="risky-value">${daysLabel}</div>
            <div class="risky-sub">de atraso máx.</div>
          </div>
          <div class="risky-mv">
            <div class="risky-value accent">${fmtK(r.mv2026)}</div>
            <div class="risky-sub">comprado em 2026</div>
          </div>
          <div class="risky-badge ${riskClass}">${riskLabel}</div>
        </div>`;
    }).join('');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showLoading(active, msg) {
    const el = document.getElementById('loading-state');
    if (!el) return;
    if (active) {
      el.style.display = 'flex';
      el.querySelector('.loading-msg').textContent = 'Carregando dados...';
    } else if (msg) {
      el.querySelector('.loading-msg').textContent = msg;
    } else {
      el.style.display = 'none';
    }
  }

  init();
})();
