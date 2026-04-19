// DM Pay — Calendario com dados reais do Supabase
(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);
  let MES_REF = HOJE.getMonth(); // 0-11
  let ANO_REF = HOJE.getFullYear();
  let PAYABLES = [];
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function fmtBRL(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}); }
  function fmtBRLfull(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function diffDays(iso) { if(!iso) return 0; const d = new Date(iso); d.setHours(0,0,0,0); return Math.round((d-HOJE)/86400000); }
  function brDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; }

  async function load() {
    const inicio = new Date(ANO_REF, MES_REF, 1).toISOString().slice(0,10);
    const fim = new Date(ANO_REF, MES_REF + 2, 0).toISOString().slice(0,10); // pega ate fim do mês seguinte tambem
    const { data, error } = await sb
      .from('payables')
      .select('id, amount, due_date, status, paid_at, description, payment_method, boleto_line, suppliers(legal_name, cnpj)')
      .eq('company_id', window.DMPAY_COMPANY.id)
      .gte('due_date', inicio)
      .lte('due_date', fim)
      .limit(2000);
    if (error) { console.error(error); return; }
    PAYABLES = data;
  }

  function render() {
    const grid = document.querySelector('.cal-grid');
    if (!grid) return;
    // Limpa
    grid.innerHTML = '';

    // Atualiza titulo do mês
    const titulo = document.querySelector('.month-nav .current');
    if (titulo) titulo.textContent = `${MESES[MES_REF]} ${ANO_REF}`;

    const primeiroDia = new Date(ANO_REF, MES_REF, 1);
    const ultimoDia = new Date(ANO_REF, MES_REF + 1, 0);
    const diaSemPrim = primeiroDia.getDay(); // 0=dom

    // Agrega por dia
    const porDia = {};
    PAYABLES.forEach(p => {
      const d = new Date(p.due_date + 'T00:00:00');
      if (d.getMonth() === MES_REF && d.getFullYear() === ANO_REF) {
        const dia = d.getDate();
        if (!porDia[dia]) porDia[dia] = { total:0, count:0, paid:0, items:[] };
        porDia[dia].total += Number(p.amount);
        porDia[dia].count += 1;
        if (p.status === 'paid') porDia[dia].paid += 1;
        porDia[dia].items.push(p);
      }
    });

    // Dias do mês anterior (preenchimento)
    const mesAnt = MES_REF === 0 ? 11 : MES_REF - 1;
    const anoAnt = MES_REF === 0 ? ANO_REF - 1 : ANO_REF;
    const ultDiaAnt = new Date(anoAnt, mesAnt + 1, 0).getDate();
    for (let i = diaSemPrim - 1; i >= 0; i--) {
      const d = ultDiaAnt - i;
      const dt = new Date(anoAnt, mesAnt, d);
      const isWk = dt.getDay() === 0 || dt.getDay() === 6;
      grid.innerHTML += `<div class="cal-day empty${isWk?' weekend':''}"><span class="cal-day-num">${d}</span></div>`;
    }

    // Dias do mês atual
    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
      const dt = new Date(ANO_REF, MES_REF, dia);
      const isWk = dt.getDay() === 0 || dt.getDay() === 6;
      const isHoje = dt.getTime() === HOJE.getTime();
      const agg = porDia[dia];
      let html = `<div class="cal-day${isWk?' weekend':''}${isHoje?' today':''}" onclick="DMPAY_CAL.openDia(${dia})">`;
      html += `<span class="cal-day-num">${dia}</span>`;
      if (isHoje) {
        html += `<span class="cal-day-total" style="font-size:11px;color:var(--accent);font-weight:600">Hoje</span>`;
      } else if (agg && agg.total > 0) {
        html += `<span class="cal-day-total">${fmtBRL(agg.total)}</span>`;
        const dots = Math.min(agg.count, 3);
        let chips = '<div class="cal-day-chips">';
        for (let i = 0; i < dots; i++) {
          const cls = agg.paid === agg.count ? 'paid' : (diffDays(dt.toISOString().slice(0,10)) < 0 ? 'late' : 'open');
          chips += `<span class="cal-dot ${cls}"></span>`;
        }
        const cnt = agg.count > 1 ? `${agg.count} contas` : '1 conta';
        chips += `<span class="cal-day-count">${cnt}</span></div>`;
        html += chips;
        if (agg.total > 50000) html = html.replace('cal-day', 'cal-day critical');
        else if (agg.total > 20000) html = html.replace('cal-day', 'cal-day heavy');
      }
      html += `</div>`;
      grid.innerHTML += html;
    }

    // Dias do mês seguinte (preenchimento)
    const totalCells = diaSemPrim + ultimoDia.getDate();
    const restantes = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= restantes; i++) {
      const dt = new Date(ANO_REF, MES_REF + 1, i);
      const isWk = dt.getDay() === 0 || dt.getDay() === 6;
      grid.innerHTML += `<div class="cal-day empty${isWk?' weekend':''}"><span class="cal-day-num">${i}</span></div>`;
    }

    atualizaKPIs(porDia);
  }

  function atualizaKPIs(porDia) {
    const totMes = Object.values(porDia).reduce((s,d)=>s+d.total, 0);
    const totHoje = porDia[HOJE.getDate()] && HOJE.getMonth() === MES_REF ? porDia[HOJE.getDate()].total : 0;

    // Pagos no mes
    const pagosMes = PAYABLES.filter(p => p.status === 'paid' && p.paid_at && p.paid_at.startsWith(`${ANO_REF}-${String(MES_REF+1).padStart(2,'0')}`)).reduce((s,p)=>s+Number(p.amount), 0);

    // Próximo mês
    const proxMes = MES_REF + 1 > 11 ? 0 : MES_REF + 1;
    const proxAno = MES_REF + 1 > 11 ? ANO_REF + 1 : ANO_REF;
    const totProx = PAYABLES.filter(p => {
      const d = new Date(p.due_date + 'T00:00:00');
      return d.getMonth() === proxMes && d.getFullYear() === proxAno;
    }).reduce((s,p)=>s+Number(p.amount), 0);

    const ks = document.querySelectorAll('.kpi-value');
    if (ks[0]) ks[0].textContent = fmtBRL(totMes);
    if (ks[1]) ks[1].textContent = fmtBRL(totHoje);
    if (ks[2]) ks[2].textContent = fmtBRL(pagosMes);
    if (ks[3]) ks[3].textContent = fmtBRL(totProx);

    const heroSub = document.querySelector('.hero-sub') || document.querySelector('.hero p');
    if (heroSub) heroSub.innerHTML = `${MESES[MES_REF]}/${ANO_REF} · <b>dados reais</b> do banco · ${Object.keys(porDia).length} dias com vencimento`;
  }

  function openDia(dia) {
    const dt = new Date(ANO_REF, MES_REF, dia);
    const items = PAYABLES.filter(p => {
      const d = new Date(p.due_date + 'T00:00:00');
      return d.getDate() === dia && d.getMonth() === MES_REF && d.getFullYear() === ANO_REF;
    });
    const total = items.reduce((s,p)=>s+Number(p.amount), 0);
    const drawerHead = document.querySelector('.drawer-head h2');
    const drawerP = document.querySelector('.drawer-head p');
    if (drawerHead) drawerHead.textContent = `${dt.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long'})}`;
    if (drawerP) drawerP.innerHTML = `${items.length} boleto${items.length !== 1 ? 's' : ''} · <b>${fmtBRLfull(total)}</b>`;
    // Substitui boletos no drawer
    const boletosArea = document.querySelector('.drawer-body');
    if (boletosArea && items.length > 0) {
      boletosArea.innerHTML = items.map(p => {
        const temBoleto = p.payment_method === 'boleto' && p.boleto_line && p.boleto_line.replace(/\D/g,'').length >= 44;
        const isPago = p.status === 'paid';
        return `
        <div style="padding:14px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:10px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13.5px">${p.suppliers?.legal_name || p.description || '—'}</div>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${p.description || ''}</div>
            </div>
            <div style="font-family:'Geist Mono',monospace;font-weight:700;font-size:14px;white-space:nowrap">${fmtBRLfull(p.amount)}</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="badge" style="font-size:10px;padding:2px 7px;border-radius:999px;background:${isPago?'var(--success-soft)':'var(--warn-soft)'};color:${isPago?'var(--success)':'var(--warn)'};font-weight:600;text-transform:uppercase;letter-spacing:.04em">${isPago?'Pago':'Em aberto'}</span>
            <div style="display:flex;gap:6px">
              ${!isPago && temBoleto ? `<button onclick="DMPAY_CAL.pagar('${p.id}')" style="padding:6px 10px;font-size:11.5px;background:var(--accent);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:5px"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h2v2H7zm0 4h2v2H7zm4-4h2v2h-2zm4 0h2v2h-2zm0 4h2v2h-2z"/></svg> Pagar com código</button>` : ''}
              ${!isPago ? `<button onclick="DMPAY_CAL.marcarPago('${p.id}')" style="padding:6px 10px;font-size:11.5px;background:transparent;color:var(--success);border:1px solid var(--success);border-radius:6px;cursor:pointer;font-weight:600">✓ Marcar pago</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    } else if (boletosArea) {
      boletosArea.innerHTML = '<p style="text-align:center;padding:30px 20px;color:var(--text-muted)">Nenhum vencimento neste dia</p>';
    }
    document.getElementById('drawer')?.classList.add('open');
  }

  // Abrir modal de pagamento com barcode (reutiliza payModal do HTML)
  function pagar(id) {
    const p = PAYABLES.find(x => x.id === id); if (!p) return;
    const modal = document.getElementById('payModal');
    if (!modal) { alert('Modal de pagamento não disponível'); return; }
    document.getElementById('paySupplier').textContent = p.suppliers?.legal_name || p.description || 'Boleto';
    document.getElementById('payNfInfo').textContent = p.description || '—';
    document.getElementById('payAmount').textContent = fmtBRLfull(p.amount);
    document.getElementById('payLineText').textContent = p.boleto_line;
    // Renderiza barcode
    try {
      const digits = p.boleto_line.replace(/\D/g,'');
      let barcode44;
      if (digits.length === 44) barcode44 = digits;
      else if (digits.length === 47) barcode44 = digits.substr(0,4) + digits.substr(32,1) + digits.substr(33,14) + digits.substr(4,5) + digits.substr(10,10) + digits.substr(21,10);
      else barcode44 = digits.substr(0,44);
      JsBarcode('#payBarcode', barcode44, { format:'ITF', width:1.6, height:70, displayValue:false, margin:0, background:'#fff', lineColor:'#000' });
    } catch(e) { console.warn('barcode:', e); }
    modal.classList.add('open');
  }

  async function marcarPago(id) {
    const { error } = await sb.from('payables').update({ status:'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert(error.message); return; }
    document.getElementById('drawer')?.classList.remove('open');
    await load(); render();
  }

  async function nav(direction) {
    if (direction === 'today') {
      MES_REF = HOJE.getMonth(); ANO_REF = HOJE.getFullYear();
    } else {
      MES_REF += direction;
      if (MES_REF < 0) { MES_REF = 11; ANO_REF -= 1; }
      else if (MES_REF > 11) { MES_REF = 0; ANO_REF += 1; }
    }
    await load(); render();
  }

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    // Wire month nav
    const navBtns = document.querySelectorAll('.month-nav button');
    navBtns.forEach((b, i) => {
      b.onclick = null; // limpa handler antigo
      if (i === 0) b.addEventListener('click', () => nav(-1));
      else if (b.classList.contains('today-btn')) b.addEventListener('click', () => nav('today'));
      else b.addEventListener('click', () => nav(1));
    });
    await load(); render();
  }

  window.DMPAY_CAL = { openDia: openDia, nav: nav, pagar: pagar, marcarPago: marcarPago };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
