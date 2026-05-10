// CORS compartilhado entre as Edge Functions do DM Pay.
// Whitelist de origens permitidas. Browser de outras origens recebe o header
// fixado no primeiro item, o que faz o navegador bloquear a chamada.
//
// Para adicionar um novo domínio (ex.: ambiente de staging), inclua aqui.

const ALLOWED_ORIGINS = [
  "https://dmpayapp.com.br",
  "https://www.dmpayapp.com.br",
  "https://duamrt.github.io",
];

const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, asaas-access-token, x-cron-secret";

export function corsHeaders(
  req: Request,
  allowHeaders: string = DEFAULT_ALLOW_HEADERS,
  allowMethods: string = "POST, OPTIONS",
): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": allowMethods,
    "Vary": "Origin",
  };
}
