# VPS setup (Ubuntu 24.04 / 26.04): website + API + database on one server

1. Log in to the VPS as root and run (one command, no domain needed):

       curl -fsSL https://raw.githubusercontent.com/mohanuue1-ENG/6.11mapweb/main/deploy/setup-server.sh | bash

   It installs nginx, Node, PostgreSQL and the firewall, makes the deploy key, gets free HTTPS for
   `<ip>.sslip.io` (a name that points at the IP), and prints at the end what to put into GitHub.
   With your own domain: `DOMAIN=yourdomain.com bash setup-server.sh` (point its A record at the IP first).

2. In GitHub put the printed values into Settings -> Environments -> **automatic deploy** -> Secrets
   (`DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_SSH_KEY`, `APP_ENV`), and the repository variable `DEPLOY_ENABLED=true`.
   Do not paste these values into any chat.

3. Push to `main` (or Actions -> CI/CD -> Run workflow). The server checks the checksum, switches to the new release,
   restarts the API and checks `/api/v1/health`; if the new release does not start it goes back to the old one.

Layout: `/srv/app/releases/<commit>`, `/srv/app/current` (link), `/srv/app/shared/app.env`.

Useful commands on the server:

    systemctl status app-api
    journalctl -u app-api -n 100 --no-pager
    curl http://127.0.0.1:4000/api/v1/health

Mobile app: build with `EXPO_PUBLIC_API_URL=https://<address>/api/v1` (Android needs HTTPS).
