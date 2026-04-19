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

  async function novo() {
    const bank_name = prompt('Nome do banco (ex: Santander, Banco do Brasil, Nubank):');
    if (!bank_name) return;
    const agency = prompt('Agência (opcional):') || null;
    const account_number = prompt('Número da conta (opcional):') || null;
    const balanceStr = prompt('Saldo atual (R$ 0,00):', '0,00');
    if (balanceStr === null) return;
    const balance = parseFloat(String(balanceStr).replace(/\./g,'').replace(',','.')) || 0;
    const is_primary = ACCOUNTS.length === 0; // primeira vira principal
    const { error } = await sb.from('bank_accounts').insert({
      company_id: window.DMPAY_COMPANY.id,
      bank_name: bank_name.trim(),
      agency, account_number,
      balance, is_primary,
      account_type: 'corrente'
    });
    if (error) { alert('Erro: ' + error.message); return; }
    await load(); render();
  }

  async function editar(id) {
    const a = ACCOUNTS.find(x => x.id === id); if (!a) return;
    const bank_name = prompt('Nome do banco:', a.bank_name);
    if (bank_name === null) return;
    const agency = prompt('Agência:', a.agency || '') || null;
    const account_number = prompt('Número da conta:', a.account_number || '') || null;
    const balanceStr = prompt('Saldo atual:', String(a.balance).replace('.',','));
    if (balanceStr === null) return;
    const balance = parseFloat(String(balanceStr).replace(/\./g,'').replace(',','.')) || 0;
    const { error } = await sb.from('bank_accounts').update({
      bank_name: bank_name.trim(), agency, account_number, balance,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) { alert(error.message); return; }
    await load(); render();
  }

  async function remover(id) {
    const a = ACCOUNTS.find(x => x.id === id); if (!a) return;
    if (!confirm(`Remover a conta "${a.bank_name}"? Essa ação é irreversível.`)) return;
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
