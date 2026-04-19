// DM Pay — Despesas fixas (CRUD real em fixed_expenses + expense_categories)
(function() {
  let EXPENSES = [];
  let CATEGORIES = [];
  let FILTRO_CAT = 'all';
  let BUSCA = '';

  function fmtBRL(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function catColor(name) {
    const map = { 'Geral':'#6B7280', 'Vendas':'#2563EB', 'Administrativa':'#7C3AED', 'Comercial':'#10B981', 'Financeira':'#D97706' };
    return map[name] || '#6B7280';
  }
  function catIcon(name) {
    const map = { 'Geral':'home', 'Vendas':'users', 'Administrativa':'briefcase', 'Comercial':'shopping-bag', 'Financeira':'dollar-sign' };
    return map[name] || 'tag';
  }

  async function load() {
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const [catsR, expsR] = await Promise.all([
      sb.from('expense_categories').select('id, name, color, icon').eq('company_id', COMPANY_ID).order('name'),
      sb.from('fixed_expenses').select('id, description, amount, due_day, active, category_id, expense_categories(name, color, icon)')
        .eq('company_id', COMPANY_ID).eq('active', true).order('due_day')
    ]);
    if (catsR.error) console.warn('cats', catsR.error);
    if (expsR.error) console.warn('exps', expsR.error);
    CATEGORIES = catsR.data || [];
    EXPENSES = expsR.data || [];
  }

  function render() {
    renderKPIs();
    renderChips();
    renderLista();
    renderChart();
    if (window.lucide) lucide.createIcons();
  }

  function renderKPIs() {
    const totalMes = EXPENSES.reduce((s,e)=>s+Number(e.amount), 0);
    const count = EXPENSES.length;
    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const proximos = EXPENSES.filter(e => e.due_day >= diaHoje).sort((a,b)=>a.due_day-b.due_day);
    const prox = proximos[0];
    const kpis = document.querySelectorAll('.kpi-value');
    const subs = document.querySelectorAll('.kpi-sub');
    if (kpis[0]) kpis[0].textContent = count > 0 ? fmtBRL(totalMes) : '—';
    if (subs[0]) subs[0].innerHTML = count > 0 ? `${count} despesa${count>1?'s':''} ativa${count>1?'s':''}` : 'nenhuma cadastrada';
    if (kpis[1]) kpis[1].textContent = '—';
    if (subs[1]) subs[1].innerHTML = 'cadastre faturamento no DRE';
    if (kpis[2]) kpis[2].textContent = prox ? `Dia ${String(prox.due_day).padStart(2,'0')}` : '—';
    if (subs[2]) subs[2].innerHTML = prox ? `${prox.description} · ${fmtBRL(prox.amount)}` : 'sem próximas';
    if (kpis[3]) kpis[3].textContent = count > 0 ? `${count}` : '—';
    if (subs[3]) subs[3].innerHTML = count > 0 ? 'despesas fixas ativas' : 'cadastre pra começar';
    const rodape = document.querySelector('.exp-footer');
    if (rodape) rodape.innerHTML = `<span>${count} despesa${count!==1?'s':''} ativa${count!==1?'s':''}</span><span>Total mensal: <b>${count > 0 ? fmtBRL(totalMes) : '—'}</b></span>`;
  }

  function renderChips() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    // Remove chips antigos mas mantém o search
    toolbar.querySelectorAll('.chip').forEach(c => c.remove());
    const search = toolbar.querySelector('.search');
    const chipAll = document.createElement('span');
    chipAll.className = 'chip' + (FILTRO_CAT === 'all' ? ' active' : '');
    chipAll.innerHTML = `Todas <span style="opacity:.7">· ${EXPENSES.length}</span>`;
    chipAll.addEventListener('click', () => { FILTRO_CAT = 'all'; render(); });
    toolbar.insertBefore(chipAll, search);
    const porCat = {};
    EXPENSES.forEach(e => {
      const nome = e.expense_categories?.name || 'Sem categoria';
      porCat[nome] = (porCat[nome] || 0) + 1;
    });
    Object.entries(porCat).forEach(([nome, qtd]) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (FILTRO_CAT === nome ? ' active' : '');
      chip.innerHTML = `<span class="chip-dot" style="background:${catColor(nome)}"></span>${nome} · ${qtd}`;
      chip.addEventListener('click', () => { FILTRO_CAT = nome; render(); });
      toolbar.insertBefore(chip, search);
    });
  }

  function renderLista() {
    const container = document.querySelector('.expenses');
    if (!container) return;
    // Remove todas as linhas exceto .head e .exp-footer
    container.querySelectorAll('.exp-row:not(.head)').forEach(r => r.remove());
    const rodape = container.querySelector('.exp-footer');
    const head = container.querySelector('.exp-row.head');

    let filtradas = EXPENSES;
    if (FILTRO_CAT !== 'all') filtradas = filtradas.filter(e => (e.expense_categories?.name || 'Sem categoria') === FILTRO_CAT);
    if (BUSCA) {
      const q = BUSCA.toLowerCase();
      filtradas = filtradas.filter(e => (e.description || '').toLowerCase().includes(q));
    }

    if (filtradas.length === 0) {
      const vazio = document.createElement('div');
      vazio.className = 'exp-row empty';
      vazio.style.cssText = 'grid-column:1/-1;padding:40px;text-align:center;color:var(--text-muted);font-size:13.5px';
      vazio.innerHTML = EXPENSES.length === 0
        ? `<i data-lucide="inbox" style="width:32px;height:32px;opacity:.4;margin-bottom:10px"></i><div><b>Nenhuma despesa fixa cadastrada.</b></div><div style="margin-top:4px;font-size:12px">Clique em <b>Nova despesa fixa</b> pra começar.</div>`
        : `<div style="font-size:13px">Nenhuma despesa encontrada com esse filtro.</div>`;
      head ? head.after(vazio) : container.insertBefore(vazio, rodape);
      return;
    }

    filtradas.forEach(e => {
      const cat = e.expense_categories?.name || 'Sem categoria';
      const color = catColor(cat);
      const icon = catIcon(cat);
      const row = document.createElement('div');
      row.className = 'exp-row';
      row.dataset.cat = cat;
      row.dataset.id = e.id;
      row.innerHTML = `
        <div class="exp-ico" style="background:${color}22;color:${color}"><i data-lucide="${icon}"></i></div>
        <div>
          <div class="exp-name">${escapeHtml(e.description || '—')}</div>
          <div class="exp-sub" style="display:flex;align-items:center;gap:6px"><span class="exp-cat-pill" style="background:${color}22;color:${color};font-size:10px;padding:2px 7px;border-radius:999px;font-weight:600">${cat}</span></div>
        </div>
        <div class="exp-day" style="text-align:center"><b>${String(e.due_day).padStart(2,'0')}</b></div>
        <div class="exp-val">${fmtBRL(e.amount)}</div>
        <div class="exp-actions" style="display:flex;gap:4px;justify-content:flex-end">
          <button class="icon-btn" style="width:26px;height:26px" title="Editar" onclick="event.stopPropagation();DMPAY_DESP.editar('${e.id}')"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>
          <button class="icon-btn" style="width:26px;height:26px" title="Desativar" onclick="event.stopPropagation();DMPAY_DESP.desativar('${e.id}')"><i data-lucide="pause" style="width:12px;height:12px"></i></button>
        </div>`;
      head ? head.after(row) : container.insertBefore(row, rodape);
    });
  }

  function renderChart() {
    const chart = document.getElementById('distribChart');
    if (!chart) return;
    chart.innerHTML = '';
    if (EXPENSES.length === 0) {
      chart.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:12.5px;grid-column:1/-1">Distribuição aparece aqui quando você cadastrar despesas</div>`;
      return;
    }
    // Agrupa por dia
    const porDia = {};
    EXPENSES.forEach(e => { porDia[e.due_day] = (porDia[e.due_day] || 0) + Number(e.amount); });
    const max = Math.max(...Object.values(porDia), 1);
    const labelsShown = new Set([1,5,10,15,20,25,30]);
    const labelRow = document.createElement('div');
    labelRow.className = 'distrib-labels';
    for (let d = 1; d <= 31; d++) {
      const val = porDia[d] || 0;
      const bar = document.createElement('div');
      bar.className = 'distrib-bar';
      bar.style.height = `${Math.max((val / max) * 100, 2)}%`;
      bar.style.background = val > 0 ? 'var(--accent)' : 'var(--border)';
      if (val > 0) {
        bar.title = `Dia ${d}: ${fmtBRL(val)}`;
      }
      chart.appendChild(bar);
      const lbl = document.createElement('span');
      lbl.textContent = labelsShown.has(d) ? d : '';
      labelRow.appendChild(lbl);
    }
    chart.appendChild(labelRow);
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function salvarNova(form) {
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const nome = form.nome.trim();
    const amount = parseFloat(String(form.valor).replace(/\./g,'').replace(',','.'));
    const due = parseInt(form.dia, 10);
    if (!nome || !amount || !due) { alert('Preencha descrição, valor e dia'); return; }
    const categoria = form.categoria || 'Geral';
    // Garante categoria
    let catId = CATEGORIES.find(c => c.name === categoria)?.id;
    if (!catId) {
      const { data, error } = await sb.from('expense_categories').insert({
        company_id: COMPANY_ID, name: categoria, color: catColor(categoria), icon: catIcon(categoria)
      }).select('id').single();
      if (error) { alert('Erro: '+error.message); return; }
      catId = data.id;
    }
    const { error } = await sb.from('fixed_expenses').insert({
      company_id: COMPANY_ID,
      category_id: catId,
      description: nome,
      amount: amount,
      due_day: due,
      active: true
    });
    if (error) { alert('Erro ao salvar: '+error.message); return; }
    document.getElementById('modal')?.classList.remove('open');
    await load(); render();
  }

  async function desativar(id) {
    if (!confirm('Desativar essa despesa fixa? Ela para de aparecer na lista mas fica no histórico.')) return;
    const { error } = await sb.from('fixed_expenses').update({ active: false }).eq('id', id);
    if (error) { alert(error.message); return; }
    await load(); render();
  }

  function editar(id) {
    const e = EXPENSES.find(x => x.id === id); if (!e) return;
    const modal = document.getElementById('modal');
    if (!modal) return;
    document.getElementById('exp-nome').value = e.description || '';
    document.getElementById('exp-valor').value = String(e.amount).replace('.', ',');
    document.getElementById('exp-dia').value = e.due_day;
    document.getElementById('modal').dataset.editId = id;
    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
  }

  async function init() {
    if (!window.sb || !window.DMPAY_COMPANY) { setTimeout(init, 100); return; }
    await load();
    render();
    // Busca
    const search = document.querySelector('.toolbar .search input');
    if (search) {
      let t;
      search.addEventListener('input', e => {
        clearTimeout(t);
        t = setTimeout(() => { BUSCA = e.target.value; render(); }, 180);
      });
    }
    // Salvar despesa (botão dentro do modal)
    const salvarBtn = document.querySelector('#modal .btn.btn-primary');
    if (salvarBtn) {
      salvarBtn.onclick = async () => {
        const editId = document.getElementById('modal').dataset.editId;
        const form = {
          nome: document.getElementById('exp-nome')?.value || '',
          valor: document.getElementById('exp-valor')?.value || '',
          dia: document.getElementById('exp-dia')?.value || '',
          categoria: document.querySelector('.cat-option.selected')?.dataset.cat || 'Geral'
        };
        if (editId) {
          const amount = parseFloat(String(form.valor).replace(/\./g,'').replace(',','.'));
          const due = parseInt(form.dia, 10);
          const { error } = await sb.from('fixed_expenses').update({
            description: form.nome, amount, due_day: due
          }).eq('id', editId);
          if (error) { alert(error.message); return; }
          delete document.getElementById('modal').dataset.editId;
          document.getElementById('modal').classList.remove('open');
          await load(); render();
        } else {
          await salvarNova(form);
        }
      };
    }
  }

  window.DMPAY_DESP = { desativar, editar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
