// DM Pay — Guard de autenticacao
// Inclua em todas as paginas privadas via:
//   <script src="js/supabase.js"></script>
//   <script src="js/auth.js"></script>
//   <script src="js/auth-guard.js"></script>
// Ele bloqueia o render ate confirmar sessao + injeta dados do usuario.

(async function() {
  const html = document.documentElement;
  html.style.visibility = 'hidden';

  const session = await DMPAY.requireAuth();
  if (!session) return; // redirecionou

  // Expoe globalmente
  window.DMPAY_USER = session.user;
  window.DMPAY_PROFILE = session.profile;
  window.DMPAY_COMPANY = session.company;

  // Atualiza avatar (iniciais) + nome empresa em qualquer elemento padrao
  const initials = (session.profile.name || session.user.email || '?')
    .split(' ').map(function(p){return p[0];}).slice(0,2).join('').toUpperCase();
  document.querySelectorAll('.avatar').forEach(function(el) {
    if (!el.dataset.fixed) el.textContent = initials;
  });
  document.querySelectorAll('.brand-name').forEach(function(el) {
    if (session.company && session.company.trade_name && !el.dataset.fixed) {
      // Mantem brand DM Pay no topo, mas adiciona empresa em outro lugar
    }
  });

  html.style.visibility = '';
})();
