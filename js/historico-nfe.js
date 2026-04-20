// DM Pay — Histórico de NF-e (lista invoices importadas + detalhe na drawer)
(function () {
  let INVOICES = [];
  let FILTRO = 'all';

  const STATUS_LABEL = {
    linked:          'Vinculada',
    awaiting_boleto: 'Aguardando boleto',
    paid:            'Paga',
    pending:         'Pendente'
  };
  const STATUS_CLS = {
    linked:          'chip-success',
    awaiting_boleto: 'chip-warn',
    paid:            'chip-muted',
    pending:         'chip-muted'
  };

  function fmtBRL(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function brDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.toString().split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function iniciais(nome) {
    const w = (nome || '?').replace(/[^\wÀ-ÿ ]/g, '').trim().split(/\s+/);
    return ((w[0] || '')[0] + (w[1] || '')[0] || (w[0] || '??').slice(0, 2)).toUpperCase();
  }
  function tone(nome) {
    let h = 0; const s = nome || '';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 5) + 1;
  }

  async function load() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(load, 150); return; }

    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const tbody = document.getElementById('nfTable');
    tbody.innerHTML = `<tr><td colspan="8" style="padding:48px 16px;text-align:center;color:var(--text-muted)">Carregando…</td></tr>`;

    const invRes = await window.sb
      .from('invoices')
      .select(`id, nf_number, series, issue_date, total, status, nfe_key, created_at,
               suppliers(legal_name, trade_name, cnpj)`)
      .eq('company_id', COMPANY_ID)
      .order('issue_date', { ascending: false })
      .limit(1000);

    if (invRes.error) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding:48px 16px;text-align:center;color:var(--danger)">Erro: ${esc(invRes.error.message)}</td></tr>`;
      return;
    }

    INVOICES = invRes.data || [];

    // Conta payables por invoice (parcelas)
    if (INVOICES.length) {
      const ids = INVOICES.map(i => i.id);
      const payRes = await window.sb
        .from('payables')
        .select('invoice_id, id, amount, status')
        .in('invoice_id', ids);
      const byInv = {};
      (payRes.data || []).forEach(p => {
        if (!byInv[p.invoice_id]) byInv[p.invoice_id] = [];
        byInv[p.invoice_id].push(p);
      });
      INVOICES.forEach(i => {
        i._payables = byInv[i.id] || [];
      });
    }

    render();
  }

  function render() {
    const tbody = document.getElementById('nfTable');
    if (!tbody) return;

    const list = FILTRO === 'all'
      ? INVOICES
      : INVOICES.filter(i => i.status === FILTRO);

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding:48px 16px;text-align:center;color:var(--text-muted)">
        <div style="font-size:28px;margin-bottom:8px">—</div>
        <div style="font-size:14px">${INVOICES.length ? 'Nenhuma NF-e nesse filtro' : 'Nenhuma NF-e importada ainda'}</div>
      </td></tr>`;
      atualizaFooter(list.length);
      return;
    }

    tbody.innerHTML = list.map(i => {
      const forn = i.suppliers?.legal_name || i.suppliers?.trade_name || 'Sem fornecedor';
      const fornShort = forn.length > 42 ? forn.slice(0, 39) + '…' : forn;
      const st = i.status || 'pending';
      const cls = STATUS_CLS[st] || 'chip-muted';
      const lbl = STATUS_LABEL[st] || st;
      const parcelas = i._payables?.length || 0;
      return `
        <tr data-id="${i.id}" data-status="${esc(st)}" onclick="window.DMPAY_HISTNF.openDetail('${i.id}')">
          <td><div style="display:flex;align-items:center;gap:8px">
            <div class="supplier-avatar tone-${tone(forn)}">${iniciais(forn)}</div>
            <div><div style="font-weight:500">${esc(fornShort)}</div>
              ${i.suppliers?.cnpj ? `<div style="font-size:11px;color:var(--text-muted);font-family:monospace">${esc(i.suppliers.cnpj)}</div>` : ''}
            </div>
          </div></td>
          <td class="mono">${esc(i.nf_number || '—')}${i.series ? '/' + esc(i.series) : ''}</td>
          <td>${brDate(i.issue_date)}</td>
          <td class="ctr">${parcelas}</td>
          <td class="num">${fmtBRL(i.total)}</td>
          <td class="ctr"><span class="chip ${cls}">${lbl}</span></td>
          <td class="ctr source-col"><span class="chip chip-muted">XML</span></td>
          <td></td>
        </tr>`;
    }).join('');

    atualizaFooter(list.length);
    if (window.lucide) lucide.createIcons();
  }

  function atualizaFooter(qtd) {
    const foot = document.querySelector('.nfs-footer span');
    if (foot) foot.textContent = qtd === 0 ? '—' : `${qtd} NF-e${qtd > 1 ? 's' : ''}`;
    // Atualiza badges dos chips
    const counts = {
      all: INVOICES.length,
      linked: INVOICES.filter(i => i.status === 'linked').length,
      awaiting_boleto: INVOICES.filter(i => i.status === 'awaiting_boleto').length,
      paid: INVOICES.filter(i => i.status === 'paid').length
    };
    document.querySelectorAll('.status-chip').forEach(chip => {
      const st = chip.getAttribute('onclick')?.match(/filterStatus\(['"]([^'"]+)/)?.[1];
      if (!st) return;
      const cnt = chip.querySelector('.cnt');
      if (cnt && counts[st] !== undefined) cnt.textContent = counts[st];
    });
  }

  function filterStatus(st, el) {
    FILTRO = st;
    document.querySelectorAll('.status-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    render();
  }

  function openDetail(id) {
    const inv = INVOICES.find(x => x.id === id);
    if (!inv) return;
    const forn = inv.suppliers?.legal_name || inv.suppliers?.trade_name || 'Sem fornecedor';
    const body = document.querySelector('#drawer .drawer-body');
    const sub = document.querySelector('#drawer .drawer-head-sub');
    if (sub) sub.textContent = `NF ${inv.nf_number || '—'}${inv.series ? '/' + inv.series : ''} · ${forn}`;
    if (body) {
      body.innerHTML = `
        <div style="padding:14px 18px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <div class="supplier-avatar tone-${tone(forn)}" style="width:44px;height:44px;font-size:15px">${iniciais(forn)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600">${esc(forn)}</div>
              ${inv.suppliers?.cnpj ? `<div style="font-size:12px;color:var(--text-muted);font-family:monospace">${esc(inv.suppliers.cnpj)}</div>` : ''}
            </div>
          </div>
          <div style="font-size:30px;font-weight:700;letter-spacing:-.02em;margin-bottom:14px">${fmtBRL(inv.total)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:18px">
            <div><div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em">NF-e</div><div class="mono">${esc(inv.nf_number || '—')}${inv.series ? '/' + esc(inv.series) : ''}</div></div>
            <div><div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em">Emissão</div><div>${brDate(inv.issue_date)}</div></div>
            <div><div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em">Status</div><div>${STATUS_LABEL[inv.status] || inv.status}</div></div>
            <div><div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em">Importada em</div><div>${brDate(inv.created_at)}</div></div>
          </div>
          <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Chave NF-e</div>
          <div class="mono" style="font-size:11px;word-break:break-all;color:var(--text-muted);margin-bottom:18px">${esc(inv.nfe_key || '—')}</div>
          ${inv._payables && inv._payables.length ? `
            <div style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Parcelas (${inv._payables.length})</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${inv._payables.map((p, idx) => `
                <div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--bg-soft);border-radius:6px;font-size:13px">
                  <span>Parcela ${idx + 1} · ${p.status === 'paid' ? 'paga' : 'em aberto'}</span>
                  <span class="mono">${fmtBRL(p.amount)}</span>
                </div>
              `).join('')}
            </div>
          ` : '<div style="color:var(--text-muted);font-size:12.5px;font-style:italic">Sem parcelas vinculadas.</div>'}
        </div>`;
    }
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
  }

  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  }

  window.DMPAY_HISTNF = { load, filterStatus, openDetail, closeDrawer };
  // Substitui as funções inline pré-existentes no HTML
  window.filterStatus = filterStatus;
  window.closeDrawer = closeDrawer;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
