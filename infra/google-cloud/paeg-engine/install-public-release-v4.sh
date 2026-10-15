#!/bin/sh
# Install a reviewed public-testnet courier; never start, deploy or fund it.
set -eu
[ "$(uname -s)" = Linux ]
[ -x /usr/bin/flock ] || { echo PAEG_PUBLIC_FLOCK_REQUIRED >&2; exit 1; }
if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 2 ]; then
  echo 'Usage (root): install-public-release-v4.sh /absolute/unpacked/release MANIFEST_SHA256' >&2
  exit 2
fi
release=$1
digest=$2
case "$digest" in *[!a-f0-9]*|'') echo PAEG_PUBLIC_INSTALL_DIGEST >&2; exit 2 ;; esac
if [ "${#digest}" -ne 64 ]; then exit 2; fi
python3 "$(dirname "$0")/verify-release.py" --directory "$release" --sha256 "$digest"
python3 - "$release" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]); ready=json.loads((root/'deployment-readiness.json').read_bytes())
if ready['profile']!='NEW_PUBLIC_TESTNET_STAGING' or ready['publicChainDeployment'] is not False:
    raise SystemExit('PAEG_PUBLIC_INSTALL_REQUIRES_PUBLIC_COURIER')
required=['candidate/packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs',
          'infra/run-public-operator-v4.mjs','infra/init-public-operator-v4.mjs',
          'infra/public-operator-state-v4.mjs','infra/lianum-paeg-public.service']
for name in required:
    if not (root/name).is_file():raise SystemExit('PAEG_PUBLIC_INSTALL_SOURCE_MISSING')
PY
if ! getent passwd lianum-testnet-signer >/dev/null; then
  echo PAEG_PUBLIC_EXISTING_KEY_OWNER_REQUIRED >&2
  exit 1
fi
if [ -e /opt/lianum-paeg-public/current ] || [ -L /opt/lianum-paeg-public/current ] || [ -e /var/lib/lianum-paeg-public/current ] || [ -L /var/lib/lianum-paeg-public/current ]; then
  echo PAEG_PUBLIC_EXISTING_RELEASE_REQUIRES_CONTROLLED_MIGRATION >&2
  exit 1
fi
python3 - <<'PY'
import os,pathlib,pwd,stat
user=pwd.getpwnam('lianum-testnet-signer')
for name in ['/var/lib/lianum-testnet-signer/paeg-provider-v1','/var/lib/lianum-testnet-signer/paeg-provider-v1/keys','/var/lib/lianum-testnet-signer/transport']:
    path=pathlib.Path(name);s=path.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid!=user.pw_uid or stat.S_IMODE(s.st_mode)!=0o700 or str(path.resolve())!=name:
        raise SystemExit('PAEG_PUBLIC_INSTALL_EXISTING_PRIVATE_DIRECTORY')
PY
install -d -o root -g root -m 0755 /opt/lianum-paeg-public/releases /var/lib/lianum-paeg-public/releases
destination=/opt/lianum-paeg-public/releases/$digest
workspace=/var/lib/lianum-paeg-public/releases/$digest
if [ -e "$destination" ] || [ -e "$workspace" ]; then
  echo PAEG_PUBLIC_INSTALL_RELEASE_ALREADY_EXISTS >&2
  exit 1
fi
cp -a -- "$release" "$destination"
chown -R root:root "$destination"
python3 "$(dirname "$0")/verify-release.py" --directory "$destination" --sha256 "$digest"
cp -a -- "$destination" "$workspace"
python3 - "$workspace" <<'PY'
import json,os,pathlib,pwd,sys
root=pathlib.Path(sys.argv[1]);user=pwd.getpwnam('lianum-testnet-signer')
for relative in ['omnichain-product/.local/integrations','omnichain-product/evidence/paeg-proof-attempts','omnichain-flat-profile/flat-wallet/.local/proof-workers']:
    path=root/'candidate/resources'/relative;path.mkdir(parents=True,exist_ok=True)
    for parent,dirs,files in os.walk(path,followlinks=False):
        directory=pathlib.Path(parent)
        if directory.is_symlink():raise SystemExit('PAEG_PUBLIC_INSTALL_STATE_ALIAS')
        os.chown(directory,user.pw_uid,user.pw_gid);directory.chmod(0o700)
manifest=json.loads((root/'candidate/source-bundle.json').read_bytes())
prefix='resources/omnichain-flat-profile/flat-wallet/.local/proof-workers/'
lines=['[Service]']
for name in sorted(manifest['files']):
    if name.startswith(prefix):
        path=root/'candidate'/name
        if not path.is_file() or path.is_symlink() or any(c.isspace() for c in str(path)):
            raise SystemExit('PAEG_PUBLIC_INSTALL_ARTIFACT_BIND')
        lines.append('BindReadOnlyPaths='+str(path))
drop=pathlib.Path('/etc/systemd/system/lianum-paeg-public.service.d');drop.mkdir(parents=True,exist_ok=True)
(drop/'artifacts.conf').write_text('\n'.join(lines)+'\n');(drop/'artifacts.conf').chmod(0o644)
PY
python3 "$destination/infra/initialize-public-prover-work-v5.py" "$workspace"
ln -s -- "$destination" /opt/lianum-paeg-public/current
ln -s -- "$workspace" /var/lib/lianum-paeg-public/current
install -o root -g root -m 0644 "$destination/infra/lianum-paeg-public.service" /etc/systemd/system/lianum-paeg-public.service
systemctl daemon-reload
echo 'PAEG_PUBLIC_STAGING_INSTALLED_NOT_STARTED; existing keys preserved; initialize NEW configuration explicitly.'
