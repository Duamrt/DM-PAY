"""
DM Pay — Agentes de Auditoria (5 agentes + Claude API)
Lê dados já sincronizados no Supabase (read-only) e gera relatório inteligente.

Uso:
  python audit_agents.py --config config.ini
  python audit_agents.py --dry-run          # sem chamar Claude
  python audit_agents.py --only conciliacao
  python audit_agents.py --days 30
"""
import argparse
import configparser
import json
import logging
import math
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import requests

LOG = logging.getLogger("dmpay-audit")


# =============================================================================
# Infra compartilhada (mesmos padrões do dmpay_agent.py)
# =============================================================================

def load_config(path: Path) -> configparser.ConfigParser:
    if not path.exists():
        sys.exit(f"config nao encontrado: {path}")
    cfg = configparser.ConfigParser()
    cfg.read(path, encoding="utf-8-sig")
    return cfg


def setup_logging(log_dir: Path):
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"audit-{datetime.now():%Y-%m-%d}.log"
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    LOG.setLevel(logging.INFO)
    LOG.addHandler(fh)
    LOG.addHandler(sh)


def sb_get(cfg, table: str, params: dict) -> list:
    base = cfg["supabase"]["url"].rstrip("/")
    key  = cfg["supabase"]["service_role_key"]
    url  = f"{base}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    r = requests.get(url, headers=headers, params=params, timeout=30)
    if r.status_code >= 400:
        LOG.error("supabase GET %s -> %s %s", table, r.status_code, r.text[:300])
        r.raise_for_status()
    return r.json() if r.text else []


def date_range(days: int):
    today = date.today()
    start = today - timedelta(days=days)
    return start.isoformat(), today.isoformat()


def worst_status(*statuses):
    order = {"ok": 0, "warn": 1, "crit": 2}
    return max(statuses, key=lambda s: order.get(s, 0))


# =============================================================================
# Agente 1 — Integridade dos Dados
# =============================================================================

