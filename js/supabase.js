// DM Pay — config + cliente Supabase
// Carregado por todas as paginas que precisam de auth/dados.
window.DMPAY_CONFIG = {
  SUPABASE_URL: 'https://ufxldjdppaonskxhmosi.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_ZasChENbAizpAR12zxm2Ug_x6H0eUEp',
  PLATFORM_COMPANY_ID: 'aaaa0001-0000-0000-0000-000000000001'
};

(function() {
  // Carrega Supabase JS via CDN se ainda nao carregou
  if (typeof window.supabase === 'undefined') {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload = function() { initSupabase(); };
    document.head.appendChild(s);
  } else {
    initSupabase();
  }

  function initSupabase() {
    if (window.sb) return;
    window.sb = window.supabase.createClient(
      window.DMPAY_CONFIG.SUPABASE_URL,
      window.DMPAY_CONFIG.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storage: window.localStorage,
          storageKey: 'dmpay-auth'
        }
      }
    );
    window.dispatchEvent(new CustomEvent('dmpay-sb-ready'));
  }
})();

// ── Utils globais compartilhados por todas as páginas ───────────────────
window.fmtBRL      = function(v){ return 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); };
window.fmtBRLshort = function(v){ return 'R$ ' + Math.round(Number(v||0)).toLocaleString('pt-BR'); };
window.brDate      = function(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('T')[0].split('-'); return d+'/'+m+'/'+y; };
window.diffDaysUtil= function(iso){ if(!iso) return 0; const [y,m,d]=String(iso).slice(0,10).split('-').map(Number); return Math.round((new Date(y,m-1,d)-new Date(new Date().setHours(0,0,0,0)))/86400000); };
window.warnIfTruncated = function(data, limit, label){ if(data && data.length === limit) console.warn('[DM Pay] '+label+': truncado em '+limit+' registros — considere paginação'); };

// ── Escape HTML para evitar XSS em innerHTML com dados do banco ──────────
window.esc = function(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
