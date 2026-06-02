-- Onda 0 Mikael (2026-05-17): RPC que alimenta o card "Fluxo de Caixa Torto"
-- na home mobile. Foi aplicada via SQL direto — versionada aqui retroativamente.
-- Só authenticated pode chamar; anon e PUBLIC bloqueados explicitamente.
CREATE OR REPLACE FUNCTION public.get_payables_situation(
  p_company_id uuid,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  vencidos_count   integer,
  vencidos_total   numeric,
  dias_sem_baixa   integer,
  ultimo_baixador_email text,
  baixas_mes       integer,
  operador_phone   text,
  operador_name    text
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
  -- Payables vencidos sem baixa
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_count, v_total
  FROM payables
  WHERE company_id = p_company_id
    AND status = 'open'
    AND due_date < p_today;

  -- Última baixa (action=pay) + dias desde ela
  SELECT MAX(created_at)
    INTO v_ultimo
  FROM audit_log
  WHERE company_id = p_company_id
    AND entity = 'payable'
    AND action = 'pay';

  v_dias := CASE WHEN v_ultimo IS NULL THEN NULL
                 ELSE EXTRACT(DAY FROM (NOW() - v_ultimo))::int END;

  -- Email de quem fez mais baixas no mês + total baixas mês
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

  -- Telefone/nome do operador admin (whatsapp_settings.recipients)
  -- Pega o primeiro recipient ativo com role='admin' ou nome contendo "mikael"
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
