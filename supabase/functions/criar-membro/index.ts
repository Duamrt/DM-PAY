import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://dmpayapp.com.br",
  "https://www.dmpayapp.com.br",
  "http://localhost:3000",
  "http://localhost:5173",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

const MASTER_COMPANY = "aaaa0001-0000-0000-0000-000000000001";

serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Autenticar chamador
  const jwt = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const { data: caller } = await admin
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!caller || !["dono", "admin"].includes(caller.role)) {
    return new Response(JSON.stringify({ error: "Acesso negado — apenas dono ou admin podem convidar membros" }), {
      status: 403, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const { name, email, password, role, company_id } = await req.json();

  if (!email || !password || !company_id) {
    return new Response(JSON.stringify({ error: "email, senha e company_id são obrigatórios" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  if (String(password).length < 8) {
    return new Response(JSON.stringify({ error: "Senha deve ter ao menos 8 caracteres" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  if (company_id === MASTER_COMPANY) {
    return new Response(JSON.stringify({ error: "company_id inválido" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Dono/admin só cria na própria empresa
  const isPlatformAdmin = caller.company_id === MASTER_COMPANY;
  if (!isPlatformAdmin && caller.company_id !== company_id) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const validRoles = ["admin", "financeiro", "viewer"];
  const memberRole = validRoles.includes(role) ? role : "viewer";

  // 1. Criar usuário no Auth
  const { data: authData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    return new Response(JSON.stringify({ error: createErr.message }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // 2. Criar profile vinculado à empresa
  const { error: profErr } = await admin.from("profiles").insert({
    id:         authData.user.id,
    name:       name || null,
    email,
    company_id,
    role:       memberRole,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return new Response(JSON.stringify({ error: profErr.message }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: authData.user.id }), {
    headers: { "Content-Type": "application/json", ...CORS },
  });
});