def agent_integridade(cfg, company_id: str, days: int) -> dict:
    findings = []
    status   = "ok"
    start, today = date_range(days)

    # 1a. sync_state: último sync de cada entidade
    try:
        rows = sb_get(cfg, "sync_state", {
            "company_id": f"eq.{company_id}",
            "select": "entity,last_sync_at,rows_synced",
        })
        cutoff = datetime.utcnow() - timedelta(hours=2)
        for r in rows:
            raw_at = r.get("last_sync_at", "")
            if not raw_at:
                findings.append({"nivel": "crit", "msg": f"sync_state/{r['entity']}: nunca sincronizado"})
                status = worst_status(status, "crit")
                continue
            last = datetime.fromisoformat(raw_at.replace("Z", "+00:00")).replace(tzinfo=None)
            if last < cutoff:
                delta_h = round((datetime.utcnow() - last).total_seconds() / 3600, 1)
                findings.append({"nivel": "warn", "msg": f"sync_state/{r['entity']}: último sync há {delta_h}h (> 2h)"})
                status = worst_status(status, "warn")
        if not rows:
            findings.append({"nivel": "warn", "msg": "sync_state: nenhum registro encontrado"})
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"sync_state: não acessível ({e})"})
        status = worst_status(status, "warn")

    # 1b. daily_sales: dias sem nenhum registro no período
    try:
        rows = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date": f"gte.{start}",
            "select": "sale_date",
        })
        dias_com_venda = {r["sale_date"] for r in rows}
        total_dias = (date.today() - date.fromisoformat(start)).days
        # Exclui domingos (dia 6) — ajuste se o Liberato abre domingo
        dias_esperados = [
            (date.fromisoformat(start) + timedelta(days=i)).isoformat()
            for i in range(total_dias)
            if (date.fromisoformat(start) + timedelta(days=i)).weekday() != 6
        ]
        gaps = [d for d in dias_esperados if d not in dias_com_venda]
        if gaps:
            findings.append({
                "nivel": "warn",
                "msg": f"daily_sales: {len(gaps)} dia(s) sem venda nos últimos {days} dias",
                "detalhe": gaps[-10:],  # últimos 10 gaps
            })
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"daily_sales: erro ao verificar gaps ({e})"})

    # 1c. cash_withdrawals sem operador
    try:
        rows = sb_get(cfg, "cash_withdrawals", {
            "company_id": f"eq.{company_id}",
            "withdrawal_date": f"gte.{start}",
            "operator": "is.null",
            "select": "withdrawal_date,amount",
        })
        if rows:
            total = sum(float(r.get("amount", 0)) for r in rows)
            findings.append({
                "nivel": "warn",
                "msg": f"cash_withdrawals: {len(rows)} sangria(s) sem operador — R$ {total:,.2f}",
            })
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"cash_withdrawals: erro ({e})"})

    # 1d. register_sessions: dias com sessão mas sem daily_sales
    try:
        sess_rows = sb_get(cfg, "register_sessions", {
            "company_id": f"eq.{company_id}",
            "session_date": f"gte.{start}",
            "select": "session_date",
        })
        dias_com_sessao = {r["session_date"] for r in sess_rows}
        rows_vendas = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date": f"gte.{start}",
            "select": "sale_date",
        })
        dias_com_venda_set = {r["sale_date"] for r in rows_vendas}
        orphan = dias_com_sessao - dias_com_venda_set
        if orphan:
            findings.append({
                "nivel": "warn",
                "msg": f"register_sessions: {len(orphan)} dia(s) com sessão PDV mas sem venda registrada",
                "detalhe": sorted(orphan)[-5:],
            })
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"register_sessions: não acessível ({e}) — tabela pode não existir"})

    if not findings:
        findings.append({"nivel": "ok", "msg": "Todos os dados chegando corretamente"})

    LOG.info("agente_integridade: status=%s findings=%d", status, len(findings))
    return {"status": status, "findings": findings}


# =============================================================================
# Agente 2 — Categorização
# =============================================================================

def agent_categorizacao(cfg, company_id: str, days: int) -> dict:
    findings = []
    status   = "ok"
    start, _ = date_range(days)
    start_90  = (date.today() - timedelta(days=90)).isoformat()

    # 2a. Payables sem categoria (últimos 90 dias)
    try:
        rows = sb_get(cfg, "payables", {
            "company_id":  f"eq.{company_id}",
            "category_id": "is.null",
            "due_date":    f"gte.{start_90}",
            "status":      "neq.cancelled",
            "select":      "amount",
            "limit":       "2000",
        })
        if rows:
            total = sum(float(r.get("amount", 0)) for r in rows)
            nivel = "crit" if len(rows) > 20 else "warn"
            findings.append({
                "nivel": nivel,
                "msg": f"payables: {len(rows)} conta(s) sem categoria — R$ {total:,.2f} (90 dias)",
            })
            status = worst_status(status, nivel)
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"payables sem categoria: erro ({e})"})

    # 2b. Fornecedores placeholder (legal_name começa com "Fornecedor ")
    try:
        rows = sb_get(cfg, "suppliers", {
            "company_id": f"eq.{company_id}",
            "legal_name":  "like.Fornecedor *",
            "select":      "legal_name,cnpj",
            "limit":       "200",
        })
        if rows:
            findings.append({
                "nivel": "warn",
                "msg": f"suppliers: {len(rows)} fornecedor(es) ainda como placeholder (sem nome real)",
                "detalhe": [r["cnpj"] for r in rows[:10]],
            })
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"suppliers placeholder: erro ({e})"})

    # 2c. Invoices sem supplier_id
    try:
        rows = sb_get(cfg, "invoices", {
            "company_id":  f"eq.{company_id}",
            "supplier_id": "is.null",
            "issue_date":  f"gte.{start}",
            "select":      "nf_number,issue_date,total",
            "limit":       "500",
        })
        if rows:
            total = sum(float(r.get("total", 0)) for r in rows)
            findings.append({
                "nivel": "warn",
                "msg": f"invoices: {len(rows)} NF-e sem fornecedor vinculado — R$ {total:,.2f}",
            })
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"invoices sem supplier: erro ({e})"})

    # 2d. Fixed expenses sem categoria
    try:
        rows = sb_get(cfg, "fixed_expenses", {
            "company_id":  f"eq.{company_id}",
            "category_id": "is.null",
            "active":      "eq.true",
            "select":      "description,amount",
        })
        if rows:
            total = sum(float(r.get("amount", 0)) for r in rows)
            findings.append({
                "nivel": "warn",
                "msg": f"fixed_expenses: {len(rows)} despesa(s) fixa(s) sem categoria — R$ {total:,.2f}/mês",
            })
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"fixed_expenses sem categoria: erro ({e})"})

    if not findings:
        findings.append({"nivel": "ok", "msg": "Todos os dados estão corretamente categorizados"})

    LOG.info("agente_categorizacao: status=%s findings=%d", status, len(findings))
    return {"status": status, "findings": findings}


