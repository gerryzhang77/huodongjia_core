#!/usr/bin/env bash
set -Eeuo pipefail
SERVER_HOST="${SERVER_HOST:-59.110.51.187}"
SERVER_USER="${SERVER_USER:-eventadmin}"
SERVER_PORT="${SERVER_PORT:-22}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/eventclubNew.pem}"
REMOTE_BASE=/home/eventadmin/eventclub
WEB_BASE=/var/www/eventclub
NODE_BIN=/opt/eventclub/node-v22.23.4-linux-x64/bin
[[ "$SERVER_HOST" =~ ^[a-zA-Z0-9.-]+$ && "$SERVER_USER" == eventadmin && "$SERVER_PORT" =~ ^[0-9]+$ ]] || exit 1
SSH_OPTS=(-p "$SERVER_PORT" -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o StrictHostKeyChecking=yes)
if [[ -n "${SSH_AGENT_SOCKET:-}" ]]; then SSH_OPTS+=(-o "IdentityAgent=$SSH_AGENT_SOCKET"); fi
remote() { ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" "$@"; }
remote_bash() {
  local command='bash -s --' value
  for value in "$@"; do printf -v value '%q' "$value"; command+=" $value"; done
  remote "$command"
}
