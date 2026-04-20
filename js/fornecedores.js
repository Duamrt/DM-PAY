// js/fornecedores.js — DM Pay Fornecedores
// Carrega suppliers + invoices do Supabase, preenche KPIs, tabela e drawer
'use strict';

(function () {

  // ── Aguarda DMPAY_COMPANY ficar disponível (auth-guard pode ser async)
  function init(tries) {
    const sb  = window.sb;
    const CID = window.DMPAY_COMPANY?.id;
    if (!sb || !CID) {
      if (tries > 40) return; // timeout 4s
      return setTimeout(() => init((tries||0)+1), 100);
    }
    run(sb, CID);
  }

  document.addEventListener('DOMContentLoaded', () => init(0));

  // ── Helpers visuais
  const PALETTE = ['#2563EB','#7C3AED','#DB2777','#DC2626','#D97706','#059669','#0891B2','#9333EA'];
  function avatarColor(str) {
    let h = 0;
    for (let i = 0; i < (str||'').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xFFFFFF;
    return PALETTE[Math.abs(h) % PALETTE.length];
  }
  function initials(name) {
    const w = (name||'?').trim().split(/\s+/).filter(Boolean);
    if (w.length === 1) return w[0].slice(0,2).toUpperCase();
    return (w[0][0] + w[w.length-1][0]).toUpperCase();
  }
  function fmtCNPJ(c) {
    const d = (c||'').replace(/\D/g,'');
    if (d.length !== 14) return c || '—';
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  }
  function fmtBRL(v) {
    return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2});
  }
  function fmtDate(s) {
    if (!s) return '—';
    const [y,m,d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  // ── Sparkline SVG 80×24
  function sparkSVG(values) {
    const valid = values.filter(v => v > 0);
    if (valid.length < 2) {
      return `<svg width="80" height="24" viewBox="0 0 80 24"><line x1="0" y1="12" x2="80" y2="12" stroke="var(--border)" stroke-width="1.5"/></svg>`;
    }
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const pts = values.map((v,i) => {
      const x = (i / (values.length-1)) * 80;
      const y = 22 - ((v-min)/range) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last  = values[values.length-1];
    const first = values[0];
    const color = last > first * 1.08 ? 'var(--danger)'
                : last < first * 0.92 ? 'var(--success)'
                : 'var(--text-muted)';
    return `<svg width="80" height="24" viewBox="0 0 80 24"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  }

  // ── Lógica principal
  function run(sb, CID) {
    let allForns = []; // array de objetos enriquecidos
    let filtro   = 'todos';
    let busca    = '';

    // ── Carrega suppliers + invoices
    async function load() {
      showLoading();
      try {
        const [supRes, invRes] = await Promise.all([
          sb.from('suppliers')
            .select('id,cnpj,legal_name,trade_name,email,phone,address_city,address_state')
            .eq('company_id', CID)
            .order('legal_name'),
          sb.from('invoices')
            .select('id,supplier_id,issue_date,total,nature')
            .eq('company_id', CID)
            .eq('nature', 'entrada')
            .order('issue_date', {ascending:false})
        ]);

        const suppliers = supRes.data  || [];
        const invoices  = invRes.data  || [];

        // Meses (últimos 6)
        const now   = new Date();
        const months6 = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          months6.push({
            y: d.getFullYear(),
            m: d.getMonth()+1,
            label: d.toLocaleString('pt-BR',{month:'short'})
          });
        }

        // Corte de 30 dias
        const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
        const d30Str = d30.toISOString().slice(0,10);

        // Map supplier_id → invoices[]
        const invMap = {};
        for (const inv of invoices) {
          if (!inv.supplier_id) continue;
          if (!invMap[inv.supplier_id]) invMap[inv.supplier_id] = [];
          invMap[inv.supplier_id].push(inv);
        }

        // Enriquece cada supplier
        allForns = suppliers.map(s => {
          const invs      = invMap[s.id] || [];
          const total_all = invs.reduce((a,b)=>a+(b.total||0),0);
          const total_30d = invs.filter(i => i.issue_date >= d30Str).reduce((a,b)=>a+(b.total||0),0);
          const ultima    = invs.length ? invs[0].issue_date : null; // ordenado desc

          const monthly = months6.map(({y,m}) => {
            const prefix = `${y}-${String(m).padStart(2,'0')}`;
            return invs.filter(i => i.issue_date?.startsWith(prefix)).reduce((a,b)=>a+(b.total||0),0);
          });

          return { supplier:s, invoices:invs, total_all, total_30d, ultima, monthly, months6 };
        });

        renderKPIs();
        renderTable();
        updateBadge();
      } catch(e) {
        document.getElementById('fornTable').innerHTML =
          `<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--danger)">Erro ao carregar: ${e.message}</td></tr>`;
      }
    }

    function showLoading() {
      document.getElementById('fornTable').innerHTML =
        `<tr><td colspan="6" style="padding:48px;text-align:center;color:var(--text-muted)">
          <div style="font-size:13px">Carregando fornecedores…</div>
        </td></tr>`;
    }

    // ── KPIs
    function renderKPIs() {
      const ativos = allForns.filter(f=>f.invoices.length>0).length;

      const now = new Date();
      const mesStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const comprasMes = allForns.reduce((a,f) =>
        a + f.invoices.filter(i=>i.issue_date?.startsWith(mesStr)).reduce((s,i)=>s+(i.total||0),0), 0);

      const ranked   = [...allForns].sort((a,b)=>b.total_30d-a.total_30d);
      const totalGer = ranked.reduce((a,b)=>a+b.total_30d,0);
      const top3sum  = ranked.slice(0,3).reduce((a,b)=>a+b.total_30d,0);
      const conc     = totalGer > 0 ? Math.round(top3sum/totalGer*100) : 0;

      const kpis = document.querySelectorAll('.kpi');
      if (kpis[0]) {
        kpis[0].querySelector('.kpi-value').textContent = ativos;
        kpis[0].querySelector('.kpi-sub').textContent   = `de ${allForns.length} cadastrados`;
      }
      if (kpis[1]) {
        kpis[1].querySelector('.kpi-value').textContent = fmtBRL(comprasMes);
        kpis[1].querySelector('.kpi-sub').textContent   = 'NF-e de entrada no mês';
      }
      if (kpis[2]) {
        kpis[2].querySelector('.kpi-value').textContent = '—';
        kpis[2].querySelector('.kpi-sub').textContent   = 'Disponível com itens NF-e (v2)';
      }
      if (kpis[3]) {
        kpis[3].querySelector('.kpi-value').textContent = conc + '%';
        kpis[3].querySelector('.kpi-sub').textContent   = `concentração nos top 3 fornecedores`;
      }
    }

    // ── Tabela
    function renderTable() {
      const tbody = document.getElementById('fornTable');
      let rows = [...allForns];

      if (busca) {
        const q = busca.toLowerCase();
        rows = rows.filter(f => {
          const nm = (f.supplier.legal_name || f.supplier.trade_name || '').toLowerCase();
          const cn = (f.supplier.cnpj||'').replace(/\D/g,'');
          return nm.includes(q) || cn.includes(q.replace(/\D/g,''));
        });
      }
      if (filtro === 'recorrentes') {
        rows = rows.filter(f => f.monthly.filter(v=>v>0).length >= 2);
      }

      rows.sort((a,b)=>b.total_30d-a.total_30d);

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:48px;text-align:center;color:var(--text-muted)">
          <div style="font-size:24px;margin-bottom:8px">🔍</div>
          <div>Nenhum fornecedor encontrado</div>
        </td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(f => {
        const s  = f.supplier;
        const nm = s.legal_name || s.trade_name || `Fornecedor ${s.cnpj}`;
        const color = avatarColor(nm);
        const ini   = initials(nm);

        // Placeholder = criado automaticamente pelo agente (nome é "Fornecedor CNPJ")
        const isPlaceholder = /^Fornecedor \d{14}$/.test(nm);
        const nameHtml = isPlaceholder
          ? `<span style="color:var(--text-muted);font-style:italic">${nm}</span>`
          : `<span>${nm}</span>`;

        const isRec = f.monthly.filter(v=>v>0).length >= 2;
        const badgeRec = isRec
          ? `<span style="font-size:10px;background:var(--success-soft);color:var(--success);padding:2px 7px;border-radius:999px;font-weight:600;margin-left:6px;white-space:nowrap">recorrente</span>`
          : '';

        const total30html = f.total_30d > 0
          ? fmtBRL(f.total_30d)
          : `<span style="color:var(--text-soft)">—</span>`;

        const sid = s.id.replace(/'/g,"\\'");
        return `<tr onclick="window._FORN_openDrawer('${sid}')">
          <td>
            <div class="forn-cell">
              <div class="forn-avatar" style="background:${color}">${ini}</div>
              <div>
                <div class="forn-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">${nameHtml}${badgeRec}</div>
                <div class="forn-cnpj">${fmtCNPJ(s.cnpj)}</div>
              </div>
            </div>
          </td>
          <td><span class="cat-chip cat-diversos">—</span></td>
          <td>
            <div>${fmtDate(f.ultima)}</div>
            <div class="tiny-date">${f.invoices.length} NF-e</div>
          </td>
          <td class="num">${total30html}</td>
          <td class="ctr"><span style="color:var(--text-soft);font-size:11px">—</span></td>
          <td class="ctr">${sparkSVG(f.monthly)}</td>
        </tr>`;
      }).join('');
    }

    // ── Drawer detalhe
    window._FORN_openDrawer = function(supId) {
      const f = allForns.find(x => x.supplier.id === supId);
      if (!f) return;
      const s   = f.supplier;
      const nm  = s.legal_name || s.trade_name || `Fornecedor ${s.cnpj}`;
      const color = avatarColor(nm);
      const ini   = initials(nm);
      const city  = [s.address_city, s.address_state].filter(Boolean).join('/') || '—';

      const total6m = f.monthly.reduce((a,b)=>a+b,0);

      // Polyline para mini-chart
      const vals = f.monthly;
      const maxV = Math.max(...vals, 1);
      const chartPts = vals.map((v,i) => {
        const x = (i/(vals.length-1)) * 200;
        const y = 58 - (v/maxV)*52;
        return `${x.toFixed(0)},${y.toFixed(0)}`;
      }).join(' ');

      // Últimas 5 NF-e
      const recentes = f.invoices.slice(0,5);
      const histHtml = recentes.length
        ? recentes.map(inv => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid var(--border);font-size:12.5px">
            <div>
              <div style="font-weight:500">${fmtDate(inv.issue_date)}</div>
              <div style="font-size:11px;color:var(--text-soft);font-family:'Geist Mono',monospace">${(inv.id||'').slice(0,8)}…</div>
            </div>
            <div style="font-family:'Geist Mono',monospace;font-weight:600">${fmtBRL(inv.total)}</div>
          </div>`).join('')
        : `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px">Nenhuma NF-e registrada</div>`;

      const contactHtml = (s.email || s.phone) ? `
        <div class="dr-section">
          <div class="dr-section-title"><i data-lucide="phone"></i> Contato</div>
          <div class="cond-grid">
            ${s.email ? `<div class="cond-item"><span class="k">E-mail</span><span class="v" style="font-size:11px;word-break:break-all">${s.email}</span></div>` : ''}
            ${s.phone ? `<div class="cond-item"><span class="k">Telefone</span><span class="v">${s.phone}</span></div>` : ''}
          </div>
        </div>` : '';

      const monthLabels = f.months6.map((mh,i) =>
        `<div style="text-align:center;flex:1">
          <div style="font-size:9px;color:var(--text-soft)">${mh.label}</div>
          <div style="font-size:10px;font-weight:600;font-family:'Geist Mono',monospace">${vals[i]>0?'R$'+Math.round(vals[i]/1000)+'k':'—'}</div>
        </div>`
      ).join('');

      document.getElementById('dr-title').textContent = nm;
      document.getElementById('dr-body').innerHTML = `
        <div class="dr-head-info">
          <div class="dr-avatar-lg" style="background:${color}">${ini}</div>
          <div class="dr-head-meta">
            <h4>${nm}</h4>
            <p>${fmtCNPJ(s.cnpj)} · ${city}</p>
          </div>
        </div>

        <div class="dr-stats">
          <div class="dr-stat">
            <div class="dr-stat-label">Compras 6 meses</div>
            <div class="dr-stat-value">${fmtBRL(total6m)}</div>
            <div class="dr-stat-sub">via NF-e de entrada</div>
          </div>
          <div class="dr-stat">
            <div class="dr-stat-label">NF-e registradas</div>
            <div class="dr-stat-value">${f.invoices.length}</div>
            <div class="dr-stat-sub">no banco de dados</div>
          </div>
          <div class="dr-stat">
            <div class="dr-stat-label">Última compra</div>
            <div class="dr-stat-value" style="font-size:14px">${fmtDate(f.ultima)}</div>
            <div class="dr-stat-sub">${f.total_30d>0 ? fmtBRL(f.total_30d)+' nos últimos 30d' : 'Sem compras recentes'}</div>
          </div>
        </div>

        <div class="dr-section">
          <div class="dr-section-title"><i data-lucide="line-chart"></i> Volume mensal (últimos 6 meses)</div>
          <div class="mini-chart" style="height:110px">
            <div class="mini-chart-header">
              <span>${f.months6[0].label}</span>
              <b>${fmtBRL(vals[vals.length-1])}</b>
              <span>${f.months6[f.months6.length-1].label}</span>
            </div>
            <svg viewBox="0 0 200 60" preserveAspectRatio="none" style="flex:1">
              <polyline points="${chartPts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
              <polyline points="0,60 ${chartPts} 200,60" fill="var(--accent)" fill-opacity="0.08" stroke="none"/>
            </svg>
            <div style="display:flex;justify-content:space-between;padding-top:4px">${monthLabels}</div>
          </div>
        </div>

        <div class="dr-section">
          <div class="dr-section-title"><i data-lucide="file-text"></i> NF-e recentes</div>
          <div style="background:var(--bg-soft);border:1px solid var(--border);border-radius:8px;overflow:hidden">
            ${histHtml}
          </div>
        </div>

        ${contactHtml}
      `;
      lucide.createIcons();

      document.querySelector('.drawer-backdrop').classList.add('open');
      document.getElementById('drawer').classList.add('open');
    };

    // ── Badge sidebar
    function updateBadge() {
      const badge = document.querySelector('.nav-item.active .nav-badge');
      if (badge) badge.textContent = allForns.filter(f=>f.invoices.length>0).length;
    }

    // ── Busca
    document.querySelector('.search input')?.addEventListener('input', e => {
      busca = e.target.value.trim();
      renderTable();
    });

    // ── Chips filtro
    document.querySelectorAll('.status-chip').forEach((chip, i) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.status-chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        filtro = i === 0 ? 'todos' : i === 1 ? 'recorrentes' : 'todos';
        renderTable();
      });
    });

    load();
  }

})();
