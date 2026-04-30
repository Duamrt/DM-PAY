-- Migration 006: colunas extras em payables + fixed_expense_id para rastreabilidade
-- Usa "if not exists" em tudo — seguro de rodar mesmo que algumas colunas já existam

alter table public.payables
  add column if not exists tipo_lancamento text,
  add column if not exists pago_por         text,
  add column if not exists created_by       uuid references auth.users(id) on delete set null,
  add column if not exists fixed_expense_id uuid references public.fixed_expenses(id) on delete set null;

create index if not exists idx_payables_fixed_expense
  on public.payables(fixed_expense_id)
  where fixed_expense_id is not null;

comment on column public.payables.fixed_expense_id is
  'Referência à despesa fixa que gerou este lançamento automaticamente (null = lançamento manual)';
