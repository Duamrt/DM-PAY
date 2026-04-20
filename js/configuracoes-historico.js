// DM Pay — Histórico de alterações (tab "Histórico" em configuracoes.html)
// Consulta public.audit_log filtrada pela company do usuário (RLS protege).
// Expõe window.DMPAY_HIST.reload() para recarregar manualmente.
(function () {
  let REGISTROS = [];
  let EXPANDIDO = new Set(); // ids de linhas expandidas

  const ACAO_LABEL = {
    create:  'criado',
    update:  'alterado',
    delete:  'excluído',
    pay:     'pago',
    receive: 'recebido',
    estorno: 'estornado',
    cancel:  'cancelado',
    import:  'importado'
  };

  const ENTIDADE_LABEL = {
    payable:    'conta a pagar',
    receivable: 'conta a receber',
    customer:   'cliente',
    supplier:   'fornecedor',
    invoice:    'NF-e',
    expense:    'despesa'
  };

  function fmtDT(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + mi;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function diffView(before, after) {
    if (!before && !after) return '<i>Sem payload.</i>';
    if (!before) return '<b>Depois:</b>\n' + esc(JSON.stringify(after, null, 2));
    if (!after) return '<b>Antes:</b>\n' + esc(JSON.stringify(before, null, 2));
    // Calcula diff chave a chave
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const changes = [];
    const iguais = [];
    keys.forEach(k => {
      const a = JSON.stringify(before?.[k]);
      const b = JSON.stringify(after?.[k]);
      if (a !== b) changes.push({ k, a, b });
      else iguais.push(k);
    });
    if (!changes.length) {
      return '<i>Nenhum campo alterado no payload registrado.</i>';
    }
    return changes.map(c =>
      '<b>' + esc(c.k) + '</b>\n' +
      '  <span class="diff-before">- ' + esc(c.a) + '</span>\n' +
      '  <span class="diff-after">+ ' + esc(c.b) + '</span>'
    ).join('\n\n');
  }

  async function load() {
    if (!window.sb) { setTimeout(load, 150); return; }
    const COMPANY_ID = window.DMPAY_COMPANY?.id;
    if (!COMPANY_ID) { setTimeout(load, 150); return; }

    const tbody = document.getElementById('hist-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="hist-empty"><i data-lucide="loader"></i><div>Carregando histórico...</div></td></tr>';
    window.lucide && lucide.createIcons();

    const { data, error } = await window.sb
      .from('audit_log')
      .select('id, created_at, user_id, user_email, entity, entity_id, action, before, after, ip_origem, user_agent')
      .eq('company_id', COMPANY_ID)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      tbody.innerHTML = '<tr><td colspan="5" class="hist-empty"><i data-lucide="alert-triangle"></i><div>Erro ao carregar: ' + esc(error.message) + '</div></td></tr>';
      window.lucide && lucide.createIcons();
      return;
    }

    REGISTROS = data || [];
    render();
  }

  function aplicarFiltros() {
    const busca = (document.getElementById('hist-busca')?.value || '').toLowerCase().trim();
    const acao = document.getElementById('hist-acao')?.value || '';
    const de = document.getElementById('hist-de')?.value || '';
    const ate = document.getElementById('hist-ate')?.value || '';

    return REGISTROS.filter(r => {
      if (acao && r.action !== acao) return false;
      if (de && r.created_at.slice(0, 10) < de) return false;
      if (ate && r.created_at.slice(0, 10) > ate) return false;
      if (busca) {
        const hay = [
          r.entity || '',
          r.user_email || '',
          r.entity_id || '',
          JSON.stringify(r.before || {}),
          JSON.stringify(r.after || {})
        ].join(' ').toLowerCase();
        if (!hay.includes(busca)) return false;
      }
      return true;
    });
  }

  function render() {
    const tbody = document.getElementById('hist-tbody');
    const stats = document.getElementById('hist-stats');
    if (!tbody) return;

    const filtrados = aplicarFiltros();

    // Stats
    const porAcao = {};
    filtrados.forEach(r => { porAcao[r.action] = (porAcao[r.action] || 0) + 1; });
    const partes = Object.entries(porAcao).map(([k, v]) => '<b>' + v + '</b> ' + (ACAO_LABEL[k] || k));
    stats.innerHTML = '<b>' + filtrados.length + '</b> registros' + (partes.length ? ' · ' + partes.join(' · ') : '');

    if (!filtrados.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="hist-empty"><i data-lucide="inbox"></i><div>Nenhum registro encontrado</div><div style="font-size:12px;margin-top:4px">Ajuste os filtros ou faça uma operação que gere histórico.</div></td></tr>';
      window.lucide && lucide.createIcons();
      return;
    }

    let html = '';
    filtrados.forEach(r => {
      const quem = r.user_email || '—';
      const iniciais = quem.slice(0, 2).toUpperCase();
      const acaoLabel = ACAO_LABEL[r.action] || r.action;
      const entLabel = ENTIDADE_LABEL[r.entity] || r.entity;
      const entIdShort = r.entity_id ? ('<div class="hist-entity" title="' + esc(r.entity_id) + '">' + esc(r.entity_id.slice(0, 8)) + '…</div>') : '';
      const expandido = EXPANDIDO.has(r.id);
      html += '<tr onclick="DMPAY_HIST.toggle(\'' + r.id + '\')">';
      html += '<td class="time">' + fmtDT(r.created_at) + '</td>';
      html += '<td class="user"><div>' + esc(quem.split('@')[0]) + '</div><div class="email">' + esc(quem) + '</div></td>';
      html += '<td><span class="hist-pill ' + esc(r.action) + '">' + esc(acaoLabel) + '</span></td>';
      html += '<td>' + esc(entLabel) + entIdShort + '</td>';
      html += '<td style="color:var(--text-muted);font-size:12px">' + (r.ip_origem ? 'IP ' + esc(r.ip_origem) : '') + (expandido ? ' — clique pra fechar' : '') + '</td>';
      html += '</tr>';
      if (expandido) {
        html += '<tr><td colspan="5" style="padding:0"><div class="hist-detail">' + diffView(r.before, r.after) + '</div></td></tr>';
      }
    });
    tbody.innerHTML = html;
    window.lucide && lucide.createIcons();
  }

  function toggle(id) {
    if (EXPANDIDO.has(id)) EXPANDIDO.delete(id);
    else EXPANDIDO.add(id);
    render();
  }

  function wireFiltros() {
    ['hist-busca', 'hist-acao', 'hist-de', 'hist-ate'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', render);
      el.addEventListener('change', render);
    });
  }

  window.DMPAY_HIST = { reload: load, toggle: toggle };

  function init() {
    if (!document.getElementById('panel-historico')) return; // página não tem a tab
    wireFiltros();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
