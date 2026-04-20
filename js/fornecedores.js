// js/fornecedores.js — DM Pay Fornecedores
// Estado global — sem IIFE, sem closure, zero ambiguidade
'use strict';

window._FORN = {
  all:    [],   // todos os fornecedores enriquecidos
  busca:  '',
  filtro: 'todos',   // 'todos' | 'recorrentes' | 'sem-compra'
  tipo:   'todos',   // 'todos' | 'com-nfe'    | 'sem-nfe'
};

// ── Chamadas dos atributos inline no HTML
window._FORN_busca = function(val) {
  window._FORN.busca = (val || '').trim();
  window._FORN_render();
};
window._FORN_tipo = function(val) {
  window._FORN.tipo = val || 'todos';
  window._FORN_render();
};
window._FORN_chip = function(el, idx) {
  document.querySelectorAll('.status-chip').forEach(function(c) { c.classList.remove('active'); });
  el.classList.add('active');
  window._FORN.filtro = idx === 0 ? 'todos' : idx === 1 ? 'recorrentes' : 'sem-compra';
  window._FORN_render();
};

// ── Helpers
var FORN_PALETTE = ['#2563EB','#7C3AED','#DB2777','#DC2626','#D97706','#059669','#0891B2','#9333EA'];
function _fornAvatarColor(str) {
  var h = 0;
  for (var i = 0; i < (str||'').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xFFFFFF;
  return FORN_PALETTE[Math.abs(h) % FORN_PALETTE.length];
}
function _fornInitials(name) {
  var w = (name||'?').trim().split(/\s+/).filter(Boolean);
  if (w.length === 1) return w[0].slice(0,2).toUpperCase();
  return (w[0][0] + w[w.length-1][0]).toUpperCase();
}
function _fornFmtCNPJ(c) {
  var d = (c||'').replace(/\D/g,'');
  if (d.length !== 14) return c || '—';
  return d.slice(0,2)+'.'+d.slice(2,5)+'.'+d.slice(5,8)+'/'+d.slice(8,12)+'-'+d.slice(12);
}
function _fornFmtBRL(v) {
  return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2});
}
function _fornFmtDate(s) {
  if (!s) return '—';
  var p = s.split('-');
  return p[2]+'/'+p[1]+'/'+p[0];
}
function _fornSpark(values) {
  var valid = values.filter(function(v){return v>0;});
  if (valid.length < 2) return '<svg width="80" height="24" viewBox="0 0 80 24"><line x1="0" y1="12" x2="80" y2="12" stroke="var(--border)" stroke-width="1.5"/></svg>';
  var max = Math.max.apply(null,values), min = Math.min.apply(null,values), range = max-min||1;
  var pts = values.map(function(v,i){
    var x = (i/(values.length-1))*80, y = 22-((v-min)/range)*20;
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  var last = values[values.length-1], first = values[0];
  var color = last > first*1.08 ? 'var(--danger)' : last < first*0.92 ? 'var(--success)' : 'var(--text-muted)';
  return '<svg width="80" height="24" viewBox="0 0 80 24"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linejoin="round"/></svg>';
}

// ── Render da tabela (lê window._FORN direto)
window._FORN_render = function() {
  var F = window._FORN;
  var tbody = document.getElementById('fornTable');
  if (!tbody) return;

  var rows = F.all.slice();

  // Busca
  if (F.busca) {
    var q = F.busca.toLowerCase();
    rows = rows.filter(function(f) {
      var nm = (f.s.legal_name || f.s.trade_name || '').toLowerCase();
      var cn = (f.s.cnpj||'').replace(/\D/g,'');
      var qNum = q.replace(/\D/g,'');
      return nm.indexOf(q) !== -1 || (qNum.length > 0 && cn.indexOf(qNum) !== -1);
    });
  }

  // Dropdown tipo
  if (F.tipo === 'com-nfe')  rows = rows.filter(function(f){ return f.invs.length > 0; });
  if (F.tipo === 'sem-nfe')  rows = rows.filter(function(f){ return f.invs.length === 0; });

  // Chip filtro
  if (F.filtro === 'recorrentes') rows = rows.filter(function(f){ return f.monthly.filter(function(v){return v>0;}).length >= 2; });
  if (F.filtro === 'sem-compra')  rows = rows.filter(function(f){ return f.t30 === 0; });

  rows.sort(function(a,b){ return b.t30 - a.t30; });

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:48px;text-align:center;color:var(--text-muted)"><div style="font-size:24px;margin-bottom:8px">🔍</div><div>Nenhum fornecedor encontrado</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function(f) {
    var nm = f.s.legal_name || f.s.trade_name || 'Fornecedor '+f.s.cnpj;
    var color = _fornAvatarColor(nm), ini = _fornInitials(nm);
    var isPlaceholder = /^Fornecedor \d{14}$/.test(nm);
    var nameHtml = isPlaceholder
      ? '<span style="color:var(--text-muted);font-style:italic">'+nm+'</span>'
      : '<span>'+nm+'</span>';
    var isRec = f.monthly.filter(function(v){return v>0;}).length >= 2;
    var badgeRec = isRec ? '<span style="font-size:10px;background:var(--success-soft);color:var(--success);padding:2px 7px;border-radius:999px;font-weight:600;margin-left:6px;white-space:nowrap">recorrente</span>' : '';
    var t30html = f.t30 > 0 ? _fornFmtBRL(f.t30) : '<span style="color:var(--text-soft)">—</span>';
    var sid = f.s.id.replace(/'/g,"\\'");
    return '<tr onclick="window._FORN_openDrawer(\''+sid+'\')">'
      +'<td><div class="forn-cell">'
      +'<div class="forn-avatar" style="background:'+color+'">'+ini+'</div>'
      +'<div><div class="forn-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">'+nameHtml+badgeRec+'</div>'
      +'<div class="forn-cnpj">'+_fornFmtCNPJ(f.s.cnpj)+'</div></div>'
      +'</div></td>'
      +'<td><span class="cat-chip cat-diversos">—</span></td>'
      +'<td><div>'+_fornFmtDate(f.ultima)+'</div><div class="tiny-date">'+f.invs.length+' NF-e</div></td>'
      +'<td class="num">'+t30html+'</td>'
      +'<td class="ctr"><span style="color:var(--text-soft);font-size:11px">—</span></td>'
      +'<td class="ctr">'+_fornSpark(f.monthly)+'</td>'
      +'</tr>';
  }).join('');
};

// ── Drawer
window._FORN_openDrawer = function(supId) {
  var f = window._FORN.all.find(function(x){ return x.s.id === supId; });
  if (!f) return;
  var nm = f.s.legal_name || f.s.trade_name || 'Fornecedor '+f.s.cnpj;
  var color = _fornAvatarColor(nm), ini = _fornInitials(nm);
  var total6m = f.monthly.reduce(function(a,b){return a+b;},0);
  var maxV = Math.max.apply(null,f.monthly.concat([1]));
  var chartPts = f.monthly.map(function(v,i){
    var x = (i/(f.monthly.length-1))*200, y = 58-(v/maxV)*52;
    return Math.round(x)+','+Math.round(y);
  }).join(' ');
  var recentes = f.invs.slice(0,5);
  var histHtml = recentes.length
    ? recentes.map(function(inv){
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid var(--border);font-size:12.5px">'
          +'<div style="font-weight:500">'+_fornFmtDate(inv.issue_date)+'</div>'
          +'<div style="font-family:\'Geist Mono\',monospace;font-weight:600">'+_fornFmtBRL(inv.total)+'</div>'
          +'</div>';
      }).join('')
    : '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px">Nenhuma NF-e registrada</div>';
  var contactHtml = '';
  if (f.s.email || f.s.phone) {
    contactHtml = '<div class="dr-section"><div class="dr-section-title"><i data-lucide="phone"></i> Contato</div><div class="cond-grid">'
      +(f.s.email?'<div class="cond-item"><span class="k">E-mail</span><span class="v" style="font-size:11px;word-break:break-all">'+f.s.email+'</span></div>':'')
      +(f.s.phone?'<div class="cond-item"><span class="k">Telefone</span><span class="v">'+f.s.phone+'</span></div>':'')
      +'</div></div>';
  }
  var monthLabels = f.months6.map(function(mh,i){
    return '<div style="text-align:center;flex:1"><div style="font-size:9px;color:var(--text-soft)">'+mh.label+'</div>'
      +'<div style="font-size:10px;font-weight:600;font-family:\'Geist Mono\',monospace">'+(f.monthly[i]>0?'R$'+Math.round(f.monthly[i]/1000)+'k':'—')+'</div></div>';
  }).join('');
  document.getElementById('dr-title').textContent = nm;
  document.getElementById('dr-body').innerHTML =
    '<div class="dr-head-info"><div class="dr-avatar-lg" style="background:'+color+'">'+ini+'</div>'
    +'<div class="dr-head-meta"><h4>'+nm+'</h4><p>'+_fornFmtCNPJ(f.s.cnpj)+'</p></div></div>'
    +'<div class="dr-stats">'
    +'<div class="dr-stat"><div class="dr-stat-label">Compras 6 meses</div><div class="dr-stat-value">'+_fornFmtBRL(total6m)+'</div><div class="dr-stat-sub">via NF-e de entrada</div></div>'
    +'<div class="dr-stat"><div class="dr-stat-label">NF-e registradas</div><div class="dr-stat-value">'+f.invs.length+'</div><div class="dr-stat-sub">no banco de dados</div></div>'
    +'<div class="dr-stat"><div class="dr-stat-label">Última compra</div><div class="dr-stat-value" style="font-size:14px">'+_fornFmtDate(f.ultima)+'</div>'
    +'<div class="dr-stat-sub">'+(f.t30>0?_fornFmtBRL(f.t30)+' nos últimos 30d':'Sem compras recentes')+'</div></div></div>'
    +'<div class="dr-section"><div class="dr-section-title"><i data-lucide="line-chart"></i> Volume mensal (últimos 6 meses)</div>'
    +'<div class="mini-chart" style="height:110px"><div class="mini-chart-header"><span>'+f.months6[0].label+'</span><b>'+_fornFmtBRL(f.monthly[f.monthly.length-1])+'</b><span>'+f.months6[f.months6.length-1].label+'</span></div>'
    +'<svg viewBox="0 0 200 60" preserveAspectRatio="none" style="flex:1">'
    +'<polyline points="'+chartPts+'" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>'
    +'<polyline points="0,60 '+chartPts+' 200,60" fill="var(--accent)" fill-opacity="0.08" stroke="none"/>'
    +'</svg><div style="display:flex;justify-content:space-between;padding-top:4px">'+monthLabels+'</div></div></div>'
    +'<div class="dr-section"><div class="dr-section-title"><i data-lucide="file-text"></i> NF-e recentes</div>'
    +'<div style="background:var(--bg-soft);border:1px solid var(--border);border-radius:8px;overflow:hidden">'+histHtml+'</div></div>'
    +contactHtml;
  lucide.createIcons();
  document.querySelector('.drawer-backdrop').classList.add('open');
  document.getElementById('drawer').classList.add('open');
};

// ── KPIs
function _fornRenderKPIs() {
  var all = window._FORN.all;
  var ativos = all.filter(function(f){return f.invs.length>0;}).length;
  var now = new Date();
  var mesStr = now.getFullYear()+'-'+(''+(now.getMonth()+1)).padStart(2,'0');
  var comprasMes = all.reduce(function(a,f){
    return a + f.invs.filter(function(i){return i.issue_date&&i.issue_date.startsWith(mesStr);}).reduce(function(s,i){return s+(i.total||0);},0);
  },0);
  var ranked = all.slice().sort(function(a,b){return b.t30-a.t30;});
  var totalGer = ranked.reduce(function(a,b){return a+b.t30;},0);
  var top3 = ranked.slice(0,3).reduce(function(a,b){return a+b.t30;},0);
  var conc = totalGer>0 ? Math.round(top3/totalGer*100) : 0;
  var kpis = document.querySelectorAll('.kpi');
  if (kpis[0]) { kpis[0].querySelector('.kpi-value').textContent=ativos; kpis[0].querySelector('.kpi-sub').textContent='de '+all.length+' cadastrados'; }
  if (kpis[1]) { kpis[1].querySelector('.kpi-value').textContent=_fornFmtBRL(comprasMes); kpis[1].querySelector('.kpi-sub').textContent='NF-e de entrada no mês'; }
  if (kpis[2]) { kpis[2].querySelector('.kpi-value').textContent='—'; kpis[2].querySelector('.kpi-sub').textContent='Disponível com itens NF-e (v2)'; }
  if (kpis[3]) { kpis[3].querySelector('.kpi-value').textContent=conc+'%'; kpis[3].querySelector('.kpi-sub').textContent='concentração nos top 3 fornecedores'; }
}

// ── Carrega dados do Supabase
function _fornLoad() {
  var sb = window.sb, CID = window.DMPAY_COMPANY && window.DMPAY_COMPANY.id;
  if (!sb || !CID) return setTimeout(_fornLoad, 100);

  var tbody = document.getElementById('fornTable');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:48px;text-align:center;color:var(--text-muted)"><div style="font-size:13px">Carregando fornecedores…</div></td></tr>';

  var now = new Date();
  var months6 = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months6.push({ y:d.getFullYear(), m:d.getMonth()+1, label:d.toLocaleString('pt-BR',{month:'short'}) });
  }
  var d30 = new Date(now); d30.setDate(d30.getDate()-30);
  var d30Str = d30.toISOString().slice(0,10);

  Promise.all([
    sb.from('suppliers').select('id,cnpj,legal_name,trade_name,email,phone').eq('company_id',CID).order('legal_name'),
    sb.from('invoices').select('supplier_id,issue_date,total').eq('company_id',CID).order('issue_date',{ascending:false}).limit(5000)
  ]).then(function(results) {
    var supRes = results[0], invRes = results[1];
    if (supRes.error) throw new Error('suppliers: '+supRes.error.message);
    if (invRes.error) throw new Error('invoices: '+invRes.error.message);

    var suppliers = supRes.data||[], invoices = invRes.data||[];
    var invMap = {};
    invoices.forEach(function(inv){ if (!inv.supplier_id) return; if (!invMap[inv.supplier_id]) invMap[inv.supplier_id]=[]; invMap[inv.supplier_id].push(inv); });

    window._FORN.all = suppliers.map(function(s) {
      var invs = invMap[s.id]||[];
      var t30 = invs.filter(function(i){return i.issue_date>=d30Str;}).reduce(function(a,b){return a+(b.total||0);},0);
      var ultima = invs.length ? invs[0].issue_date : null;
      var monthly = months6.map(function(mh){
        var prefix = mh.y+'-'+(''+(mh.m)).padStart(2,'0');
        return invs.filter(function(i){return i.issue_date&&i.issue_date.startsWith(prefix);}).reduce(function(a,b){return a+(b.total||0);},0);
      });
      return { s:s, invs:invs, t30:t30, ultima:ultima, monthly:monthly, months6:months6 };
    });

    _fornRenderKPIs();
    window._FORN_render();

    var badge = document.querySelector('.nav-item.active .nav-badge');
    if (badge) badge.textContent = window._FORN.all.filter(function(f){return f.invs.length>0;}).length;

  }).catch(function(e) {
    var tb = document.getElementById('fornTable');
    if (tb) tb.innerHTML = '<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--danger)">Erro ao carregar: '+e.message+'</td></tr>';
  });
}

// ── Init — mesmo padrão do contas-receber.js que funciona
function _fornInit() {
  if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(_fornInit, 100); return; }

  // Busca — addEventListener igual ao contas-receber
  var search = document.querySelector('.search input');
  if (search) {
    var _to;
    search.addEventListener('input', function(e) {
      clearTimeout(_to);
      _to = setTimeout(function() {
        window._FORN.busca = e.target.value;
        window._FORN_render();
      }, 200);
    });
  }

  // Chips — adiciona listener pelo data-index (HTML mantém onclick como fallback)
  document.querySelectorAll('.status-chip').forEach(function(chip, i) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('.status-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      window._FORN.filtro = i === 0 ? 'todos' : i === 1 ? 'recorrentes' : 'sem-compra';
      window._FORN_render();
    });
  });

  // Dropdown tipo
  var sel = document.querySelector('.filter-select');
  if (sel) {
    sel.addEventListener('change', function() {
      window._FORN.tipo = sel.value;
      window._FORN_render();
    });
  }

  _fornLoad();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _fornInit);
else _fornInit();
