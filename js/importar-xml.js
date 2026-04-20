// DM Pay — Importar NF-e (XML) → Supabase
// Parser SEFAZ + criação automática de supplier + invoice + payables (parcelas)

(function() {
  let PARSED = null;

  function getText(parent, tag) {
    if (!parent) return null;
    const el = parent.getElementsByTagName(tag)[0];
    return el ? el.textContent.trim() : null;
  }
  function getNumber(parent, tag) {
    const v = getText(parent, tag);
    return v ? parseFloat(v) : 0;
  }
  function fmtBRL(v) { return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function brDate(iso) { if(!iso) return '—'; const [y,m,d]=iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; }
  function fmtCNPJ(c) {
    if (!c) return '—';
    c = c.replace(/\D/g,'');
    if (c.length !== 14) return c;
    return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function parseNFe(xmlString) {
    const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error('XML inválido (não é uma NF-e)');

    const infNFe = doc.getElementsByTagName('infNFe')[0];
    if (!infNFe) throw new Error('Não é um XML de NF-e (tag <infNFe> não encontrada)');

    const nfeKey = (infNFe.getAttribute('Id') || '').replace(/^NFe/, '');
    const ide = infNFe.getElementsByTagName('ide')[0];
    const emit = infNFe.getElementsByTagName('emit')[0];
    const enderEmit = emit ? emit.getElementsByTagName('enderEmit')[0] : null;
    const total = infNFe.getElementsByTagName('total')[0];
    const icmsTot = total ? total.getElementsByTagName('ICMSTot')[0] : null;
    const cobr = infNFe.getElementsByTagName('cobr')[0];

    // Fornecedor
    const fornecedor = {
      cnpj: getText(emit, 'CNPJ'),
      legal_name: getText(emit, 'xNome'),
      trade_name: getText(emit, 'xFant'),
      ie: getText(emit, 'IE'),
      city: getText(enderEmit, 'xMun'),
      state: getText(enderEmit, 'UF'),
      phone: getText(enderEmit, 'fone'),
    };
    if (!fornecedor.cnpj) throw new Error('CNPJ do fornecedor não encontrado no XML');

    // Itens
    const itens = Array.from(infNFe.getElementsByTagName('det')).map(det => {
      const prod = det.getElementsByTagName('prod')[0];
      return {
        code: getText(prod, 'cProd'),
        description: getText(prod, 'xProd'),
        ncm: getText(prod, 'NCM'),
        unit: getText(prod, 'uCom'),
        quantity: getNumber(prod, 'qCom'),
        unit_price: getNumber(prod, 'vUnCom'),
        total: getNumber(prod, 'vProd')
      };
    });

    // Parcelas
    const parcelas = Array.from(cobr ? cobr.getElementsByTagName('dup') : []).map(d => ({
      nDup: getText(d, 'nDup'),
      dVenc: getText(d, 'dVenc'),
      vDup: getNumber(d, 'vDup')
    }));

    return {
      nfeKey,
      number: getText(ide, 'nNF'),
      series: getText(ide, 'serie') || '1',
      issue_date: (getText(ide, 'dhEmi') || getText(ide, 'dEmi') || '').slice(0,10),
      nature: getText(ide, 'natOp') || 'Compra para revenda',
      total_value: icmsTot ? getNumber(icmsTot, 'vNF') : 0,
      total_products: icmsTot ? getNumber(icmsTot, 'vProd') : 0,
      total_freight: icmsTot ? getNumber(icmsTot, 'vFrete') : 0,
      total_discount: icmsTot ? getNumber(icmsTot, 'vDesc') : 0,
      icms: icmsTot ? getNumber(icmsTot, 'vICMS') : 0,
      ipi: icmsTot ? getNumber(icmsTot, 'vIPI') : 0,
      pis: icmsTot ? getNumber(icmsTot, 'vPIS') : 0,
      cofins: icmsTot ? getNumber(icmsTot, 'vCOFINS') : 0,
      fornecedor,
      itens,
      parcelas
    };
  }

  function renderPreview(p) {
    const el = document.getElementById('preview-area');
    if (!el) return;
    const parcRows = (p.parcelas.length > 0 ? p.parcelas : [{nDup:'001', dVenc:p.issue_date, vDup:p.total_value}])
      .map(par => `<tr>
        <td>${par.nDup}</td>
        <td>${brDate(par.dVenc)}</td>
        <td class="num">${fmtBRL(par.vDup)}</td>
      </tr>`).join('');
    const itensRows = p.itens.slice(0,10).map(i => `<tr>
      <td><b>${i.description||'—'}</b><div class="tiny" style="color:var(--text-soft)">${i.code||''} · NCM ${i.ncm||'—'}</div></td>
      <td class="num">${i.quantity}</td>
      <td class="num">${fmtBRL(i.unit_price)}</td>
      <td class="num">${fmtBRL(i.total)}</td>
    </tr>`).join('');
    const moreItens = p.itens.length > 10 ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-size:12px;padding:10px">+ ${p.itens.length - 10} itens</td></tr>` : '';

    el.innerHTML = `
      <div class="prev-card">
        <div class="prev-head">
          <div>
            <div class="prev-title">${p.fornecedor.legal_name || '—'}</div>
            <div class="prev-sub">CNPJ ${fmtCNPJ(p.fornecedor.cnpj)} ${p.fornecedor.city ? '· '+p.fornecedor.city+'/'+p.fornecedor.state : ''}</div>
          </div>
          <div style="text-align:right">
            <div class="prev-value">${fmtBRL(p.total_value)}</div>
            <div class="prev-sub">NF ${p.number} · série ${p.series} · ${brDate(p.issue_date)}</div>
          </div>
        </div>
        <div class="prev-section">
          <h4>Parcelas (${p.parcelas.length || 1})</h4>
          <table class="prev-table">
            <thead><tr><th>#</th><th>Vencimento</th><th class="num">Valor</th></tr></thead>
            <tbody>${parcRows}</tbody>
          </table>
        </div>
        <div class="prev-section">
          <h4>Itens (${p.itens.length})</h4>
          <table class="prev-table">
            <thead><tr><th>Descrição</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Total</th></tr></thead>
            <tbody>${itensRows}${moreItens}</tbody>
          </table>
        </div>
        <div class="prev-section" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
          <div class="prev-pill">ICMS: <b>${fmtBRL(p.icms)}</b></div>
          <div class="prev-pill">PIS: <b>${fmtBRL(p.pis)}</b></div>
          <div class="prev-pill">COFINS: <b>${fmtBRL(p.cofins)}</b></div>
          <div class="prev-pill">Frete: <b>${fmtBRL(p.total_freight)}</b></div>
        </div>
        <div class="prev-foot">
          <button class="btn btn-ghost" onclick="DMPAY_XML.cancel()">Cancelar</button>
          <button class="btn btn-primary" id="btn-save-nfe" onclick="DMPAY_XML.save()"><i data-lucide="check"></i> Salvar no banco</button>
        </div>
      </div>`;
    el.style.display = 'block';
    document.getElementById('dropzone').style.display = 'none';
    lucide.createIcons();
  }

  function cancel() {
    document.getElementById('preview-area').style.display = 'none';
    document.getElementById('preview-area').innerHTML = '';
    document.getElementById('dropzone').style.display = 'block';
    PARSED = null;
  }

  async function save() {
    if (!PARSED) return;
    const COMPANY_ID = window.DMPAY_COMPANY.id;
    const btn = document.getElementById('btn-save-nfe'); btn.disabled = true; btn.textContent = 'Salvando...';

    try {
      // 1. Upsert fornecedor por CNPJ
      const cnpjLimpo = PARSED.fornecedor.cnpj.replace(/\D/g,'');
      const supRes = await sb.from('suppliers').upsert({
        company_id: COMPANY_ID,
        cnpj: cnpjLimpo,
        legal_name: PARSED.fornecedor.legal_name,
        trade_name: PARSED.fornecedor.trade_name || null,
        city: PARSED.fornecedor.city || null,
        state: PARSED.fornecedor.state || null,
        phone: PARSED.fornecedor.phone || null
      }, { onConflict: 'company_id,cnpj' }).select().single();
      if (supRes.error) throw supRes.error;
      const supplier_id = supRes.data.id;

      // 2. Insert invoice (anti-dup por nfe_key)
      const invRes = await sb.from('invoices').insert({
        company_id: COMPANY_ID,
        supplier_id: supplier_id,
        nf_number: PARSED.number,
        series: PARSED.series,
        issue_date: PARSED.issue_date,
        nature: PARSED.nature,
        total: PARSED.total_value,
        total_products: PARSED.total_products,
        total_discount: PARSED.total_discount,
        total_freight: PARSED.total_freight,
        nfe_key: PARSED.nfeKey,
        xml_raw: PARSED,
        status: PARSED.parcelas.length > 0 ? 'linked' : 'awaiting_boleto'
      }).select().single();
      if (invRes.error) {
        if (invRes.error.code === '23505') throw new Error('Essa NF-e já foi importada antes (chave duplicada)');
        throw invRes.error;
      }
      const invoice_id = invRes.data.id;

      // 3. Insert payables (1 por parcela)
      const parcelas = PARSED.parcelas.length > 0 ? PARSED.parcelas : [{nDup:'001', dVenc:PARSED.issue_date, vDup:PARSED.total_value}];
      const payables = parcelas.map(par => ({
        company_id: COMPANY_ID,
        invoice_id: invoice_id,
        supplier_id: supplier_id,
        description: `NF ${PARSED.number} ${PARSED.fornecedor.legal_name} ${parcelas.length > 1 ? '· parc '+par.nDup : ''}`.trim(),
        amount: par.vDup,
        due_date: par.dVenc,
        payment_method: 'boleto',
        status: 'open'
      }));
      const payRes = await sb.from('payables').insert(payables).select('id');
      if (payRes.error) throw payRes.error;
      if (window.DMPAY_AUDIT) {
        window.DMPAY_AUDIT.import('invoice', invoice_id, {
          nfe_key: PARSED.nfeKey,
          supplier_id,
          total: PARSED.total_value,
          parcelas: parcelas.length
        });
      }

      btn.innerHTML = '<i data-lucide="check-circle-2"></i> Salvo!';
      lucide.createIcons();
      setTimeout(() => {
        cancel();
        // Mostra link pra Contas a Pagar
        const el = document.getElementById('preview-area');
        el.innerHTML = `
          <div class="prev-card" style="text-align:center;padding:32px 24px">
            <div style="width:48px;height:48px;border-radius:50%;background:var(--success-soft);color:var(--success);margin:0 auto 12px;display:grid;place-items:center"><i data-lucide="check"></i></div>
            <h3 style="margin:0 0 4px">NF-e importada!</h3>
            <p style="margin:0 0 16px;color:var(--text-muted);font-size:13px">${parcelas.length} parcela${parcelas.length>1?'s':''} criada${parcelas.length>1?'s':''} em Contas a pagar</p>
            <a href="contas-a-pagar.html" class="btn btn-primary" style="text-decoration:none"><i data-lucide="receipt"></i> Ver em Contas a pagar</a>
            <a href="importar-xml.html" class="btn btn-ghost" style="text-decoration:none;margin-left:8px"><i data-lucide="upload-cloud"></i> Importar outra</a>
          </div>`;
        el.style.display = 'block';
        document.getElementById('dropzone').style.display = 'none';
        lucide.createIcons();
      }, 800);
    } catch (err) {
      alert('Erro: ' + err.message);
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="check"></i> Tentar novamente';
      lucide.createIcons();
    }
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xml')) {
      alert('Por favor selecione um arquivo .xml');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        PARSED = parseNFe(e.target.result);
        renderPreview(PARSED);
      } catch (err) {
        alert('Erro ao ler XML: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function init() {
    if (!window.sb) { setTimeout(init, 100); return; }

    // CSS do preview
    if (!document.getElementById('xml-prev-css')) {
      const s = document.createElement('style');
      s.id = 'xml-prev-css';
      s.textContent = `
        #preview-area{display:none;margin-top:18px}
        .prev-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
        .prev-head{padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--bg-soft);flex-wrap:wrap;gap:12px}
        .prev-title{font-size:16px;font-weight:600;letter-spacing:-.01em;color:var(--text)}
        .prev-sub{font-size:12px;color:var(--text-muted);font-family:'Geist Mono',monospace}
        .prev-value{font-size:24px;font-weight:700;letter-spacing:-.02em;color:var(--text);font-family:'Geist',sans-serif}
        .prev-section{padding:14px 22px;border-bottom:1px solid var(--border)}
        .prev-section h4{margin:0 0 10px;font-size:11px;font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em}
        .prev-table{width:100%;border-collapse:collapse;font-size:12.5px}
        .prev-table th{font-size:10px;font-weight:600;color:var(--text-soft);text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:6px 10px;background:var(--bg-soft);border-bottom:1px solid var(--border)}
        .prev-table th.num{text-align:right}
        .prev-table td{padding:8px 10px;border-bottom:1px solid var(--border)}
        .prev-table td.num{text-align:right;font-family:'Geist Mono',monospace;font-weight:600}
        .prev-table tr:last-child td{border-bottom:none}
        .prev-pill{padding:9px 12px;background:var(--bg-soft);border:1px solid var(--border);border-radius:7px;font-size:12px;color:var(--text-muted)}
        .prev-pill b{color:var(--text);font-weight:600;font-family:'Geist Mono',monospace}
        .prev-foot{padding:14px 22px;display:flex;justify-content:flex-end;gap:10px;background:var(--bg-soft)}
      `;
      document.head.appendChild(s);
    }

    // Preview area (cria se não existe)
    if (!document.getElementById('preview-area')) {
      const main = document.querySelector('main');
      const div = document.createElement('div');
      div.id = 'preview-area';
      main.appendChild(div);
    }

    // Wire dropzone
    const dz = document.getElementById('dropzone');
    if (!dz) return;
    let input = dz.querySelector('input[type=file]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xml,application/xml,text/xml';
      input.style.display = 'none';
      dz.appendChild(input);
    } else {
      input.accept = '.xml,application/xml,text/xml';
    }

    // Remove handlers antigos
    const dz2 = dz.cloneNode(true);
    dz.parentNode.replaceChild(dz2, dz);
    const newInput = dz2.querySelector('input[type=file]');

    dz2.addEventListener('click', () => newInput.click());
    newInput.addEventListener('change', e => handleFile(e.target.files[0]));
    dz2.addEventListener('dragover', e => { e.preventDefault(); dz2.classList.add('drag'); });
    dz2.addEventListener('dragleave', () => dz2.classList.remove('drag'));
    dz2.addEventListener('drop', e => {
      e.preventDefault(); dz2.classList.remove('drag');
      handleFile(e.dataTransfer.files[0]);
    });
  }

  window.DMPAY_XML = { cancel: cancel, save: save };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
