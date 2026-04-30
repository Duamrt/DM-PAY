-- =============================================================================
-- DM PAY — Migração 006
-- Infraestrutura de rate limiting por IP para Edge Functions.
--
-- ESCOPO: SOMENTE adições. Não altera nenhuma tabela ou função existente.
-- As Edge Functions só passam a CONSULTAR esta infraestrutura quando forem
-- explicitamente plugadas (Fase 2). Esta migração é segura para rodar em
-- produção sem impacto em nenhum fluxo atual.
-- =============================================================================

-- Tabela de janelas fixas (1 min) por IP + rota.
create table if not exists public.rate_limits (
  ip text not null,
  route text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (ip, route, window_start)
);

create index if not exists idx_rate_limits_window
  on public.rate_limits(window_start);

-- RLS: nega acesso direto via REST. Só funciona via SECURITY DEFINER abaixo.
alter table public.rate_limits enable row level security;
-- (sem policies = ninguém lê/escreve via REST)

-- Incrementa contador da janela atual e retorna se permitido.
-- true  = dentro do limite (deixa passar)
-- false = excedeu (bloqueia)
create or replace function public.dmp_check_rate_limit(
  p_ip text,
  p_route text,
  p_max_per_min int default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count int;
begin
  if p_ip is null or p_ip = '' then
    return true;
  end if;

  v_window := date_trunc('minute', now());

  insert into public.rate_limits as rl (ip, route, window_start, count)
  values (p_ip, p_route, v_window, 1)
  on conflict (ip, route, window_start) do update
    set count = rl.count + 1
  returning count into v_count;

  return v_count <= p_max_per_min;
end;
$$;

-- Limpa janelas com mais de 1h (idempotente; pode ser chamada por cron).
create or replace function public.dmp_cleanup_rate_limits()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.rate_limits
  where window_start < now() - interval '1 hour';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- =============================================================================
-- FIM 006
-- =============================================================================
