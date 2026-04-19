// DM Pay — helpers de autenticacao + sessao
// Uso:
//   await DMPAY.ready()
//   const { user, profile, company } = await DMPAY.session()
//   DMPAY.requireAuth()  // redireciona pra login se nao logado
//   await DMPAY.signIn(email, senha)
//   await DMPAY.signUp(email, senha, nome, companyName)
//   await DMPAY.signOut()

window.DMPAY = (function() {
  const PUBLIC_PAGES = ['login.html', 'wizard.html', 'index.html', ''];
  let _session = null;

  function ready() {
    return new Promise(function(resolve) {
      if (window.sb) return resolve();
      window.addEventListener('dmpay-sb-ready', resolve, { once: true });
      // fallback se ja carregou antes desse JS
      setTimeout(function() { if (window.sb) resolve(); }, 50);
    });
  }

  async function session(force) {
    if (_session && !force) return _session;
    await ready();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { _session = { user: null, profile: null, company: null }; return _session; }
    const { data: profile } = await sb
      .from('profiles')
      .select('*, companies(*)')
      .eq('id', user.id)
      .maybeSingle();
    _session = {
      user: user,
      profile: profile,
      company: profile ? profile.companies : null
    };
    return _session;
  }

  async function requireAuth() {
    await ready();
    const s = await session();
    const path = location.pathname.split('/').pop();
    if (!s.user) {
      sessionStorage.setItem('dmpay-redirect', location.pathname + location.search);
      location.replace('login.html');
      return null;
    }
    if (!s.profile) {
      // user existe mas profile nao — algo deu errado no signup
      console.warn('[DMPAY] user sem profile — redirecionando pro wizard');
      location.replace('wizard.html');
      return null;
    }
    // Platform admin (DM Stack Master) nao precisa passar pelo wizard
    const isPlatformAdmin = s.company && s.company.id === window.DMPAY_CONFIG.PLATFORM_COMPANY_ID;
    if (!isPlatformAdmin && (!s.company || !s.company.cnpj)) {
      // wizard ainda nao foi concluido
      if (path !== 'wizard.html') {
        location.replace('wizard.html');
        return null;
      }
    }
    return s;
  }

  async function signIn(email, senha) {
    await ready();
    const { data, error } = await sb.auth.signInWithPassword({ email: email, password: senha });
    if (error) throw error;
    _session = null;
    return data;
  }

  async function signUp(email, senha, nome, companyName) {
    await ready();
    const { data, error } = await sb.auth.signUp({
      email: email,
      password: senha,
      options: {
        data: {
          name: nome,
          company_name: companyName,
          role: 'dono'
        }
      }
    });
    if (error) throw error;
    _session = null;
    return data;
  }

  async function signOut() {
    await ready();
    await sb.auth.signOut();
    _session = null;
    sessionStorage.removeItem('dmpay-redirect');
    location.replace('login.html');
  }

  function postLoginRedirect() {
    const target = sessionStorage.getItem('dmpay-redirect');
    sessionStorage.removeItem('dmpay-redirect');
    return target || 'dashboard.html';
  }

  return {
    ready: ready,
    session: session,
    requireAuth: requireAuth,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    postLoginRedirect: postLoginRedirect
  };
})();
