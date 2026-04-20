// DM Pay — Export Excel helpers
// Usa xlsx-js-style (fork SheetJS com estilos, MIT, CDN).
// Carregado dinamicamente no primeiro uso.

window.DMPAY_EXPORT = (() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js';

  // ── Paleta DM Pay ──────────────────────────────────────────────────────────
  const C = {
    headBg:    '1E3A5F',
    headFg:    'FFFFFF',
    subBg:     'DBEAFE',
    subFg:     '1E3A8A',
    bandBg:    'F0F6FF',
    whiteBg:   'FFFFFF',
    accentBg:  '2563EB',
    accentFg:  'FFFFFF',
    greenBg:   'D1FAE5',
    greenFg:   '065F46',
    redBg:     'FEE2E2',
    redFg:     '991B1B',
    yellowBg:  'FEF3C7',
    yellowFg:  '92400E',
    mutedFg:   '6B7280',
    borderClr: 'D1D5DB',
  };

  const FONT_BASE = 'Calibri';
  const FONT_SIZE = 11;

  // ── Estilos reutilizáveis ──────────────────────────────────────────────────
  function border() {
    const s = { style: 'thin', color: { rgb: C.borderClr } };
    return { top: s, bottom: s, left: s, right: s };
  }

  function cell(v, opts = {}) {
    const {
      bold = false, fg = '111827', bg = C.whiteBg, sz = FONT_SIZE,
      italic = false, align = 'left', numFmt = null, wrap = false,
    } = opts;
    const c = {
      v,
      t: typeof v === 'number' ? 'n' : 's',
      s: {
        font:      { name: FONT_BASE, sz, bold, italic, color: { rgb: fg } },
        fill:      { fgColor: { rgb: bg } },
        alignment: { horizontal: align, vertical: 'center', wrapText: wrap },
        border:    border(),
      },
    };
    if (numFmt) c.z = numFmt;
    return c;
  }

  function hCell(v, opts = {}) {
    return cell(v, {
      bold: true, fg: C.headFg, bg: C.headBg, sz: FONT_SIZE,
      align: 'center', ...opts,
    });
  }

  function subCell(v, opts = {}) {
    return cell(v, {
      bold: true, fg: C.subFg, bg: C.subBg, sz: FONT_SIZE, ...opts,
    });
  }

  function moneyCell(v, opts = {}) {
    return cell(v, {
      numFmt: '#,##0.00',
      align: 'right',
      ...opts,
      t: undefined, // será definido por cell() via typeof
    });
  }

  // ── Faixa de título do arquivo ─────────────────────────────────────────────
  function brandRow(ws, titulo, ncols, row) {
    const range = `A${row}`;
    ws[range] = {
      v: `DM Pay  ·  ${titulo}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`,
      t: 's',
      s: {
        font:      { name: FONT_BASE, sz: 13, bold: true, color: { rgb: C.headFg } },
        fill:      { fgColor: { rgb: C.accentBg } },
        alignment: { horizontal: 'left', vertical: 'center' },
      },
    };
    ws['!merges'] = ws['!merges'] || [];
    ws['!merges'].push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: ncols - 1 } });
  }

  // ── KPI row ────────────────────────────────────────────────────────────────
  function kpiRow(ws, items, row, ncols) {
    // items = [{label, value, bg, fg}]
    // distribui em pares (label | value | espaço ...)
    items.forEach((item, i) => {
      const col = i * 2;
      const ltr = String.fromCharCode(65 + col);
      const vtr = String.fromCharCode(65 + col + 1);
      ws[`${ltr}${row}`] = cell(item.label, { bold: true, fg: C.mutedFg, bg: item.bg || C.subBg, sz: 10 });
      ws[`${vtr}${row}`] = cell(item.value, { bold: true, fg: item.fg || C.subFg, bg: item.bg || C.subBg, align: 'right' });
      ws['!merges'] = ws['!merges'] || [];
    });
  }

  // ── Utilitários ────────────────────────────────────────────────────────────
  function brDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function fmtMoney(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function colLetter(n) { return String.fromCharCode(65 + n); }

  function setRange(ws, r1, c1, r2, c2) {
    ws['!ref'] = `A1:${colLetter(c2)}${r2}`;
  }

  // ── Carrega lib sob demanda ────────────────────────────────────────────────
  let _loaded = false;
  function loadLib() {
    return new Promise((resolve, reject) => {
      if (_loaded || window.XLSX) { _loaded = true; return resolve(); }
      const s = document.createElement('script');
      s.src = CDN;
      s.onload  = () => { _loaded = true; resolve(); };
      s.onerror = () => reject(new Error('Falha ao carregar xlsx-js-style'));
      document.head.appendChild(s);
    });
  }

  function download(wb, filename) {
    XLSX.writeFile(wb, filename, { bookType: 'xlsx', type: 'binary' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTAÇÕES POR MÓDULO
  // ══════════════════════════════════════════════════════════════════════════

  // ── Contas a Pagar ─────────────────────────────────────────────────────────
  async function contasPagar(payables) {
    await loadLib();

    const COLS = [
      { wch: 30 }, // Fornecedor
      { wch: 36 }, // Descrição
      { wch: 16 }, // Vencimento
      { wch: 18 }, // Valor
      { wch: 16 }, // Pago em
      { wch: 14 }, // Status
      { wch: 24 }, // Categoria
    ];
    const NC = COLS.length;
    const ws = { '!cols': COLS };

    // linha 1: brand
    brandRow(ws, 'Contas a Pagar', NC, 1);

    // linha 2: KPIs
    const abertas = payables.filter(p => p.status !== 'paid');
    const pagas   = payables.filter(p => p.status === 'paid');
    const totalAberto = abertas.reduce((s, p) => s + Number(p.amount), 0);
    const totalPago   = pagas.reduce((s, p) => s + Number(p.amount), 0);
    const atrasadas   = abertas.filter(p => {
      const diff = (new Date(p.due_date) - new Date()) / 86400000;
      return diff < 0;
    });

    const kpis = [
      { label: 'Em aberto', value: fmtMoney(totalAberto), bg: C.yellowBg, fg: C.yellowFg },
      { label: 'Atrasadas', value: `${atrasadas.length} contas`, bg: C.redBg, fg: C.redFg },
      { label: 'Pagas (período)', value: fmtMoney(totalPago), bg: C.greenBg, fg: C.greenFg },
    ];
    kpiRow(ws, kpis, 2, NC);

    // linha 3: espaço
    ws['A3'] = cell('', { bg: C.whiteBg });

    // linha 4: cabeçalho
    const hdrs = ['Fornecedor', 'Descrição', 'Vencimento', 'Valor (R$)', 'Pago em', 'Status', 'Categoria'];
    hdrs.forEach((h, i) => { ws[`${colLetter(i)}4`] = hCell(h); });

    // linhas de dados
    const STATUS_MAP = {
      paid:    { label: 'Pago',     bg: C.greenBg,  fg: C.greenFg  },
      overdue: { label: 'Atrasado', bg: C.redBg,    fg: C.redFg    },
      open:    { label: 'A pagar',  bg: C.yellowBg, fg: C.yellowFg },
    };

    let row = 5;
    payables.forEach((p, i) => {
      const band = i % 2 === 0 ? C.bandBg : C.whiteBg;
      const diff = (new Date(p.due_date) - new Date()) / 86400000;
      let statusKey = p.status === 'paid' ? 'paid' : diff < 0 ? 'overdue' : 'open';
      const st = STATUS_MAP[statusKey] || STATUS_MAP.open;
      const sup = p.suppliers?.trade_name || p.suppliers?.legal_name || '—';
      const cat = p.expense_categories?.name || '—';

      ws[`A${row}`] = cell(sup,                 { bg: band });
      ws[`B${row}`] = cell(p.description || '—',{ bg: band });
      ws[`C${row}`] = cell(brDate(p.due_date),  { bg: band, align: 'center' });
      ws[`D${row}`] = cell(Number(p.amount||0), { bg: band, align: 'right', numFmt: '#,##0.00' });
      ws[`E${row}`] = cell(brDate(p.paid_at),   { bg: band, align: 'center', fg: C.mutedFg });
      ws[`F${row}`] = cell(st.label,            { bg: st.bg, fg: st.fg, bold: true, align: 'center' });
      ws[`G${row}`] = cell(cat,                 { bg: band, fg: C.mutedFg });
      row++;
    });

    ws['!ref'] = `A1:${colLetter(NC - 1)}${row - 1}`;
    ws['!rows'] = [{ hpt: 28 }, { hpt: 26 }, { hpt: 6 }, { hpt: 24 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Pagar');
    download(wb, `DM_Pay_Contas_a_Pagar_${_today()}.xlsx`);
  }

  // ── Despesas Fixas ─────────────────────────────────────────────────────────
  async function despesas(expenses) {
    await loadLib();

    const COLS = [
      { wch: 36 }, // Descrição
      { wch: 18 }, // Valor Mensal
      { wch: 12 }, // Dia Venc.
      { wch: 24 }, // Categoria
    ];
    const NC = COLS.length;
    const ws = { '!cols': COLS };

    brandRow(ws, 'Despesas Fixas Mensais', NC, 1);

    const totalMes = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const kpis = [
      { label: 'Total/mês', value: fmtMoney(totalMes), bg: C.subBg, fg: C.subFg },
      { label: 'Despesas ativas', value: `${expenses.length}`, bg: C.subBg, fg: C.subFg },
    ];
    kpiRow(ws, kpis, 2, NC);

    ws['A3'] = cell('', { bg: C.whiteBg });
    const hdrs = ['Descrição', 'Valor Mensal (R$)', 'Dia Vencimento', 'Categoria'];
    hdrs.forEach((h, i) => { ws[`${colLetter(i)}4`] = hCell(h); });

    let row = 5;
    expenses.forEach((e, i) => {
      const band = i % 2 === 0 ? C.bandBg : C.whiteBg;
      const cat  = e.expense_categories?.name || '—';
      ws[`A${row}`] = cell(e.description || '—',     { bg: band });
      ws[`B${row}`] = cell(Number(e.amount || 0),    { bg: band, align: 'right', numFmt: '#,##0.00' });
      ws[`C${row}`] = cell(`Dia ${e.due_day || '?'}`,{ bg: band, align: 'center' });
      ws[`D${row}`] = cell(cat,                       { bg: band, fg: C.mutedFg });
      row++;
    });

    // linha de total
    ws[`A${row}`] = cell('TOTAL MENSAL', { bold: true, bg: C.subBg, fg: C.subFg });
    ws[`B${row}`] = cell(totalMes,       { bold: true, bg: C.subBg, fg: C.subFg, align: 'right', numFmt: '#,##0.00' });
    ws[`C${row}`] = cell('', { bg: C.subBg });
    ws[`D${row}`] = cell('', { bg: C.subBg });
    row++;

    ws['!ref'] = `A1:${colLetter(NC - 1)}${row - 1}`;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Despesas Fixas');
    download(wb, `DM_Pay_Despesas_Fixas_${_today()}.xlsx`);
  }

  // ── Fornecedores ───────────────────────────────────────────────────────────
  async function fornecedores(suppliers) {
    await loadLib();

    const COLS = [
      { wch: 32 }, // Razão Social
      { wch: 26 }, // Nome Fantasia
      { wch: 20 }, // CNPJ
      { wch: 28 }, // Email
      { wch: 18 }, // Telefone
      { wch: 32 }, // Endereço
    ];
    const NC = COLS.length;
    const ws = { '!cols': COLS };

    brandRow(ws, 'Fornecedores', NC, 1);
    ws['A2'] = subCell(`${suppliers.length} fornecedores cadastrados`);
    ws['!merges'] = ws['!merges'] || [];
    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: NC - 1 } });
    ws['A3'] = cell('', { bg: C.whiteBg });

    const hdrs = ['Razão Social', 'Nome Fantasia', 'CNPJ', 'E-mail', 'Telefone', 'Endereço'];
    hdrs.forEach((h, i) => { ws[`${colLetter(i)}4`] = hCell(h); });

    let row = 5;
    suppliers.forEach((s, i) => {
      const band = i % 2 === 0 ? C.bandBg : C.whiteBg;
      const end  = [s.address_street, s.address_city, s.address_state].filter(Boolean).join(', ') || '—';
      ws[`A${row}`] = cell(s.legal_name || '—',  { bg: band, bold: true });
      ws[`B${row}`] = cell(s.trade_name || '—',  { bg: band });
      ws[`C${row}`] = cell(s.cnpj || '—',        { bg: band, align: 'center' });
      ws[`D${row}`] = cell(s.email || '—',        { bg: band });
      ws[`E${row}`] = cell(s.phone || '—',        { bg: band, align: 'center' });
      ws[`F${row}`] = cell(end,                   { bg: band, fg: C.mutedFg });
      row++;
    });

    ws['!ref'] = `A1:${colLetter(NC - 1)}${row - 1}`;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');
    download(wb, `DM_Pay_Fornecedores_${_today()}.xlsx`);
  }

  // ── Vendas Diárias ─────────────────────────────────────────────────────────
  async function vendasDiarias(rows) {
    // rows = [{sale_date, payment_method, amount}]
    await loadLib();

    // agrupa por data
    const porData = {};
    rows.forEach(r => {
      if (!porData[r.sale_date]) porData[r.sale_date] = {};
      porData[r.sale_date][r.payment_method] = (porData[r.sale_date][r.payment_method] || 0) + Number(r.amount);
    });
    const datas = Object.keys(porData).sort().reverse();
    const metodos = ['dinheiro', 'pix', 'credito', 'debito', 'a_prazo', 'cheque', 'troco', 'outro'];
    const metLabels = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', debito: 'Débito', a_prazo: 'A Prazo', cheque: 'Cheque', troco: 'Troco', outro: 'Outro' };

    const COLS = [{ wch: 14 }, ...metodos.map(() => ({ wch: 16 })), { wch: 18 }];
    const NC = COLS.length;
    const ws = { '!cols': COLS };

    brandRow(ws, 'Vendas Diárias por Forma de Pagamento', NC, 1);
    ws['A3'] = cell('', { bg: C.whiteBg });

    const hdrs = ['Data', ...metodos.map(m => metLabels[m]), 'Total Líquido'];
    hdrs.forEach((h, i) => { ws[`${colLetter(i)}4`] = hCell(h); });

    let row = 5;
    const totaisMet = {};
    datas.forEach((d, i) => {
      const band = i % 2 === 0 ? C.bandBg : C.whiteBg;
      const dia = porData[d];
      let totalDia = 0;
      ws[`A${row}`] = cell(brDate(d), { bg: band, bold: true, align: 'center' });
      metodos.forEach((m, j) => {
        const v = dia[m] || 0;
        totaisMet[m] = (totaisMet[m] || 0) + v;
        totalDia += m === 'troco' ? 0 : v; // troco já é negativo
        const bgCell = m === 'troco' && v < 0 ? C.redBg : band;
        const fgCell = m === 'troco' && v < 0 ? C.redFg : undefined;
        const c = cell(v || '', { bg: bgCell, align: 'right', numFmt: '#,##0.00' });
        if (fgCell) c.s.font.color = { rgb: fgCell };
        ws[`${colLetter(j + 1)}${row}`] = c;
      });
      totalDia = metodos.reduce((s, m) => s + (dia[m] || 0), 0);
      ws[`${colLetter(NC - 1)}${row}`] = cell(totalDia, { bg: band, bold: true, align: 'right', numFmt: '#,##0.00', fg: totalDia >= 0 ? C.greenFg : C.redFg });
      row++;
    });

    // totais
    ws[`A${row}`] = cell('TOTAL', { bold: true, bg: C.subBg, fg: C.subFg });
    let grandTotal = 0;
    metodos.forEach((m, j) => {
      const v = totaisMet[m] || 0;
      grandTotal += v;
      ws[`${colLetter(j + 1)}${row}`] = cell(v || '', { bold: true, bg: C.subBg, fg: C.subFg, align: 'right', numFmt: '#,##0.00' });
    });
    ws[`${colLetter(NC - 1)}${row}`] = cell(grandTotal, { bold: true, bg: C.accentBg, fg: C.accentFg, align: 'right', numFmt: '#,##0.00' });
    row++;

    ws['!ref'] = `A1:${colLetter(NC - 1)}${row - 1}`;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas Diárias');
    download(wb, `DM_Pay_Vendas_${_today()}.xlsx`);
  }

  function _today() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  return { contasPagar, despesas, fornecedores, vendasDiarias };
})();
