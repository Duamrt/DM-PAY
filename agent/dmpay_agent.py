"""
DM Pay — Agente local de sincronização iCommerce → Supabase.
Read-only no SQL Server (apenas SELECT WITH NOLOCK).
"""
import argparse
import configparser
import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, date
from pathlib import Path

import pyodbc
import requests

LOG = logging.getLogger("dmpay-agent")
SOURCE = "icommerce"

FRP_TO_METHOD = {
    1: "dinheiro",
    2: "cheque",
    3: "credito",      # cartão genérico (legado)
    4: "a_prazo",      # FATURADO no iCommerce
    5: "outro",        # vale
    6: "debito",
    7: "credito",
    8: "pix",
    9: "pix",          # pix pos
}


def to_iso_date(v):
    """Aceita date/datetime/str e devolve YYYY-MM-DD."""
    if v is None:
        return None
    if isinstance(v, str):
        return v[:10]
    if hasattr(v, "date"):
        return v.date().isoformat()
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)[:10]


def to_iso_datetime(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return str(v)


def setup_logging(log_dir: Path, retention_days: int = 30):
    log_dir.mkdir(parents=True, exist_ok=True)
    # Rotação: apaga logs mais velhos que retention_days
    cutoff = time.time() - retention_days * 86400
    for old in log_dir.glob("agent-*.log"):
        try:
            if old.stat().st_mtime < cutoff:
                old.unlink()
        except OSError:
            pass

    log_file = log_dir / f"agent-{datetime.now():%Y-%m-%d}.log"
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    LOG.setLevel(logging.INFO)
    LOG.addHandler(fh)
    LOG.addHandler(sh)


def load_config(path: Path) -> configparser.ConfigParser:
    if not path.exists():
        sys.exit(f"config nao encontrado: {path}")
    cfg = configparser.ConfigParser()
    cfg.read(path, encoding="utf-8")
    return cfg


def sql_connect(cfg) -> pyodbc.Connection:
    conn_str = cfg["sqlserver"]["connection_string"]
    LOG.info("conectando SQL Server (read-only)...")
    cn = pyodbc.connect(conn_str, autocommit=True, readonly=True)
    cn.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED").close()
    return cn


def sb_request(cfg, method, path, params=None, json_body=None, prefer=None):
    base = cfg["supabase"]["url"].rstrip("/")
    key = cfg["supabase"]["service_role_key"]
    url = f"{base}/rest/v1/{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    r = requests.request(method, url, headers=headers, params=params,
                         data=json.dumps(json_body) if json_body is not None else None,
                         timeout=60)
    if r.status_code >= 400:
        LOG.error("supabase %s %s -> %s %s", method, path, r.status_code, r.text[:500])
        r.raise_for_status()
    if r.text:
        try:
            return r.json()
        except json.JSONDecodeError:
            return None
    return None


def sb_upsert(cfg, table, rows, on_conflict, dry_run):
    if not rows:
        return 0
    if dry_run:
        LOG.info("[DRY] %s -> %d linhas (sample=%s)", table, len(rows), rows[0])
        return len(rows)
    # PostgREST aceita até ~1000 linhas por POST sem problema
    chunk = 500
    total = 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i+chunk]
        sb_request(cfg, "POST", table,
                   params={"on_conflict": on_conflict},
                   json_body=batch,
                   prefer="resolution=merge-duplicates,return=minimal")
        total += len(batch)
    return total


def get_sync_state(cfg, company_id, entity):
    rows = sb_request(cfg, "GET", "sync_state", params={
        "company_id": f"eq.{company_id}",
        "source_system": f"eq.{SOURCE}",
        "entity": f"eq.{entity}",
        "select": "*",
    })
    return rows[0] if rows else None


def update_sync_state(cfg, company_id, entity, last_external_id, rows_synced, dry_run):
    payload = [{
        "company_id": company_id,
        "source_system": SOURCE,
        "entity": entity,
        "last_external_id": int(last_external_id),
        "last_sync_at": datetime.utcnow().isoformat() + "Z",
        "rows_synced": int(rows_synced),
    }]
    if dry_run:
        LOG.info("[DRY] sync_state %s -> last_id=%s rows=%s", entity, last_external_id, rows_synced)
        return
    sb_request(cfg, "POST", "sync_state",
               params={"on_conflict": "company_id,source_system,entity"},
               json_body=payload,
               prefer="resolution=merge-duplicates,return=minimal")


# ---------------- jobs ----------------

