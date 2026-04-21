// DM Pay — Calendario com dados reais do Supabase
(function() {
  const HOJE = new Date(); HOJE.setHours(0,0,0,0);
  let MES_REF = HOJE.getMonth(); // 0-11
  let ANO_REF = HOJE.getFullYear();
  let PAYABLES = [];
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function fmtBRL(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}); }
  function fmtBRLfull(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function diffDays(iso) { if(!iso) return 0; const [y,m,d]=String(iso).slice(0,10).split('-').map(Number); return Math.round((new Date(y,m-1,d)-HOJE)/86400000); }
  function brDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; }
  function isoOfLocal(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }

  async function load() {
    const inicio = new Date(ANO_REF, MES_REF, 1).toISOString().slice(0,10);
    const fim = new Date(ANO_REF, MES_REF + 2, 0).toISOString().slice(0,10);
    const COMPANY_ID = window.DMPAY_COMPANY.id;

    const pagsR = await sb.from('payables')
      .select('id, amount, due_date, status, paid_at, description, payment_method, boleto_line, suppliers(legal_name, cnpj)')
      .eq('company_id', COMPANY_ID)
      .gte('due_date', inicio).lte('due_date', fim)
      .limit(2000);
    if (pagsR.error) { console.error(pagsR.error); return; }
    PAYABLES = pagsR.data || [];
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

    // Agrega por dia — só SAÍDAS (payables / boletos a pagar)
    const porDia = {};
    function bucket(dia) {
      if (!porDia[dia]) porDia[dia] = { total:0, count:0, paid:0, items:[] };
      return porDia[dia];
    }
    PAYABLES.forEach(p => {
      const d = new Date(p.due_date + 'T00:00:00');
      if (d.getMonth() === MES_REF && d.getFullYear() === ANO_REF) {
        const b = bucket(d.getDate());
        b.total += Number(p.amount);
        b.count += 1;
        if (p.status === 'paid') b.paid += 1;
        b.items.push(p);
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
      const temAlgo = agg && agg.total > 0;
      const ehFds = isWk;
      if (isHoje) {
        html += `<span class="cal-day-total" style="font-size:11px;color:var(--accent);font-weight:600">Hoje</span>`;
      } else if (temAlgo) {
        html += `<span class="cal-day-total" style="color:var(--danger)">−${fmtBRL(agg.total)}</span>`;
        const atrasado = window.DMPAY_DIAUTIL ? window.DMPAY_DIAUTIL.atrasado(isoOfLocal(dt)) : diffDays(dt.toISOString().slice(0,10)) < 0;
        const dots = Math.min(agg.count, 3);
        let chips = '<div class="cal-day-chips">';
        for (let i = 0; i < dots; i++) {
          const cls = agg.paid === agg.count ? 'paid' : (atrasado ? 'late' : 'open');
          chips += `<span class="cal-dot ${cls}"></span>`;
        }
        const cnt = agg.count > 1 ? `${agg.count} boletos` : '1 boleto';
        chips += `<span class="cal-day-count">${cnt}</span></div>`;
        html += chips;
        if (ehFds) html += `<span class="cal-day-total" style="font-size:10px;color:var(--text-muted);font-style:italic;font-weight:500">→ paga seg</span>`;
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
    const saidas = PAYABLES.filter(p => {
      const d = new Date(p.due_date + 'T00:00:00');
      return d.getDate() === dia && d.getMonth() === MES_REF && d.getFullYear() === ANO_REF;
    });
    const totalSaida = saidas.reduce((s,p)=>s+Number(p.amount), 0);
    const drawerHead = document.querySelector('.drawer-head h2');
    const drawerP = document.querySelector('.drawer-head p');
    if (drawerHead) drawerHead.textContent = `${dt.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long'})}`;
    if (drawerP) {
      drawerP.innerHTML = saidas.length
        ? `<span style="color:var(--danger)">−${fmtBRLfull(totalSaida)} <small>(${saidas.length} boleto${saidas.length!==1?'s':''})</small></span>`
        : '<i>Sem vencimentos</i>';
    }
    const boletosArea = document.querySelector('.drawer-body');
    if (!boletosArea) { document.getElementById('drawer')?.classList.add('open'); return; }

    let htmlOut = '';
    if (saidas.length > 0) {
      htmlOut += saidas.map(p => {
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
              ${!isPago && !temBoleto ? `<button onclick="DMPAY_CAL.colarCodigo('${p.id}')" style="padding:6px 10px;font-size:11.5px;background:var(--warn-soft);color:var(--warn);border:1px solid var(--warn);border-radius:6px;cursor:pointer;font-weight:600">📋 Colar código</button>` : ''}
              ${!isPago && temBoleto ? `<button onclick="DMPAY_CAL.copiarCodigo('${p.id}', this)" style="padding:6px 10px;font-size:11.5px;background:transparent;color:var(--accent);border:1px solid var(--accent);border-radius:6px;cursor:pointer;font-weight:600">📋 Copiar código</button>` : ''}
              ${!isPago && temBoleto ? `<button onclick="DMPAY_CAL.pagar('${p.id}')" style="padding:6px 10px;font-size:11.5px;background:var(--accent);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:5px"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Ver boleto</button>` : ''}
              ${!isPago ? `<button onclick="DMPAY_CAL.marcarPago('${p.id}')" style="padding:6px 10px;font-size:11.5px;background:transparent;color:var(--success);border:1px solid var(--success);border-radius:6px;cursor:pointer;font-weight:600">✓ Marcar pago</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    }
    if (htmlOut) {
      boletosArea.innerHTML = htmlOut;
    } else {
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
      JsBarcode('#barcodeSvg', barcode44, { format:'ITF', width:2.2, height:80, displayValue:false, margin:20, background:'#fff', lineColor:'#000' });
    } catch(e) { console.warn('barcode:', e); }
    modal.classList.add('open');
  }

  async function marcarPago(id) {
    const before = (typeof PAYABLES !== 'undefined') ? PAYABLES.find(x => x.id === id) : null;
    const paid_at = new Date().toISOString();
    const { error } = await sb.from('payables').update({ status:'paid', paid_at }).eq('id', id);
    if (error) { alert(error.message); return; }
    if (window.DMPAY_AUDIT) window.DMPAY_AUDIT.pay('payable', id,
      before ? { status: before.status, paid_at: before.paid_at } : null,
      { status: 'paid', paid_at });
    document.getElementById('drawer')?.classList.remove('open');
    await load(); render();
  }

  async function colarCodigo(id) {
    const p = PAYABLES.find(x => x.id === id); if (!p) return;
    if (!window.DMPAY_UI) { alert('UI não carregada'); return; }
    const r = await window.DMPAY_UI.open({
      title: 'Código de barras do boleto',
      desc: `${p.suppliers?.legal_name || p.description || ''} · ${fmtBRLfull(p.amount)}`,
      fields: [{
        key: 'codigo',
        label: 'Linha digitável ou código de barras',
        value: p.boleto_line || '',
        multiline: true,
        placeholder: '23793.38128 00000.000000 00000.000000 1 99990000000000',
        hint: 'Aceita linha digitável (47 dígitos com espaços/pontos) ou código de barras puro (44 dígitos).'
      }],
      submitLabel: 'Salvar código',
      onSubmit: async (vals) => {
        const v = vals.codigo || '';
        const digits = v.replace(/\D/g, '');
        if (digits.length !== 44 && digits.length !== 47) {
          throw new Error(`Código inválido: ${digits.length} dígitos. Precisa ter 44 ou 47.`);
        }
        const before = (typeof PAYABLES !== 'undefined') ? PAYABLES.find(x => x.id === id) : null;
        const after = { boleto_line: v.trim(), payment_method: 'boleto' };
        const { error } = await sb.from('payables').update(after).eq('id', id);
        if (error) throw new Error(error.message);
        if (window.DMPAY_AUDIT) window.DMPAY_AUDIT.update('payable', id,
          before ? { boleto_line: before.boleto_line, payment_method: before.payment_method } : null,
          after);
      }
    });
    if (!r) return;
    const dia = new Date(p.due_date + 'T00:00:00').getDate();
    await load(); render(); openDia(dia);
  }

  async function copiarCodigo(id, btn) {
    const p = PAYABLES.find(x => x.id === id); if (!p?.boleto_line) return;
    const text = p.boleto_line;
    const feedback = (ok) => {
      if (!btn) { alert(ok ? 'Código copiado!' : 'Não foi possível copiar'); return; }
      const orig = btn.innerHTML;
      btn.innerHTML = ok ? '✓ Copiado!' : '⚠ Falhou';
      btn.style.background = ok ? 'var(--success)' : 'var(--danger)';
      btn.style.color = 'white';
      btn.style.borderColor = ok ? 'var(--success)' : 'var(--danger)';
      setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }, 1500);
    };
    try {
      await navigator.clipboard.writeText(text);
      feedback(true);
    } catch(e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        feedback(ok);
      } catch(e2) { feedback(false); }
    }
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

  window.DMPAY_CAL = { openDia: openDia, nav: nav, pagar: pagar, marcarPago: marcarPago, colarCodigo: colarCodigo, copiarCodigo: copiarCodigo };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
