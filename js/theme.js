// DM Pay — tema global unificado (sempre mesma chave, default light)
// Incluir no <head> ANTES do body pra evitar FOUC (flash of unstyled content)
(function() {
  var KEY = 'dmpay-theme';
  var saved = localStorage.getItem(KEY);
  var theme = (saved === 'dark' || saved === 'light') ? saved : 'light';
  document.documentElement.setAttribute('data-theme', theme);

  window.DMPAY_THEME = {
    get: function() { return document.documentElement.getAttribute('data-theme'); },
    set: function(t) {
      if (t !== 'dark' && t !== 'light') return;
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem(KEY, t);
      document.dispatchEvent(new CustomEvent('dmpay:theme-changed', { detail: { theme: t } }));
    },
    toggle: function() {
      var cur = document.documentElement.getAttribute('data-theme');
      this.set(cur === 'dark' ? 'light' : 'dark');
    }
  };

  window.toggleTheme = function() { window.DMPAY_THEME.toggle(); };
})();