# =============================================================================
# Agente 3 — Conciliação
# =============================================================================

def agent_conciliacao(cfg, company_id: str, days: int) -> dict:
    findings = []
    status   = "ok"
    start, today = date_range(days)

    # 3a. daily_sales vs register_sessions por dia
    try:
        sales_rows = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date":  f"gte.{start}",
            "select":     "sale_date,amount",
            "limit":      "5000",
        })
        # Agrega daily_sales por dia (excluindo troco negativo da conta)
        sales_by_day: dict[str, float] = {}
        for r in sales_rows:
            d = r["sale_date"]
            v = float(r.get("amount", 0))
            sales_by_day[d] = sales_by_day.get(d, 0) + v

        sess_rows = sb_get(cfg, "register_sessions", {
            "company_id":   f"eq.{company_id}",
            "session_date": f"gte.{start}",
            "select":       "session_date,total_vendas",
            "limit":        "5000",
        })
        sess_by_day: dict[str, float] = {}
        for r in sess_rows:
            d = r["session_date"]
            v = float(r.get("total_vendas", 0))
            sess_by_day[d] = sess_by_day.get(d, 0) + v

        divergencias = []
        for d in sorted(set(sales_by_day) & set(sess_by_day)):
            s  = sales_by_day[d]
            r  = sess_by_day[d]
            if s == 0 and r == 0:
                continue
            ref = max(abs(s), abs(r), 0.01)
            pct = abs(s - r) / ref * 100
            if pct > 1:
                divergencias.append({
                    "data": d,
                    "daily_sales": round(s, 2),
                    "register_sessions": round(r, 2),
                    "divergencia_pct": round(pct, 1),
                })

        if divergencias:
            nivel = "crit" if any(d["divergencia_pct"] > 5 for d in divergencias) else "warn"
            findings.append({
                "nivel": nivel,
                "msg": f"conciliacao vendas×PDV: {len(divergencias)} dia(s) com divergência > 1%",
                "detalhe": divergencias[:10],
            })
            status = worst_status(status, nivel)
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"conciliacao vendas×PDV: erro ({e})"})

    # 3b. Invoices sem payable vinculado
    try:
        inv_rows = sb_get(cfg, "invoices", {
            "company_id": f"eq.{company_id}",
            "issue_date": f"gte.{start}",
            "status":     "neq.cancelled",
            "select":     "id,nf_number,issue_date,total",
            "limit":      "500",
        })
        inv_ids = [r["id"] for r in inv_rows]

        linked_ids: set[str] = set()
        if inv_ids:
            # Busca payables que referenciam essas invoices
            pay_rows = sb_get(cfg, "payables", {
                "company_id": f"eq.{company_id}",
                "invoice_id": f"in.({','.join(inv_ids[:200])})",
                "select":     "invoice_id",
                "limit":      "500",
            })
            linked_ids = {r["invoice_id"] for r in pay_rows}

        sem_boleto = [r for r in inv_rows if r["id"] not in linked_ids]
        if sem_boleto:
            total = sum(float(r.get("total", 0)) for r in sem_boleto)
            findings.append({
                "nivel": "warn",
                "msg": f"invoices: {len(sem_boleto)} NF-e sem boleto cadastrado — R$ {total:,.2f}",
                "detalhe": [{"nf": r["nf_number"], "data": r["issue_date"], "valor": r["total"]}
                            for r in sem_boleto[:5]],
            })
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"invoices sem boleto: erro ({e})"})

    # 3c. Payables overdue há mais de 30 dias
    try:
        cutoff_overdue = (date.today() - timedelta(days=30)).isoformat()
        rows = sb_get(cfg, "payables", {
            "company_id": f"eq.{company_id}",
            "status":     "eq.overdue",
            "due_date":   f"lte.{cutoff_overdue}",
            "select":     "description,amount,due_date",
            "limit":      "200",
        })
        if rows:
            total = sum(float(r.get("amount", 0)) for r in rows)
            findings.append({
                "nivel": "crit",
                "msg": f"payables: {len(rows)} boleto(s) vencido(s) há mais de 30 dias — R$ {total:,.2f}",
                "detalhe": [{"desc": r["description"][:40], "data": r["due_date"], "valor": r["amount"]}
                            for r in rows[:5]],
            })
            status = worst_status(status, "crit")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"payables overdue: erro ({e})"})

    # 3d. Receivables overdue há mais de 60 dias
    try:
        cutoff_recv = (date.today() - timedelta(days=60)).isoformat()
        rows = sb_get(cfg, "receivables", {
            "company_id": f"eq.{company_id}",
            "status":     "eq.overdue",
            "due_date":   f"lte.{cutoff_recv}",
            "select":     "description,amount,due_date",
            "limit":      "200",
        })
        if rows:
            total = sum(float(r.get("amount", 0)) for r in rows)
            findings.append({
                "nivel": "warn",
                "msg": f"receivables: {len(rows)} conta(s) a receber vencida(s) há mais de 60 dias — R$ {total:,.2f}",
            })
            status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"receivables overdue: erro ({e})"})

    if not findings:
        findings.append({"nivel": "ok", "msg": "Todos os dados conciliados sem divergências"})

    LOG.info("agente_conciliacao: status=%s findings=%d", status, len(findings))
    return {"status": status, "findings": findings}


