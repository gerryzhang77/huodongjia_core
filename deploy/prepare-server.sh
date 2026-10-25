#!/usr/bin/env bash
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/server-lib.sh"
MODE="${1:---plan}"
bash "$HERE/bootstrap.sh" --plan
echo "Upload target: $SERVER_USER@$SERVER_HOST:$REMOTE_BASE/bootstrap"
[[ "$MODE" == --apply ]] || { [[ "$MODE" == --plan ]]; exit; }
remote "umask 077; mkdir -p '$REMOTE_BASE/bootstrap'"
tar -cf - -C "$HERE" bootstrap.sh nginx-http.conf nginx-https.conf |
  remote "tar -xf - -C '$REMOTE_BASE/bootstrap'"
remote "sha256sum '$REMOTE_BASE/bootstrap/bootstrap.sh' '$REMOTE_BASE/bootstrap/nginx-http.conf' '$REMOTE_BASE/bootstrap/nginx-https.conf'"
echo "Review the scripts, then run sudo bash $REMOTE_BASE/bootstrap/bootstrap.sh --apply in your own SSH terminal."
