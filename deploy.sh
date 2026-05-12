#!/bin/bash
# DM Pay deploy — atualiza versao + commit + push
# Regra Estrategia/02-DM-Pay/Restricoes.md: deploy exige teste com conta Liberato.
# Use --skip-check apenas em hotfix urgente (registra no commit message).
set -e

MSG="${1:-update}"
SKIP_CHECK=0
for arg in "$@"; do
  case "$arg" in
    --skip-check|--no-liberato|-y|--yes)
      SKIP_CHECK=1
      ;;
  esac
done

if [ "$SKIP_CHECK" -eq 0 ]; then
  if [ ! -t 0 ]; then
    cat <<'NONINT' >&2

ERRO: deploy.sh precisa de TTY pra confirmar checklist Liberato.
Pra rodar nao-interativo (CI, hotfix urgente), use:

    ./deploy.sh "msg" --skip-check

NONINT
    exit 2
  fi

  cat <<'CHECKLIST'

==================================================================
  DM PAY · CHECKLIST PRE-DEPLOY  (regra Restricoes.md)
==================================================================
  Liberato e cliente vivo. Bug em prod = ligacao do Reginaldo hoje.

  Antes de subir, confirme que voce ja:
    [ ] Logou local com conta Liberato
    [ ] Validou fluxo de RECEBIMENTO sem erro
    [ ] Validou fluxo de CONCILIACAO sem erro
    [ ] Validou DASHBOARD carregando sem erro JS
    [ ] Console do browser limpo (sem erro vermelho)

  Hotfix urgente sem teste: ./deploy.sh "msg" --skip-check
==================================================================

CHECKLIST
  read -p "Testou com Liberato? Digite SIM pra continuar: " resp
  if [ "$resp" != "SIM" ]; then
    echo ""
    echo "Deploy abortado. Testa com a conta Liberato e roda de novo."
    exit 1
  fi
  echo ""
fi

if [ "$SKIP_CHECK" -eq 1 ]; then
  MSG="[skip-liberato-check] $MSG"
fi

VERSION="v$(date +%m%d%H%M)"

# Atualiza sw.js — novo CACHE_NAME força browser a baixar tudo de novo
sed -i "s/dmpay-mobile-v[^']*/dmpay-mobile-${VERSION}/" sw.js

# Atualiza apenas a linha da versao em dmpay-version.js (preserva auto-update logic)
sed -i "s/DMPAY_VERSION = 'v[^']*'/DMPAY_VERSION = '${VERSION}'/" dmpay-version.js

# Atualiza ?v= do script tag dmpay-version.js em todos os HTMLs (evita loop de reload por cache)
find . -name "*.html" -not -path "./.git/*" -exec sed -i "s|dmpay-version\.js[^\"']*|dmpay-version.js?v=${VERSION}|g" {} \;

# Cache-bust também o sentry-init.js (mesma versão)
find . -name "*.html" -not -path "./.git/*" -exec sed -i "s|js/sentry-init\.js[^\"']*|js/sentry-init.js?v=${VERSION}|g" {} \;

git add -A

# Pre-deploy check — varre diff staged contra secrets/SQL destrutivo/RLS aberta
if [ "$SKIP_CHECK" -ne 1 ] && [ -f "$HOME/.claude/scripts/pre-deploy-check.sh" ]; then
  bash "$HOME/.claude/scripts/pre-deploy-check.sh" || exit 1
fi

git commit -m "${VERSION} ${MSG}"
git push origin dev

# Sync main = dev (Gitflow: dev é a fonte da verdade)
git checkout main
git reset --hard dev
git push --force-with-lease origin main
git checkout dev

echo "✓ ${VERSION} no ar · https://duamrt.github.io/DM-PAY/dashboard.html"