# =============================================================================
# Agente 4 — Relatório Financeiro
# =============================================================================

def agent_relatorio(cfg, company_id: str, days: int) -> dict:
    findings = []
    status   = "ok"
    today    = date.today().isoformat()
    start_7  = (date.today() - timedelta(days=7)).isoformat()
    start_30 = (date.today() - timedelta(days=30)).isoformat()
    prox_7   = (date.today() + timedelta(days=7)).isoformat()

    # 4a. Vendas últimos 7 e 30 dias por forma de pagamento
    try:
        rows_7 = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date":  f"gte.{start_7}",
            "select":     "payment_method,amount",
            "limit":      "2000",
        })
        rows_30 = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date":  f"gte.{start_30}",
            "select":     "payment_method,amount",
            "limit":      "5000",
        })

        def agg_by_method(rows):
            out: dict[str, float] = {}
            for r in rows:
                m = r.get("payment_method", "outro")
                out[m] = out.get(m, 0) + float(r.get("amount", 0))
            return out

        v7  = agg_by_method(rows_7)
        v30 = agg_by_method(rows_30)
        total_7  = sum(v7.values())
        total_30 = sum(v30.values())

        findings.append({
            "nivel": "ok",
            "msg": f"Vendas 7 dias: R$ {total_7:,.2f} | Vendas 30 dias: R$ {total_30:,.2f}",
            "detalhe": {
                "7_dias":  {k: round(v, 2) for k, v in sorted(v7.items(),  key=lambda x: -x[1])},
                "30_dias": {k: round(v, 2) for k, v in sorted(v30.items(), key=lambda x: -x[1])},
            },
        })
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"vendas: erro ({e})"})

    # 4b. Top 5 fornecedores por despesas (30 dias)
    try:
        rows = sb_get(cfg, "payables", {
            "company_id": f"eq.{company_id}",
            "due_date":   f"gte.{start_30}",
            "status":     "neq.cancelled",
            "select":     "amount,suppliers(legal_name)",
            "limit":      "2000",
        })
        sup_total: dict[str, float] = {}
        for r in rows:
            sup = (r.get("suppliers") or {})
            nome = sup.get("legal_name") or "Sem fornecedor"
            sup_total[nome] = sup_total.get(nome, 0) + float(r.get("amount", 0))
        top5 = sorted(sup_total.items(), key=lambda x: -x[1])[:5]
        findings.append({
            "nivel": "ok",
            "msg": "Top 5 fornecedores por despesas (30 dias)",
            "detalhe": [{"fornecedor": k, "total": round(v, 2)} for k, v in top5],
        })
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"top fornecedores: erro ({e})"})

    # 4c. Top 5 categorias por despesas (30 dias)
    try:
        rows = sb_get(cfg, "payables", {
            "company_id": f"eq.{company_id}",
            "due_date":   f"gte.{start_30}",
            "status":     "neq.cancelled",
            "select":     "amount,expense_categories(name)",
            "limit":      "2000",
        })
        cat_total: dict[str, float] = {}
        for r in rows:
            cat = (r.get("expense_categories") or {})
            nome = cat.get("name") or "Sem categoria"
            cat_total[nome] = cat_total.get(nome, 0) + float(r.get("amount", 0))
        top5_cat = sorted(cat_total.items(), key=lambda x: -x[1])[:5]
        findings.append({
            "nivel": "ok",
            "msg": "Top 5 categorias de despesa (30 dias)",
            "detalhe": [{"categoria": k, "total": round(v, 2)} for k, v in top5_cat],
        })
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"top categorias: erro ({e})"})

    # 4d. Contas a pagar vencendo nos próximos 7 dias
    try:
        rows = sb_get(cfg, "payables", {
            "company_id": f"eq.{company_id}",
            "status":     "eq.open",
            "due_date":   f"gte.{today}",
            "due_date":   f"lte.{prox_7}",
            "select":     "description,amount,due_date",
            "limit":      "200",
        })
        # Nota: dois due_date no dict — usar params list para evitar colisão
        rows = sb_get(cfg, "payables", {
            "company_id": f"eq.{company_id}",
            "status":     "eq.open",
            "select":     "description,amount,due_date",
            "limit":      "500",
        })
        rows_prox = [r for r in rows
                     if today <= r.get("due_date", "9999") <= prox_7]
        if rows_prox:
            total = sum(float(r.get("amount", 0)) for r in rows_prox)
            nivel = "warn" if total > 5000 else "ok"
            findings.append({
                "nivel": nivel,
                "msg": f"Vencimentos próximos 7 dias: {len(rows_prox)} conta(s) — R$ {total:,.2f}",
                "detalhe": [{"desc": r["description"][:40], "data": r["due_date"], "valor": r["amount"]}
                            for r in sorted(rows_prox, key=lambda x: x["due_date"])[:5]],
            })
            status = worst_status(status, nivel)
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"vencimentos proximos: erro ({e})"})

    # 4e. Contas a receber vencendo nos próximos 7 dias
    try:
        rows = sb_get(cfg, "receivables", {
            "company_id": f"eq.{company_id}",
            "status":     "eq.open",
            "select":     "description,amount,due_date",
            "limit":      "500",
        })
        rows_prox = [r for r in rows
                     if today <= r.get("due_date", "9999") <= prox_7]
        if rows_prox:
            total = sum(float(r.get("amount", 0)) for r in rows_prox)
            findings.append({
                "nivel": "ok",
                "msg": f"A receber próximos 7 dias: {len(rows_prox)} conta(s) — R$ {total:,.2f}",
            })
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"a receber proximos: erro ({e})"})

    LOG.info("agente_relatorio: status=%s findings=%d", status, len(findings))
    return {"status": status, "findings": findings}


