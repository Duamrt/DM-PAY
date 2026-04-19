-- DM PAY — Migração 003
-- Regras invioláveis DM Stack: anti-duplicata de cadastro + autocomplete fuzzy
-- Aplicada em 2026-04-18

-- 1. Extensão pg_trgm ANTES dos índices (schema extensions do Supabase)
create extension if not exists pg_trgm schema extensions;

-- 2. CATEGORIAS: UNIQUE case-insensitive por empresa
create unique index if not exists idx_expense_categories_unique_name
  on public.expense_categories (company_id, lower(name));

-- 3. FORNECEDORES: índices trigram pra autocomplete fuzzy (tolera typo)
-- Busca "impact" encontra "IMPACTO DISTRIBUIDORA" mesmo que Mikael digite errado
create index if not exists idx_suppliers_legal_name_trgm
  on public.suppliers using gin (legal_name extensions.gin_trgm_ops);

create index if not exists idx_suppliers_trade_name_trgm
  on public.suppliers using gin (coalesce(trade_name, '') extensions.gin_trgm_ops);

-- Documentação inline
comment on index public.idx_expense_categories_unique_name is
  'DM Stack: categoria case-insensitive única por empresa';
comment on index public.idx_suppliers_legal_name_trgm is
  'Autocomplete fuzzy (pg_trgm) em razão social — padrão DM Stack';
comment on index public.idx_payables_dedupe is
  'Anti-duplicata de boleto: SHA256(CNPJ+valor+vencimento+linha digitável)';
