-- =============================================================================
-- DM PAY — Migração 020
-- Agenda limpeza automática da tabela public.rate_limits.
--
-- Roda dmp_cleanup_rate_limits() a cada hora via pg_cron.
-- A função (criada na migração 006) apaga registros com window_start > 1h.
-- =============================================================================

-- pg_cron já está instalado na maioria dos projetos Supabase, mas garantimos.
create extension if not exists pg_cron;

-- Remove agendamento prévio com mesmo nome (idempotente).
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'dmp_cleanup_rate_limits_hourly';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

-- Agenda: a cada hora no minuto 7 (evita pico do :00).
select cron.schedule(
  'dmp_cleanup_rate_limits_hourly',
  '7 * * * *',
  $$ select public.dmp_cleanup_rate_limits(); $$
);

-- =============================================================================
-- FIM 020
-- =============================================================================
