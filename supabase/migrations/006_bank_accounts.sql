-- =============================================================================
-- DM PAY — Migração 006
-- Tabela bank_accounts: contas bancárias por empresa
-- Data: 2026-04-28
-- =============================================================================

create table if not exists public.bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  bank_name       text not null,
  agency          text,
  account_number  text,
  balance         numeric(14,2) not null default 0,
  account_type    text not null default 'corrente'
                    check (account_type in ('corrente','poupanca','pagamento')),
  is_primary      boolean not null default false,
  active          boolean not null default true,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_bank_accounts_company_id
  on public.bank_accounts(company_id);

create index if not exists idx_bank_accounts_company_active
  on public.bank_accounts(company_id, active);

-- RLS
alter table public.bank_accounts enable row level security;

create policy bank_accounts_select on public.bank_accounts
  for select using (
    company_id = public.get_my_company_id()
    or public.is_platform_admin()
  );

create policy bank_accounts_insert on public.bank_accounts
  for insert with check (
    company_id = public.get_my_company_id()
  );

create policy bank_accounts_update on public.bank_accounts
  for update using (
    company_id = public.get_my_company_id()
    or public.is_platform_admin()
  );

create policy bank_accounts_delete on public.bank_accounts
  for delete using (
    company_id = public.get_my_company_id()
    or public.is_platform_admin()
  );