# =============================================================================
# Agente 5 — Insights e Tendências
# =============================================================================

def agent_insights(cfg, company_id: str, days: int) -> dict:
    findings = []
    status   = "ok"

    # 5a. Tendência: semana atual vs semana anterior
    try:
        hoje   = date.today()
        ini_s1 = (hoje - timedelta(days=7)).isoformat()
        ini_s2 = (hoje - timedelta(days=14)).isoformat()
        fim_s2 = (hoje - timedelta(days=8)).isoformat()

        rows_s1 = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date":  f"gte.{ini_s1}",
            "select":     "amount",
            "limit":      "2000",
        })
        rows_s2 = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date":  f"gte.{ini_s2}",
            "sale_date":  f"lte.{fim_s2}",
            "select":     "amount",
            "limit":      "2000",
        })
        # Filtro manual para evitar colisão de chave dupla no dict
        rows_s2 = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "select":     "sale_date,amount",
            "limit":      "5000",
        })
        rows_s2 = [r for r in rows_s2 if ini_s2 <= r["sale_date"] <= fim_s2]

        total_s1 = sum(float(r.get("amount", 0)) for r in rows_s1)
        total_s2 = sum(float(r.get("amount", 0)) for r in rows_s2)

        if total_s2 > 0:
            var_pct = (total_s1 - total_s2) / total_s2 * 100
            sinal   = "▲" if var_pct >= 0 else "▼"
            nivel   = "ok" if var_pct >= -10 else "warn"
            findings.append({
                "nivel": nivel,
                "msg": (f"Tendência vendas: {sinal} {abs(var_pct):.1f}% "
                        f"(semana atual R$ {total_s1:,.2f} vs anterior R$ {total_s2:,.2f})"),
            })
            status = worst_status(status, nivel)
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"tendencia vendas: erro ({e})"})

    # 5b. Sangria fora do padrão (> média + 2σ)
    try:
        start_30 = (date.today() - timedelta(days=30)).isoformat()
        rows = sb_get(cfg, "cash_withdrawals", {
            "company_id":      f"eq.{company_id}",
            "withdrawal_date": f"gte.{start_30}",
            "select":          "withdrawal_date,amount,operator",
            "limit":           "500",
        })
        if len(rows) >= 3:
            valores = [float(r.get("amount", 0)) for r in rows]
            media   = sum(valores) / len(valores)
            variancia = sum((v - media) ** 2 for v in valores) / len(valores)
            sigma   = math.sqrt(variancia)
            limite  = media + 2 * sigma
            outliers = [r for r in rows if float(r.get("amount", 0)) > limite]
            if outliers:
                findings.append({
                    "nivel": "warn",
                    "msg": (f"Sangrias atípicas: {len(outliers)} acima de "
                            f"R$ {limite:,.2f} (média R$ {media:,.2f} + 2σ)"),
                    "detalhe": [{"data": r["withdrawal_date"], "valor": r["amount"],
                                 "operador": r.get("operator")} for r in outliers[:5]],
                })
                status = worst_status(status, "warn")
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"sangrias outlier: erro ({e})"})

    # 5c. Dia da semana mais forte e mais fraco
    try:
        start_30 = (date.today() - timedelta(days=30)).isoformat()
        rows = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date":  f"gte.{start_30}",
            "select":     "sale_date,amount",
            "limit":      "5000",
        })
        dow_total: dict[int, float] = {}
        dow_count: dict[int, int]   = {}
        for r in rows:
            d   = date.fromisoformat(r["sale_date"])
            dow = d.weekday()
            dow_total[dow] = dow_total.get(dow, 0) + float(r.get("amount", 0))
            dow_count[dow] = dow_count.get(dow, 0) + 1
        if dow_total:
            DIAS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
            medias  = {k: dow_total[k] / dow_count[k] for k in dow_total}
            melhor  = max(medias, key=lambda k: medias[k])
            pior    = min(medias, key=lambda k: medias[k])
            findings.append({
                "nivel": "ok",
                "msg": (f"Padrão semanal: {DIAS_PT[melhor]} é o dia mais forte "
                        f"(R$ {medias[melhor]:,.2f}/dia) | "
                        f"{DIAS_PT[pior]} é o mais fraco (R$ {medias[pior]:,.2f}/dia)"),
            })
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"padrao semanal: erro ({e})"})

    # 5d. Forma de pagamento com maior crescimento (PIX vs crédito vs dinheiro)
    try:
        start_30 = (date.today() - timedelta(days=30)).isoformat()
        mid      = (date.today() - timedelta(days=15)).isoformat()
        rows_all = sb_get(cfg, "daily_sales", {
            "company_id": f"eq.{company_id}",
            "sale_date":  f"gte.{start_30}",
            "select":     "sale_date,payment_method,amount",
            "limit":      "5000",
        })
        primeira: dict[str, float] = {}
        segunda:  dict[str, float] = {}
        for r in rows_all:
            m = r.get("payment_method", "outro")
            v = float(r.get("amount", 0))
            if r["sale_date"] < mid:
                primeira[m] = primeira.get(m, 0) + v
            else:
                segunda[m]  = segunda.get(m, 0) + v
        crescimentos = []
        for m in set(list(primeira) + list(segunda)):
            p = primeira.get(m, 0)
            s = segunda.get(m, 0)
            if p > 100:
                pct = (s - p) / p * 100
                crescimentos.append((m, pct, s))
        if crescimentos:
            crescimentos.sort(key=lambda x: -x[1])
            maior = crescimentos[0]
            findings.append({
                "nivel": "ok",
                "msg": (f"Forma de pgto em crescimento: {maior[0]} "
                        f"{'+' if maior[1] >= 0 else ''}{maior[1]:.1f}% "
                        f"(R$ {maior[2]:,.2f} na 2ª quinzena)"),
            })
    except Exception as e:
        findings.append({"nivel": "warn", "msg": f"crescimento metodo pgto: erro ({e})"})

    if not any(f["nivel"] in ("warn", "crit") for f in findings):
        status = "ok"

    LOG.info("agente_insights: status=%s findings=%d", status, len(findings))
    return {"status": status, "findings": findings}


