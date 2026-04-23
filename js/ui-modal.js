// DM Pay — Modal/prompt padrão com visual da app (substitui window.prompt e window.confirm)
// CSS é injetado AUTOMATICAMENTE no load (não mais lazy), pra cobrir modais inline
// que usam as classes .dmp-modal-back, .dmp-modal, .dmp-field, etc (ex: contas-a-receber).
(function() {
  function injectStyle() {
    if (document.getElementById('dmp-ui-modal-css')) return;
    const s = document.createElement('style');
    s.id = 'dmp-ui-modal-css';
    s.textContent = `
      .dmp-modal-bg,.dmp-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;animation:dmpFade .15s ease-out}
      @keyframes dmpFade{from{opacity:0}to{opacity:1}}
      .dmp-modal{background:var(--bg-card,#fff);border:1px solid var(--border,#E5E7EB);border-radius:12px;max-width:460px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.2);font-family:'Geist',-apple-system,sans-serif;color:var(--text,#111)}
      .dmp-modal-head{padding:18px 20px 6px;display:flex;align-items:center;justify-content:space-between;gap:12px}
      .dmp-modal-head h3{margin:0 0 4px;font-size:16px;font-weight:600;color:var(--text,#111);letter-spacing:-.01em}
      .dmp-modal-head p{margin:0;font-size:12.5px;color:var(--text-muted,#6B7280);line-height:1.4}
      .dmp-modal-head button{background:transparent;border:none;color:var(--text-muted,#6B7280);cursor:pointer;padding:4px;border-radius:6px;display:grid;place-items:center}
      .dmp-modal-head button:hover{background:var(--bg-hover,#F3F4F6);color:var(--text,#111)}
      .dmp-modal-head button svg{width:18px;height:18px}
      .dmp-modal-body{padding:14px 20px 4px;display:flex;flex-direction:column;gap:12px}
      .dmp-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .dmp-field{min-width:0}
      .dmp-field label{display:block;font-size:11.5px;font-weight:600;color:var(--text-muted,#6B7280);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
      .dmp-field input,.dmp-field textarea,.dmp-field select{width:100%;padding:9px 11px;border:1px solid var(--border,#D1D5DB);border-radius:7px;background:var(--bg,#fff);color:var(--text,#111);font-family:inherit;font-size:13.5px;outline:none;transition:border .15s}
      .dmp-field input:focus,.dmp-field textarea:focus,.dmp-field select:focus{border-color:var(--accent,#2563EB);box-shadow:0 0 0 3px var(--accent-soft,rgba(37,99,235,.15))}
      .dmp-field textarea{min-height:80px;resize:vertical;font-family:'Geist Mono',monospace;font-size:12.5px}
      .dmp-field .hint,.dmp-hint{font-size:11px;color:var(--text-soft,#9CA3AF);margin-top:4px;line-height:1.4}
      .dmp-modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:10px 20px 18px;flex-wrap:wrap}
      .dmp-btn{padding:8px 14px;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;font-family:inherit;transition:.15s}
      .dmp-btn-ghost{background:transparent;color:var(--text,#111);border-color:var(--border,#E5E7EB)}
      .dmp-btn-ghost:hover{background:var(--bg-hover,#F3F4F6)}
      .dmp-btn-primary{background:var(--accent,#2563EB);color:#fff}
      .dmp-btn-primary:hover{background:var(--accent-hover,#1D4ED8)}
      .dmp-btn-danger{background:var(--danger,#DC2626);color:#fff}
      .dmp-btn-danger:hover{opacity:.9}
      .dmp-err{font-size:12px;color:var(--danger,#DC2626);background:var(--danger-soft,#FEE2E2);padding:8px 10px;border-radius:6px;display:none}
      .dmp-err.on{display:block}
      /* Autocomplete de cliente/fornecedor reutilizável */
      .dmp-ac{position:relative}
      .dmp-ac-drop{position:absolute;top:calc(100% + 2px);left:0;right:0;max-height:240px;overflow-y:auto;background:var(--bg-card,#fff);border:1px solid var(--border,#D1D5DB);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.18);z-index:10001}
      .dmp-ac-item{padding:8px 11px;cursor:pointer;font-size:13px;color:var(--text,#111);display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--border,#F3F4F6)}
      .dmp-ac-item:last-child{border-bottom:none}
      .dmp-ac-item:hover,.dmp-ac-item.sel{background:var(--accent-soft,#DBEAFE);color:var(--accent,#2563EB)}
      .dmp-ac-item small{color:var(--text-muted,#6B7280);font-family:'Geist Mono',monospace;font-size:11px}
      .dmp-ac-item.new-btn{color:var(--accent,#2563EB);font-weight:500;font-style:italic}
      .dmp-ac-empty{padding:10px 11px;color:var(--text-muted,#6B7280);font-size:12.5px;font-style:italic}
    `;
    (document.head || document.documentElement).appendChild(s);
  }
  // Injeta agora (ou quando head estiver pronto)
  if (document.head) injectStyle();
  else document.addEventListener('DOMContentLoaded', injectStyle);

  function open({ title, desc, fields, submitLabel, cancelLabel, danger, onSubmit }) {
    injectStyle();
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'dmp-modal-bg';
      const close = (val) => { bg.remove(); resolve(val); };

      const fieldsHtml = (fields || []).map((f, i) => `
        <div class="dmp-field">
          <label for="dmp-f-${i}">${f.label || ''}</label>
          ${f.options
            ? `<select id="dmp-f-${i}" data-key="${f.key}">${f.options.map(o=>`<option value="${o.value}"${o.value===String(f.value||'')?` selected`:``}>${o.label}</option>`).join('')}</select>`
            : f.multiline
              ? `<textarea id="dmp-f-${i}" data-key="${f.key}" placeholder="${f.placeholder||''}">${f.value||''}</textarea>`
              : `<input id="dmp-f-${i}" data-key="${f.key}" type="${f.type||'text'}" placeholder="${f.placeholder||''}" value="${(f.value||'').toString().replace(/"/g,'&quot;')}" ${f.maxlength?'maxlength="'+f.maxlength+'"':''} ${f.required?'required':''}>`
          }
          ${f.hint ? `<div class="hint">${f.hint}</div>` : ''}
        </div>`).join('');

      const _uid = Math.random().toString(36).slice(2,8);
      bg.innerHTML = `
        <div class="dmp-modal" role="dialog" aria-modal="true" aria-labelledby="dmp-modal-title-${_uid}">
          <div class="dmp-modal-head">
            <h3 id="dmp-modal-title-${_uid}">${title||'Confirmação'}</h3>
            ${desc ? `<p>${desc}</p>` : ''}
          </div>
          <div class="dmp-modal-body">
            ${fieldsHtml}
            <div class="dmp-err" id="dmp-err"></div>
          </div>
          <div class="dmp-modal-foot">
            <button class="dmp-btn dmp-btn-ghost" data-act="cancel">${cancelLabel||'Cancelar'}</button>
            <button class="dmp-btn ${danger?'dmp-btn-danger':'dmp-btn-primary'}" data-act="ok">${submitLabel||'Confirmar'}</button>
          </div>
        </div>`;
      document.body.appendChild(bg);

      const inputs = bg.querySelectorAll('[data-key]');
      if (inputs[0]) setTimeout(() => inputs[0].focus(), 30);

      const errBox = bg.querySelector('#dmp-err');
      const submit = async () => {
        const values = {};
        inputs.forEach(i => { values[i.dataset.key] = i.value.trim(); });
        if (onSubmit) {
          errBox.classList.remove('on');
          try {
            const res = await onSubmit(values);
            if (res === false) return; // handler cancelou
            close(values);
          } catch (e) {
            errBox.textContent = e?.message || String(e);
            errBox.classList.add('on');
          }
        } else close(values);
      };

      bg.addEventListener('click', (e) => {
        if (e.target === bg) close(null);
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'cancel') close(null);
        if (act === 'ok') submit();
      });
      bg.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') submit();
      });
    });
  }

  async function confirmar({ title, desc, danger, okLabel, cancelLabel }) {
    const r = await open({ title, desc, fields: [], submitLabel: okLabel||'Confirmar', cancelLabel, danger });
    return r !== null;
  }

  window.DMPAY_UI = { open, confirm: confirmar };
})();
