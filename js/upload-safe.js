// DM Pay — Cofre de arquivos (pilar #3 Gemini)
// Sanitiza uploads: valida magic number, tamanho, renomeia pra UUID.
// Uso:
//   const r = await DMPAY_UPLOAD.sanitize(file, { types: ['xml'] });
//   if (!r.ok) { alert(r.error); return; }
//   // r.file = File com nome UUID seguro (mesmo conteúdo)
//   // r.safeName = '8c2f...ab3.xml'

(function () {
  const MAX_MB_DEFAULT = 10;

  // Magic numbers esperados por tipo (primeiros bytes)
  const MAGIC = {
    pdf: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
    png: [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }],
    jpg: [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
    // XML: magic é "<?xml" ou "<" direto (BOM UTF-8 EF BB BF opcional antes)
    xml: 'xml-text'
  };

  const MIME_HINT = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    xml: 'application/xml'
  };

  function uuid4() {
    // RFC 4122 v4 via crypto se disponível
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    const b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  async function readFirstBytes(file, n) {
    const slice = file.slice(0, n);
    const buf = await slice.arrayBuffer();
    return new Uint8Array(buf);
  }

  function matchBytes(arr, offset, expected) {
    for (let i = 0; i < expected.length; i++) {
      if (arr[offset + i] !== expected[i]) return false;
    }
    return true;
  }

  async function detectTipo(file, extHint) {
    const first16 = await readFirstBytes(file, 16);

    // Checa magic numbers binários
    for (const tipo of ['pdf', 'png', 'jpg']) {
      const sigs = MAGIC[tipo];
      if (Array.isArray(sigs)) {
        for (const sig of sigs) {
          if (matchBytes(first16, sig.offset, sig.bytes)) return tipo;
        }
      }
    }

    // Checa XML como texto (BOM UTF-8 opcional + '<')
    let start = 0;
    if (first16[0] === 0xEF && first16[1] === 0xBB && first16[2] === 0xBF) start = 3;
    if (first16[start] === 0x3C) {
      // começa com '<' — pode ser XML ou HTML. Lê 512 bytes pra confirmar presença de <?xml ou namespace SEFAZ
      const head512 = new TextDecoder('utf-8', { fatal: false }).decode(await readFirstBytes(file, 512));
      if (head512.startsWith('<?xml') || head512.includes('<NFe') || head512.includes('<nfeProc') || head512.startsWith('<?XML')) {
        return 'xml';
      }
      // Rejeita HTML u outros '<' não-XML
      if (head512.toLowerCase().includes('<!doctype html') || head512.toLowerCase().includes('<html')) return 'html';
    }

    return 'desconhecido';
  }

  async function sanitize(file, opts) {
    opts = opts || {};
    const allowed = (opts.types || ['xml', 'pdf', 'png', 'jpg']).map(t => t.toLowerCase());
    const maxMb = opts.maxMb || MAX_MB_DEFAULT;
    const maxBytes = maxMb * 1024 * 1024;

    if (!file || !(file instanceof File) && !(file instanceof Blob)) {
      return { ok: false, error: 'Nenhum arquivo recebido.' };
    }
    if (file.size === 0) {
      return { ok: false, error: 'Arquivo vazio.' };
    }
    if (file.size > maxBytes) {
      return { ok: false, error: 'Arquivo maior que o limite de ' + maxMb + 'MB (' + (file.size / 1024 / 1024).toFixed(1) + 'MB).' };
    }

    const extHint = (file.name || '').split('.').pop().toLowerCase();
    const tipoReal = await detectTipo(file, extHint);

    if (tipoReal === 'desconhecido' || tipoReal === 'html') {
      return { ok: false, error: 'Tipo de arquivo não reconhecido ou inseguro. Aceitos: ' + allowed.join(', ') + '.' };
    }

    if (!allowed.includes(tipoReal)) {
      return { ok: false, error: 'Arquivo detectado como "' + tipoReal + '", mas esta tela aceita apenas: ' + allowed.join(', ') + '.' };
    }

    // Renomeia pro UUID (pilar #3 Gemini: evita enumeração + execução)
    const safeName = uuid4() + '.' + tipoReal;
    const mime = MIME_HINT[tipoReal] || 'application/octet-stream';
    const cleanFile = new File([file], safeName, { type: mime, lastModified: file.lastModified });

    return {
      ok: true,
      file: cleanFile,
      safeName,
      tipo: tipoReal,
      original: { name: file.name, size: file.size, type: file.type }
    };
  }

  window.DMPAY_UPLOAD = { sanitize, uuid4 };
})();