def job_daily_sales(cfg, cn, company_id, days, dry_run):
    """Agrega CUPOM_FISCAL_RECEBIMENTOS (NFCe do PDV) por dia/forma. Idempotente (UPSERT).

    Notas:
      - VENDAS no iCommerce parou em 06/01/2023. Vendas atuais (NFCe/PDV) vão pra CFR.
      - CFR_TROCO é o troco devolvido ao cliente (sai do dinheiro). Vai como linha
        separada (payment_method='troco', amount NEGATIVO) pra que SUM(amount) por dia
        bata com o "Total das Vendas" do relatório iCommerce.
    """
    cutoff = datetime.now() - timedelta(days=days)

    # Query 1: recebimentos por (dia, forma) — filtrando cupons NÃO cancelados
    sql_receb = """
        SELECT
            CONVERT(date, CFR.CFR_DATA) AS dia,
            CFR.CFR_COD_FORMA_PGTO AS frp,
            SUM(CFR.CFR_VALOR) AS total_recebido
        FROM CUPOM_FISCAL_RECEBIMENTOS CFR WITH (NOLOCK)
        LEFT JOIN CUPOM_FISCAL CUP WITH (NOLOCK) ON CUP.CUP_CODIGO = CFR.CFR_CODIGO_CUPOM
        WHERE CFR.CFR_DATA >= ?
          AND ISNULL(CUP.CUP_SITUACAO, 'N') <> 'C'
        GROUP BY CONVERT(date, CFR.CFR_DATA), CFR.CFR_COD_FORMA_PGTO
    """
    rows_receb = cn.cursor().execute(sql_receb, cutoff).fetchall()

    # Query 2: troco por dia — direto da header CUPOM_FISCAL
    sql_troco = """
        SELECT
            CONVERT(date, CUP_EMISSAO) AS dia,
            SUM(ISNULL(CUP_TROCO, 0)) AS troco
        FROM CUPOM_FISCAL WITH (NOLOCK)
        WHERE CUP_EMISSAO >= ?
          AND ISNULL(CUP_SITUACAO, 'N') <> 'C'
        GROUP BY CONVERT(date, CUP_EMISSAO)
        HAVING SUM(ISNULL(CUP_TROCO, 0)) > 0
    """
    rows_troco = cn.cursor().execute(sql_troco, cutoff).fetchall()

    # Consolida por (dia, método) — mistura PIX (8+9), CARTAO 3+7 etc
    bucket = {}
    troco_por_dia = {}
    for dia, frp, total_recebido in rows_receb:
        method = FRP_TO_METHOD.get(int(frp), "outro")
        dia_iso = to_iso_date(dia)
        bucket[(dia_iso, method)] = bucket.get((dia_iso, method), 0) + float(total_recebido or 0)
    for dia, troco in rows_troco:
        troco_por_dia[to_iso_date(dia)] = float(troco or 0)

    payload = [{
        "company_id": company_id,
        "sale_date": d,
        "payment_method": m,
        "amount": round(v, 2),
        "source": SOURCE,
    } for (d, m), v in bucket.items()]

    # Adiciona linha de troco por dia (negativa) — apenas onde há troco
    for d, t in troco_por_dia.items():
        if t > 0:
            payload.append({
                "company_id": company_id,
                "sale_date": d,
                "payment_method": "troco",
                "amount": round(-t, 2),
                "source": SOURCE,
            })

    sent = sb_upsert(cfg, "daily_sales", payload,
                     on_conflict="company_id,sale_date,payment_method,source",
                     dry_run=dry_run)
    LOG.info("daily_sales: %d linhas (%d dias x metodos + %d trocos)",
             sent, len({k[0] for k in bucket}), len(troco_por_dia))
    return sent


def job_cash_withdrawals(cfg, cn, company_id, days, dry_run):
    """MOV_CAIXA.MOV_TIPO='D' agregado por dia/operador."""
    cutoff = datetime.now() - timedelta(days=days)
    sql = """
        SELECT
            CONVERT(date, MOV_DATA) AS dia,
            ISNULL(CONVERT(varchar(50), MOV_FUNCIONARIO), '') AS operador,
            SUM(MOV_VALOR) AS total,
            STRING_AGG(CONVERT(varchar(MAX), ISNULL(MOV_OBS, '')), ' | ') AS notas
        FROM MOV_CAIXA WITH (NOLOCK)
        WHERE MOV_TIPO = 'D'
          AND MOV_DATA >= ?
          AND MOV_STATUS <> 'C'
        GROUP BY CONVERT(date, MOV_DATA), MOV_FUNCIONARIO
    """
    rows = cn.cursor().execute(sql, cutoff).fetchall()
    payload = []
    for dia, operador, total, notas in rows:
        payload.append({
            "company_id": company_id,
            "withdrawal_date": to_iso_date(dia),
            "amount": round(float(total or 0), 2),
            "operator": operador or None,
            "notes": (notas or "")[:500] or None,
            "source": SOURCE,
        })
    sent = sb_upsert(cfg, "cash_withdrawals", payload,
                     on_conflict="company_id,withdrawal_date,amount,operator,source",
                     dry_run=dry_run)
    LOG.info("cash_withdrawals: %d linhas", sent)
    return sent


