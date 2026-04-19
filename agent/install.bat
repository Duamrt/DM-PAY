@echo off
REM ============================================================
REM DM Pay agent - instalador Windows
REM Cria venv, instala deps e agenda tarefa a cada 15min
REM ============================================================

setlocal
set DIR=%~dp0
cd /d "%DIR%"

echo.
echo === DM Pay agent installer ===
echo Diretorio: %DIR%
echo.

REM 1. Verifica Python
where python >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Python nao encontrado no PATH.
    echo Baixe em: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 2. Cria venv
if not exist "venv\" (
    echo Criando ambiente virtual...
    python -m venv venv
)

REM 3. Instala dependencias
echo Instalando dependencias...
call venv\Scripts\activate.bat
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERRO] Falha ao instalar pacotes.
    pause
    exit /b 1
)

REM 4. Cria config se nao existir
if not exist "config.ini" (
    copy config.example.ini config.ini >nul
    echo.
    echo === ATENCAO ===
    echo Arquivo config.ini criado a partir do exemplo.
    echo EDITE config.ini com as credenciais antes de continuar.
    echo.
    notepad config.ini
)

REM 5. Cria run.bat (script que a tarefa agendada vai chamar)
echo @echo off > run.bat
echo cd /d "%DIR%" >> run.bat
echo call venv\Scripts\activate.bat >> run.bat
echo python dmpay_agent.py >> run.bat

REM 6. Agenda tarefa (a cada 15min)
echo.
echo Criando tarefa agendada "DmSync" (a cada 15 min)...
schtasks /create /sc minute /mo 15 /tn "DmSync" /tr "\"%DIR%run.bat\"" /rl highest /f
if errorlevel 1 (
    echo [AVISO] Falha ao criar tarefa - rode como Administrador.
) else (
    echo Tarefa criada. Para remover: schtasks /delete /tn "DmSync" /f
)

REM 7. Teste dry-run
echo.
echo === Teste dry-run (nao envia nada) ===
python dmpay_agent.py --dry-run --days-sales 1
echo.
echo Se nao apareceu erro acima, esta tudo certo.
echo Pra rodar manualmente: run.bat
echo Logs em: %DIR%logs\
echo.
pause
endlocal