# =============================================================================
# Claude API — gera narrativa a partir dos findings
# =============================================================================

def claude_narrate(cfg, company_id: str, all_results: dict) -> str:
    try:
        import anthropic
    except ImportError:
        return "[anthropic não instalado — rode: pip install anthropic]"

    api_key = cfg.get("anthropic", "api_key", fallback="")
    model   = cfg.get("anthropic", "model", fallback="claude-haiku-4-5-20251001")

    if not api_key or api_key == "COLE_AQUI_A_ANTHROPIC_API_KEY":
        return "[ANTHROPIC_API_KEY não configurada em config.ini]"

    client = anthropic.Anthropic(api_key=api_key)

    system_prompt = (
        "Você é um auditor financeiro especializado em varejo, analisando os dados do "
        "Liberato Supermercados pelo sistema DM Pay. "
        "Receberá um JSON com os achados de 5 agentes de auditoria. "
        "Gere um relatório executivo em português (máximo 600 palavras), com: "
        "1) Situação geral (ok/atenção/crítico); "
        "2) Principais problemas encontrados com impacto financeiro quando disponível; "
        "3) Top 3 ações recomendadas priorizadas por urgência. "
        "Seja direto, use números concretos do JSON. Não repita todos os dados, destaque o que importa."
    )

    user_content = json.dumps(all_results, ensure_ascii=False, indent=2)

    LOG.info("claude_narrate: chamando %s...", model)
    msg = client.messages.create(
        model=model,
        max_tokens=800,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_content}],
    )

    narrativa = msg.content[0].text if msg.content else ""
    LOG.info("claude_narrate: %d tokens usados (input=%d output=%d)",
             msg.usage.input_tokens + msg.usage.output_tokens,
             msg.usage.input_tokens, msg.usage.output_tokens)
    return narrativa


