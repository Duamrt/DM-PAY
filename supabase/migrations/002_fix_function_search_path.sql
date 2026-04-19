-- DM PAY — Migração 002
-- Fix: dmp_payable_dedupe_hash precisa de search_path fixo (warning advisor)
-- digest() vem do schema `extensions` no Supabase (pgcrypto), então incluímos no path

create or replace function public.dmp_payable_dedupe_hash(
  p_supplier_cnpj text, p_amount numeric, p_due_date date, p_boleto_line text default null
) returns text
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.digest(
    coalesce(p_boleto_line,'') || '|' || coalesce(p_supplier_cnpj,'') || '|' ||
    p_amount::text || '|' || p_due_date::text, 'sha256'), 'hex');
$$;
