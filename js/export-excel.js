// DM Pay — Export Excel (ExcelJS, mesmo padrão RPM Pro / EDR System)
// Carrega ExcelJS sob demanda via CDN.

window.DMPAY_EXPORT = (() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

  // Paleta DM Pay
  const AZUL_ESCURO = '1E3A5F';
  const AZUL        = '2563EB';
  const AZUL_CLARO  = 'DBEAFE';
  const BRANCO      = 'FFFFFF';
  const CINZA_CLR   = 'F3F4F6';
  const CINZA_BRD   = 'D1D5DB';
  const VERDE       = '10B981';
  const VERDE_BG    = 'D1FAE5';
  const VERMELHO    = 'DC2626';
  const VERM_BG     = 'FEE2E2';
  const AMARELO_BG  = 'FEF3C7';
  const AMARELO_FG  = '92400E';
  const TEXTO       = '111827';
  const MUTED       = '6B7280';

  function brd() {
    const s = { style: 'thin', color: { argb: CINZA_BRD } };
    return { top: s, bottom: s, left: s, right: s };
  }

  function brDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = String(iso).split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  }

  function fmt(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function hoje() { return new Date().toLocaleDateString('pt-BR'); }

  async function loadLib() {
    if (window.ExcelJS) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CDN;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    if (!window.ExcelJS) throw new Error('ExcelJS não carregou');
  }

  function nomeEmpresa() {
    return window.DMPAY_COMPANY?.name || 'DM Pay';
  }

  // Faixa de título (2 linhas): empresa + subtítulo
  function addHeader(ws, titulo, ncols) {
    const empresa = nomeEmpresa().toUpperCase();

    // Linha 1: nome da empresa
    ws.getRow(1).height = 44;
    ws.mergeCells(1, 1, 1, ncols);
    const c1 = ws.getCell('A1');
    c1.value = empresa;
    c1.font = { name: 'Arial', size: 18, bold: true, color: { argb: BRANCO } };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ESCURO } };
    c1.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 2; c <= ncols; c++)
      ws.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ESCURO } };

    // Linha 2: título do relatório
    ws.getRow(2).height = 26;
    ws.mergeCells(2, 1, 2, ncols);
    const c2 = ws.getCell('A2');
    c2.value = titulo.toUpperCase();
    c2.font = { name: 'Arial', size: 11, bold: true, color: { argb: BRANCO } };
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c2.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 2; c <= ncols; c++)
      ws.getRow(2).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };

    // Linha 3: data
    ws.getRow(3).height = 20;
    ws.mergeCells(3, 1, 3, ncols);
    const c3 = ws.getCell('A3');
    c3.value = `Gerado em ${hoje()}  •  DM Pay — dmpay.com.br`;
    c3.font = { name: 'Arial', size: 9, italic: true, color: { argb: MUTED } };
    c3.alignment = { horizontal: 'center', vertical: 'middle' };

    ws.addRow([]);
  }

  async function salvar(wb, nome) {
    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toast(msg) {
    if (window.DMPAY_TOAST?.show) DMPAY_TOAST.show(msg);
    else if (window.DMPAY_UI?.toast) DMPAY_UI.toast(msg);
    else console.log('[Export]', msg);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONTAS A PAGAR
  // ══════════════════════════════════════════════════════════════════════════
  async function contasPagar(payables) {
    if (!payables?.length) { toast('Nenhuma conta para exportar'); return; }
    toast('Gerando planilha...');
    await loadLib();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DM Pay';
    const ws = wb.addWorksheet('Contas a Pagar', { properties: { defaultColWidth: 18 } });
    const NC = 10;

    ws.columns = [
      { width: 14 }, // Emissão
      { width: 20 }, // NF
      { width: 45 }, // Fornecedor
      { width: 14 }, // Vencimento
      { width: 18 }, // Valor
      { width: 14 }, // Pago em
      { width: 14 }, // Pago por
      { width: 14 }, // Status
      { width: 14 }, // Tipo
      { width: 28 }, // Categoria
    ];

    addHeader(ws, 'Contas a Pagar', NC);

    // KPIs resumo
    const abertas   = payables.filter(p => p.status !== 'paid');
    const pagas     = payables.filter(p => p.status === 'paid');
    const atrasadas = abertas.filter(p => new Date(p.due_date) < new Date());
    const totAberto = abertas.reduce((s, p) => s + Number(p.amount), 0);
    const totPago   = pagas.reduce((s, p) => s + Number(p.amount), 0);

    const kRow = ws.addRow([
      `Em aberto: ${fmt(totAberto)}`,
      '',
      `Atrasadas: ${atrasadas.length} contas`,
      '',
      `Pagas (período): ${fmt(totPago)}`,
      '', '', ''
    ]);
    kRow.height = 24;
    [[1,2, AMARELO_BG, AMARELO_FG], [3,4, VERM_BG, VERMELHO], [5,6, VERDE_BG, VERDE]].forEach(([ci1, ci2, bg, fg]) => {
      [ci1, ci2].forEach(ci => {
        kRow.getCell(ci).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        kRow.getCell(ci).font  = { name: 'Arial', size: 10, bold: true, color: { argb: fg } };
        kRow.getCell(ci).alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });

    ws.addRow([]);

    // Cabeçalho colunas + AutoFilter
    const hRow = ws.addRow(['Emissão', 'NF', 'Fornecedor', 'Vencimento', 'Valor (R$)', 'Pago em', 'Pago por', 'Status', 'Tipo', 'Categoria']);
    const hRowNum = hRow.number;
    hRow.height = 24;
    hRow.eachCell(c => {
      c.font      = { name: 'Arial', size: 9, bold: true, color: { argb: BRANCO } };
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ESCURO } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border    = brd();
    });
    ws.autoFilter = { from: { row: hRowNum, column: 1 }, to: { row: hRowNum, column: NC } };

    // Helper: extrai número da NF da descrição ("NF 3465493 ..." ou "NF-e 3465493 ...")
    function extrairNF(desc) {
      const m = String(desc || '').match(/^NF(?:-e)?\s+["']?([^\s"',]+)/i);
      return m ? m[1] : '—';
    }

    // Dados
    payables.forEach((p, i) => {
      const diff = (new Date(p.due_date) - new Date()) / 86400000;
      let stLabel = 'A pagar', stBg = AMARELO_BG, stFg = AMARELO_FG;
      if (p.status === 'paid')    { stLabel = 'Pago';     stBg = VERDE_BG;  stFg = VERDE; }
      else if (diff < 0)          { stLabel = 'Atrasado'; stBg = VERM_BG;   stFg = VERMELHO; }

      const _descSup = p.description?.replace(/^NF(?:-e)?\s+[\d\s\-,]+/i, '').trim() || '';
      const supRaw = p.suppliers?.legal_name || p.suppliers?.trade_name || _descSup || '—';
      const sup    = supRaw === '—' ? '—' : supRaw.toUpperCase();
      const cat    = p.expense_categories?.name || '—';
      const emissao = brDate(p.invoices?.issue_date || p.created_at);
      const nf      = p.invoices?.nf_number || extrairNF(p.description);
      const tipo    = p.tipo_lancamento === 'compra' ? 'Compra' : p.tipo_lancamento === 'despesa' ? 'Despesa' : '—';
      const pagoPor = p.pago_por === 'conta_pj' ? 'Conta PJ' : p.pago_por === 'loteria' ? 'Lotérica' : p.pago_por === 'terceiros' ? 'Terceiros' : '—';
      const band    = i % 2 === 0 ? CINZA_CLR : BRANCO;

      const row = ws.addRow([
        emissao,
        nf,
        sup,
        brDate(p.due_date),
        Number(p.amount || 0),
        brDate(p.paid_at),
        pagoPor,
        stLabel,
        tipo,
        cat,
      ]);
      row.height = 20;

      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(1).font = { name: 'Arial', size: 9, color: { argb: MUTED } };
      row.getCell(2).font = { name: 'Arial', size: 9, bold: true };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).font = { name: 'Arial', size: 10, bold: true };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(5).font = { name: 'Arial', size: 10, bold: true };
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).font = { name: 'Arial', size: 9, color: { argb: MUTED } };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).font = { name: 'Arial', size: 9, color: { argb: MUTED } };
      row.getCell(8).font = { name: 'Arial', size: 9, bold: true, color: { argb: stFg } };
      row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stBg } };
      row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(9).font = { name: 'Arial', size: 9, bold: true };
      row.getCell(10).font = { name: 'Arial', size: 9, color: { argb: MUTED } };

      [1,2,3,4,5,6,7,9,10].forEach(ci => {
        row.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: band } };
      });
      row.eachCell(c => { c.border = brd(); });
    });

    // Rodapé totais
    ws.addRow([]);
    const tRow = ws.addRow(['', '', '', `Total em aberto: ${fmt(totAberto)}`, '', `Total pago: ${fmt(totPago)}`, `${payables.length} lançamentos`, '']);
    tRow.getCell(4).font = { name: 'Arial', size: 9, bold: true, color: { argb: AZUL } };
    tRow.getCell(6).font = { name: 'Arial', size: 9, bold: true, color: { argb: VERDE } };
    tRow.getCell(7).font = { name: 'Arial', size: 9, color: { argb: MUTED } };

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.headerFooter = { oddFooter: `${nomeEmpresa()} — Contas a Pagar — Página &P de &N` };

    const iso = new Date().toISOString().slice(0, 10);
    await salvar(wb, `DM_Pay_Contas_a_Pagar_${iso}.xlsx`);
    toast('Planilha exportada!');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESPESAS FIXAS
  // ══════════════════════════════════════════════════════════════════════════
  async function despesas(expenses) {
    if (!expenses?.length) { toast('Nenhuma despesa para exportar'); return; }
    toast('Gerando planilha...');
    await loadLib();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DM Pay';
    const ws = wb.addWorksheet('Despesas Fixas', { properties: { defaultColWidth: 18 } });
    const NC = 4;

    ws.columns = [
      { width: 38 }, // Descrição
      { width: 18 }, // Valor Mensal
      { width: 14 }, // Dia Venc.
      { width: 26 }, // Categoria
    ];

    addHeader(ws, 'Despesas Fixas Mensais', NC);

    const totalMes = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const kRow = ws.addRow([`${expenses.length} despesas ativas`, `Total/mês: ${fmt(totalMes)}`, '', '']);
    kRow.height = 24;
    kRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: AZUL } };
    kRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
    kRow.getCell(2).font = { name: 'Arial', size: 10, bold: true, color: { argb: AZUL_ESCURO } };
    kRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };
    kRow.getCell(2).alignment = { horizontal: 'right' };

    ws.addRow([]);

    const hRow = ws.addRow(['Descrição', 'Valor Mensal (R$)', 'Dia Vencimento', 'Categoria']);
    hRow.height = 24;
    hRow.eachCell(c => {
      c.font      = { name: 'Arial', size: 9, bold: true, color: { argb: BRANCO } };
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ESCURO } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border    = brd();
    });

    expenses.forEach((e, i) => {
      const band = i % 2 === 0 ? CINZA_CLR : BRANCO;
      const cat  = e.expense_categories?.name || '—';
      const row  = ws.addRow([e.description || '—', Number(e.amount || 0), `Dia ${e.due_day || '?'}`, cat]);
      row.height = 20;
      row.getCell(1).font = { name: 'Arial', size: 10, bold: true };
      row.getCell(2).numFmt = '#,##0.00';
      row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(2).font = { name: 'Arial', size: 10, bold: true };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).font = { name: 'Arial', size: 9, color: { argb: MUTED } };
      row.eachCell(c => {
        c.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: band } };
        c.border = brd();
      });
    });

    // Linha total
    const tRow = ws.addRow(['TOTAL MENSAL', totalMes, '', '']);
    tRow.height = 26;
    tRow.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: BRANCO } };
    tRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    tRow.getCell(2).numFmt = '#,##0.00';
    tRow.getCell(2).font = { name: 'Arial', size: 11, bold: true, color: { argb: BRANCO } };
    tRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    tRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
    tRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    tRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    tRow.eachCell(c => { c.border = brd(); });

    ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, paperSize: 9 };
    ws.headerFooter = { oddFooter: `${nomeEmpresa()} — Despesas Fixas — Página &P de &N` };

    const iso = new Date().toISOString().slice(0, 10);
    await salvar(wb, `DM_Pay_Despesas_Fixas_${iso}.xlsx`);
    toast('Planilha exportada!');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FORNECEDORES
  // ══════════════════════════════════════════════════════════════════════════
  async function fornecedores(suppliers) {
    if (!suppliers?.length) { toast('Nenhum fornecedor para exportar'); return; }
    toast('Gerando planilha...');
    await loadLib();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DM Pay';
    const ws = wb.addWorksheet('Fornecedores', { properties: { defaultColWidth: 18 } });
    const NC = 6;

    ws.columns = [
      { width: 34 }, // Razão Social
      { width: 28 }, // Nome Fantasia
      { width: 20 }, // CNPJ
      { width: 30 }, // E-mail
      { width: 18 }, // Telefone
      { width: 34 }, // Endereço
    ];

    addHeader(ws, 'Cadastro de Fornecedores', NC);

    const kRow = ws.addRow([`${suppliers.length} fornecedores cadastrados`, '', '', '', '', '']);
    kRow.height = 22;
    kRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: AZUL } };
    kRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_CLARO } };

    ws.addRow([]);

    const hRow = ws.addRow(['Razão Social', 'Nome Fantasia', 'CNPJ', 'E-mail', 'Telefone', 'Endereço']);
    hRow.height = 24;
    hRow.eachCell(c => {
      c.font      = { name: 'Arial', size: 9, bold: true, color: { argb: BRANCO } };
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ESCURO } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border    = brd();
    });

    suppliers.forEach((s, i) => {
      const band = i % 2 === 0 ? CINZA_CLR : BRANCO;
      const end  = [s.address_street, s.address_city, s.address_state].filter(Boolean).join(', ') || '—';
      const row  = ws.addRow([
        s.legal_name || '—',
        s.trade_name || '—',
        s.cnpj || '—',
        s.email || '—',
        s.phone || '—',
        end,
      ]);
      row.height = 20;
      row.getCell(1).font = { name: 'Arial', size: 10, bold: true };
      row.getCell(2).font = { name: 'Arial', size: 9 };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(3).font = { name: 'Arial', size: 9, color: { argb: MUTED } };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(5).font = { name: 'Arial', size: 9, color: { argb: MUTED } };
      row.getCell(6).font = { name: 'Arial', size: 9, color: { argb: MUTED } };
      row.eachCell(c => {
        c.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: band } };
        c.border = brd();
      });
    });

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 };
    ws.headerFooter = { oddFooter: `${nomeEmpresa()} — Fornecedores — Página &P de &N` };

    const iso = new Date().toISOString().slice(0, 10);
    await salvar(wb, `DM_Pay_Fornecedores_${iso}.xlsx`);
    toast('Planilha exportada!');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDAS DIÁRIAS
  // ══════════════════════════════════════════════════════════════════════════
  async function vendasDiarias(rows) {
    if (!rows?.length) { toast('Nenhuma venda para exportar'); return; }
    toast('Gerando planilha...');
    await loadLib();

    const metodos  = ['dinheiro','pix','credito','debito','a_prazo','cheque','troco','outro'];
    const labels   = { dinheiro:'Dinheiro', pix:'PIX', credito:'Crédito', debito:'Débito', a_prazo:'A Prazo', cheque:'Cheque', troco:'Troco', outro:'Outro' };
    const NC = 2 + metodos.length; // Data + metodos + Total

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DM Pay';
    const ws = wb.addWorksheet('Vendas Diárias', { properties: { defaultColWidth: 16 } });

    ws.columns = [{ width: 14 }, ...metodos.map(() => ({ width: 16 })), { width: 18 }];
    addHeader(ws, 'Vendas Diárias por Forma de Pagamento', NC);

    // Agrupa por data
    const porData = {};
    rows.forEach(r => {
      if (!porData[r.sale_date]) porData[r.sale_date] = {};
      porData[r.sale_date][r.payment_method] = (porData[r.sale_date][r.payment_method] || 0) + Number(r.amount);
    });
    const datas = Object.keys(porData).sort().reverse();

    ws.addRow([]);

    const hRow = ws.addRow(['Data', ...metodos.map(m => labels[m]), 'Total Líquido']);
    hRow.height = 24;
    hRow.eachCell(c => {
      c.font      = { name: 'Arial', size: 9, bold: true, color: { argb: BRANCO } };
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ESCURO } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border    = brd();
    });

    const totMet = {};
    datas.forEach((d, i) => {
      const dia  = porData[d];
      const band = i % 2 === 0 ? CINZA_CLR : BRANCO;
      const totalDia = metodos.reduce((s, m) => s + (dia[m] || 0), 0);

      const vals = [brDate(d), ...metodos.map(m => dia[m] || ''), totalDia];
      const row  = ws.addRow(vals);
      row.height = 20;

      row.getCell(1).font      = { name: 'Arial', size: 10, bold: true };
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

      metodos.forEach((m, j) => {
        totMet[m] = (totMet[m] || 0) + (dia[m] || 0);
        const ci  = j + 2;
        const v   = dia[m] || 0;
        if (v) {
          row.getCell(ci).numFmt    = '#,##0.00';
          row.getCell(ci).alignment = { horizontal: 'right', vertical: 'middle' };
          if (m === 'troco' && v < 0)
            row.getCell(ci).font = { name: 'Arial', size: 9, color: { argb: VERMELHO } };
          else
            row.getCell(ci).font = { name: 'Arial', size: 9 };
        }
      });

      const lastCI = NC;
      row.getCell(lastCI).numFmt    = '#,##0.00';
      row.getCell(lastCI).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(lastCI).font      = { name: 'Arial', size: 10, bold: true, color: { argb: totalDia >= 0 ? VERDE : VERMELHO } };

      row.eachCell(c => {
        c.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: band } };
        c.border = brd();
      });
      row.getCell(lastCI).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: band } };
    });

    // Total geral
    const grandTotal = metodos.reduce((s, m) => s + (totMet[m] || 0), 0);
    const tRow = ws.addRow(['TOTAL', ...metodos.map(m => totMet[m] || ''), grandTotal]);
    tRow.height = 26;
    tRow.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: BRANCO } };
    tRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    metodos.forEach((m, j) => {
      const ci = j + 2;
      if (totMet[m]) { tRow.getCell(ci).numFmt = '#,##0.00'; }
      tRow.getCell(ci).font = { name: 'Arial', size: 9, bold: true, color: { argb: BRANCO } };
      tRow.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
      tRow.getCell(ci).alignment = { horizontal: 'right', vertical: 'middle' };
    });
    tRow.getCell(NC).numFmt    = '#,##0.00';
    tRow.getCell(NC).font      = { name: 'Arial', size: 11, bold: true, color: { argb: BRANCO } };
    tRow.getCell(NC).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ESCURO } };
    tRow.getCell(NC).alignment = { horizontal: 'right', vertical: 'middle' };
    tRow.eachCell(c => { c.border = brd(); });

    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 };
    ws.headerFooter = { oddFooter: `${nomeEmpresa()} — Vendas Diárias — Página &P de &N` };

    const iso = new Date().toISOString().slice(0, 10);
    await salvar(wb, `DM_Pay_Vendas_${iso}.xlsx`);
    toast('Planilha exportada!');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONTAS A RECEBER
  // ══════════════════════════════════════════════════════════════════════════
  async function contasReceber(recvs) {
    if (!recvs?.length) { toast('Nenhuma conta para exportar'); return; }
    toast('Gerando planilha...');
    await loadLib();

    const hoje = new Date();
    function diasAtraso(iso) {
      if (!iso) return 0;
      const [y,m,d] = String(iso).split('T')[0].split('-');
      const diff = Math.floor((hoje - new Date(+y,+m-1,+d)) / 86400000);
      return diff > 0 ? diff : 0;
    }

    // ── Agrupa por cliente ──────────────────────────────────────────────────
    const map = {};
    recvs.forEach(r => {
      const nome = r.customers?.name || r.description || 'Sem cliente';
      const cpf  = r.customers?.cpf_cnpj || '';
      const key  = nome;
      if (!map[key]) map[key] = { nome, cpf, parcelas: [], totalAberto: 0, totalRecebido: 0 };
      map[key].parcelas.push(r);
      if (r.status === 'received') map[key].totalRecebido += Number(r.amount || 0);
      else                         map[key].totalAberto   += Number(r.amount || 0);
    });

    const clientes = Object.values(map).sort((a, b) => b.totalAberto - a.totalAberto);
    const totalGeral   = clientes.reduce((s, c) => s + c.totalAberto, 0);
    const totalClients = clientes.filter(c => c.totalAberto > 0).length;
    const totalParcelas = recvs.filter(r => r.status !== 'received').length;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DM Pay';

    // ══════════════════════════════════════════════════════════════════════
    // ABA 1 — RESUMO POR CLIENTE
    // ══════════════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('Resumo por Cliente', { properties: { defaultColWidth: 20 } });
    const NC1 = 6;
    ws1.columns = [
      { width: 40 }, // Cliente
      { width: 18 }, // CPF/CNPJ
      { width: 12 }, // Parcelas
      { width: 20 }, // Total em Aberto
      { width: 16 }, // Mais Antiga
      { width: 16 }, // Dias em Atraso
    ];

    addHeader(ws1, 'Contas a Receber — Resumo por Cliente', NC1);

    // KPIs
    const k1 = ws1.addRow([
      `Total em aberto: ${fmt(totalGeral)}`,
      '', `${totalClients} clientes`,
      '', `${totalParcelas} parcelas`,
      ''
    ]);
    k1.height = 24;
    [[1,2,VERM_BG,VERMELHO],[3,4,AMARELO_BG,AMARELO_FG],[5,6,AZUL_CLARO,AZUL]].forEach(([a,b,bg,fg]) => {
      [a,b].forEach(ci => {
        k1.getCell(ci).fill      = { type:'pattern', pattern:'solid', fgColor:{argb:bg} };
        k1.getCell(ci).font      = { name:'Arial', size:10, bold:true, color:{argb:fg} };
        k1.getCell(ci).alignment = { horizontal:'center', vertical:'middle' };
      });
    });
    ws1.addRow([]);

    const h1 = ws1.addRow(['CLIENTE','CPF / CNPJ','PARCELAS','TOTAL EM ABERTO','MAIS ANTIGA','DIAS ATRASO']);
    h1.height = 24;
    h1.eachCell(c => {
      c.font      = { name:'Arial', size:9, bold:true, color:{argb:BRANCO} };
      c.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:AZUL_ESCURO} };
      c.alignment = { horizontal:'center', vertical:'middle' };
      c.border    = brd();
    });
    ws1.autoFilter = { from:{row:h1.number,column:1}, to:{row:h1.number,column:NC1} };

    clientes.forEach((cl, i) => {
      if (cl.totalAberto <= 0) return;
      const abertas = cl.parcelas.filter(r => r.status !== 'received');
      const maisAntiga = abertas.map(r => r.due_date).sort()[0];
      const maxDias = Math.max(...abertas.map(r => diasAtraso(r.due_date)));
      const band = i % 2 === 0 ? CINZA_CLR : BRANCO;

      const row = ws1.addRow([
        cl.nome,
        cl.cpf || '—',
        abertas.length,
        Number(cl.totalAberto),
        brDate(maisAntiga),
        maxDias || '—'
      ]);
      row.height = 20;
      row.getCell(1).font      = { name:'Arial', size:10, bold:true };
      row.getCell(2).font      = { name:'Arial', size:9, color:{argb:MUTED} };
      row.getCell(2).alignment = { horizontal:'center', vertical:'middle' };
      row.getCell(3).alignment = { horizontal:'center', vertical:'middle' };
      row.getCell(3).font      = { name:'Arial', size:9 };
      row.getCell(4).numFmt    = '#,##0.00';
      row.getCell(4).font      = { name:'Arial', size:10, bold:true, color:{argb: maxDias > 90 ? VERMELHO : maxDias > 30 ? AMARELO_FG : TEXTO} };
      row.getCell(4).alignment = { horizontal:'right', vertical:'middle' };
      row.getCell(5).alignment = { horizontal:'center', vertical:'middle' };
      row.getCell(5).font      = { name:'Arial', size:9, color:{argb:MUTED} };
      row.getCell(6).alignment = { horizontal:'center', vertical:'middle' };
      row.getCell(6).font      = { name:'Arial', size:9, bold: maxDias > 30,
        color:{argb: maxDias > 90 ? VERMELHO : maxDias > 30 ? AMARELO_FG : MUTED} };

      [1,2,3,5,6].forEach(ci =>
        row.getCell(ci).fill = { type:'pattern', pattern:'solid', fgColor:{argb:band} }
      );
      row.getCell(4).fill = { type:'pattern', pattern:'solid', fgColor:{argb:
        maxDias > 90 ? VERM_BG : maxDias > 30 ? AMARELO_BG : band} };
      row.eachCell(c => { c.border = brd(); });
    });

    // Total
    ws1.addRow([]);
    const t1 = ws1.addRow(['TOTAL EM ABERTO', '', '', totalGeral, '', '']);
    t1.height = 26;
    t1.getCell(1).font = { name:'Arial', size:11, bold:true, color:{argb:BRANCO} };
    t1.getCell(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:AZUL} };
    t1.getCell(4).numFmt = '#,##0.00';
    t1.getCell(4).font   = { name:'Arial', size:11, bold:true, color:{argb:BRANCO} };
    t1.getCell(4).fill   = { type:'pattern', pattern:'solid', fgColor:{argb:AZUL_ESCURO} };
    t1.getCell(4).alignment = { horizontal:'right', vertical:'middle' };
    [2,3,5,6].forEach(ci => {
      t1.getCell(ci).fill   = { type:'pattern', pattern:'solid', fgColor:{argb:AZUL} };
    });
    t1.eachCell(c => { c.border = brd(); });

    ws1.pageSetup = { orientation:'landscape', fitToPage:true, fitToWidth:1, paperSize:9 };

    // ══════════════════════════════════════════════════════════════════════
    // ABA 2 — HISTÓRICO COMPLETO
    // ══════════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('Histórico Completo', { properties: { defaultColWidth: 18 } });
    const NC2 = 7;
    ws2.columns = [
      { width: 40 }, // Cliente
      { width: 18 }, // CPF/CNPJ
      { width: 14 }, // Vencimento
      { width: 34 }, // Descrição
      { width: 18 }, // Valor
      { width: 14 }, // Status
      { width: 14 }, // Dias Atraso
    ];

    addHeader(ws2, 'Contas a Receber — Histórico Completo', NC2);
    ws2.addRow([]);

    const h2 = ws2.addRow(['CLIENTE','CPF / CNPJ','VENCIMENTO','DESCRIÇÃO','VALOR (R$)','STATUS','DIAS ATRASO']);
    h2.height = 24;
    h2.eachCell(c => {
      c.font      = { name:'Arial', size:9, bold:true, color:{argb:BRANCO} };
      c.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:AZUL_ESCURO} };
      c.alignment = { horizontal:'center', vertical:'middle' };
      c.border    = brd();
    });
    ws2.autoFilter = { from:{row:h2.number,column:1}, to:{row:h2.number,column:NC2} };

    // Ordenado por cliente ASC, due_date ASC
    const sorted = [...recvs].sort((a, b) => {
      const na = (a.customers?.name || a.description || '').toLowerCase();
      const nb = (b.customers?.name || b.description || '').toLowerCase();
      if (na < nb) return -1; if (na > nb) return 1;
      return (a.due_date || '').localeCompare(b.due_date || '');
    });

    let lastClient = null, colorToggle = false;
    sorted.forEach(r => {
      const nome = r.customers?.name || r.description || 'Sem cliente';
      const cpf  = r.customers?.cpf_cnpj || '—';
      if (nome !== lastClient) { colorToggle = !colorToggle; lastClient = nome; }
      const band = colorToggle ? CINZA_CLR : BRANCO;

      let stLabel = 'A receber', stBg = AMARELO_BG, stFg = AMARELO_FG;
      if (r.status === 'received')      { stLabel = 'Recebido'; stBg = VERDE_BG; stFg = VERDE; }
      else if (r.status === 'overdue')  { stLabel = 'Vencido';  stBg = VERM_BG;  stFg = VERMELHO; }

      const dias = diasAtraso(r.due_date);

      const row = ws2.addRow([
        nome,
        cpf,
        brDate(r.due_date),
        r.description || '—',
        Number(r.amount || 0),
        stLabel,
        r.status === 'received' ? '—' : (dias > 0 ? dias : '—')
      ]);
      row.height = 19;
      row.getCell(1).font      = { name:'Arial', size:9, bold: nome !== (sorted[sorted.indexOf(r)-1]?.customers?.name) };
      row.getCell(2).font      = { name:'Arial', size:8, color:{argb:MUTED} };
      row.getCell(2).alignment = { horizontal:'center', vertical:'middle' };
      row.getCell(3).alignment = { horizontal:'center', vertical:'middle' };
      row.getCell(3).font      = { name:'Arial', size:9 };
      row.getCell(4).font      = { name:'Arial', size:9, color:{argb:MUTED} };
      row.getCell(5).numFmt    = '#,##0.00';
      row.getCell(5).font      = { name:'Arial', size:10, bold:true };
      row.getCell(5).alignment = { horizontal:'right', vertical:'middle' };
      row.getCell(6).font      = { name:'Arial', size:9, bold:true, color:{argb:stFg} };
      row.getCell(6).fill      = { type:'pattern', pattern:'solid', fgColor:{argb:stBg} };
      row.getCell(6).alignment = { horizontal:'center', vertical:'middle' };
      row.getCell(7).alignment = { horizontal:'center', vertical:'middle' };
      row.getCell(7).font      = { name:'Arial', size:9, color:{argb: dias > 90 ? VERMELHO : dias > 30 ? AMARELO_FG : MUTED} };

      [1,2,3,4,5,7].forEach(ci =>
        row.getCell(ci).fill = { type:'pattern', pattern:'solid', fgColor:{argb:band} }
      );
      row.eachCell(c => { c.border = brd(); });
    });

    ws2.pageSetup = { orientation:'landscape', fitToPage:true, fitToWidth:1, paperSize:9 };
    ws2.headerFooter = { oddFooter:`${nomeEmpresa()} — Contas a Receber — Página &P de &N` };

    const iso = new Date().toISOString().slice(0,10);
    await salvar(wb, `DM_Pay_Contas_a_Receber_${iso}.xlsx`);
    toast('Planilha exportada!');
  }

  return { contasPagar, despesas, fornecedores, vendasDiarias, contasReceber };
})();
