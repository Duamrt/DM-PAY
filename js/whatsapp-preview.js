// DM Pay — Briefing WhatsApp · preview dinâmico (respeita content_flags)
// Expõe window.refreshWAPreview() para o whatsapp-config.js chamar após salvar toggle
(function () {
  const fmt  = v => 'R$\u00a0' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const saud = () => { const h = new Date().getHours(); return h<12?'Bom dia':(h<18?'Boa tarde':'Boa noite'); };
  const iso  = d => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; };

  // Range bancário: segunda inclui sáb+dom
  function rangeBancario() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const dow = hoje.getDay();
    let ini = new Date(hoje), fim = new Date(hoje);
    if (dow === 1) ini.setDate(ini.getDate() - 2);
    if (dow === 6 || dow === 0) {
      while (fim.getDay() !== 1) fim.setDate(fim.getDate() + 1);
      ini = new Date(fim); ini.setDate(fim.getDate() - 2);
    }
    return { iniIso: iso(ini), fimIso: iso(fim), dataRef: fim };
  }

  // Gera texto puro pra WhatsApp — compartilhado com botão "Copiar"
  let _ultimoTexto = '';

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    const CID = window.DMPAY_COMPANY.id;
    const { iniIso, fimIso, dataRef } = rangeBancario();
    const ontem = iso(new Date(Date.now() - 86400000));
    const mesIni = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

    // ── 1) Carrega flags do banco ──────────────────────────────────────────────
    const settR = await sb.from('whatsapp_settings').select('content_flags').eq('company_id', CID).maybeSingle();
    const flags = settR.data?.content_flags || {
      vencimentos:true, saldo:true, alerta_dia:true, dica:true,
      vendas_ontem:false, pagos_ontem:false
    };

    // ── 2) Busca paralela de dados ─────────────────────────────────────────────
    const queries = [
      sb.from('profiles').select('name').eq('company_id',CID).eq('role','dono').limit(1).maybeSingle(),
      sb.from('payables').select('amount,due_date,description,suppliers(legal_name,trade_name)')
        .eq('company_id',CID).eq('status','open')
        .gte('due_date',iniIso).lte('due_date',fimIso)
        .order('amount',{ascending:false}).limit(200),
      sb.from('bank_accounts').select('balance').eq('company_id',CID).eq('active',true),
    ];

    // Opcionais
    if (flags.vendas_ontem) {
      queries.push(
        sb.from('daily_sales').select('amount').eq('company_id',CID).eq('sale_date',ontem)
      );
    } else queries.push(Promise.resolve({data:[]}));

    if (flags.pagos_ontem) {
      queries.push(
        sb.from('payables').select('amount,description,suppliers(legal_name,trade_name)')
          .eq('company_id',CID).neq('status','open')
          .gte('updated_at',ontem+'T00:00:00').limit(50)
      );
    } else queries.push(Promise.resolve({data:[]}));

    if (flags.alerta_dia) {
      queries.push(
        sb.from('payables').select('amount,due_date')
          .eq('company_id',CID).eq('status','open')
          .gte('due_date',mesIni).lte('due_date',fimIso).limit(1000)
      );
    } else queries.push(Promise.resolve({data:[]}));

    const [donoR, pagsR, bankR, salesR, pagosR, mesR] = await Promise.all(queries);

    const nome  = (donoR?.data?.name||'dono').split(' ')[0];
    const pags  = pagsR.data  || [];
    const banks = bankR.data  || [];
    const vendasOntem = (salesR.data||[]).reduce((s,v)=>s+Number(v.amount),0);
    const pagos       = pagosR.data || [];
    const totalPagos  = pagos.reduce((s,p)=>s+Number(p.amount),0);

    const total = pags.reduce((s,p)=>s+Number(p.amount),0);
    const saldo = banks.reduce((s,b)=>s+Number(b.balance||0),0);

    // ── 3) Calcula alerta de dia pesado ───────────────────────────────────────
    let alertaDia = false;
    if (flags.alerta_dia && total > 0) {
      const mesPags = mesR.data || [];
      const porDia = {};
      mesPags.forEach(p => { const d=(p.due_date||'').slice(0,10); if(d){if(!porDia[d])porDia[d]=0;porDia[d]+=Number(p.amount);} });
      const vals = Object.values(porDia);
      if (vals.length >= 3) {
        const media = vals.reduce((a,b)=>a+b,0) / vals.length;
        alertaDia = total > media * 1.35;
      }
    }

    // ── 4) Gera dica contextual ────────────────────────────────────────────────
    let dica = null;
    if (flags.dica) {
      const apos = saldo - total;
      if (apos < 0) {
        dica = 'Caixa fica negativo após pagar tudo hoje. Verifique quais boletos podem ser negociados ou postergados.';
      } else if (alertaDia) {
        dica = 'Pico por acúmulo do fim de semana. Na próxima sexta, antecipe os boletos de sábado e domingo.';
      } else if (pags.length === 0) {
        dica = 'Dia tranquilo. Bom momento para antecipar pagamentos da semana e negociar desconto à vista.';
      } else if (total > saldo * 0.6) {
        dica = 'Esse pagamento compromete mais de 60% do caixa. Confirme o saldo antes de executar.';
      }
    }

    // ── 5) Monta bolhas ────────────────────────────────────────────────────────
    const dtStr = dataRef.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    const hora  = '06:15';
    const bubs  = [];

    // Bolha 1 — saudação (sempre)
    bubs.push(`
      <div class="wa-bubble received">
        <span class="wa-ttl"><span class="wa-emoji">🌅</span> ${saud()}, ${nome}!</span>
        ${dtStr.charAt(0).toUpperCase()+dtStr.slice(1)}.
        <div class="wa-time">${hora}</div>
      </div>`);

    // Bolha 2 — vencimentos + alerta + dica
    if (flags.vencimentos !== false) {
      const top5  = pags.slice(0,5);
      const resto = pags.length - top5.length;
      const listHtml = top5.map(p => {
        const n = p.suppliers?.trade_name||p.suppliers?.legal_name||p.description||'—';
        return `<li><span>${n.length>24?n.slice(0,21)+'…':n}</span><span>${fmt(p.amount)}</span></li>`;
      }).join('');
      const restoHtml = resto>0
        ? `<li style="opacity:.7"><span>+ ${resto} boleto${resto>1?'s':''}</span><span>—</span></li>` : '';

      const alertaHtml = (alertaDia && flags.alerta_dia)
        ? `<div class="wa-warn"><b><span class="wa-emoji">⚠️</span> Dia acima da média.</b><br>Pico de pagamentos — verifique o caixa antes de liberar.</div>` : '';

      const dicaHtml = (dica && flags.dica)
        ? `<div class="wa-tip"><b><span class="wa-emoji">💡</span> Dica:</b> ${dica}</div>` : '';

      bubs.push(`
        <div class="wa-bubble received" style="max-width:92%">
          <span class="wa-ttl">Resumo do dia</span>
          ${pags.length > 0 ? `
          <div class="wa-kpi">
            <div class="wa-kpi-val">${fmt(total)}</div>
            <div class="wa-kpi-lbl">A PAGAR · ${pags.length} BOLETO${pags.length>1?'S':''}</div>
          </div>
          <div style="font-size:13px;margin:8px 0 4px;color:var(--wa-meta);font-weight:500">TOP ${top5.length} POR VALOR</div>
          <ul class="wa-list">${listHtml}${restoHtml}</ul>`
          : `<div style="font-size:13px;color:var(--wa-meta);margin:8px 0">Nenhum boleto vencendo hoje.</div>`}
          ${alertaHtml}${dicaHtml}
          <div class="wa-time">${hora}</div>
        </div>`);
    }

    // Bolha 3 — saldo projetado
    if (flags.saldo !== false) {
      const apos = saldo - total;
      bubs.push(`
        <div class="wa-bubble received">
          <span class="wa-ttl"><span class="wa-emoji">📊</span> Saldo</span>
          Hoje: <b>${fmt(saldo)}</b> nos bancos.<br>
          ${total > 0 ? `Após pagar tudo: <b style="${apos<0?'color:#c62828':''}">${fmt(apos)}</b>${apos<0?' ⚠️':''}<br>` : ''}
          <div class="wa-time">${hora}</div>
        </div>`);
    }

    // Bolha 4 — vendas do dia anterior
    if (flags.vendas_ontem) {
      const dtOntem = new Date(Date.now()-86400000).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'});
      bubs.push(`
        <div class="wa-bubble received">
          <span class="wa-ttl"><span class="wa-emoji">🛒</span> Vendas de ontem</span>
          ${dtOntem.charAt(0).toUpperCase()+dtOntem.slice(1)}:<br>
          <b>${vendasOntem > 0 ? fmt(vendasOntem) : 'Sem vendas registradas'}</b>
          <div class="wa-time">${hora}</div>
        </div>`);
    }

    // Bolha 5 — boletos pagos ontem
    if (flags.pagos_ontem) {
      const listPago = pagos.slice(0,3).map(p => {
        const n = p.suppliers?.trade_name||p.suppliers?.legal_name||p.description||'—';
        return `<li><span>${n.length>24?n.slice(0,21)+'…':n}</span><span>${fmt(p.amount)}</span></li>`;
      }).join('');
      bubs.push(`
        <div class="wa-bubble received">
          <span class="wa-ttl"><span class="wa-emoji">✅</span> Boletos pagos ontem</span>
          ${pagos.length > 0 ? `
          <div class="wa-kpi" style="background:linear-gradient(135deg,#10B981,#059669)">
            <div class="wa-kpi-val">${fmt(totalPagos)}</div>
            <div class="wa-kpi-lbl">LIQUIDADO · ${pagos.length} BOLETO${pagos.length>1?'S':''}</div>
          </div>
          <ul class="wa-list">${listPago}</ul>`
          : `<div style="font-size:13px;color:var(--wa-meta);margin:8px 0">Nenhum boleto pago ontem.</div>`}
          <div class="wa-time">${hora}</div>
        </div>`);
    }

    // ── 6) Injeta no DOM ───────────────────────────────────────────────────────
    const chat = document.querySelector('.wa-chat');
    if (!chat) return;

    // Remove bolhas antigas
    chat.querySelectorAll('.wa-bubble').forEach(b => b.remove());

    // Insere novas bolhas
    const tmp = document.createElement('div');
    tmp.innerHTML = bubs.join('');
    while (tmp.firstChild) chat.appendChild(tmp.firstChild);
    if (window.lucide) lucide.createIcons();

    // ── 7) Gera texto puro pra clipboard ──────────────────────────────────────
    function buildTexto() {
      const linhas = [];
      linhas.push(`${saud()}, ${nome}!`);
      linhas.push(dtStr.charAt(0).toUpperCase() + dtStr.slice(1) + '.');
      linhas.push('');

      if (flags.vencimentos !== false) {
        if (pags.length === 0) {
          linhas.push('*Resumo do dia*');
          linhas.push('Nenhum boleto vencendo hoje.');
        } else {
          linhas.push(`*TOTAL A PAGAR: ${fmt(total)}* (${pags.length} boleto${pags.length>1?'s':''})`);
          linhas.push('');
          const topN = Math.min(5, pags.length);
          linhas.push(`*Top ${topN} por valor:*`);
          pags.slice(0,topN).forEach(p => {
            const n = p.suppliers?.trade_name||p.suppliers?.legal_name||p.description||'—';
            linhas.push(`• ${n} - ${fmt(p.amount)}`);
          });
          if (pags.length > topN) linhas.push(`• +${pags.length-topN} boleto${pags.length-topN>1?'s':''} menores`);
          if (alertaDia && flags.alerta_dia) { linhas.push(''); linhas.push('⚠️ Dia acima da média — verifique o caixa.'); }
          if (dica && flags.dica) { linhas.push(''); linhas.push(`💡 Dica: ${dica}`); }
        }
        linhas.push('');
      }

      if (flags.saldo !== false) {
        const apos = saldo - total;
        linhas.push(`*Saldo nos bancos:* ${fmt(saldo)}`);
        if (total > 0) linhas.push(`Após pagar tudo: *${fmt(apos)}*${apos<0?' ⚠️':''}`);
        linhas.push('');
      }

      if (flags.vendas_ontem) {
        const dtO = new Date(Date.now()-86400000).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'});
        linhas.push(`🛒 Vendas de ontem (${dtO}): *${vendasOntem>0?fmt(vendasOntem):'sem registro'}*`);
        linhas.push('');
      }

      if (flags.pagos_ontem && pagos.length > 0) {
        linhas.push(`✅ Boletos pagos ontem: *${fmt(totalPagos)}* (${pagos.length} boleto${pagos.length>1?'s':''})`);
        linhas.push('');
      }

      linhas.push('-- DM Pay');
      return linhas.join('\n');
    }
    _ultimoTexto = buildTexto();

    // ── 8) Botão "Copiar pra WhatsApp" ─────────────────────────────────────────
    const existingBar = document.getElementById('wa-copy-btn')?.parentElement;
    if (!existingBar) {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:sticky;top:0;display:flex;gap:8px;padding:8px;background:var(--bg-card);border-bottom:1px solid var(--border);z-index:5';
      bar.innerHTML = `
        <button id="wa-copy-btn" style="flex:1;padding:8px 12px;background:var(--wa-green);color:white;border:none;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
          <i data-lucide="copy" style="width:14px;height:14px"></i> Copiar texto pra WhatsApp
        </button>
        <button id="wa-refresh" style="padding:8px 12px;background:transparent;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer" title="Recarregar dados">
          <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
        </button>`;
      chat.parentElement.insertBefore(bar, chat);
      if (window.lucide) lucide.createIcons();
      document.getElementById('wa-refresh').onclick = () => init();
    }

    // Atualiza handler do copiar com texto atual (sempre, mesmo em refresh)
    const copyBtn = document.getElementById('wa-copy-btn');
    if (copyBtn) {
      copyBtn.onclick = async (e) => {
        const btn = e.currentTarget;
        const txt = _ultimoTexto;
        try {
          await navigator.clipboard.writeText(txt);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.cssText='position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy');
          document.body.removeChild(ta);
        }
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> Copiado! Cola no WhatsApp';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => { btn.innerHTML = orig; if (window.lucide) lucide.createIcons(); }, 2500);
      };
    }
  }

  // Exposto para whatsapp-config.js chamar após salvar toggle
  window.refreshWAPreview = init;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
})();
