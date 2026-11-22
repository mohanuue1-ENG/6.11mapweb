#!/usr/bin/env bash
# Runs on the VPS as the user "deploy". It is the ONLY thing the GitHub deploy key may run
# (forced command in ~deploy/.ssh/authorized_keys).
#
# GitHub sends:  SSH command text = "<commit sha> <sha256 of release.tar.gz>"
#                stdin           = tar of release.tar.gz + app.env
set -euo pipefail

APP_DIR=/srv/app
read -r SHA SUM <<< "${SSH_ORIGINAL_COMMAND:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "bad commit id"; exit 1; }
[[ "$SUM" =~ ^[0-9a-f]{64}$ ]] || { echo "bad checksum"; exit 1; }

IN="$(mktemp -d)"
trap 'rm -rf "$IN"' EXIT
tar -xf - -C "$IN" release.tar.gz app.env

echo "$SUM  $IN/release.tar.gz" | sha256sum -c - || { echo "checksum does not match, stopping"; exit 1; }

REL="$APP_DIR/releases/$SHA"
rm -rf "$REL"; mkdir -p "$REL"
tar -xzf "$IN/release.tar.gz" -C "$REL"
chmod -R a+rX "$REL"

# Settings: written outside the release so they survive between releases.
install -m 640 -g app "$IN/app.env" "$APP_DIR/shared/app.env"

PREV="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
ln -sfn "$REL" "$APP_DIR/current.new"
mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"

sudo /usr/bin/systemctl restart app-api

# The API must answer, otherwise go back to the previous release.
ok=""
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "the new release did not start"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$APP_DIR/current.new"; mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"
    sudo /usr/bin/systemctl restart app-api
    echo "went back to $PREV"
  fi
  exit 1
fi

# Keep the 5 newest releases.
ls -1dt "$APP_DIR"/releases/*/ | tail -n +6 | xargs -r rm -rf
echo "Deployed $SHA"
