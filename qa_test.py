"""
QA DM Pay — verifica carregamento, erros JS, e testa botões não-destrutivos.
Conta: duam@edreng.com.br (DM Stack Master)
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
import time

BASE  = "https://duamrt.github.io/DM-PAY"
EMAIL = "duam@edreng.com.br"
PASS  = "admin123"

# Palavras que indicam botão destrutivo ou de navegação — pula
SKIP = {
    "excluir","deletar","remover","salvar","criar","adicionar","importar",
    "pagar","receber","cancelar","fechar caixa","registrar","lanccar",
    "novo","nova","gerar","confirmar","ok","sim","fechar","close",
    "torre de comando","configuracoes","meu plano","entrar","sair","logout",
    "dashboard","vendas","alertas","equipe","dre","calendario"
}

def skip_btn(txt):
    t = txt.lower().strip()
    return not t or len(t) < 2 or any(s in t for s in SKIP)

PAGES = [
    ("dashboard.html",        "Dashboard"),
    ("vendas.html",           "Vendas"),
    ("contas-a-pagar.html",   "Contas a Pagar"),
    ("contas-a-receber.html", "Contas a Receber"),
    ("calendario.html",       "Calendario"),
    ("despesas.html",         "Despesas Fixas"),
    ("dre.html",              "DRE"),
    ("fornecedores.html",     "Fornecedores"),
    ("historico-nfe.html",    "Historico NFe"),
    ("fluxo-caixa.html",      "Fluxo de Caixa"),
    ("evolucao-anual.html",   "Evolucao Anual"),
    ("alertas.html",          "Alertas"),
    ("equipe.html",           "Equipe"),
    ("configuracoes.html",    "Configuracoes"),
    ("meu-plano.html",        "Meu Plano"),
    ("admin.html",            "Torre de Comando"),
]

issues = []

def prob(pname, elem, msg):
    line = f"[{pname}] {elem} — {msg}"
    issues.append(line)
    print(f"    PROBLEMA: {line}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width":1440,"height":900})

    # -- LOGIN: obtém token e reutiliza em cada página
    print("[LOGIN] ...")
    setup = ctx.new_page()
    setup.goto(f"{BASE}/login.html", wait_until="domcontentloaded", timeout=15000)
    time.sleep(2)
    session = setup.evaluate(f"""async()=>{{
        const r = await sb.auth.signInWithPassword({{email:'{EMAIL}',password:'{PASS}'}});
        if(r.error) return null;
        return r.data.session;
    }}""")
    if not session:
        print("FALHA no login"); browser.close(); exit(1)
    access_token   = session["access_token"]
    refresh_token  = session["refresh_token"]
    setup.close()
    print(f"[LOGIN] OK\n")

    # -- TESTA CADA PÁGINA numa aba nova com a sessão injetada
    for slug, name in PAGES:
        print(f"[{name}]", end=" ", flush=True)

        page = ctx.new_page()
        console_errs = []
        page.on("console", lambda m: console_errs.append(m.text[:200])
                if m.type == "error" and not any(x in m.text.lower()
                for x in ["favicon","sw.js","net::err_aborted"]) else None)
        page.on("pageerror", lambda e: console_errs.append(f"JS_EXC:{str(e)[:200]}"))

        try:
            # Navega e injeta sessão antes do JS da página rodar
            page.goto(f"{BASE}/{slug}", wait_until="domcontentloaded", timeout=10000)
            # Injeta token no localStorage para o Supabase reconhecer
            page.evaluate(f"""()=>{{
                const key = 'sb-ufxldjdppaonskxhmosi-auth-token';
                localStorage.setItem(key, JSON.stringify({{
                    access_token:'{access_token}',
                    refresh_token:'{refresh_token}',
                    token_type:'bearer',
                    expires_in:3600,
                    expires_at: Math.floor(Date.now()/1000)+3600,
                    user:{{id:'placeholder'}}
                }}));
            }}""")
            # Aguarda JS carregar dados
            time.sleep(2)

            # Redirecionou pro login?
            if "login" in page.url:
                prob(name, "auth", "Redirecionou pro login")
                page.close(); continue

            # Erros JS críticos
            for e in console_errs:
                if any(x in e.lower() for x in ["uncaught","typeerror","referenceerror",
                        "syntaxerror","is not defined","cannot read","is not a function"]):
                    prob(name, "JS_ERROR", e[:150])

            # Conteúdo vazio?
            body_len = len(page.locator("body").inner_text().strip())
            if body_len < 40:
                prob(name, "conteudo", "Pagina vazia ou travada no spinner")

            # Botões visíveis — classifica e testa os seguros
            all_btns = page.locator("button:visible").all()
            safe_btns = []
            for b in all_btns:
                try:
                    txt = b.inner_text().strip()
                    if not skip_btn(txt):
                        safe_btns.append((b, txt[:40]))
                except: pass

            btn_errs = 0
            clicked = set()
            for btn, txt in safe_btns:
                if txt.lower() in clicked: continue
                clicked.add(txt.lower())
                orig_url = page.url
                try:
                    btn.scroll_into_view_if_needed()
                    btn.click(timeout=1500)
                    time.sleep(0.3)
                    # Voltou a navegar? Retorna à página
                    if page.url != orig_url:
                        page.goto(f"{BASE}/{slug}", wait_until="domcontentloaded", timeout=8000)
                        time.sleep(1)
                    else:
                        # Fecha modal/drawer se abriu
                        if page.locator(".modal.active, .drawer.open, [data-modal].active").count() > 0:
                            page.keyboard.press("Escape")
                            time.sleep(0.2)
                except Exception as e:
                    msg = str(e)
                    if not any(x in msg for x in ["detached","not visible","intercept","closed"]):
                        prob(name, f"btn '{txt}'", msg[:80])
                        btn_errs += 1

            # Erros novos após cliques
            for e in console_errs:
                if any(x in e.lower() for x in ["uncaught","typeerror","referenceerror","is not defined"]):
                    if not any(f"[{name}] JS_ERROR" in i for i in issues):
                        prob(name, "JS_pos_clique", e[:150])

            n_issues = sum(1 for i in issues if f"[{name}]" in i)
            status = "OK" if n_issues == 0 else f"PROB({n_issues})"
            print(f"{status} — {len(all_btns)} botoes ({len(safe_btns)} testados)")

        except Exception as e:
            prob(name, "crash", str(e)[:100])
            print(f"CRASH")

        page.close()

    browser.close()

# -- RELATORIO
print("\n" + "="*65)
ok = sum(1 for _,n in PAGES if not any(f"[{n}]" in i for i in issues))
print(f"RESULTADO: {ok}/{len(PAGES)} paginas sem problema")
print("="*65)
if issues:
    print(f"\n{len(issues)} PROBLEMA(S):\n")
    for i, iss in enumerate(issues, 1):
        print(f"  {i:02}. {iss}")
else:
    print("\nTudo OK!")
