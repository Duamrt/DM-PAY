-- =============================================================================
-- DM PAY — Migração inicial 001
-- Schema completo + RLS multi-tenant + funções auxiliares + índices
-- Data: 2026-04-18
-- =============================================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================================
-- CORE: companies + profiles
-- =============================================================================

-- Empresas (tenants)
create table if not exists public.companies (
  id uuid primary key default uuid_generate_v4(),
  cnpj text unique,
  legal_name text not null,
  trade_name text,
  plan text not null default 'trial' check (plan in ('trial','essencial','pro','rede','admin','expirado')),
  status text not null default 'trial' check (status in ('trial','ativa','atrasada','suspensa','cancelada')),
  trial_until timestamptz default (now() + interval '14 days'),
  city text,
  state text,
  logo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Perfis de usuário (FK para auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'admin' check (role in ('dono','admin','viewer')),
  permissions jsonb default '{}'::jsonb,
  phone text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_profiles_email on public.profiles(email);

-- =============================================================================
-- Funções auxiliares (SECURITY DEFINER)
-- =============================================================================

-- Retorna o company_id do usuário logado — usada em todas as policies RLS
create or replace function public.get_my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- Platform admin (empresa master DM Stack — libera acesso a qualquer tenant)
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'dono'
      and company_id = 'aaaa0001-0000-0000-0000-000000000001'::uuid
  );
$$;

-- Permissão granular (dono sempre true, resto checa jsonb)
create or replace function public.can_access(key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'dono' from public.profiles where id = auth.uid()),
    false
  ) or coalesce(
    (select (permissions->>key)::boolean from public.profiles where id = auth.uid()),
    false
  );
$$;

-- =============================================================================
-- CADASTROS: suppliers + expense_categories
-- =============================================================================

-- Fornecedores (auto-cadastro via XML NF-e)
create table if not exists public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cnpj text not null,
  legal_name text not null,
  trade_name text,
  state text,
  city text,
  email text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, cnpj)
);

create index if not exists idx_suppliers_company_id on public.suppliers(company_id);
create index if not exists idx_suppliers_cnpj on public.suppliers(cnpj);