def job_customers(cfg, cn, company_id, dry_run):
    """Sincroniza CLIENTES alterados desde o last_sync_at."""
    state = get_sync_state(cfg, company_id, "customers")
    last_at = state["last_sync_at"] if state else "1900-01-01T00:00:00Z"
    # SQL Server quer datetime, não ISO Z
    last_dt = datetime.fromisoformat(last_at.replace("Z", "+00:00")).replace(tzinfo=None)

    sql = """
        SELECT TOP 5000
            CLI_CODIGO, CLI_NOME, CLI_CPFCNPJ, CLI_FONE, CLI_CELULAR,
            CLI_EMAIL, CLI_SITUACAO, CLI_ULT_ALTERACAO
        FROM CLIENTES WITH (NOLOCK)
        WHERE ISNULL(CLI_ULT_ALTERACAO, CLI_CADASTRO) > ?
        ORDER BY ISNULL(CLI_ULT_ALTERACAO, CLI_CADASTRO)
    """
    rows = cn.cursor().execute(sql, last_dt).fetchall()
    payload = []
    max_id = state["last_external_id"] if state else 0
    for r in rows:
        payload.append({
            "company_id": company_id,
            "external_id": str(r.CLI_CODIGO),
            "external_source": SOURCE,
            "name": (r.CLI_NOME or "").strip()[:200] or "—",
            "cpf_cnpj": (r.CLI_CPFCNPJ or "").strip() or None,
            "phone": (r.CLI_CELULAR or r.CLI_FONE or "").strip() or None,
            "email": (r.CLI_EMAIL or "").strip() or None,
            "active": (r.CLI_SITUACAO or 1) == 1,
        })
        max_id = max(max_id, int(r.CLI_CODIGO))

    sent = sb_upsert(cfg, "customers", payload,
                     on_conflict="company_id,external_source,external_id",
                     dry_run=dry_run)
    update_sync_state(cfg, company_id, "customers", max_id, sent, dry_run)
    LOG.info("customers: %d linhas (max_id=%s)", sent, max_id)
    return sent