# =============================================================================
# Orquestrador principal
# =============================================================================

AGENTS = {
    "integridade":   agent_integridade,
    "categorizacao": agent_categorizacao,
    "conciliacao":   agent_conciliacao,
    "relatorio":     agent_relatorio,
    "insights":      agent_insights,
}


def main():
    p = argparse.ArgumentParser(description="DM Pay Audit Agents — auditoria inteligente via Claude API")
    p.add_argument("--config",   default="config.ini")
    p.add_argument("--dry-run",  action="store_true", help="roda agentes mas não chama Claude API")
    p.add_argument("--days",     type=int, default=30, help="janela de análise em dias (default: 30)")
    p.add_argument("--only",     choices=list(AGENTS), default=None,
                   help="roda apenas um agente específico")
    args = p.parse_args()

    base = Path(__file__).parent
    cfg  = load_config(base / args.config)
    setup_logging(base / "logs")

    company_id = cfg["app"]["company_id"]
    LOG.info("=== DM Pay Audit Agents | company=%s | days=%d | dry=%s ===",
             company_id, args.days, args.dry_run)

    # Executa agentes selecionados
    results: dict[str, dict] = {}
    for name, fn in AGENTS.items():
        if args.only and name != args.only:
            continue
        LOG.info("--- agente: %s ---", name)
        try:
            results[name] = fn(cfg, company_id, args.days)
        except Exception as e:
            LOG.exception("agente %s falhou: %s", name, e)
            results[name] = {"status": "warn", "findings": [{"nivel": "warn", "msg": str(e)}]}

    # Status geral
    status_geral = worst_status(*[r["status"] for r in results.values()])

    # Narrativa Claude (pula em dry-run ou --only)
    narrativa = ""
    if not args.dry_run and not args.only:
        narrativa = claude_narrate(cfg, company_id, results)
    elif args.dry_run:
        narrativa = "[dry-run: Claude não chamado]"

    # Monta output final
    output = {
        "run_at":       datetime.utcnow().isoformat() + "Z",
        "company_id":   company_id,
        "days":         args.days,
        "status_geral": status_geral,
        "agents":       results,
        "narrativa":    narrativa,
    }

    # Salva JSON
    out_path = base / "logs" / f"audit-{datetime.now():%Y-%m-%d}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    LOG.info("=== STATUS GERAL: %s | salvo em %s ===", status_geral.upper(), out_path)

    # Imprime resumo no console
    print(f"\n{'='*60}")
    print(f"AUDITORIA DM PAY — STATUS: {status_geral.upper()}")
    print(f"{'='*60}")
    for name, res in results.items():
        print(f"\n[{res['status'].upper()}] {name.capitalize()}")
        for f in res.get("findings", []):
            print(f"  • {f['msg']}")
    if narrativa and not args.dry_run:
        print(f"\n{'='*60}")
        print("NARRATIVA CLAUDE:")
        print(f"{'='*60}")
        print(narrativa)
    print(f"\nJSON salvo em: {out_path}")


if __name__ == "__main__":
    main()
