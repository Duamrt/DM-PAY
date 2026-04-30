#!/bin/bash
# DM Pay deploy — atualiza versao + commit + push
set -e

MSG="${1:-update}"
VERSION="v$(date +%m%d%H%M)"

# Atualiza sw.js — novo CACHE_NAME força browser a baixar tudo de novo
sed -i "s/dmpay-mobile-v[^']*/dmpay-mobile-${VERSION}/" sw.js

# Atualiza apenas a linha da versao em dmpay-version.js (preserva auto-update logic)
sed -i "s/DMPAY_VERSION = 'v[^']*'/DMPAY_VERSION = '${VERSION}'/" dmpay-version.js

git add -A
git commit -m "${VERSION} ${MSG}"
git push origin dev

# Sync main = dev (Gitflow: dev é a fonte da verdade)
git checkout main
git reset --hard dev
git push --force-with-lease origin main
git checkout dev

echo "✓ ${VERSION} no ar · https://duamrt.github.io/DM-PAY/dashboard.html"
