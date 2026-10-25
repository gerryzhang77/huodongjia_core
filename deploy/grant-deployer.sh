#!/usr/bin/env bash
# Run by an administrator on the application server; does not restart services.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run this script with sudo on the server.' >&2; exit 1; }
deployer=${1:?Usage: grant-deployer.sh <existing-login-user>}
[[ "$deployer" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ && "$deployer" != root && "$deployer" != eventadmin ]] || { echo 'Invalid personal login account.' >&2; exit 1; }
id "$deployer" >/dev/null
id eventadmin >/dev/null
[[ -d /etc/sudoers.d ]] || { echo '/etc/sudoers.d is missing.' >&2; exit 1; }
visudo -c
echo 'Review the existing application account privileges:'
sudo -l -U eventadmin
target="/etc/sudoers.d/eventclub-deploy-$deployer"
candidate=$(mktemp /etc/sudoers.d/.eventclub-deploy.XXXXXX)
trap 'rm -f "$candidate"' EXIT
printf '%s ALL=(eventadmin) NOPASSWD: ALL\n' "$deployer" > "$candidate"
chown root:root "$candidate"
chmod 0440 "$candidate"
visudo -cf "$candidate"
created=false
if [[ -e "$target" || -L "$target" ]]; then
  [[ -f "$target" && ! -L "$target" ]] && cmp -s "$candidate" "$target" || { echo "Refusing to replace different existing policy: $target" >&2; exit 1; }
else
  ln "$candidate" "$target"
  created=true
fi
if ! visudo -c || ! sudo -n -H -u "$deployer" -- sudo -n -H -u eventadmin -- /bin/bash -c 'test "$(id -un)" = eventadmin'; then
  if [[ "$created" == true ]]; then rm -f "$target"; fi
  echo 'Authorization validation failed; any newly installed rule was removed.' >&2
  exit 1
fi
echo "Authorized $deployer to execute commands as eventadmin: $target"
echo 'This grants full application-account access, including production configuration; no service was restarted.'
