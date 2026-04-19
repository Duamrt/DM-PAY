# DM Pay Agent

Sincroniza dados do **iCommerce** (SQL Server local) pro **DM Pay** (Supabase) — a cada 15 min.

## O que ele faz

| Tabela iCommerce (lê) | Tabela DM Pay (grava) |
|---|---|
| VENDAS + VENDAS_RECEBIMENTOS | `daily_sales` (agregado por dia/forma) |
| MOV_CAIXA (tipo 'D') | `cash_withdrawals` (sangrias) |
| CLIENTES | `customers` |
| CONTAS_RECEBER + CONTAS_RECEBER_DADOS | `receivables` |

## Características

- **READ-ONLY no SQL Server** — só `SELECT WITH (NOLOCK)`, zero risco
- **Idempotente** — pode rodar 100x no mesmo dia, sempre dá o mesmo resultado (UPSERT)
- **Incremental** — clientes/contas-a-receber só sincronizam o que mudou desde a última vez
- **Logs com rotação** — mantém 30 dias, depois apaga sozinho
- **Modo dry-run** — testa sem enviar nada (`--dry-run`)

## Instalação (servidor do cliente)

### Pré-requisitos
- Windows Server 2012+ ou Windows 10+
- Python 3.8+ ([baixar](https://www.python.org/downloads/) — marcar "Add to PATH")
- ODBC Driver for SQL Server (já vem instalado se o iCommerce roda na máquina)

### Passos

1. Copiar a pasta `agent/` para `C:\dmpay-agent\`
2. Abrir CMD **como Administrador** nessa pasta
3. Rodar `install.bat`
4. Editar `config.ini` quando o Notepad abrir:
   - `company_id` = UUID da empresa no DM Pay
   - `service_role_key` = chave do Supabase (pedir pro Duam)
   - `connection_string` = ajustar instância se não for `.\SQLEXPRESS17`
5. Esperar o teste dry-run terminar — se aparecer "linhas", tá funcionando

A tarefa agendada **DM Pay Agent** roda a cada 15 minutos automaticamente.

## Comandos úteis

```bash
# Rodar manualmente uma vez
run.bat

# Testar sem enviar nada (dry-run)
venv\Scripts\python dmpay_agent.py --dry-run

# Sincronizar só vendas
venv\Scripts\python dmpay_agent.py --only sales

# Janela maior (recalcular últimos 30 dias de vendas)
venv\Scripts\python dmpay_agent.py --days-sales 30

# Ver tarefa agendada
schtasks /query /tn "DM Pay Agent"

# Remover a tarefa
schtasks /delete /tn "DM Pay Agent" /f
```

## Onde ficam os logs

`C:\dmpay-agent\logs\agent-YYYY-MM-DD.log`

Cada execução adiciona linhas tipo:
```
2026-04-19 16:00:00 [INFO] === DM Pay agent start | company=... | dry=False ===
2026-04-19 16:00:01 [INFO] conectando SQL Server (read-only)...
2026-04-19 16:00:03 [INFO] customers: 12 linhas (max_id=4521)
2026-04-19 16:00:05 [INFO] daily_sales: 35 linhas (5 dias x metodos)
2026-04-19 16:00:06 [INFO] cash_withdrawals: 8 linhas
2026-04-19 16:00:09 [INFO] receivables: 47 linhas (max_id=224355)
2026-04-19 16:00:09 [INFO] === fim em 9.3s ===
```

## Segurança

- `config.ini` está no `.gitignore` — credenciais nunca vão pro git
- Service role key do Supabase fica **só** nesse arquivo, na máquina do cliente
- Recomendação opcional: criar usuário SQL Server com permissão **só de SELECT**
  nas 8 tabelas usadas, em vez de Trusted Connection
