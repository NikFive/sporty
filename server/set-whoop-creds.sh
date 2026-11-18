#!/usr/bin/env bash
# Записать ключи WHOOP на сервер и перезапустить API.
# Использование: server/set-whoop-creds.sh <CLIENT_ID> <CLIENT_SECRET>
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 CLIENT_ID CLIENT_SECRET"; exit 1; }
ssh root@72.56.96.233 "set -e
sed -i 's|^WHOOP_CLIENT_ID=.*|WHOOP_CLIENT_ID=$1|; s|^WHOOP_CLIENT_SECRET=.*|WHOOP_CLIENT_SECRET=$2|' /etc/sporty/whoop.env
sync; systemctl restart sporty-api; sleep 1; systemctl is-active sporty-api"
curl -s https://72-56-96-233.sslip.io/api/health; echo
