-- DM PAY — Migração 021
-- Hardening: handle_new_user + profiles.role + get_payables_situation
-- 2026-06-02

-- =============================================================================
-- 1. Adicionar 'financeiro' ao CHECK de profiles.role
--    criar-membro já aceita esse valor — o banco rejeitava silenciosamente.
-- =============================================================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('dono','admin','financeiro','viewer'));

-- =============================================================================
-- 2. handle_new_user: não aceitar role/company_id de raw_user_meta_data
--    Quando Edge Function criar-membro cria usuário ela passa
--    app_metadata.invited_by_admin=true e faz upsert do profile logo depois.
--    Para convites, o trigger retorna sem inserir nada (Edge Function controla).
--    Para signups novos, sempre cria empresa trial própria — nunca usa
--    company_id vindo do client (impede vinculação a tenant alheio).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_name text;
BEGIN
  -- Convite admin: Edge Function faz upsert do profile em seguida
  IF coalesce((new.raw_app_meta_data->>'invited_by_admin')::boolean, false) THEN
    RETURN new;
  END IF;

  v_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  INSERT INTO public.companies (legal_name, trial_until, plan, status)
  VALUES (
    COALESCE(new.raw_user_meta_data->>'company_name', v_name || ' (Trial)'),
    now() + interval '14 days',
    'trial',
    'trial'
  )
  RETURNING id INTO v_company_id;

  INSERT INTO public.profiles (id, company_id, name, email, role)
  VALUES (new.id, v_company_id, v_name, new.email, 'dono')
  ON CONFLICT (id) DO UPDATE SET
    company_id = excluded.company_id,
    name       = excluded.name,
    email      = excluded.email;

  RETURN new;
END;
$$;

-- =============================================================================
-- 3. get_payables_situation: guard explícito antes das queries
--    SECURITY INVOKER + RLS já protegia, mas a tabela whatsapp_settings
--    pode não ter RLS. Guard garante que chamador só vê sua empresa.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_payables_situation(
  p_company_id uuid,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  vencidos_count        integer,
  vencidos_total        numeric,
  dias_sem_baixa        integer,
  ultimo_baixador_email text,
  baixas_mes            integer,
  operador_phone        text,
  operador_name         text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count      int;
  v_total      numeric;
  v_ultimo     timestamptz;
  v_dias       int;
  v_email      text;
  v_baixas_mes int;
  v_phone      text;
  v_name       text;
BEGIN
  IF p_company_id <> public.get_my_company_id() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_count, v_total
  FROM payables
  WHERE company_id = p_company_id
    AND status = 'open'
    AND due_date < p_today;

  SELECT MAX(created_at)
    INTO v_ultimo
  FROM audit_log
  WHERE company_id = p_company_id
    AND entity = 'payable'
    AND action = 'pay';

  v_dias := CASE WHEN v_ultimo IS NULL THEN NULL
                 ELSE EXTRACT(DAY FROM (NOW() - v_ultimo))::int END;

  SELECT user_email, qtd
    INTO v_email, v_baixas_mes
  FROM (
    SELECT user_email, COUNT(*) AS qtd
    FROM audit_log
    WHERE company_id = p_company_id
      AND entity = 'payable'
      AND action = 'pay'
      AND created_at >= date_trunc('month', p_today::timestamptz)
    GROUP BY user_email
    ORDER BY qtd DESC
    LIMIT 1
  ) x;

  SELECT (r->>'phone'), (r->>'name')
    INTO v_phone, v_name
  FROM whatsapp_settings ws,
       jsonb_array_elements(ws.recipients) r
  WHERE ws.company_id = p_company_id
    AND COALESCE((r->>'active')::boolean, true) = true
    AND (
      LOWER(COALESCE(r->>'role', '')) IN ('admin', 'operador', 'aux')
      OR LOWER(COALESCE(r->>'name', '')) LIKE '%mikael%'
    )
  ORDER BY
    CASE WHEN LOWER(COALESCE(r->>'role', '')) = 'admin' THEN 1
         WHEN LOWER(COALESCE(r->>'name', '')) LIKE '%mikael%' THEN 2
         ELSE 3 END
  LIMIT 1;

  RETURN QUERY SELECT
    v_count,
    v_total,
    v_dias,
    v_email,
    COALESCE(v_baixas_mes, 0),
    v_phone,
    v_name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_payables_situation(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_payables_situation(uuid, date) TO   authenticated;

-- =============================================================================
-- FIM DA MIGRAÇÃO 021
-- =============================================================================
