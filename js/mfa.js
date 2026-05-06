// DM Pay — MFA TOTP helpers (Supabase Auth nativo)
// Uso:
//   const factors = await DMPAY_MFA.listFactors()
//   const enroll = await DMPAY_MFA.enroll()  // { factorId, qrSvg, secret }
//   await DMPAY_MFA.verifyEnroll(factorId, code)
//   await DMPAY_MFA.challenge(code)  // pós signIn quando tem factor ativo
//   await DMPAY_MFA.unenroll(factorId)
//   const aal = await DMPAY_MFA.aal()  // 'aal1' ou 'aal2'

window.DMPAY_MFA = (function() {
  async function _ready() {
    if (window.sb) return;
    await new Promise(function(r) {
      window.addEventListener('dmpay-sb-ready', r, { once: true });
      setTimeout(function() { if (window.sb) r(); }, 50);
    });
  }

  async function listFactors() {
    await _ready();
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    return {
      totp: (data && data.totp) || [],
      all: (data && data.all) || []
    };
  }

  async function aal() {
    await _ready();
    const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return {
      currentLevel: data.currentLevel,
      nextLevel: data.nextLevel,
      currentAuthenticationMethods: data.currentAuthenticationMethods
    };
  }

  async function enroll() {
    await _ready();
    // Limpa factors pendurados (unverified) antes de criar novo — evita colisão de friendlyName
    try {
      const lf = await sb.auth.mfa.listFactors();
      const pendentes = ((lf.data && lf.data.all) || []).filter(function(f){ return f.status === 'unverified'; });
      for (var i = 0; i < pendentes.length; i++) {
        try { await sb.auth.mfa.unenroll({ factorId: pendentes[i].id }); }
        catch(e){ console.warn('[mfa] unenroll pendente falhou', pendentes[i].id, e); }
      }
    } catch(e){ console.warn('[mfa] limpeza pré-enroll falhou', e); }
    // Nome único por timestamp completo — nunca colide
    const friendlyName = 'DM Pay - ' + Date.now();
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: friendlyName });
    if (error) throw error;
    return {
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri
    };
  }

  async function verifyEnroll(factorId, code) {
    await _ready();
    const ch = await sb.auth.mfa.challenge({ factorId: factorId });
    if (ch.error) throw ch.error;
    const v = await sb.auth.mfa.verify({ factorId: factorId, challengeId: ch.data.id, code: code });
    if (v.error) throw v.error;
    return v.data;
  }

  async function challenge(code) {
    await _ready();
    const factors = await listFactors();
    const totp = factors.totp.filter(function(f) { return f.status === 'verified'; })[0];
    if (!totp) throw new Error('Nenhum fator TOTP ativo.');
    const ch = await sb.auth.mfa.challenge({ factorId: totp.id });
    if (ch.error) throw ch.error;
    const v = await sb.auth.mfa.verify({ factorId: totp.id, challengeId: ch.data.id, code: code });
    if (v.error) throw v.error;
    return v.data;
  }

  async function unenroll(factorId) {
    await _ready();
    const { data, error } = await sb.auth.mfa.unenroll({ factorId: factorId });
    if (error) throw error;
    return data;
  }

  // Verifica se o usuário precisa elevar AAL (ou seja, completou senha mas não TOTP)
  async function precisaElevar() {
    const a = await aal();
    return a.currentLevel === 'aal1' && a.nextLevel === 'aal2';
  }

  return {
    listFactors: listFactors,
    aal: aal,
    enroll: enroll,
    verifyEnroll: verifyEnroll,
    challenge: challenge,
    unenroll: unenroll,
    precisaElevar: precisaElevar
  };
})();
