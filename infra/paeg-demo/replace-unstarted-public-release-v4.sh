#!/bin/sh
# Replace an installed staging courier only before its first financial birth.
# Existing provider keys and old immutable releases are never changed.
set -eu
if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 2 ]; then
  echo 'Usage (root): replace-unstarted-public-release-v4.sh /absolute/new/release MANIFEST_SHA256' >&2
  exit 2
fi
release=$1
digest=$2
case "$release" in /*) ;; *) exit 2 ;; esac
case "$digest" in *[!a-f0-9]*|'') exit 2 ;; esac
[ "${#digest}" -eq 64 ]
exec 9>/run/lock/lianum-paeg-public-staging-migration-v4.lock
flock -n 9
python3 "$release/infra/verify-release.py" --directory "$release" --sha256 "$digest"
[ "$(systemctl show lianum-paeg-public.service --property=ActiveState --value)" = inactive ]
[ "$(systemctl show lianum-paeg-public.service --property=SubState --value)" = dead ]
[ "$(systemctl show lianum-paeg-public.service --property=ExecMainStartTimestampMonotonic --value)" = 0 ]
python3 - <<'PY'
import pathlib,re,stat,pwd
roots=['/opt/lianum-paeg-public','/var/lib/lianum-paeg-public']
digests=[]
for root in roots:
    base=pathlib.Path(root);current=base/'current';s=current.lstat()
    if not stat.S_ISLNK(s.st_mode) or s.st_uid!=0:
        raise SystemExit('PAEG_STAGING_CURRENT_NOT_ROOT_SYMLINK')
    target=current.readlink()
    if not target.is_absolute() or target.parent!=base/'releases' or not re.fullmatch('[a-f0-9]{64}',target.name):
        raise SystemExit('PAEG_STAGING_CURRENT_TARGET')
    t=target.lstat()
    if not stat.S_ISDIR(t.st_mode) or t.st_uid!=0 or target.resolve()!=target:
        raise SystemExit('PAEG_STAGING_RELEASE_ALIAS')
    digests.append(target.name)
    backup=base/'current.before-unstarted-migration-v4'
    if backup.exists() or backup.is_symlink():raise SystemExit('PAEG_STAGING_PREVIOUS_MIGRATION_PENDING')
if len(set(digests))!=1:raise SystemExit('PAEG_STAGING_CURRENT_PAIR_MISMATCH')
for name in ['/var/lib/lianum-testnet-signer/paeg-public-v4',
             '/var/lib/lianum-testnet-signer/paeg-provider-v1/receiver-bootstrap',
             '/var/lib/lianum-testnet-signer/paeg-provider-v1/source-operations',
             '/var/lib/lianum-testnet-signer/paeg-provider-v1/dispatch-journal']:
    p=pathlib.Path(name)
    if name.endswith('/dispatch-journal') and p.exists() and not p.is_symlink():
        mode=p.lstat();owner=pwd.getpwnam('lianum-testnet-signer')
        if stat.S_ISDIR(mode.st_mode) and mode.st_uid==owner.pw_uid and stat.S_IMODE(mode.st_mode)==0o700 and p.resolve()==p and not list(p.iterdir()):
            continue  # Empty preflight directory only; preserve it unchanged.
    if p.exists() or p.is_symlink():raise SystemExit('PAEG_STAGING_FINANCIAL_STATE_EXISTS')
PY
old_release=$(readlink /opt/lianum-paeg-public/current)
old_digest=${old_release##*/}
python3 "$old_release/infra/verify-release.py" --directory "$old_release" --sha256 "$old_digest"
[ "$old_digest" != "$digest" ]
old_artifacts=$(mktemp /run/lianum-paeg-artifacts-before-migration-v4.XXXXXX)
cp -- /etc/systemd/system/lianum-paeg-public.service.d/artifacts.conf "$old_artifacts"
rollback() {
  result=$?
  trap - EXIT HUP INT TERM
  for base in /opt/lianum-paeg-public /var/lib/lianum-paeg-public; do
    if [ -L "$base/current.before-unstarted-migration-v4" ]; then
      if [ -L "$base/current" ]; then rm -- "$base/current"; fi
      mv -- "$base/current.before-unstarted-migration-v4" "$base/current"
    fi
  done
  install -o root -g root -m 0644 "$old_release/infra/lianum-paeg-public.service" /etc/systemd/system/lianum-paeg-public.service
  install -o root -g root -m 0644 "$old_artifacts" /etc/systemd/system/lianum-paeg-public.service.d/artifacts.conf
  systemctl daemon-reload
  rm -- "$old_artifacts"
  exit "$result"
}
trap rollback EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
mv -- /opt/lianum-paeg-public/current /opt/lianum-paeg-public/current.before-unstarted-migration-v4
mv -- /var/lib/lianum-paeg-public/current /var/lib/lianum-paeg-public/current.before-unstarted-migration-v4
sh "$release/infra/install-public-release-v4.sh" "$release" "$digest"
[ "$(systemctl show lianum-paeg-public.service --property=ActiveState --value)" = inactive ]
[ "$(readlink /opt/lianum-paeg-public/current)" = "/opt/lianum-paeg-public/releases/$digest" ]
[ "$(readlink /var/lib/lianum-paeg-public/current)" = "/var/lib/lianum-paeg-public/releases/$digest" ]
trap - EXIT HUP INT TERM
rm -- /opt/lianum-paeg-public/current.before-unstarted-migration-v4 /var/lib/lianum-paeg-public/current.before-unstarted-migration-v4 "$old_artifacts"
echo 'PAEG_PUBLIC_UNSTARTED_STAGING_REPLACED; existing keys preserved; no financial state migrated; service not started.'
