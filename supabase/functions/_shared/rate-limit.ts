// Helper de rate limit por IP para Edge Functions.
//
// Uso:
//   import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
//   const ip = getClientIp(req);
//   const ok = await checkRateLimit(sb, ip, "asaas-criar-assinatura", 30);
//   if (!ok) return json({ error: "rate_limited" }, 429);
//
// Esta função apenas LE/GRAVA a tabela public.rate_limits via a RPC
// dmp_check_rate_limit (criada na migração 006). Não chama ninguém em fase 1
// — é apenas infraestrutura disponível para ativação futura.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export function getClientIp(req: Request): string {
  // Supabase Edge runtime expõe IP via x-forwarded-for / cf-connecting-ip.
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  if (fwd) return fwd.split(",")[0].trim();
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    ""
  );
}

export async function checkRateLimit(
  sb: SupabaseClient,
  ip: string,
  route: string,
  maxPerMin = 60,
): Promise<boolean> {
  if (!ip) return true; // sem IP = não bloqueia (cron interno, etc)
  const { data, error } = await sb.rpc("dmp_check_rate_limit", {
    p_ip: ip,
    p_route: route,
    p_max_per_min: maxPerMin,
  });
  if (error) {
    console.warn("[rate-limit] rpc error, fail-open:", error.message);
    return true; // fail-open: erro no rate limit não pode derrubar a função
  }
  return data === true;
}
