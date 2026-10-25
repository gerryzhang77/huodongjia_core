#!/usr/bin/env bash
# Run on the NEW server as root. Never accepts or records a password.
set -Eeuo pipefail
MODE="${1:---plan}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE=/home/eventadmin/eventclub
NODE_ROOT=/opt/eventclub/node-v22.23.4-linux-x64
CERTBOT=/opt/eventclub/certbot/bin/certbot
case "$MODE" in
  --plan)
    echo 'Install Nginx/rsync/build tools, Node 22.23.4 (SHA256 verified), PM2 7.1.1, Certbot 5.8.0.'
    echo 'Create private app directories and public static directories; enable PM2 and Nginx systemd services.'
    echo 'HTTP serves ACME challenges and maintenance (503) until HTTPS activation. No DNS or database changes.'
    exit 0;;
  --apply|--https) [[ "$EUID" == 0 ]] || { echo 'Run with sudo in your own terminal.' >&2; exit 1; };;
  *) exit 1;;
esac
if [[ "$MODE" == --https ]]; then
  test -s /etc/letsencrypt/live/www.eventclub.cn/fullchain.pem
  test -s /etc/letsencrypt/live/www.eventclub.cn/privkey.pem
  test -s /var/www/eventclub/current/index.html
  cp /etc/nginx/conf.d/eventclub.conf "$BASE/bootstrap/eventclub.before-https.conf"
  install -m 0644 "$HERE/nginx-https.conf" /etc/nginx/conf.d/eventclub.conf
  if ! nginx -t; then cp "$BASE/bootstrap/eventclub.before-https.conf" /etc/nginx/conf.d/eventclub.conf; exit 1; fi
  systemctl reload nginx
  echo 'HTTPS configuration activated.'
  exit 0
fi
test "$(uname -m)" = x86_64
id eventadmin >/dev/null
if [[ -e /etc/nginx/conf.d/eventclub.conf ]]; then
  echo 'Existing Eventclub Nginx configuration found; stop for review.' >&2; exit 1
fi
dnf install -y nginx rsync xz tar gzip python3-pip gcc-c++ make cmake
install -d -m 0755 /opt/eventclub
if [[ ! -x "$NODE_ROOT/bin/node" ]]; then
  curl --fail --location --retry 2 --connect-timeout 10 --max-time 300 \
    https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz \
    -o /opt/eventclub/node-v22.23.4-linux-x64.tar.xz
  printf '%s  %s\n' 1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce \
    /opt/eventclub/node-v22.23.4-linux-x64.tar.xz | sha256sum -c -
  tar -xJf /opt/eventclub/node-v22.23.4-linux-x64.tar.xz -C /opt/eventclub
fi
export PATH="$NODE_ROOT/bin:$PATH"
npm install --global --prefix "$NODE_ROOT" pm2@7.1.1 --no-audit --no-fund
if [[ ! -x "$CERTBOT" ]]; then python3 -m venv /opt/eventclub/certbot; fi
/opt/eventclub/certbot/bin/pip install --disable-pip-version-check certbot==5.8.0
install -d -o eventadmin -g eventadmin -m 0700 "$BASE" "$BASE/backend" "$BASE/backend/releases" "$BASE/config" "$BASE/backups" "$BASE/shared"
for name in uploads models public matching-jobs logs; do install -d -o eventadmin -g eventadmin -m 0700 "$BASE/shared/$name"; done
install -d -o eventadmin -g eventadmin -m 0755 /var/www/eventclub /var/www/eventclub/releases /var/www/eventclub/assets /var/www/eventclub/acme
install -d -o eventadmin -g eventadmin -m 0700 /home/eventadmin/.pm2
if [[ ! -e /home/eventadmin/.pm2/dump.pm2 ]]; then
  printf '[]\n' > /home/eventadmin/.pm2/dump.pm2
  chown eventadmin:eventadmin /home/eventadmin/.pm2/dump.pm2
  chmod 0600 /home/eventadmin/.pm2/dump.pm2
fi
cat > /etc/systemd/system/pm2-eventadmin.service <<EOF
[Unit]
Description=Eventclub PM2 process manager
After=network-online.target
Wants=network-online.target
[Service]
Type=forking
User=eventadmin
Environment=PATH=$NODE_ROOT/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
Environment=PM2_HOME=/home/eventadmin/.pm2
PIDFile=/home/eventadmin/.pm2/pm2.pid
ExecStart=$NODE_ROOT/bin/pm2 resurrect
ExecReload=$NODE_ROOT/bin/pm2 reload all
ExecStop=$NODE_ROOT/bin/pm2 kill
Restart=on-failure
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
EOF
install -m 0644 "$HERE/nginx-http.conf" /etc/nginx/conf.d/eventclub.conf
cat > /etc/logrotate.d/eventclub <<'EOF'
/home/eventadmin/eventclub/shared/logs/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
    su eventadmin eventadmin
}
EOF
cat > /etc/systemd/system/eventclub-cert-renew.service <<EOF
[Unit]
Description=Renew Eventclub TLS certificates
[Service]
Type=oneshot
ExecStart=$CERTBOT renew --quiet --deploy-hook "/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx"
EOF
cat > /etc/systemd/system/eventclub-cert-renew.timer <<'EOF'
[Unit]
Description=Twice daily Eventclub certificate renewal
[Timer]
OnCalendar=*-*-* 04,16:15:00
RandomizedDelaySec=1800
Persistent=true
[Install]
WantedBy=timers.target
EOF
nginx -t
systemctl daemon-reload
systemctl enable --now pm2-eventadmin nginx eventclub-cert-renew.timer
echo 'Bootstrap completed; HTTP maintenance is ready. Backend, frontend and DNS are not activated by this script.'
