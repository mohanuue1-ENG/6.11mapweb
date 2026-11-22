#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu VPS (24.04 / 26.04). Run as root:
#   curl -fsSL https://raw.githubusercontent.com/mohanuue1-ENG/6.11mapweb/main/deploy/setup-server.sh | bash
# Optional: DOMAIN=yourdomain.com (default: <ip>.sslip.io, a free name that points at the IP and gets HTTPS)
set -euo pipefail

REPO=https://github.com/mohanuue1-ENG/6.11mapweb.git
APP_DIR=/srv/app
export DEBIAN_FRONTEND=noninteractive

[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }

echo "== Packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg git openssl ufw nginx postgresql certbot python3-certbot-nginx

# The deploy files: next to this script, or downloaded from GitHub.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo /nonexistent)"
if [ ! -f "$HERE/receive-release.sh" ]; then
  rm -rf /root/app-src
  git clone --depth 1 "$REPO" /root/app-src
  HERE=/root/app-src/deploy
fi

IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
echo "Server address: $DOMAIN (IP $IP)"

echo "== Node.js 24"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  (curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs) || apt-get install -y nodejs npm
fi
node -v

echo "== Users and folders"
id -u deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
id -u app    >/dev/null 2>&1 || adduser --system --group --no-create-home app
usermod -aG app deploy
mkdir -p "$APP_DIR/releases" "$APP_DIR/shared"
chown -R deploy:app "$APP_DIR"
chmod 755 "$APP_DIR" "$APP_DIR/releases"
chmod 750 "$APP_DIR/shared"

echo "== Receiver script and permission to restart only the API"
install -m 755 "$HERE/receive-release.sh" /usr/local/bin/receive-release
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart app-api, /usr/bin/systemctl is-active app-api' > /etc/sudoers.d/deploy-app
chmod 440 /etc/sudoers.d/deploy-app
visudo -cf /etc/sudoers.d/deploy-app

echo "== API service"
install -m 644 "$HERE/app-api.service" /etc/systemd/system/app-api.service
systemctl daemon-reload
systemctl enable app-api

echo "== nginx"
sed "s/__DOMAIN__/$DOMAIN/g" "$HERE/nginx.conf" > /etc/nginx/sites-available/app
ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "== Firewall (SSH, HTTP, HTTPS only)"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "== PostgreSQL"
systemctl enable --now postgresql
DBURL=""
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='drive611'" | grep -q 1; then
  PW="$(openssl rand -hex 24)"
  sudo -u postgres psql -c "CREATE USER drive611 WITH PASSWORD '$PW';"
  sudo -u postgres psql -c "CREATE DATABASE drive611 OWNER drive611;"
  DBURL="postgres://drive611:$PW@127.0.0.1:5432/drive611"
fi

echo "== Deploy key for GitHub (generated here, the private part is shown once)"
KEY=/root/github-deploy-key
if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -f "$KEY" -N "" -C github-deploy >/dev/null
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  echo "command=\"/usr/local/bin/receive-release\",restrict $(cat $KEY.pub)" > /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys
  chmod 600 /home/deploy/.ssh/authorized_keys
  SHOWKEY=1
fi

echo "== HTTPS"
HTTPS=no
if certbot --nginx -d "$DOMAIN" --agree-tos --register-unsafely-without-email --non-interactive --redirect; then
  HTTPS=yes
fi
SCHEME=http; [ "$HTTPS" = yes ] && SCHEME=https

echo
echo "=================== COPY THESE INTO GITHUB ==================="
echo "Settings -> Environments -> automatic deploy -> Secrets:"
echo
echo "DEPLOY_HOST:"
echo "$IP"
echo
echo "DEPLOY_KNOWN_HOSTS:"
ssh-keyscan -t ed25519 "$IP" 2>/dev/null
echo
if [ "${SHOWKEY:-}" = 1 ]; then
  echo "DEPLOY_SSH_KEY (everything between the lines, with BEGIN and END):"
  echo "-----"
  cat "$KEY"
  echo "-----"
  echo
fi
if [ -n "$DBURL" ]; then
  JWT="$(openssl rand -hex 32)"
  echo "APP_ENV (fill in the three lines with ... ):"
  cat <<ENV
DATABASE_URL=$DBURL
DATABASE_SSL=false
JWT_ACCESS_SECRET=$JWT
CLIENT_URL=$SCHEME://$DOMAIN
APP_URL=$SCHEME://$DOMAIN
COOKIE_SAMESITE=lax
MAILJET_API_KEY=...
MAILJET_SECRET_KEY=...
MAIL_FROM=...
SEED_SUPER_ADMIN_EMAIL=...
SEED_SUPER_ADMIN_PASSWORD=...
ENV
  echo
fi
echo "Repository variable: DEPLOY_ENABLED = true"
echo "=============================================================="
echo "Website / API address: $SCHEME://$DOMAIN"
[ "$HTTPS" = yes ] || echo "HTTPS did not start. The site works on http://$DOMAIN; run:  certbot --nginx -d $DOMAIN"
