-- DM PAY — Migração 004
-- Trava: boleto exige linha digitável válida (44, 47 ou 48 dígitos numéricos)
-- Quando forma = 'boleto', sem linha válida = bloqueio no INSERT/UPDATE pelo Postgres
-- Aplicada em 2026-04-18

-- 1. Função auxiliar: limpa e retorna só os dígitos
create or replace function public.dmp_clean_digits(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

-- 2. Função auxiliar: valida formato FEBRABAN por comprimento
-- 44 = barcode · 47 = linha boleto bancário · 48 = linha arrecadação
create or replace function public.dmp_is_valid_boleto_line(p text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select length(public.dmp_clean_digits(p)) in (44, 47, 48);
$$;

-- 3. CONSTRAINT: boleto sem linha válida é REJEITADO pelo banco
-- (não importa se vier do frontend, API, SQL direto — Postgres bloqueia)
alter table public.payables
  drop constraint if exists payables_boleto_requires_valid_line;

alter table public.payables
  add constraint payables_boleto_requires_valid_line
  check (
    payment_method is distinct from 'boleto'
    or public.dmp_is_valid_boleto_line(boleto_line)
  );

comment on constraint payables_boleto_requires_valid_line on public.payables is
  'DM Stack: forma=boleto exige linha digitável com 44/47/48 dígitos numéricos';
comment on function public.dmp_is_valid_boleto_line(text) is
  'Valida linha digitável FEBRABAN por comprimento (barcode 44 | bancário 47 | arrecadação 48)';
