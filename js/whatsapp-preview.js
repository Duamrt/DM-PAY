// DM Pay — Briefing WhatsApp com dados reais do dia (pra copiar/colar no WA)
(function() {
  function fmt(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function saudar(){ const h = new Date().getHours(); return h<12?'Bom dia':(h<18?'Boa tarde':'Boa noite'); }
  function isoLocal(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }

  // Regra bancária: boletos de sáb/dom compensam na próxima seg. Hoje = dia útil,
  // pega tudo que vence de HOJE até o próximo dia útil (quando HOJE é seg, puxa sáb+dom+seg).
  function rangeBancarioHoje() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const dow = hoje.getDay();
    let inicio = new Date(hoje), fim = new Date(hoje);
    if (dow === 1) inicio.setDate(inicio.getDate() - 2); // seg: inclui sáb+dom
    // Se hoje é sáb ou dom, não há "pagar hoje" — mostra a segunda
    if (dow === 6 || dow === 0) {
      while (fim.getDay() !== 1) fim.setDate(fim.getDate() + 1);
      inicio = new Date(fim);
      inicio.setDate(fim.getDate() - 2);
    }
    return { inicioIso: isoLocal(inicio), fimIso: isoLocal(fim), dataRef: fim };
  }

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const { inicioIso, fimIso, dataRef } = rangeBancarioHoje();

    // Busca paralela: dono da empresa + boletos + vendas + saldos
    const [donoR, pagsR, salesR, bankR] = await Promise.all([
      sb.from('profiles').select('name').eq('company_id', COMPANY_ID).eq('role', 'dono').limit(1).maybeSingle(),
      sb.from('payables').select('amount, due_date, description, suppliers(legal_name, trade_name)')
        .eq('company_id', COMPANY_ID).eq('status', 'open')
        .gte('due_date', inicioIso).lte('due_date', fimIso)
        .order('amount', { ascending: false })
        .limit(500),
      sb.from('daily_sales').select('sale_date, amount')
        .eq('company_id', COMPANY_ID)
        .gte('sale_date', isoLocal(new Date(Date.now() - 3*86400000)))
        .limit(500),
      sb.from('bank_accounts').select('balance').eq('company_id', COMPANY_ID).eq('active', true)
    ]);
    const nomeDono = (donoR?.data?.name || '').split(' ')[0] || 'dono';
    const pags = pagsR.data || [];
    const sales = salesR.data || [];
    const banks = bankR.data || [];

    const totalPagar = pags.reduce((s,p)=>s+Number(p.amount), 0);
    const saldoBancos = banks.reduce((s,b)=>s+Number(b.balance||0), 0);

    // Vendas agregadas por dia
    const porDia = {};
    sales.forEach(s => { porDia[s.sale_date] = (porDia[s.sale_date] || 0) + Number(s.amount); });
    const datasOrdenadas = Object.keys(porDia).sort();
    const vendasFds = datasOrdenadas.slice(-3).reduce((s,d) => s + porDia[d], 0);

    const dataStr = dataRef.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
    const top5 = pags.slice(0, 5);
    const restoQtd = pags.length - top5.length;

    // Atualiza a primeira bubble (Bom dia)
    const bubbles = document.querySelectorAll('.wa-chat .wa-bubble.received');
    if (bubbles[0]) {
      bubbles[0].innerHTML = `
        <span class="wa-ttl"><span class="wa-emoji">🌅</span> ${saudar()}, ${nomeDono}!</span>
        ${dataStr.charAt(0).toUpperCase() + dataStr.slice(1)}.
        <div class="wa-time">06:15</div>`;
    }
    // Segunda bubble: Resumo do dia
    if (bubbles[1]) {
      const listHtml = top5.map(p => {
        const nome = p.suppliers?.trade_name || p.suppliers?.legal_name || p.description || '—';
        const nomeCurto = nome.length > 24 ? nome.slice(0,21)+'…' : nome;
        return `<li><span>${nomeCurto}</span><span>${fmt(p.amount)}</span></li>`;
      }).join('');
      const resto = restoQtd > 0 ? `<li style="opacity:.7"><span>+ ${restoQtd} boleto${restoQtd>1?'s':''}</span><span>—</span></li>` : '';
      bubbles[1].innerHTML = `
        <span class="wa-ttl">Resumo do dia</span>
        <div class="wa-kpi">
          <div class="wa-kpi-val">${fmt(totalPagar)}</div>
          <div class="wa-kpi-lbl">${pags.length === 0 ? 'NENHUM BOLETO' : `A PAGAR · ${pags.length} BOLETO${pags.length>1?'S':''}`}</div>
        </div>
        ${pags.length > 0 ? `
        <div style="font-size:13px;margin:8px 0 4px;color:var(--wa-meta);font-weight:500">TOP ${top5.length} POR VALOR</div>
        <ul class="wa-list">${listHtml}${resto}</ul>` : `<div style="font-size:13px;color:var(--wa-meta);margin-top:6px">Dia tranquilo — sem contas vencendo.</div>`}
        <div class="wa-time">06:15</div>`;
    }
    // Terceira bubble: Saldo
    if (bubbles[2]) {
      const apos = saldoBancos - totalPagar;
      bubbles[2].innerHTML = `
        <span class="wa-ttl"><span class="wa-emoji">📊</span> Saldo</span>
        Hoje: <b>${fmt(saldoBancos)}</b> nos bancos.<br>
        ${totalPagar > 0 ? `Após pagar tudo: <b style="color:${apos<0?'#c62828':'var(--wa-text)'}">${fmt(apos)}</b><br>` : ''}
        <span style="color:var(--wa-meta);font-size:12px">Vendas últimos 3 dias: ${fmt(vendasFds)}</span>
        <div class="wa-time">06:15</div>`;
    }

    // Monta texto puro do WhatsApp (pra copiar)
    function textoParaCopia() {
      const l = [];
      l.push(`🌅 ${saudar()}, ${nomeDono}!`);
      l.push(dataStr.charAt(0).toUpperCase() + dataStr.slice(1) + '.');
      l.push('');
      l.push('*Resumo do dia*');
      if (pags.length === 0) {
        l.push('✅ Nenhum boleto vencendo hoje.');
      } else {
        l.push(`💰 A pagar: *${fmt(totalPagar)}* (${pags.length} boleto${pags.length>1?'s':''})`);
        l.push('');
        l.push('Top ' + top5.length + ':');
        top5.forEach(p => {
          const n = p.suppliers?.trade_name || p.suppliers?.legal_name || p.description || '—';
          l.push(`• ${n} — ${fmt(p.amount)}`);
        });
        if (restoQtd > 0) l.push(`• +${restoQtd} boleto${restoQtd>1?'s':''} menores`);
      }
      l.push('');
      l.push(`📊 Saldo: ${fmt(saldoBancos)}`);
      if (totalPagar > 0) l.push(`Após pagar tudo: ${fmt(saldoBancos - totalPagar)}`);
      l.push(`Vendas últimos 3 dias: ${fmt(vendasFds)}`);
      l.push('');
      l.push('— DM Pay');
      return l.join('\n');
    }

    // Injeta botão "Copiar pra WhatsApp" no topo da tela (na área do phone-frame)
    const chat = document.querySelector('.wa-chat');
    if (chat && !document.getElementById('wa-copy-btn')) {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:sticky;top:0;display:flex;gap:8px;padding:8px;background:var(--bg-card);border-bottom:1px solid var(--border);z-index:5';
      bar.innerHTML = `
        <button id="wa-copy-btn" style="flex:1;padding:8px 12px;background:var(--wa-green);color:white;border:none;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
          <i data-lucide="copy" style="width:14px;height:14px"></i> Copiar texto pra WhatsApp
        </button>
        <button id="wa-refresh" style="padding:8px 12px;background:transparent;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer" title="Recarregar">
          <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
        </button>`;
      chat.parentElement.insertBefore(bar, chat);
      if (window.lucide) lucide.createIcons();
      document.getElementById('wa-copy-btn').onclick = async (e) => {
        const btn = e.currentTarget;
        const txt = textoParaCopia();
        try {
          await navigator.clipboard.writeText(txt);
          const orig = btn.innerHTML;
          btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> Copiado! Cola no WhatsApp';
          if (window.lucide) lucide.createIcons();
          setTimeout(() => { btn.innerHTML = orig; if (window.lucide) lucide.createIcons(); }, 2500);
        } catch(err) {
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.position='fixed'; ta.style.opacity='0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          alert('Copiado!');
        }
      };
      document.getElementById('wa-refresh').onclick = () => location.reload();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
