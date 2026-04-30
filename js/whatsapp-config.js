// DM Pay — Configurações do briefing WhatsApp (tela Alertas/Briefing)
// Persiste em tabela whatsapp_settings + liga botões "Alterar horário", "+ Destinatário", dias, toggles
(function() {
  let SETTINGS = null;
  const DIAS = ['dom','seg','ter','qua','qui','sex','sab'];
  const DIAS_PT = { dom:'Dom', seg:'Seg', ter:'Ter', qua:'Qua', qui:'Qui', sex:'Sex', sab:'Sáb' };
  const FLAG_BY_TEXT = {
    'Vencimentos de hoje': 'vencimentos',
    'Saldo projetado': 'saldo',
    'Alerta de dias pesados': 'alerta_dia',
    'Dica do sistema': 'dica',
    'Vendas do dia anterior': 'vendas_ontem',
    'Boletos pagos ontem': 'pagos_ontem'
  };

  async function load() {
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const { data, error } = await sb.from('whatsapp_settings').select('*').eq('company_id', COMPANY_ID).maybeSingle();
    if (error && error.code !== 'PGRST116') { console.warn('whatsapp_settings', error); }
    if (!data) {
      // cria default
      const def = {
        company_id: COMPANY_ID,
        schedule_time: '06:15',
        schedule_days: ['seg','ter','qua','qui','sex','sab'],
        content_flags: { vencimentos:true, saldo:true, alerta_dia:true, dica:true, vendas_ontem:false, pagos_ontem:false },
        recipients: []
      };
      const ins = await sb.from('whatsapp_settings').insert(def).select().maybeSingle();
      SETTINGS = ins.data || def;
    } else SETTINGS = data;
  }

  async function save(patch) {
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    Object.assign(SETTINGS, patch);
    const { error } = await sb.from('whatsapp_settings').upsert({
      company_id: COMPANY_ID,
      schedule_time: SETTINGS.schedule_time,
      schedule_days: SETTINGS.schedule_days,
      content_flags: SETTINGS.content_flags,
      recipients: SETTINGS.recipients,
      updated_at: new Date().toISOString()
    });
    if (error) throw new Error(error.message);
  }

  function renderHorario() {
    const el = document.querySelector('.cfg-row .cfg-val');
    if (el) el.textContent = SETTINGS.schedule_time;
  }

  function renderDias() {
    const pills = document.querySelectorAll('.pills .pill');
    pills.forEach(p => {
      const t = (p.textContent || '').trim().toLowerCase();
      const key = Object.keys(DIAS_PT).find(k => DIAS_PT[k].toLowerCase() === t);
      if (!key) return;
      p.classList.toggle('active', SETTINGS.schedule_days.includes(key));
      p.style.cursor = 'pointer';
      p.onclick = async () => {
        const active = p.classList.contains('active');
        const next = active ? SETTINGS.schedule_days.filter(d => d !== key) : [...SETTINGS.schedule_days, key];
        try { await save({ schedule_days: next }); p.classList.toggle('active', !active); flash(p); }
        catch(e){ alert('Erro: '+e.message); }
      };
    });
  }

  function getRecipientParent() {
    // Ancora no botão "Adicionar destinatário" — sempre existe
    const addBtn = document.querySelector('.btn-add');
    return addBtn ? addBtn.parentElement : null;
  }

  function renderDestinatarios() {
    const parent = getRecipientParent();
    if (!parent) return;
    // Remove todos cards de recipient existentes
    parent.querySelectorAll('.recipient').forEach(c => c.remove());
    // Renderiza destinatários salvos
    SETTINGS.recipients.forEach((r, idx) => {
      const div = document.createElement('div');
      div.className = 'recipient';
      const color = r.role === 'dono' ? '#8b5cf6' : '#2563EB';
      const ini = (r.name || '?').slice(0,2).toUpperCase();
      div.innerHTML = `
        <div class="recipient-av" style="background:${color}">${ini}</div>
        <div class="recipient-info">
          <div class="recipient-name">${r.name || ''} ${r.role ? `<span style="font-size:10px;color:var(--text-muted);font-weight:500">(${r.role})</span>` : ''}</div>
          <div class="recipient-phone">${r.phone || ''}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" ${r.active !== false ? 'checked' : ''}>
          <span class="toggle-track"><span class="toggle-dot"></span></span>
        </label>
        <button class="btn btn-ghost" style="padding:6px 8px;margin-left:8px;color:var(--danger)" title="Remover"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>`;
      const btnAdd = parent.querySelector('.btn-add');
      parent.insertBefore(div, btnAdd);
      // toggle ativar
      div.querySelector('input').addEventListener('change', async e => {
        const arr = [...SETTINGS.recipients];
        arr[idx] = { ...arr[idx], active: e.target.checked };
        try { await save({ recipients: arr }); flash(div); }
        catch(err){ alert(err.message); }
      });
      // remover
      div.querySelector('button').addEventListener('click', async () => {
        const ok = await window.DMPAY_UI.confirm({ title:'Remover destinatário', desc:`Remover ${r.name}?`, danger:true, okLabel:'Remover' });
        if (!ok) return;
        const arr = SETTINGS.recipients.filter((_, i) => i !== idx);
        try { await save({ recipients: arr }); renderDestinatarios(); }
        catch(err){ alert(err.message); }
      });
    });
    if (window.lucide) lucide.createIcons();
  }

  function renderToggles() {
    document.querySelectorAll('.content-toggle').forEach(t => {
      const label = t.querySelector('.content-toggle-text')?.textContent?.trim() || '';
      const flag = FLAG_BY_TEXT[label];
      if (!flag) return;
      const cb = t.querySelector('input[type=checkbox]');
      const on = !!SETTINGS.content_flags[flag];
      cb.checked = on;
      t.classList.toggle('on', on);
      t.onclick = async (e) => {
        if (e.target.tagName === 'INPUT') return;
        const next = !cb.checked;
        cb.checked = next;
        t.classList.toggle('on', next);
        try {
          await save({ content_flags: { ...SETTINGS.content_flags, [flag]: next } });
          flash(t);
          if (window.refreshWAPreview) window.refreshWAPreview();  // atualiza preview
        }
        catch(err){ alert(err.message); }
      };
    });
  }

  function flash(el) {
    el.style.transition = 'box-shadow .4s';
    el.style.boxShadow = '0 0 0 3px rgba(37,99,235,.25)';
    setTimeout(() => { el.style.boxShadow = ''; }, 500);
  }

  function bindBotoes() {
    // Botão "Alterar" no horário
    const alterarBtn = document.querySelector('.cfg-chip');
    if (alterarBtn) alterarBtn.onclick = async () => {
      const r = await window.DMPAY_UI.open({
        title: 'Horário do briefing',
        desc: 'Horário local (Jupi-PE) em que a mensagem é disparada.',
        fields: [{ key:'horario', label:'Horário', value: SETTINGS.schedule_time, placeholder:'06:15', hint:'Formato HH:MM (24h).' }],
        submitLabel: 'Salvar',
        onSubmit: async (v) => {
          if (!/^\d{2}:\d{2}$/.test(v.horario)) throw new Error('Formato inválido. Use HH:MM (ex: 06:15).');
          await save({ schedule_time: v.horario });
        }
      });
      if (r) renderHorario();
    };
    // Botão "Adicionar destinatário"
    const addBtn = document.querySelector('.btn-add');
    if (addBtn) addBtn.onclick = async () => {
      const r = await window.DMPAY_UI.open({
        title: 'Adicionar destinatário',
        desc: 'Quem vai receber o briefing matinal por WhatsApp.',
        fields: [
          { key:'name', label:'Nome', placeholder:'nome do destinatário' },
          { key:'phone', label:'WhatsApp', placeholder:'+55 87 98888-1234' },
          { key:'role', label:'Papel (opcional)', placeholder:'ex: Dono, Contador' }
        ],
        submitLabel: 'Adicionar',
        onSubmit: async (v) => {
          if (!v.name || !v.phone) throw new Error('Informe nome e WhatsApp.');
          const arr = [...SETTINGS.recipients, { name:v.name, phone:v.phone, role:v.role||'', active:true }];
          await save({ recipients: arr });
        }
      });
      if (r) renderDestinatarios();
    };
    // Botão "Salvar" rodapé — apenas confirmação visual (já salva em tempo real)
    const saveBtn = document.querySelector('.bottom-actions .btn-primary');
    if (saveBtn) saveBtn.onclick = () => {
      flash(saveBtn);
      saveBtn.innerHTML = '<i data-lucide="check"></i> Salvo automaticamente';
      if (window.lucide) lucide.createIcons();
      setTimeout(() => { saveBtn.innerHTML = '<i data-lucide="check"></i> Salvar'; if (window.lucide) lucide.createIcons(); }, 1800);
    };

    // Botão "Testar envio agora" — gera briefing e abre wa.me
    const testBtn = [...document.querySelectorAll('.bottom-actions .btn-ghost, .btn.btn-ghost')].find(b => /testar/i.test(b.textContent||''));
    if (testBtn) testBtn.onclick = async () => {
      const ativos = SETTINGS.recipients.filter(r => r.active !== false);
      if (ativos.length === 0) { alert('Adicione pelo menos 1 destinatário ativo antes de testar.'); return; }
      const opcoes = ativos.map((r, i) => `${i+1}. ${r.name} — ${r.phone}`).join('\n');
      const r = await window.DMPAY_UI.open({
        title: 'Testar envio agora',
        desc: `Vai abrir o WhatsApp Web com o briefing pronto — você só clica em enviar. Destinatários ativos:\n${opcoes}`,
        fields: [{ key:'destino', label:'Qual destinatário?', value:'1', placeholder:'1', hint:'Digite o número da lista acima.' }],
        submitLabel: 'Gerar e abrir WhatsApp',
        onSubmit: async (v) => {
          const idx = parseInt(v.destino, 10) - 1;
          if (isNaN(idx) || idx < 0 || idx >= ativos.length) throw new Error('Número inválido.');
          const alvo = ativos[idx];
          const texto = await gerarBriefing();
          const fone = String(alvo.phone || '').replace(/\D/g, '');
          if (fone.length < 10) throw new Error('Telefone inválido do destinatário.');
          const url = `https://wa.me/${fone}?text=${encodeURIComponent(texto)}`;
          window.open(url, '_blank');
        }
      });
    };
  }

  // Gera o texto do briefing (emojis universais pra WhatsApp não renderizar "?")
  async function gerarBriefing() {
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const dow = hoje.getDay();
    let inicio = new Date(hoje), fim = new Date(hoje);
    if (dow === 1) inicio.setDate(inicio.getDate() - 2); // segunda inclui sáb+dom
    if (dow === 6 || dow === 0) { while (fim.getDay() !== 1) fim.setDate(fim.getDate() + 1); inicio = new Date(fim); inicio.setDate(fim.getDate() - 2); }
    const iso = d => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; };
    const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    const brDate = d => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
    const brDow = d => ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()];

    const ontem = iso(new Date(Date.now() - 86400000));
    const mesIni = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

    const flags = SETTINGS.content_flags || {};
    const [donoR, pagsR, bankR, salesOntemR, pagosR, mesR] = await Promise.all([
      sb.from('profiles').select('name').eq('company_id', COMPANY_ID).eq('role','dono').limit(1).maybeSingle(),
      sb.from('payables').select('amount, due_date, description, suppliers(legal_name, trade_name)').eq('company_id', COMPANY_ID).eq('status','open').gte('due_date', iso(inicio)).lte('due_date', iso(fim)).order('amount',{ascending:false}).limit(200),
      sb.from('bank_accounts').select('balance').eq('company_id', COMPANY_ID).eq('active',true),
      flags.vendas_ontem
        ? sb.from('daily_sales').select('amount').eq('company_id', COMPANY_ID).eq('sale_date', ontem)
        : Promise.resolve({data:[]}),
      flags.pagos_ontem
        ? sb.from('payables').select('amount,description,suppliers(legal_name,trade_name)').eq('company_id',COMPANY_ID).neq('status','open').gte('updated_at',ontem+'T00:00:00').limit(50)
        : Promise.resolve({data:[]}),
      flags.alerta_dia
        ? sb.from('payables').select('amount,due_date').eq('company_id',COMPANY_ID).eq('status','open').gte('due_date',mesIni).lte('due_date',iso(fim)).limit(1000)
        : Promise.resolve({data:[]}),
    ]);
    const nome = (donoR?.data?.name || 'dono').split(' ')[0];
    const pags   = pagsR.data    || [];
    const banks  = bankR.data    || [];
    const vendasOntem = (salesOntemR.data||[]).reduce((s,v)=>s+Number(v.amount),0);
    const pagos  = pagosR.data   || [];
    const total  = pags.reduce((s,p)=>s+Number(p.amount),0);
    const saldo  = banks.reduce((s,b)=>s+Number(b.balance||0),0);
    const totalPagos = pagos.reduce((s,p)=>s+Number(p.amount),0);

    // Alerta dia pesado
    let alertaDia = false;
    if (flags.alerta_dia && total > 0) {
      const mesPags = mesR.data || [];
      const porDia = {};
      mesPags.forEach(p => { const d=(p.due_date||'').slice(0,10); if(d){if(!porDia[d])porDia[d]=0;porDia[d]+=Number(p.amount);} });
      const vals = Object.values(porDia);
      if (vals.length >= 3) {
        const media = vals.reduce((a,b)=>a+b,0)/vals.length;
        alertaDia = total > media * 1.35;
      }
    }

    // Dica contextual
    let dica = null;
    if (flags.dica) {
      const apos = saldo - total;
      if (apos < 0) dica = 'Caixa fica negativo após pagar tudo. Verifique o que pode postergar.';
      else if (alertaDia) dica = 'Pico por acúmulo de fim de semana. Na próxima sexta, antecipe.';
      else if (pags.length === 0) dica = 'Dia tranquilo. Bom momento para antecipar e negociar desconto.';
    }
    const h = new Date().getHours();
    const saud = h<12?'Bom dia':(h<18?'Boa tarde':'Boa noite');

    // Agrupa boletos por dia (sáb/dom/seg quando for segunda)
    const porDia = {};
    pags.forEach(p => {
      const d = iso(new Date(p.due_date + 'T00:00:00'));
      if (!porDia[d]) porDia[d] = { total:0, count:0 };
      porDia[d].total += Number(p.amount);
      porDia[d].count += 1;
    });
    const diasOrdenados = Object.keys(porDia).sort();
    const temMultiplosDias = diasOrdenados.length > 1;

    const linhas = [];
    linhas.push(`${saud}, ${nome}!`);
    const dataPrincipal = fim.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'});
    linhas.push(dataPrincipal.charAt(0).toUpperCase() + dataPrincipal.slice(1) + '.');
    linhas.push('');

    if (flags.vencimentos !== false) {
      if (pags.length === 0) {
        linhas.push('*Resumo do dia*');
        linhas.push('Nenhum boleto vencendo hoje.');
      } else {
        linhas.push(`*TOTAL A PAGAR: ${fmt(total)}* (${pags.length} boleto${pags.length>1?'s':''})`);
        if (temMultiplosDias) {
          linhas.push('');
          linhas.push('_Compensação bancária (sáb+dom):_');
          diasOrdenados.forEach(dISO => {
            const d = new Date(dISO + 'T00:00:00');
            const agg = porDia[dISO];
            linhas.push(`• ${brDow(d)} ${brDate(d)}: ${fmt(agg.total)} (${agg.count} boleto${agg.count>1?'s':''})`);
          });
        }
        linhas.push('');
        const topN = Math.min(5, pags.length);
        linhas.push(`*Top ${topN} por valor:*`);
        pags.slice(0,topN).forEach(p => {
          const n = p.suppliers?.trade_name||p.suppliers?.legal_name||p.description||'—';
          linhas.push(`• ${n} - ${fmt(p.amount)}`);
        });
        if (pags.length > topN) linhas.push(`• +${pags.length-topN} boleto${pags.length-topN>1?'s':''} menores`);
        if (alertaDia) { linhas.push(''); linhas.push('⚠️ Dia acima da média — verifique o caixa.'); }
        if (dica) { linhas.push(''); linhas.push(`💡 Dica: ${dica}`); }
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
      pagos.slice(0,3).forEach(p => {
        const n = p.suppliers?.trade_name||p.suppliers?.legal_name||p.description||'—';
        linhas.push(`• ${n} - ${fmt(p.amount)}`);
      });
      linhas.push('');
    }

    linhas.push('-- DM Pay');
    return linhas.join('\n');
  }

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    if (!document.querySelector('.pills .pill')) return; // não é a tela
    await load();
    renderHorario();
    renderDias();
    renderDestinatarios();
    renderToggles();
    bindBotoes();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
