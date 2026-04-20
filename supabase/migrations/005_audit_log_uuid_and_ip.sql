-- =============================================================================
-- DM PAY — Migração 005
-- Reforço de auditoria: PK UUID v4 + ip_origem + RPC helper
-- Data: 2026-04-20
--
-- Justificativa: pilar #2 (Auditoria) e #4 (UUID v4 em PKs) do Gemini.
-- A audit_log original foi criada com bigserial; trocamos por UUID v4 e
-- adicionamos ip_origem. Tabela não tem linhas em produção no momento
-- (nunca foi populada), então o DROP é seguro.
-- =============================================================================

-- Garante extensão gen_random_uuid (pgcrypto já instalada na 001)
create extension if not exists "pgcrypto";

-- Dropa a audit_log antiga (bigserial + sem ip_origem)
drop table if exists public.audit_log cascade;

-- Recria com UUID v4 + ip_origem + FKs explícitas
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  entity text not null,
  entity_id uuid,
  action text not null check (action in ('create','update','delete','import','pay','cancel','receive','estorno')),
  before jsonb,
  after jsonb,
  ip_origem text,
  user_agent text,
  created_at timestamptz default now()
);

create index idx_audit_log_company_id on public.audit_log(company_id);
create index idx_audit_log_created_at on public.audit_log(created_at desc);
create index idx_audit_log_entity on public.audit_log(entity, entity_id);
create index idx_audit_log_user on public.audit_log(user_id);

-- RLS reativa (DROP cascade apagou as policies)
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log for select
  using (company_id = public.get_my_company_id() or public.is_platform_admin());

create policy audit_log_insert on public.audit_log for insert
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- =============================================================================
-- RPC helper: dmp_log_audit
-- Frontend chama esta função; ela injeta company_id/user_id/email do JWT.
-- Retorna o id UUID do registro criado.
-- =============================================================================
create or replace function public.dmp_log_audit(
  p_entity text,
  p_entity_id uuid,
  p_action text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_ip_origem text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_company uuid;
  v_user uuid;
  v_email text;
begin
  v_company := public.get_my_company_id();
  if v_company is null then
    raise exception 'dmp_log_audit: usuário sem company_id';
  end if;

  v_user := auth.uid();
  select email into v_email from public.profiles where id = v_user;

  insert into public.audit_log (
    company_id, user_id, user_email, entity, entity_id, action,
    before, after, ip_origem, user_agent
  ) values (
    v_company, v_user, v_email, p_entity, p_entity_id, p_action,
    p_before, p_after, p_ip_origem, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.dmp_log_audit(text, uuid, text, jsonb, jsonb, text, text) to authenticated;

-- =============================================================================
-- FIM DA MIGRAÇÃO 005
-- =============================================================================