-- Categorias de despesa (cada empresa gerencia suas)
create table if not exists public.expense_categories (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text default '#7C3AED',
  icon text default 'tag',
  is_default boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_expense_categories_company_id on public.expense_categories(company_id);

-- =============================================================================
-- ENTRADA DE DADOS: invoices + items + payables + daily_sales + sangrias + fixas
-- =============================================================================

-- Notas fiscais (NF-e recebidas via XML)
create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  nf_number text not null,
  series text default '1',
  issue_date date not null,
  nature text default 'Venda para revenda',
  total numeric(14,2) not null default 0,
  total_products numeric(14,2) default 0,
  total_discount numeric(14,2) default 0,
  total_freight numeric(14,2) default 0,
  nfe_key text,
  xml_raw jsonb,
  status text not null default 'imported' check (status in ('imported','awaiting_boleto','linked','cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, nfe_key)
);

create index if not exists idx_invoices_company_id on public.invoices(company_id);
create index if not exists idx_invoices_supplier_id on public.invoices(supplier_id);
create index if not exists idx_invoices_issue_date on public.invoices(issue_date);

-- Itens da NF (opcional v1, necessário v2 para BI de produto)
create table if not exists public.invoice_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  code text,
  description text,
  quantity numeric(14,3) default 1,
  unit text,
  unit_price numeric(14,4) default 0,
  total numeric(14,2) default 0,
  ncm text
);

create index if not exists idx_invoice_items_invoice_id on public.invoice_items(invoice_id);

-- Contas a pagar (boletos + despesas avulsas + parcelas)
create table if not exists public.payables (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  category_id uuid references public.expense_categories(id) on delete set null,
  description text not null,
  amount numeric(14,2) not null,
  due_date date not null,
  paid_at timestamptz,
  payment_method text check (payment_method in ('boleto','pix','ted','dinheiro','cartao','debito_automatico','outro')),
  boleto_line text,
  boleto_barcode text,
  status text not null default 'open' check (status in ('open','paid','overdue','cancelled')),
  dedupe_hash text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payables_company_id on public.payables(company_id);
create index if not exists idx_payables_due_date on public.payables(due_date);
create index if not exists idx_payables_status on public.payables(status);
create index if not exists idx_payables_supplier_id on public.payables(supplier_id);
create unique index if not exists idx_payables_dedupe on public.payables(company_id, dedupe_hash) where dedupe_hash is not null;

-- Vendas diárias (importadas do PDF do ERP)
create table if not exists public.daily_sales (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sale_date date not null,
  payment_method text not null check (payment_method in ('dinheiro','pix','credito','debito','cheque','a_prazo','troco','outro')),
  amount numeric(14,2) not null,
  source text default 'pdf_icommerce' check (source in ('pdf_icommerce','manual','sql_direct')),
  imported_at timestamptz default now(),
  unique (company_id, sale_date, payment_method, source)
);

create index if not exists idx_daily_sales_company_id on public.daily_sales(company_id);
create index if not exists idx_daily_sales_date on public.daily_sales(sale_date);

-- Sangrias (retiradas de caixa)
create table if not exists public.cash_withdrawals (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  withdrawal_date date not null,
  amount numeric(14,2) not null,
  operator text,
  notes text,
  source text default 'pdf_icommerce',
  created_at timestamptz default now()
);

create index if not exists idx_cash_withdrawals_company_id on public.cash_withdrawals(company_id);
create index if not exists idx_cash_withdrawals_date on public.cash_withdrawals(withdrawal_date);

-- Despesas fixas recorrentes (água, luz, folha, aluguel)
create table if not exists public.fixed_expenses (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.expense_categories(id) on delete set null,
  description text not null,
  amount numeric(14,2) not null,
  due_day int not null check (due_day between 1 and 31),
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_fixed_expenses_company_id on public.fixed_expenses(company_id);

-- =============================================================================
-- GOVERNANÇA: audit_log + closings
-- =============================================================================

create table if not exists public.audit_log (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null check (action in ('create','update','delete','import','pay','cancel')),
  before jsonb,
  after jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_company_id on public.audit_log(company_id);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);

-- Fechamentos mensais (bloqueia edição retroativa)
create table if not exists public.closings (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  closed_at timestamptz default now(),
  closed_by uuid references auth.users(id) on delete set null,
  notes text,
  unique (company_id, year, month)
);

create index if not exists idx_closings_company_id on public.closings(company_id);

-- =============================================================================
-- BILLING: subscriptions + payment_history (padrão Asaas)
-- =============================================================================

create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan text not null check (plan in ('essencial','pro','rede')),
  asaas_customer_id text,
  asaas_subscription_id text,
  status text not null default 'pendente' check (status in ('pendente','ativa','atrasada','suspensa','cancelada')),
  next_charge_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_company_id on public.subscriptions(company_id);
create index if not exists idx_subscriptions_asaas_sub on public.subscriptions(asaas_subscription_id);

create table if not exists public.payment_history (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  asaas_payment_id text unique,
  amount numeric(14,2) not null,
  status text not null,
  paid_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_payment_history_company_id on public.payment_history(company_id);

-- =============================================================================
-- Trigger: auto-criar profile quando novo usuário se cadastra
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_name text;
begin
  -- Se metadata traz company_id explícito, usa (fluxo convite)
  v_company_id := (new.raw_user_meta_data->>'company_id')::uuid;
  v_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  -- Se NÃO traz company_id, significa signup novo — cria empresa trial
  if v_company_id is null then
    insert into public.companies (legal_name, trial_until, plan, status)
    values (
      coalesce(new.raw_user_meta_data->>'company_name', v_name || ' (Trial)'),
      now() + interval '14 days',
      'trial',
      'trial'
    )
    returning id into v_company_id;
  end if;

  -- Cria profile vinculando ao user
  insert into public.profiles (id, company_id, name, email, role)
  values (
    new.id,
    v_company_id,
    v_name,
    new.email,
    case when (new.raw_user_meta_data->>'role') is not null
         then new.raw_user_meta_data->>'role'
         else 'dono'
    end
  )
  on conflict (id) do update set
    company_id = excluded.company_id,
    name = excluded.name,
    email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- RLS: ativar em todas as tabelas
-- =============================================================================

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.expense_categories enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payables enable row level security;
alter table public.daily_sales enable row level security;
alter table public.cash_withdrawals enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.audit_log enable row level security;
alter table public.closings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_history enable row level security;

-- =============================================================================
-- POLICIES: cada tabela com SELECT/INSERT/UPDATE/DELETE próprios
-- Padrão: usuário vê/mexe só na sua empresa. Platform admin vê tudo.
-- =============================================================================

-- companies
create policy companies_select on public.companies for select
  using (id = public.get_my_company_id() or public.is_platform_admin());
create policy companies_update on public.companies for update
  using (id = public.get_my_company_id() or public.is_platform_admin());

-- profiles
create policy profiles_select on public.profiles for select
  using (company_id = public.get_my_company_id() or public.is_platform_admin());
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid() or public.is_platform_admin());

-- suppliers
create policy suppliers_all on public.suppliers for all
  using (company_id = public.get_my_company_id() or public.is_platform_admin())
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- expense_categories
create policy categories_all on public.expense_categories for all
  using (company_id = public.get_my_company_id() or public.is_platform_admin())
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- invoices
create policy invoices_all on public.invoices for all
  using (company_id = public.get_my_company_id() or public.is_platform_admin())
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- invoice_items (via invoice_id — não tem company_id direto)
create policy invoice_items_all on public.invoice_items for all
  using (
    exists (select 1 from public.invoices i
            where i.id = invoice_items.invoice_id
              and (i.company_id = public.get_my_company_id() or public.is_platform_admin()))
  )
  with check (
    exists (select 1 from public.invoices i
            where i.id = invoice_items.invoice_id
              and (i.company_id = public.get_my_company_id() or public.is_platform_admin()))
  );

-- payables
create policy payables_all on public.payables for all
  using (company_id = public.get_my_company_id() or public.is_platform_admin())
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- daily_sales
create policy daily_sales_all on public.daily_sales for all
  using (company_id = public.get_my_company_id() or public.is_platform_admin())
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- cash_withdrawals
create policy withdrawals_all on public.cash_withdrawals for all
  using (company_id = public.get_my_company_id() or public.is_platform_admin())
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- fixed_expenses
create policy fixed_expenses_all on public.fixed_expenses for all
  using (company_id = public.get_my_company_id() or public.is_platform_admin())
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- audit_log (só leitura pela UI — insert via backend)
create policy audit_log_select on public.audit_log for select
  using (company_id = public.get_my_company_id() or public.is_platform_admin());
create policy audit_log_insert on public.audit_log for insert
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- closings
create policy closings_all on public.closings for all
  using (company_id = public.get_my_company_id() or public.is_platform_admin())
  with check (company_id = public.get_my_company_id() or public.is_platform_admin());

-- subscriptions (só leitura pela UI do cliente — writes via webhook Asaas)
create policy subscriptions_select on public.subscriptions for select
  using (company_id = public.get_my_company_id() or public.is_platform_admin());

-- payment_history (só leitura)
create policy payment_history_select on public.payment_history for select
  using (company_id = public.get_my_company_id() or public.is_platform_admin());

-- =============================================================================
-- SEEDS: empresa master DM Stack + categorias padrão como template
-- =============================================================================

-- Empresa master DM Stack (UUID fixo igual DMTech/RPM)
insert into public.companies (id, legal_name, trade_name, plan, status, city, state)
values (
  'aaaa0001-0000-0000-0000-000000000001',
  'DM Stack — Master',
  'DM Pay Admin',
  'admin',
  'ativa',
  'Jupi',
  'PE'
)
on conflict (id) do nothing;

-- =============================================================================
-- FUNÇÕES DE DOMÍNIO
-- =============================================================================

-- Gera hash determinístico para anti-duplicata de boleto
create or replace function public.dmp_payable_dedupe_hash(
  p_supplier_cnpj text,
  p_amount numeric,
  p_due_date date,
  p_boleto_line text default null
)
returns text
language sql
immutable
as $$
  select encode(
    digest(
      coalesce(p_boleto_line, '') || '|' ||
      coalesce(p_supplier_cnpj, '') || '|' ||
      p_amount::text || '|' ||
      p_due_date::text,
      'sha256'
    ),
    'hex'
  );
$$;

-- Verifica se mês/ano está fechado para a empresa logada
create or replace function public.dmp_is_closed(p_year int, p_month int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.closings
    where company_id = public.get_my_company_id()
      and year = p_year
      and month = p_month
  );
$$;

-- =============================================================================
-- FIM DA MIGRAÇÃO 001
-- =============================================================================
