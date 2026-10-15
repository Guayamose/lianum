#!/bin/sh
# Reviewed staging installer. No cloud API, listener, wallet or funding is run.
set -eu
if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 2 ]; then
  echo 'Usage (root): install-release.sh /absolute/unpacked/release MANIFEST_SHA256' >&2
  exit 2
fi
release=$1
digest=$2
case "$digest" in *[!a-f0-9]*|'') echo PAEG_INSTALL_DIGEST >&2; exit 2 ;; esac
if [ "${#digest}" -ne 64 ]; then exit 2; fi
# This installer/verifier must arrive through the reviewed artifact courier.
# Verify the complete unpacked inventory before copying or importing any JS.
python3 "$(dirname "$0")/verify-release.py" --directory "$release" --sha256 "$digest"
if [ -e /var/lib/lianum-paeg/realm-parent/realm ]; then
  echo PAEG_INSTALL_EXISTING_REALM_REQUIRES_CONTROLLED_MIGRATION >&2
  exit 1
fi
if [ -e /opt/lianum-paeg/current ] || [ -L /opt/lianum-paeg/current ] || [ -e /var/lib/lianum-paeg/current ] || [ -L /var/lib/lianum-paeg/current ]; then
  echo PAEG_INSTALL_EXISTING_RELEASE_POINTER_NOT_REPLACED >&2
  exit 1
fi
if ! getent passwd lianum-paeg >/dev/null; then
  useradd --system --home-dir /var/lib/lianum-paeg --shell /usr/sbin/nologin lianum-paeg
fi
install -d -o root -g root -m 0755 /opt/lianum-paeg/releases /var/lib/lianum-paeg/releases
destination=/opt/lianum-paeg/releases/$digest
workspace=/var/lib/lianum-paeg/releases/$digest
if [ -e "$destination" ] || [ -e "$workspace" ]; then
  echo PAEG_INSTALL_RELEASE_ALREADY_EXISTS >&2
  exit 1
fi
cp -a -- "$release" "$destination"
chown -R root:root "$destination"
python3 "$(dirname "$0")/verify-release.py" --directory "$destination" --sha256 "$digest"
cp -a -- "$destination" "$workspace"
# Only future runtime/job state is mutable. Immutable source/tools stay root
# owned. Initial proofworker contents are public artifact receipts selected by
# the Original loaders, not private jobs copied from the development wallet.
install -d -o lianum-paeg -g lianum-paeg -m 0700 /var/lib/lianum-paeg/realm-parent
python3 - "$workspace" <<'PY'
import json, os, pathlib, pwd, sys
root = pathlib.Path(sys.argv[1]); user = pwd.getpwnam('lianum-paeg')
paths = ['omnichain-product/.local/integrations', 'omnichain-product/evidence/paeg-proof-attempts',
         'omnichain-flat-profile/flat-wallet/.local/proof-workers']
for relative in paths:
    path = root / 'candidate/resources' / relative
    path.mkdir(parents=True, exist_ok=True)
    for parent, directories, files in os.walk(path, followlinks=False):
        directory = pathlib.Path(parent)
        if directory.is_symlink(): raise SystemExit('PAEG_INSTALL_STATE_ALIAS')
        os.chown(directory, user.pw_uid, user.pw_gid); directory.chmod(0o700)
# Protect every original historical artifact/report inside the writable worker
# tree. The service gets fresh job directories but cannot replace these bytes.
manifest = json.loads((root / 'candidate/source-bundle.json').read_bytes())
prefix = 'resources/omnichain-flat-profile/flat-wallet/.local/proof-workers/'
lines = ['[Service]']
for name in sorted(manifest['files']):
    if name.startswith(prefix):
        path = root / 'candidate' / name
        if not path.is_file() or path.is_symlink() or any(c.isspace() for c in str(path)):
            raise SystemExit('PAEG_INSTALL_ARTIFACT_BIND')
        lines.append('BindReadOnlyPaths=' + str(path))
path = pathlib.Path('/etc/systemd/system/lianum-paeg-demo.service.d')
path.mkdir(parents=True, exist_ok=True)
(path / 'artifacts.conf').write_text('\n'.join(lines) + '\n')
os.chmod(path / 'artifacts.conf', 0o644)
PY
# A root-owned parent prevents the service replacing its release pointer.
# The separate realm itself is created exclusively by init-operator.mjs below.
chown root:root /var/lib/lianum-paeg
chmod 0755 /var/lib/lianum-paeg
ln -s -- "$destination" /opt/lianum-paeg/current
ln -s -- "$workspace" /var/lib/lianum-paeg/current
install -o root -g root -m 0644 "$destination/infra/lianum-paeg-demo.service" /etc/systemd/system/lianum-paeg-demo.service
systemctl daemon-reload
echo 'PAEG_STAGING_INSTALLED_NOT_STARTED; initialize a NEW operator explicitly.'
