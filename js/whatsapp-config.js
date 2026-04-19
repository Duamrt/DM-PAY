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

  function renderDestinatarios() {
    // Substitui os 2 cards hardcoded de destinatário por dados reais + toggle + remover
    const cards = document.querySelectorAll('.recipient');
    if (cards.length === 0) return;
    const parent = cards[0].parentElement;
    // Remove todos cards de recipient
    cards.forEach(c => c.remove());
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
        try { await save({ content_flags: { ...SETTINGS.content_flags, [flag]: next } }); flash(t); }
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
          { key:'name', label:'Nome', placeholder:'ex: Reginaldo Liberato' },
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