def job_receivables(cfg, cn, company_id, days_pgto_window, dry_run, max_history_months=24):
    """
    Sincroniza CONTAS_RECEBER_DADOS (parcelas).
    Estratégia:
      - novos: CRD_ID > last_external_id
      - atualizações de status: CRD_DATA_PGTO >= ultimos N dias
      - corte de história: ignora parcelas com vencimento mais antigo que max_history_months
    """
    state = get_sync_state(cfg, company_id, "receivables")
    last_id = state["last_external_id"] if state else 0
    # Passar como datetime objects (pyodbc converte certo) — string pode falhar comparação
    cutoff_pgto = datetime.now() - timedelta(days=days_pgto_window)
    cutoff_hist = datetime.now() - timedelta(days=max_history_months * 30)

    # FK real do iCommerce (validada 2026-04-20): CR.CON_VENDAS = CRD.CRD_CODIGO.
    # CRD_CODIGO referencia a venda/cupom fiscal; o header CR liga venda → cliente via CON_VENDAS.
    # Cobre 100% das parcelas recentes (24m). LEFT JOIN por segurança pra parcelas pré-migração.
    sql = """
        SELECT
            CRD.CRD_ID, CRD.CRD_CODIGO, CRD.CRD_PARCELA,
            CRD.CRD_VALOR, CRD.CRD_VENCIMENTO_AT, CRD.CRD_DATA_PGTO,
            CRD.CRD_VALOR_PAGO,
            CR.CON_CLIENTE, CR.CON_EMISSAO, CR.CON_DOCUMENTO, CR.CON_OBS
        FROM CONTAS_RECEBER_DADOS CRD WITH (NOLOCK)
        LEFT JOIN CONTAS_RECEBER CR WITH (NOLOCK) ON CR.CON_VENDAS = CRD.CRD_CODIGO
        WHERE CRD.CRD_VENCIMENTO_AT >= ?
          AND (
                CRD.CRD_ID > ?
             OR (CRD.CRD_DATA_PGTO IS NOT NULL AND CRD.CRD_DATA_PGTO >= ?)
          )
        ORDER BY CRD.CRD_ID
    """
    rows = cn.cursor().execute(sql, cutoff_hist, last_id, cutoff_pgto).fetchall()

    # Lookup customer_id (uuid Supabase) por external_id (CLI_CODIGO)
    cli_codes = sorted({int(r.CON_CLIENTE) for r in rows if r.CON_CLIENTE})
    cust_map = {}
    if cli_codes:
        # busca em chunks
        for i in range(0, len(cli_codes), 200):
            chunk = cli_codes[i:i+200]
            in_list = ",".join(str(c) for c in chunk)
            res = sb_request(cfg, "GET", "customers", params={
                "company_id": f"eq.{company_id}",
                "external_source": f"eq.{SOURCE}",
                "external_id": f"in.({in_list})",
                "select": "id,external_id",
            }) or []
            for c in res:
                cust_map[c["external_id"]] = c["id"]

    today = date.today()
    today_iso = today.isoformat()
    payload = []
    max_id = last_id
    for r in rows:
        if r.CRD_DATA_PGTO:
            status = "received"
        else:
            venc_iso = to_iso_date(r.CRD_VENCIMENTO_AT)
            if venc_iso and venc_iso < today_iso:
                status = "overdue"
            else:
                status = "open"

        payload.append({
            "company_id": company_id,
            "customer_id": cust_map.get(str(int(r.CON_CLIENTE))) if r.CON_CLIENTE else None,
            "external_id": str(r.CRD_ID),
            "external_source": SOURCE,
            "description": (r.CON_OBS or f"Doc {r.CON_DOCUMENTO or ''} parc {r.CRD_PARCELA}").strip()[:200],
            "amount": round(float(r.CRD_VALOR or 0), 2),
            "issue_date": to_iso_date(r.CON_EMISSAO) or today.isoformat(),
            "due_date": to_iso_date(r.CRD_VENCIMENTO_AT) or today.isoformat(),
            "received_at": to_iso_datetime(r.CRD_DATA_PGTO),
            "status": status,
            "origin": "sale",
        })
        max_id = max(max_id, int(r.CRD_ID))

    sent = sb_upsert(cfg, "receivables", payload,
                     on_conflict="company_id,external_source,external_id",
                     dry_run=dry_run)
    update_sync_state(cfg, company_id, "receivables", max_id, sent, dry_run)
    LOG.info("receivables: %d linhas (max_id=%s)", sent, max_id)
    return sent


# ---------------- main ----------------

def main():
    p = argparse.ArgumentParser(description="DM Pay agent — sync iCommerce → Supabase (read-only)")
    p.add_argument("--config", default="config.ini")
    p.add_argument("--dry-run", action="store_true", help="só lê e mostra, não envia nada")
    p.add_argument("--days-sales", type=int, default=7, help="janela em dias pra recalcular daily_sales/withdrawals")
    p.add_argument("--days-receivables", type=int, default=14, help="janela pra capturar pagamentos recentes")
    p.add_argument("--only", choices=["sales", "withdrawals", "customers", "receivables"], default=None)
    args = p.parse_args()

    base = Path(__file__).parent
    cfg = load_config(base / args.config)
    setup_logging(base / "logs")

    company_id = cfg["app"]["company_id"]
    LOG.info("=== DM Pay agent start | company=%s | dry=%s ===", company_id, args.dry_run)
    t0 = time.time()

    cn = sql_connect(cfg)
    try:
        jobs = []
        if args.only in (None, "customers"):
            jobs.append(("customers", lambda: job_customers(cfg, cn, company_id, args.dry_run)))
        if args.only in (None, "sales"):
            jobs.append(("sales", lambda: job_daily_sales(cfg, cn, company_id, args.days_sales, args.dry_run)))
        if args.only in (None, "withdrawals"):
            jobs.append(("withdrawals", lambda: job_cash_withdrawals(cfg, cn, company_id, args.days_sales, args.dry_run)))
        if args.only in (None, "receivables"):
            jobs.append(("receivables", lambda: job_receivables(cfg, cn, company_id, args.days_receivables, args.dry_run)))

        for name, fn in jobs:
            try:
                fn()
            except Exception as e:
                LOG.exception("job %s falhou: %s", name, e)
    finally:
        cn.close()

    LOG.info("=== fim em %.1fs ===", time.time() - t0)


if __name__ == "__main__":
    main()
