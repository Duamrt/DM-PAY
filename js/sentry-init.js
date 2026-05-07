// DM Pay · Sentry init com Session Replay (máscara LGPD-friendly)
// Carrega depois do bundle CDN bundle.replay.min.js
(function () {
  if (typeof Sentry === 'undefined') return;

  var host = location.hostname;
  var env = (host === 'dmpayapp.com.br' || host === 'www.dmpayapp.com.br') ? 'production'
          : (host === 'localhost' || host === '127.0.0.1') ? 'development'
          : 'staging';

  Sentry.init({
    dsn: 'https://b02dbb8bcecf2b46d816ce9c7b143716@o4511319357390848.ingest.us.sentry.io/4511347818758144',
    environment: env,
    release: window.DMPAY_VERSION || 'unknown',

    // Sem Tracing/Spans (economiza quota free)
    tracesSampleRate: 0,

    // Session Replay — 10% das sessões + 100% das que tiverem erro
    replaysSessionSampleRate: env === 'production' ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // LGPD: nada de texto/input/mídia visível no replay
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
        // Bloqueia também elementos com classe sensível
        block: ['.sensivel', '[data-sensivel]'],
        mask: ['.sensivel', '[data-sensivel]'],
      }),
    ],

    // Não envia em dev local
    enabled: env !== 'development',

    // Ignora ruído típico de extensão/browser
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
      /^Script error\.?$/,
    ],
    denyUrls: [
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
      /safari-extension:\/\//,
    ],

    beforeSend: function (event) {
      // Drop eventos sem stacktrace utilizável (lixo)
      try {
        if (event.exception && event.exception.values) {
          var v = event.exception.values[0] || {};
          if (!v.stacktrace || !v.stacktrace.frames || v.stacktrace.frames.length === 0) {
            return null;
          }
        }
      } catch (_) {}
      return event;
    },
  });

  // Tagueia user logado (sem PII bruto — só id e tenant)
  try {
    var u = JSON.parse(sessionStorage.getItem('dmpay_user') || 'null');
    var c = JSON.parse(sessionStorage.getItem('dmpay_company') || 'null');
    if (u && u.id) Sentry.setUser({ id: u.id });
    if (c && c.id) Sentry.setTag('company_id', c.id);
    if (c && c.trade_name) Sentry.setTag('company', c.trade_name);
  } catch (_) {}
})();
