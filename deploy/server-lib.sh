#!/usr/bin/env bash
set -Eeuo pipefail
SERVER_HOST="${SERVER_HOST:-59.110.51.187}"
SERVER_USER="${SERVER_USER:-eventadmin}"
SERVER_PORT="${SERVER_PORT:-22}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/eventclubNew.pem}"
REMOTE_BASE=/home/eventadmin/eventclub
WEB_BASE=/var/www/eventclub
NODE_BIN=/opt/eventclub/node-v22.23.4-linux-x64/bin
[[ "$SERVER_HOST" =~ ^[a-zA-Z0-9.-]+$ && "$SERVER_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ && "$SERVER_PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid SSH host, user or port.' >&2; exit 1; }
SSH_OPTS=(-p "$SERVER_PORT" -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o StrictHostKeyChecking=yes)
if [[ -n "${SSH_AGENT_SOCKET:-}" ]]; then SSH_OPTS+=(-o "IdentityAgent=$SSH_AGENT_SOCKET"); fi
remote() {
  [[ "$#" == 1 ]] || { echo 'remote expects one shell command.' >&2; return 1; }
  local command quoted quote="'" escaped="'\\''"
  command="set -Eeuo pipefail; export HOME=/home/eventadmin PM2_HOME=/home/eventadmin/.pm2; export PATH='$NODE_BIN':/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; cd /home/eventadmin; $1"
  # POSIX shell quoting keeps commands and stdin intact through SSH and sudo.
  quoted=${command//"$quote"/"$escaped"}
  quoted="'$quoted'"
  if [[ "$SERVER_USER" == eventadmin ]]; then
    ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" "/bin/bash -c $quoted"
  else
    ssh "${SSH_OPTS[@]}" "$SERVER_USER@$SERVER_HOST" "sudo -n -H -u eventadmin -- /bin/bash -c $quoted"
  fi
}
remote_bash() {
  local command='bash -s --' value
  for value in "$@"; do printf -v value '%q' "$value"; command+=" $value"; done
  remote "$command"
}
