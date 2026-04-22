-- Migration 019: colunas extras para integração Asaas + tabela asaas_eventos

-- Adiciona campos de contato e billing na tabela companies
alter table public.companies
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists asaas_customer_id text,
  add column if not exists dias_atraso integer not null default 0,
  add column if not exists bloqueado_em timestamptz;

-- Campos extras na tabela subscriptions
alter table public.subscriptions
  add column if not exists valor numeric(14,2) not null default 0,
  add column if not exists ciclo text not null default 'MONTHLY',
  add column if not exists forma_pagamento text not null default 'UNDEFINED',
  add column if not exists proximo_vencimento date,
  add column if not exists ultimo_pagamento_em timestamptz,
  add column if not exists cartao_ultimos_digitos text,
  add column if not exists cartao_bandeira text;

-- Tabela de idempotência para webhooks Asaas
create table if not exists public.asaas_eventos (
  id uuid primary key default uuid_generate_v4(),
  asaas_event_id text unique not null,
  tipo text not null,
  payment_id text,
  subscription_id text,
  customer_id text,
  payload jsonb,
  processado boolean not null default false,
  erro text,
  created_at timestamptz default now()
);

-- RLS: só platform admin lê asaas_eventos (dados de billing sensíveis)
alter table public.asaas_eventos enable row level security;
create policy asaas_eventos_admin on public.asaas_eventos
  for all using (public.is_platform_admin());

-- RLS: subscriptions — cliente lê a própria, webhook (service key) escreve tudo
create policy if not exists subscriptions_select on public.subscriptions
  for select using (company_id = public.get_my_company_id() or public.is_platform_admin());
