#!/bin/bash
# Run as root on the dedicated Lianum VM, after bootstrap.sh.
# Both arguments describe the reviewed local artifact, never wallet data.
set -euo pipefail
test "$(id -u)" = 0
test "$#" = 2
bundle=$(realpath "$1")
expected_sha256=$2
[[ "$expected_sha256" =~ ^[a-f0-9]{64}$ ]]
actual_sha256=$(sha256sum "$bundle" | cut -d ' ' -f 1)
test "$actual_sha256" = "$expected_sha256"
release=/opt/lianum/releases/$expected_sha256
test ! -e "$release"
install -d -m 0755 "$release"
tar --extract --gzip --file "$bundle" --directory "$release" --no-same-owner --no-same-permissions
chmod 0755 "$release" "$release/bin/node"
python3 - "$release" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['profile'] == 'LIANUM_PUBLIC_WALLET_DEPLOYMENT_V1'
assert hashlib.sha256((root / 'bin/node').read_bytes()).hexdigest() == manifest['nodeSHA256']
for row in manifest['files']:
    path = root / row['path']
    assert path.resolve().is_relative_to(root.resolve())
    data = path.read_bytes()
    assert len(data) == row['bytes']
    assert hashlib.sha256(data).hexdigest() == row['sha256']
PY
runuser -u lianum -- "$release/bin/node" --input-type=module -e \
  'await import(process.argv[1]); console.log("IMPORT_OK_AS_LIANUM")' \
  "$release/packages/backend/src/public-wallet/http-service-v1.mjs"
if ! test -f /etc/lianum/public-wallet.json; then
  install -m 0640 -o root -g lianum "$release/infra/google-cloud/api-server/config.example.json" /etc/lianum/public-wallet.json
fi
install -m 0644 "$release/infra/google-cloud/api-server/lianum-public-wallet.service" /etc/systemd/system/lianum-public-wallet.service
caddy_config="$release/infra/google-cloud/api-server/Caddyfile.example"
if test -f /etc/caddy/lianum-paeg-transport.pem; then
  caddy_config="$release/infra/google-cloud/paeg-engine/Caddyfile.example"
fi
caddy validate --config "$caddy_config" --adapter caddyfile
install -m 0644 "$caddy_config" /etc/caddy/Caddyfile
ln -s "$release" /opt/lianum/current.next
mv -Tf /opt/lianum/current.next /opt/lianum/current
systemctl daemon-reload
systemctl enable lianum-public-wallet caddy
systemctl restart lianum-public-wallet
systemctl reload-or-restart caddy
systemctl is-active --quiet lianum-public-wallet
# HTTPS is checked separately once the DNS A record points to this VM.
