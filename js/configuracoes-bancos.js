// DM Pay — CRUD de contas bancárias em configuracoes.html
(function() {
  let ACCOUNTS = [];

  function fmtBRL(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function load() {
    const { data, error } = await sb.from('bank_accounts')
      .select('*')
      .eq('company_id', window.DMPAY_COMPANY.id)
      .eq('active', true)
      .order('is_primary', { ascending: false })
      .order('bank_name');
    if (error) { console.error(error); ACCOUNTS = []; return; }
    ACCOUNTS = data || [];
  }

  function render() {
    const list = document.getElementById('bancos-list');
    const statusEl = document.getElementById('bancos-status');
    if (!list) return;
    if (statusEl) {
      statusEl.className = ACCOUNTS.length > 0 ? 'status ok' : 'status';
      statusEl.textContent = ACCOUNTS.length > 0 ? `${ACCOUNTS.length} conta${ACCOUNTS.length>1?'s':''}` : 'Nenhuma cadastrada';
    }
    if (ACCOUNTS.length === 0) {
      list.innerHTML = `<div style="padding:28px 20px;text-align:center;color:var(--text-muted);font-size:13px;border:1px dashed var(--border);border-radius:10px;margin-bottom:12px">
        <i data-lucide="credit-card" style="width:28px;height:28px;opacity:.4;margin-bottom:8px"></i>
        <div><b>Nenhuma conta bancária cadastrada.</b></div>
        <div style="margin-top:4px;font-size:12px">Clique em <b>Adicionar conta bancária</b> abaixo.</div>
      </div>`;
      if (window.lucide) lucide.createIcons();
      return;
    }
    list.innerHTML = ACCOUNTS.map(a => {
      const initials = (a.bank_name || '?').slice(0,2).toUpperCase();
      const tipo = a.account_type === 'poupanca' ? 'Poupança' : (a.account_type === 'pagamento' ? 'Pagamento' : 'Corrente');
      const info = [a.agency ? `Ag ${escapeHtml(a.agency)}` : '', a.account_number ? `CC ${escapeHtml(a.account_number)}` : ''].filter(Boolean).join(' / ');
      return `
        <div class="integracao">
          <div class="integracao-logo" style="background:#2563EB;color:white">${escapeHtml(initials)}</div>
          <div class="integracao-info">
            <div class="integracao-name">${escapeHtml(a.bank_name)}${a.is_primary ? ' <span style="font-size:10px;background:var(--accent-soft);color:var(--accent);padding:2px 6px;border-radius:999px;margin-left:6px;text-transform:uppercase;letter-spacing:.04em">principal</span>' : ''}</div>
            <div class="integracao-desc">${info || tipo}${info ? ' · '+tipo : ''}${a.notes ? ' · '+escapeHtml(a.notes) : ''}</div>
          </div>
          <div style="text-align:right;min-width:140px">
            <div style="font-size:13px;font-weight:600;font-family:'Geist Mono',monospace;margin-bottom:6px">${fmtBRL(a.balance)}</div>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:11px" onclick="DMPAY_BANCOS.editar('${a.id}')"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:11px;color:var(--danger)" onclick="DMPAY_BANCOS.remover('${a.id}')"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>
            </div>
          </div>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  }

  async function abrirForm(a) {
    const editing = !!a;
    const r = await window.DMPAY_UI.open({
      title: editing ? 'Editar conta bancária' : 'Nova conta bancária',
      fields: [
        { key:'bank_name', label:'Banco', value:a?.bank_name||'', placeholder:'Santander, Banco do Brasil, Nubank…' },
        { key:'agency', label:'Agência', value:a?.agency||'', placeholder:'0000' },
        { key:'account_number', label:'Conta', value:a?.account_number||'', placeholder:'00000-0' },
        { key:'balance', label:'Saldo atual (R$)', value:a?String(a.balance).replace('.',','):'0,00', placeholder:'0,00' }
      ],
      submitLabel: editing ? 'Salvar alterações' : 'Adicionar conta',
      onSubmit: async (v) => {
        if (!v.bank_name) throw new Error('Informe o nome do banco');
        const balance = parseFloat(String(v.balance).replace(/\./g,'').replace(',','.')) || 0;
        const payload = { bank_name: v.bank_name.trim(), agency: v.agency||null, account_number: v.account_number||null, balance };
        let error;
        if (editing) {
          ({ error } = await sb.from('bank_accounts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', a.id));
        } else {
          ({ error } = await sb.from('bank_accounts').insert({ ...payload, company_id: window.DMPAY_COMPANY.id, account_type:'corrente', is_primary: ACCOUNTS.length === 0 }));
        }
        if (error) throw new Error(error.message);
      }
    });
    if (r) { await load(); render(); }
  }
  async function novo() { return abrirForm(null); }
  async function editar(id) { const a = ACCOUNTS.find(x => x.id === id); if (a) return abrirForm(a); }

  async function remover(id) {
    const a = ACCOUNTS.find(x => x.id === id); if (!a) return;
    const ok = await window.DMPAY_UI.confirm({
      title: 'Remover conta bancária',
      desc: `Remover "${a.bank_name}"? A conta é desativada e some da lista — a ação é reversível no banco.`,
      danger: true, okLabel: 'Remover'
    });
    if (!ok) return;
    const { error } = await sb.from('bank_accounts').update({ active: false }).eq('id', id);
    if (error) { alert(error.message); return; }
    await load(); render();
  }

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    if (!document.getElementById('bancos-list')) return; // não é a tela de configurações
    await load(); render();
  }

  window.DMPAY_BANCOS = { novo, editar, remover };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
