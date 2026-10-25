#!/usr/bin/env bash
# Run with sudo on the new server; never collects a password.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run with sudo in your own terminal.' >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTBOT=/opt/eventclub/certbot/bin/certbot
attempt_log=$(mktemp /tmp/eventclub-certbot.XXXXXX)
chmod 600 "$attempt_log"
trap 'rm -f "$attempt_log"' EXIT
retry_network() {
  local attempt result
  for attempt in 1 2 3; do
    echo "Certificate operation attempt $attempt/3"
    set +e
    "$@" 2>&1 | tee "$attempt_log"
    result=${PIPESTATUS[0]}
    set -e
    [[ "$result" != 0 ]] || return 0
    # Only retry transient network errors, never domain-validation/configuration errors.
    if [[ "$attempt" == 3 ]] || ! grep -Eqi 'ReadTimeout|ConnectTimeout|ConnectionError|Read timed out|Connection timed out|Temporary failure in name resolution' "$attempt_log"; then
      return "$result"
    fi
    echo 'Transient certificate-service network error; retrying in 10 seconds.'
    sleep 10
  done
}
retry_network "$CERTBOT" certonly --webroot -w /var/www/eventclub/acme \
  --cert-name www.eventclub.cn -d www.eventclub.cn -d eventclub.cn \
  --keep-until-expiring --agree-tos --register-unsafely-without-email --non-interactive
bash "$HERE/bootstrap.sh" --https

# Two scheduled renewal checks per day remain; transient failures get two extra tries.
install -d -m 0755 /etc/systemd/system/eventclub-cert-renew.service.d
cat > /etc/systemd/system/eventclub-cert-renew.service.d/retry.conf <<'EOF'
[Unit]
StartLimitIntervalSec=3600
StartLimitBurst=3
[Service]
Restart=on-failure
RestartSec=300
EOF
systemctl daemon-reload
echo 'HTTPS is active. Testing automatic renewal against the staging CA.'
retry_network "$CERTBOT" renew --cert-name www.eventclub.cn --dry-run \
  --no-random-sleep-on-renew --run-deploy-hooks --non-interactive \
  --deploy-hook '/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx'
echo 'HTTPS activation and renewal rehearsal completed.'
