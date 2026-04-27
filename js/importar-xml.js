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
  function fmtCNPJ(c) {
    if (!c) return '—';
    c = c.replace(/\D/g,'');
    if (c.length !== 14) return c;
    return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  function fmtCPF(c) {
    if (!c) return '—';
    c = c.replace(/\D/g,'');
    if (c.length !== 11) return c;
    return c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
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

    // Fornecedor (PJ = CNPJ, PF = CPF em Nota Fiscal Avulsa)
    const cnpjEmit = getText(emit, 'CNPJ');
    const cpfEmit  = getText(emit, 'CPF');
    if (!cnpjEmit && !cpfEmit) throw new Error('Documento do fornecedor (CNPJ/CPF) não encontrado no XML');
    const fornecedor = {
      cnpj: cnpjEmit || null,
      cpf:  cpfEmit  || null,
      tipo_pessoa: cnpjEmit ? 'PJ' : 'PF',
      legal_name: getText(emit, 'xNome'),
      trade_name: getText(emit, 'xFant'),
      ie: getText(emit, 'IE'),
      city: getText(enderEmit, 'xMun'),
      state: getText(enderEmit, 'UF'),
      phone: getText(enderEmit, 'fone'),
    };

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

  const NATUREZAS_SEM_CP = ['BONIF', 'REM', 'BRINDE', 'DOACAO', 'DOAÇÃO', 'REMESSA', 'BONIFICACAO', 'BONIFICAÇÃO'];
  function naturezaSemCP(nature) {
    if (!nature) return false;
    const up = nature.toUpperCase();
    return NATUREZAS_SEM_CP.some(n => up.includes(n));
  }

  function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function renderPreview(p) {
    const el = document.getElementById('preview-area');
    if (!el) return;
    const semCP = naturezaSemCP(p.nature);
    const semDup = p.parcelas.length === 0;
    let parcRows;
    if (semCP) {
      parcRows = `<tr><td colspan="3" style="text-align:center;color:var(--warning);font-weight:600;padding:12px">Natureza "${p.nature}" — sem boleto gerado</td></tr>`;
    } else if (semDup) {
      parcRows = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);font-style:italic;padding:12px">Parcelas a definir — você informará ao salvar</td></tr>`;
    } else {
      parcRows = p.parcelas.map(par => `<tr>
        <td>${par.nDup}</td>
        <td>${brDate(par.dVenc)}</td>
        <td class="num">${fmtBRL(par.vDup)}</td>
      </tr>`).join('');
    }
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
            <div class="prev-sub">${p.fornecedor.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ'} ${p.fornecedor.tipo_pessoa === 'PF' ? fmtCPF(p.fornecedor.cpf) : fmtCNPJ(p.fornecedor.cnpj)} ${p.fornecedor.city ? '· '+p.fornecedor.city+'/'+p.fornecedor.state : ''}</div>
          </div>
          <div style="text-align:right">
            <div class="prev-value">${fmtBRL(p.total_value)}</div>
            <div class="prev-sub">NF ${p.number} · série ${p.series} · ${brDate(p.issue_date)}</div>
          </div>
        </div>
        <div class="prev-section">
          <h4>${naturezaSemCP(p.nature) ? 'Parcelas (sem CP)' : p.parcelas.length === 0 ? 'Parcelas (a definir)' : 'Parcelas (' + p.parcelas.length + ')'}</h4>
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
    const btn = document.getElementById('btn-save-nfe');
    const original = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Salvando...';

    try {
      // 1. Upsert fornecedor (PJ por CNPJ, PF por nome pois cnpj é null)
      let supplier_id;
      if (PARSED.fornecedor.tipo_pessoa === 'PJ') {
        const cnpjLimpo = PARSED.fornecedor.cnpj.replace(/\D/g,'');
        const supRes = await sb.from('suppliers').upsert({
          company_id: COMPANY_ID,
          cnpj: cnpjLimpo,
          tipo_pessoa: 'PJ',
          legal_name: PARSED.fornecedor.legal_name,
          trade_name: PARSED.fornecedor.trade_name || null,
          city: PARSED.fornecedor.city || null,
          state: PARSED.fornecedor.state || null,
          phone: PARSED.fornecedor.phone || null
        }, { onConflict: 'company_id,cnpj' }).select().single();
        if (supRes.error) throw supRes.error;
        supplier_id = supRes.data.id;
      } else {
        // PF: busca por nome (cnpj é null, não dá pra usar onConflict)
        const { data: existing } = await sb.from('suppliers')
          .select('id')
          .eq('company_id', COMPANY_ID)
          .eq('legal_name', PARSED.fornecedor.legal_name)
          .eq('tipo_pessoa', 'PF')
          .maybeSingle();
        if (existing) {
          supplier_id = existing.id;
        } else {
          const supRes = await sb.from('suppliers').insert({
            company_id: COMPANY_ID,
            cnpj: null,
            tipo_pessoa: 'PF',
            legal_name: PARSED.fornecedor.legal_name,
            trade_name: PARSED.fornecedor.trade_name || null,
            city: PARSED.fornecedor.city || null,
            state: PARSED.fornecedor.state || null,
            phone: PARSED.fornecedor.phone || null,
            observacao: 'Importado via NF-e (CPF)'
          }).select().single();
          if (supRes.error) throw supRes.error;
          supplier_id = supRes.data.id;
        }
      }

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
        xml_raw: (() => { const s = JSON.stringify(PARSED); return s.length > 500_000 ? { _truncated: true, nfeKey: PARSED.nfeKey, total: PARSED.total_value } : PARSED; })(),
        status: PARSED.parcelas.length > 0 ? 'linked' : 'awaiting_boleto'
      }).select().single();
      if (invRes.error) {
        if (invRes.error.code === '23505') {
          if (window.DMPAY_UI) {
            const ir = await window.DMPAY_UI.confirm({ title: 'NF-e já importada', desc: 'Esta NF-e já está no Histórico NF-e. Consulte lá para ver parcelas e status.', okLabel: 'Ver Histórico', cancelLabel: 'Fechar' });
            if (ir) window.location.href = 'historico-nfe.html';
          } else {
            alert('Esta NF-e já está no Histórico NF-e.');
          }
          btn.disabled = false; btn.innerHTML = original;
          return;
        }
        throw invRes.error;
      }
      const invoice_id = invRes.data.id;

      // 3. Insert payables (1 por parcela)
      // Naturezas BONIF/REM/BRINDE/DOACAO → não gera CP, só salva invoice
      if (naturezaSemCP(PARSED.nature)) {
        if (window.DMPAY_UI) {
          await window.DMPAY_UI.open({
            title: 'NF-e sem cobrança',
            desc: `Natureza "${PARSED.nature}" (bonificação/remessa/brinde/doação) — invoice salva no Histórico, mas nenhuma conta a pagar foi gerada.`,
            fields: [],
            submitLabel: 'Ok',
            cancelLabel: null
          });
        }
        btn.innerHTML = '<i data-lucide="check-circle-2"></i> Salvo!';
        lucide.createIcons();
        setTimeout(() => {
          cancel();
          const el = document.getElementById('preview-area');
          el.innerHTML = `<div class="prev-card" style="text-align:center;padding:32px 24px">
            <div style="width:48px;height:48px;border-radius:50%;background:var(--bg-soft);color:var(--text-muted);margin:0 auto 12px;display:grid;place-items:center"><i data-lucide="info"></i></div>
            <h3 style="margin:0 0 4px">NF-e salva</h3>
            <p style="margin:0 0 16px;color:var(--text-muted);font-size:13px">Natureza "${PARSED.nature}" — sem conta a pagar gerada</p>
            <a href="historico-nfe.html" class="btn btn-ghost" style="text-decoration:none"><i data-lucide="file-text"></i> Ver no Histórico NF-e</a>
          </div>`;
          el.style.display = 'block';
          document.getElementById('dropzone').style.display = 'none';
          lucide.createIcons();
        }, 800);
        return;
      }

      // Sem <dup> no XML → perguntar qtd + 1º vencimento + intervalo
      let parcelas;
      if (PARSED.parcelas.length > 0) {
        parcelas = PARSED.parcelas;
      } else {
        // Modal para definir parcelas manualmente
        const parcelaVals = await window.DMPAY_UI.open({
          title: 'Definir parcelas',
          desc: `XML sem dados de cobrança (sem <dup>). Informe como parcelar ${fmtBRL(PARSED.total_value)}.`,
          fields: [
            {
              key: 'qtd',
              label: 'Quantidade de parcelas *',
              type: 'number',
              placeholder: '1',
              value: '1',
              hint: 'Ex: 1, 2, 3...'
            },
            {
              key: 'primeiro_venc',
              label: '1º Vencimento *',
              type: 'date',
              value: PARSED.issue_date,
              hint: 'Data do primeiro boleto'
            },
            {
              key: 'intervalo',
              label: 'Intervalo entre parcelas (dias)',
              type: 'number',
              placeholder: '30',
              value: '30',
              hint: 'Para parcela única, ignore.'
            }
          ],
          submitLabel: 'Confirmar',
          cancelLabel: 'Cancelar',
          onSubmit: (v) => {
            const q = parseInt(v.qtd, 10);
            if (!q || q < 1 || q > 60) throw new Error('Quantidade inválida (1–60).');
            if (!v.primeiro_venc) throw new Error('Informe o 1º vencimento.');
            return true;
          }
        });

        if (!parcelaVals) {
          btn.disabled = false;
          btn.innerHTML = original;
          return;
        }

        const qtd = parseInt(parcelaVals.qtd, 10) || 1;
        const primeiroVenc = parcelaVals.primeiro_venc;
        const intervalo = parseInt(parcelaVals.intervalo, 10) || 30;
        const valorParcela = Math.round((PARSED.total_value / qtd) * 100) / 100;
        // Última parcela absorve diferença de centavos
        let acumulado = 0;
        parcelas = Array.from({ length: qtd }, (_, i) => {
          const valor = i === qtd - 1 ? Math.round((PARSED.total_value - acumulado) * 100) / 100 : valorParcela;
          acumulado += valorParcela;
          return {
            nDup: String(i + 1).padStart(3, '0'),
            dVenc: addDays(primeiroVenc, i * intervalo),
            vDup: valor
          };
        });
      }

      let boletosColados = {}; // { parcelaIdx: 'linha digitável' }
      let formaPagamento = null; // 'boleto' | 'dinheiro' | 'pix' | 'outro'

      if (window.DMPAY_UI) {
        // Passo 1: escolher forma de pagamento
        const pmVals = await window.DMPAY_UI.open({
          title: 'Forma de pagamento',
          desc: `${parcelas.length === 1 ? '1 parcela' : parcelas.length + ' parcelas'} · ${fmtBRL(PARSED.total_value)}. Como será pago?`,
          fields: [{
            key: 'method',
            label: 'Forma de pagamento *',
            options: [
              { value: 'boleto',   label: 'Boleto' },
              { value: 'dinheiro', label: 'À vista / Dinheiro' },
              { value: 'pix',      label: 'PIX' },
              { value: 'outro',    label: 'Outro' }
            ],
            value: 'boleto'
          }],
          submitLabel: 'Continuar',
          cancelLabel: 'Cancelar'
        });

        if (!pmVals) {
          btn.disabled = false;
          btn.innerHTML = original;
          return;
        }
        formaPagamento = pmVals.method || 'boleto';

        // Passo 2: se boleto, coletar código(s) de barras diretamente
        if (formaPagamento === 'boleto') {
          const fields = parcelas.map((par, i) => ({
            key: 'p' + i,
            label: parcelas.length > 1
              ? `Parcela ${par.nDup} · venc ${brDate(par.dVenc)} · ${fmtBRL(par.vDup)}`
              : `Linha digitável · venc ${brDate(par.dVenc)} · ${fmtBRL(par.vDup)}`,
            multiline: true,
            placeholder: '23793.38128 00000.000000 00000.000000 1 99990000000000',
            hint: 'Aceita 44 dígitos (código de barras) ou 47 dígitos (linha digitável). Deixe em branco se o boleto ainda não chegou.'
          }));
          fields.push({
            key: 'obs',
            label: 'Observação (opcional)',
            placeholder: 'Ex: boleto chega até dia 30, pagamento parcelado no cartão...',
            hint: ''
          });

          const vals = await window.DMPAY_UI.open({
            title: parcelas.length > 1 ? 'Códigos de barras' : 'Código de barras',
            desc: 'Cole o código do boleto. Deixe em branco se ainda não chegou — fica pendente no Calendário.',
            fields,
            submitLabel: 'Salvar',
            cancelLabel: 'Pular',
            onSubmit: (v) => {
              for (let i = 0; i < parcelas.length; i++) {
                const raw = (v['p' + i] || '').replace(/\D/g, '');
                if (raw && ![44, 47, 48].includes(raw.length)) {
                  throw new Error(`Parcela ${parcelas[i].nDup}: código com ${raw.length} dígitos (precisa ter 44, 47 ou 48). Limpe ou corrija.`);
                }
              }
              return true;
            }
          });

          if (vals) {
            Object.keys(vals).forEach(k => {
              if (k === 'obs') return;
              const raw = (vals[k] || '').replace(/\D/g, '');
              if (raw && [44, 47, 48].includes(raw.length)) {
                boletosColados[parseInt(k.slice(1), 10)] = raw;
              }
            });
            if (vals.obs && vals.obs.trim()) {
              window._nfeObs = vals.obs.trim();
            }
          }
        }
      }

      const nfeObs = window._nfeObs || null;
      window._nfeObs = null;
      const payables = parcelas.map((par, idx) => {
        const codigo = formaPagamento === 'boleto' ? (boletosColados[idx] || null) : null;
        const pm = formaPagamento || null;
        return {
          company_id: COMPANY_ID,
          invoice_id: invoice_id,
          supplier_id: supplier_id,
          description: `NF ${PARSED.number} ${PARSED.fornecedor.legal_name} ${parcelas.length > 1 ? '· parc '+par.nDup : ''}`.trim(),
          amount: par.vDup,
          due_date: par.dVenc,
          payment_method: pm,
          boleto_line: codigo,
          notes: nfeObs,
          tipo_lancamento: 'compra',
          status: 'open'
        };
      });
      const payRes = await sb.from('payables').insert(payables).select('id');
      if (payRes.error) {
        // Rollback manual: se falhou, apaga a invoice criada pra não deixar órfã
        // (senão o próximo upload da mesma NF bate no unique nfe_key e trava o usuário)
        try { await sb.from('invoices').delete().eq('id', invoice_id); } catch(_) {}
        throw payRes.error;
      }
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

  async function handleFile(file) {
    if (!file) return;

    // Cofre de arquivos (pilar #3 Gemini): valida magic number + tamanho + rename UUID
    if (!window.DMPAY_UPLOAD) {
      alert('Sistema de upload seguro ainda carregando. Aguarde 1s e tente de novo.');
      return;
    }
    const san = await window.DMPAY_UPLOAD.sanitize(file, { types: ['xml'], maxMb: 10 });
    if (!san.ok) {
      alert('Upload bloqueado: ' + san.error);
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        PARSED = parseNFe(e.target.result);
        if (PARSED) {
          PARSED._upload = { safeName: san.safeName, originalName: san.original.name, size: san.original.size };
        }
        renderPreview(PARSED);
      } catch (err) {
        alert('Erro ao ler XML: ' + err.message);
      }
    };
    reader.readAsText(san.file, 'utf-8');
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
