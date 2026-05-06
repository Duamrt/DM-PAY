// DM Pay — MFA helpers (Supabase Auth nativo)
// Suporta 2 métodos de 2º fator:
//   - 'email': OTP enviado pro inbox do usuário no login (recomendado, sem app)
//   - 'totp':  App autenticador (Google Authenticator, Authy, etc — avançado)
//
// Preferência guardada em profiles.mfa_method
//
// API:
//   await DMPAY_MFA.getMethod()                 -> 'email' | 'totp' | null
//   await DMPAY_MFA.setMethod(metodo)           -> seta em profiles
//   await DMPAY_MFA.disable()                   -> desativa tudo (limpa mfa_method + unenroll TOTP)
//
//   TOTP:
//   await DMPAY_MFA.enroll()                    -> { factorId, qrSvg, secret }
//   await DMPAY_MFA.verifyEnroll(factorId, code)
//   await DMPAY_MFA.listFactors()
//   await DMPAY_MFA.unenroll(factorId)
//   await DMPAY_MFA.challenge(code)             -> usa no login
//
//   E-mail OTP:
//   await DMPAY_MFA.sendEmailOtp(email)         -> Supabase manda código pro inbox
//   await DMPAY_MFA.verifyEmailOtp(email, code) -> valida e cria sessão

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

  // ===== Preferência de método (profiles.mfa_method) =====
  async function getMethod() {
    await _ready();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data, error } = await sb.from('profiles').select('mfa_method').eq('id', user.id).maybeSingle();
    if (error) { console.warn('[mfa] getMethod', error); return null; }
    return data ? data.mfa_method : null;
  }

  async function setMethod(metodo) {
    await _ready();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Sem sessão.');
    if (metodo !== null && metodo !== 'email' && metodo !== 'totp') throw new Error('Método inválido.');
    const { error } = await sb.from('profiles').update({ mfa_method: metodo }).eq('id', user.id);
    if (error) throw error;
  }

  async function disable() {
    // Desliga tudo: limpa preferência + remove qualquer factor TOTP cadastrado
    const factors = await listFactors();
    for (var i = 0; i < factors.totp.length; i++) {
      try { await unenroll(factors.totp[i].id); } catch(e){ console.warn('[mfa] unenroll', e); }
    }
    await setMethod(null);
  }

  // ===== E-mail OTP (Supabase signInWithOtp / verifyOtp) =====
  // Fluxo no login:
  //   1. signInWithPassword OK (sessão A criada)
  //   2. detecta mfa_method='email'
  //   3. signOut() (mata sessão A — usuário NÃO logado entre 2-fatores)
  //   4. sendEmailOtp(email) — Supabase manda 6 dígitos pro inbox
  //   5. usuário digita
  //   6. verifyEmailOtp(email, code) — cria sessão B (usuário logado)
  async function sendEmailOtp(email) {
    await _ready();
    const { error } = await sb.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: false }
    });
    if (error) throw error;
  }

  async function verifyEmailOtp(email, code) {
    await _ready();
    const { data, error } = await sb.auth.verifyOtp({
      email: email,
      token: code,
      type: 'email'
    });
    if (error) throw error;
    return data;
  }

  return {
    // Preferência
    getMethod: getMethod,
    setMethod: setMethod,
    disable: disable,
    // TOTP
    listFactors: listFactors,
    aal: aal,
    enroll: enroll,
    verifyEnroll: verifyEnroll,
    challenge: challenge,
    unenroll: unenroll,
    precisaElevar: precisaElevar,
    // E-mail
    sendEmailOtp: sendEmailOtp,
    verifyEmailOtp: verifyEmailOtp
  };
})();
