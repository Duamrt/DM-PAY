// DM Pay — Salva Empresa na tabela companies
(function() {
  const FIELDS = [
    ['emp-legal_name', 'legal_name'],
    ['emp-trade_name', 'trade_name'],
    ['emp-cnpj', 'cnpj'],
    ['emp-ie', 'state_registration'],
    ['emp-im', 'municipal_registration'],
    ['emp-address', 'address_street'],
    ['emp-city', 'city'],
    ['emp-state', 'state'],
    ['emp-zip', 'zip_code'],
    ['emp-phone', 'phone'],
    ['emp-email', 'email']
  ];

  async function load() {
    const { data, error } = await sb.from('companies').select('*').eq('id', window.DMPAY_COMPANY.id).single();
    if (error) { console.error(error); return; }
    FIELDS.forEach(([id, col]) => {
      const el = document.getElementById(id);
      if (el) el.value = data[col] || '';
    });
  }

  async function salvar() {
    const payload = {};
    FIELDS.forEach(([id, col]) => {
      const el = document.getElementById(id);
      if (el) payload[col] = el.value.trim() || null;
    });
    if (!payload.legal_name && !payload.trade_name) { alert('Informe ao menos razão social ou nome fantasia.'); return; }
    if (payload.state) payload.state = payload.state.toUpperCase();
    const btn = document.querySelector('#panel-empresa .btn.btn-primary');
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Salvando…'; }
    const { error } = await sb.from('companies').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', window.DMPAY_COMPANY.id);
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    if (error) { alert('Erro: ' + error.message); return; }
    // feedback visual
    const status = document.querySelector('#panel-empresa .status');
    if (status) { status.className = 'status ok'; status.textContent = 'Salvo ✓'; setTimeout(() => { status.textContent = 'Completo'; }, 2000); }
    // Atualiza cache local
    Object.assign(window.DMPAY_COMPANY, payload);
  }

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    if (!document.getElementById('emp-legal_name')) return;
    await load();
  }

  window.DMPAY_EMP = { salvar, reload: load };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
