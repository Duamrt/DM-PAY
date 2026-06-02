# DM Pay — Contexto Completo para Codex
**Gerado em:** 2026-06-02  
**Fonte:** memória Claude Code + Obsidian `08_DM PAY/` + repo `~/dmpay/`

---

## O que é

SaaS B2B de controle financeiro para mercados, farmácias, autopeças.  
**Dor resolvida:** dono sem visibilidade do fluxo diário, boletos no Excel, ninguém sabe o que vence amanhã.

---

## Stack

| Item | Valor |
|---|---|
| Frontend | HTML + CSS + JS vanilla (sem framework) |
| Backend | Supabase (PostgreSQL) — projeto `ufxldjdppaonskxhmosi` |
| Deploy | `./deploy.sh "mensagem"` → GitHub Pages (branch `main`) |
| Branches | `dev` → `main` (merge automático após validar) |
| Repo local | `~/dmpay/` e `~/OneDrive/Documentos/DM PAY/` (Codex) |
| URL produção | `dmpayapp.com.br` |
| Preview | `https://duamrt.github.io/DM-PAY/` |
| Agente DmSync | Python em `C:\ProgramData\Microsoft\DmSync\` no SERVLIBERATO |

**NUNCA push manual** — `deploy.sh` é obrigatório (cache busting do SW).

---

## Cliente piloto ativo

**Supermercado Liberato** (Jupi-PE, CNPJ 01.056.558/0001-51)  
- ~R$ 960k/mês vendas, ~R$ 576k/mês compras  
- ERP: iCommerce (SQL Server 2017 — SERVLIBERATO)  
- Reginaldo (dono, mobile, só consulta) + Mikael (admin, desktop, lança boletos)  
- Contrato: R$ 1.500 implantação + R$ 399/mês via Asaas recorrente  

---

## Estado atual — O que está NO AR (2026-06-02)

### Telas (26 HTMLs)
`dashboard`, `contas-a-pagar`, `contas-a-receber`, `calendario`, `fluxo-caixa`, `dre`, `vendas`, `despesas`, `alertas`, `historico-nfe`, `importar-xml`, `fornecedores`, `categorias`, `equipe`, `configuracoes`, `meu-plano`, `mobile`, `admin`, `insights`, `evolucao-anual`, `wizard`, `design-system`, `offline`, `landing`, `login`, `whatsapp-preview`

### Backend / Infra
- Auth + multi-tenant RLS (cada empresa isolada)  
- Asaas billing LIVE (recorrente pix/boleto/cartão, cliente escolhe)  
- Importação XML NF-e com anti-duplicata por `nfe_key`  
- Agente Python read-only lendo SQL Server iCommerce em produção (daily 19:30)  
- DRE mensal com Taxas Cielo, impostos por média histórica  
- Sentry Replay ativo (DSN `b02dbb8b...`, masking LGPD)  
- CSP + SRI em 26 HTMLs  
- PWA precache 20 assets + `offline.html`  
- Backup off-site diário (GitHub Actions → pg_dump v17 → GPG AES-256)  
- Healthcheck pg_cron 2x/dia (14h + 00h UTC)  
- MFA (TOTP + e-mail OTP) em `js/mfa.js`  
- Signup público bloqueado (allowlist `dmp_signup_allowlist` one-shot)  
- PostHog analytics (`phc_CtiNTixDvDa6Dd5BdyY2EByA3Z6AzUhomCjmEcb2kJ4f`)  

### Auditoria de segurança 2026-05-10 (8 game-overs fechados)
1. Signup público virava platform admin (handle_new_user ignorava metadata do client) ✅
2. Self-upgrade trial→pro sem pagar (trigger `trg_companies_block_self_billing_change`) ✅
3. `valor` arbitrário em asaas-criar-assinatura (v11 — só admin master cria) ✅
4. XSS armazenado em fornecedores/alertas/mobile/configuracoes (função `esc()`) ✅
5. Banco aceitava amount negativo (4 CHECK constraints) ✅
6. Signup público via bypass (`dmp_signup_allowlist` + trigger profundidade) ✅
7. Service Role plaintext no PC da Liberato (env var Machine scope + chave rotacionada) ✅
8. Frontend XSS em produção (deploy `v05101253`) ✅

### Onda 0 Mikael — entregue 2026-05-17 (v05171204)
Card vermelho "Fluxo de Caixa Torto" na home mobile (`mobile.html`).  
- **RPC `get_payables_situation(p_company_id, p_today)`** — retorna vencidos_count, vencidos_total, dias_sem_baixa, ultimo_baixador_email, baixas_mes, operador_phone, operador_name. SECURITY INVOKER, só `authenticated`.  
- Card aparece no topo do `viewResumo` com botão "Falar com operador" (wa.me com mensagem dinâmica).  
- Fallback safe: se RPC erro ou 0 vencidos → card oculto.  
- Dados Liberato no deploy: 235 boletos vencidos = R$ 445.835, 14 dias sem baixa.  

**Estratégia:** mostrar erro operacional em R$ de impacto pro dono — nunca acusar o Mikael diretamente.

### Lockdown REVOKE EXECUTE anon (2026-06-01)
Funções trigger do DM Pay tiveram `REVOKE EXECUTE FROM PUBLIC,anon,authenticated` aplicado.  
Funções retornam contexto `trigger` — chamada direta retorna erro mas é inócua pra disparo legítimo.

---

## Pendentes (próximas frentes — não iniciar sem OK do Duam)

| # | Item | Prioridade |
|---|---|---|
| 1 | WhatsApp diário automático (Evolution API + pg_cron 06:15) | Alta |
| 2 | Wizard onboarding 5 passos (obrigatório antes do 2º cliente) | Alta |
| 3 | Investigar `CUPOM_FISCAL_RECEBIMENTOS` (vendas atuais PDV iCommerce) | Média |
| 4 | Onda 1 Mikael (observar impacto da Onda 0 antes de iniciar) | Aguardando |
| 5 | Hotmail Graph para leitura NF-e por e-mail | Backlog |
| 6 | MFA para usuários além do admin | Backlog |
| 7 | Headers HTTP segurança (HSTS, X-Content-Type) via Cloudflare | Backlog |
| 8 | HMAC no webhook Asaas | Backlog |

**Ducal (2º cliente) — frio até agosto/2026. Não pingar antes de 2026-08-08.**

---

## Design

- **Cores:** fundo #0F172A, primary #F59E0B (âmbar), CTA #8B5CF6 (violeta), glassmorphism
- **Tipografia:** Fira Code (DM Pay override) / JetBrains Mono
- **Ícones:** Lucide SVG line 1.5px — ZERO emojis em produção
- **Touch targets:** mín 44×44px
- **Filosofia:** Brutalismo + Minimalismo funcional

---

## Regras de negócio imutáveis

1. **Anti-duplicata:** NF-e por `nfe_key`, boleto por SHA-256(CNPJ+valor+vencimento+linha_digitável)
2. **Cadastro inteligente XML:** busca fornecedor por CNPJ, cria só se não existe — nunca duplica
3. **Autocomplete obrigatório** em qualquer campo com >15 itens — NUNCA `<select>` com scroll
4. **Fechamento mensal imutável:** após `closings`, dados do mês não editam (exceto platform admin)
5. **Auditoria obrigatória:** todo CRUD grava em `audit_log` com before/after jsonb
6. **Boleto exige linha digitável válida:** 44, 47 ou 48 dígitos (validado no frontend E no banco)
7. **DM Pay = app do DONO** — NUNCA botões transacionais (Receber/Pagar/XML) na home mobile
8. **DM Pay NÃO TOCA EM FISCAL** — boundary rígido com contador, recusar qualquer pedido de Hub Fiscal/NCM/CFOP

---

## Gotchas críticos (armadilhas que já queimaram)

### Banco / Supabase
- **`verify_jwt: false` SEMPRE** nas Edge Functions — legacy JWT desativada, auth interno via `sb.auth.getUser(jwt)`
- **NUNCA UNIQUE em `customers.cpf_cnpj`** — ERPs legados têm CPF duplicado como comportamento normal
- **PostgREST `ON CONFLICT` só aceita UNIQUE INDEX puro** — sem `WHERE` parcial, sem expressão
- **Timezone financeiro: NUNCA `new Date(iso)`** para data — usar `[y,m,d].split('-')` para evitar offset
- **PostgREST limita 1000 rows** — usar RPC para consultas grandes (ex: `get_yoy_sales`)
- **TROCO e SANGRIA negativos** — não tratar como saída no cálculo de fluxo
- **Supabase keys:** usar `sb_secret_...` (novas), NUNCA as `eyJ...` (legacy desativadas)
- **NUNCA `IS NOT NULL`** em filtros SQL do agente iCommerce — descarta dados. Usar `ISNULL(campo, 0)`

### Deploy / Frontend
- **Deploy SEMPRE via `./deploy.sh`** — push manual não faz cache busting do SW
- **DOM: NUNCA `appendChild`/reparent** em elemento existente — cria duplicata ou some
- **`DMPAY_UI`:** expõe `.open`, `.confirm` e `.alert` (alertar sem cancelar) — os três existem em `js/ui-modal.js:132`
- **`closeDrawer`:** privado em IIFE — usar `DMPAY_CP.closeDrawer()` ou `window.closeDrawer = closeDrawer`
- **`unsafe-inline` em `script-src` é necessário** — DM Pay tem inline event handlers em massa nos HTMLs

### Agente DmSync (SERVLIBERATO)
- **pyodbc + datetime:** passar objeto `datetime` diretamente, NUNCA string ISO (quebra no SQL Server com locale BR)
- **VENDAS iCommerce parou em 06/01/2023** — vendas atuais do PDV vão para `CUPOM_FISCAL_RECEBIMENTOS`
- **Tarefa Windows silent:** usar `pythonw.exe`, não `python.exe`
- **Filtro `own_cnpj`:** 73 NF-es do CNPJ `01056558000151` (próprio Reginaldo) são bloqueadas no sync

### Tela Vendas (CRÍTICA — não quebrar)
- Card lateral: 5 linhas fixas (Dinheiro, Crédito, Débito, PIX, Fiado) + Troco condicional
- **Dinheiro = valor BRUTO** (o que entrou no PDV)
- **Troco** só aparece quando `formas.troco < 0`, em vermelho
- Fórmula líquido: `totalVendasDia + totalFiadoRecebido − totalSangria`
- Timezone filtro: `.gte('received_at', dataIso + 'T00:00:00Z')` — **não trocar por cast `.eq(::date, ...)`**
- Versão estável de referência: `v04200542` — se regredir, diff contra esse

---

## Supabase Migrations aplicadas

```
001 — schema inicial
002 — fix function search_path
003 — uniqueness + autocomplete indexes
004 — boleto line validation
005 — audit_log uuid + ip
019 — asaas billing extras
020 — get_payables_situation (RPC Onda 0 Mikael — versionada retroativamente 2026-06-02)
(+ migrations segurança 2026-05-10 via SQL direto, ainda sem arquivo)
```

## Edge Functions ativas

| Function | Versão | Notas |
|---|---|---|
| `asaas-webhook` | v7 | fallback auto por `customer_id` |
| `asaas-criar-assinatura` | v11 | só platform admin, valor livre |
| `asaas-gerenciar-assinatura` | — | — |
| `asaas-checar-atrasos` | — | exige `x-cron-secret` |
| `criar-membro` | v5 | adiciona na allowlist antes de criar |

---

## Regras de trabalho

- Commitar e push automático após fix/feature — sem perguntar
- Merge `dev`→`main` automático após validar
- `node -c` em todo JS antes de subir
- NUNCA dizer "pronto" sem verificar de fato
- **Módulo por módulo** — 1 frente completa + deploy + validação, só depois próxima
- Resposta em português brasileiro
- Respostas breves e diretas — sem narrar o processo, só o resultado

---

## Objetivo sugerido para a 1ª frente no Codex

**Inventário completo do código atual:** ler módulo por módulo (JS por JS, HTML por HTML) e devolver um diagnóstico — o que está OK, o que tem dívida técnica, o que está desatualizado vs o que a memória diz.  
Isso serve de base para qualquer frente seguinte sem risco de editar o que não deve.

Alternativas se quiser ir direto pra uma feature:
- `"WhatsApp diário"` — próximo item mais valioso pro Reginaldo
- `"Validar Onda 0 Mikael"` — verificar se o card `get_payables_situation` está funcionando com dados reais de hoje
- `"Auditar divergência Obsidian vs código"` — Obsidian parou em 2026-05-03, código foi muito mais longe

---

## Checklist de saúde antes de qualquer deploy

- [ ] `node -c js/[arquivo].js` — zero erros
- [ ] Abrir no `npx serve -s .` local e testar tela modificada
- [ ] Confirmar que tela carrega sem erro no console
- [ ] `./deploy.sh "mensagem"` (nunca push manual)
- [ ] Verificar URL em produção e confirmar comportamento
