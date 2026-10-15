#!/bin/sh
# Install an explicitly reviewed runtime change after Original CAPTURED inspection. Never start.
# Share the existing deployment upgrade lock/rollback namespace with V5.
set -eu
[ "$(id -u)" -eq 0 ] && [ "$#" -eq 4 ] || exit 2
release=$1
digest=$2
checkpoint=$3
review=$4
case "$release" in /*) ;; *) exit 2 ;; esac
for value in "$digest" "$checkpoint"; do
    case "$value" in *[!a-f0-9]*|'') exit 2 ;; esac
    [ "${#value}" -eq 64 ]
done
exec 9>/run/lock/lianum-paeg-public-partial-birth-upgrade-v5.lock
/usr/bin/flock -n 9
python3 "$release/infra/verify-release.py" --directory "$release" --sha256 "$digest"
state=$(systemctl show lianum-paeg-public.service --property=ActiveState --value)
case "$state" in inactive|failed) ;; *) exit 1 ;; esac
[ "$(systemctl show lianum-paeg-public.service --property=MainPID --value)" = 0 ]
# systemd forgets its monotonic start timestamp after a host reboot. The Original
# inspector below authenticates the persistent startup marker, exact two-library
# journal, canonical receipts/code and next nonce before any pointer is changed.
python3 - <<'CHECK'
import pathlib,re,stat
names=[]
for name in ['/opt/lianum-paeg-public','/var/lib/lianum-paeg-public']:
    base=pathlib.Path(name);link=base/'current';ls=link.lstat();target=link.readlink()
    if not stat.S_ISLNK(ls.st_mode) or ls.st_uid!=0 or not target.is_absolute() or target.parent!=base/'releases' or not re.fullmatch('[a-f0-9]{64}',target.name):raise SystemExit('PAEG_PARTIAL_CURRENT_INVALID')
    ts=target.lstat()
    if not stat.S_ISDIR(ts.st_mode) or ts.st_uid!=0 or target.resolve()!=target:raise SystemExit('PAEG_PARTIAL_RELEASE_ALIAS')
    backup=base/'current.before-partial-birth-upgrade-v5'
    if backup.exists() or backup.is_symlink():raise SystemExit('PAEG_PARTIAL_UPGRADE_PENDING')
    names.append(target.name)
if len(set(names))!=1:raise SystemExit('PAEG_PARTIAL_POINTER_MISMATCH')
CHECK
old_release=$(readlink /opt/lianum-paeg-public/current)
old_digest=${old_release##*/}
[ "$old_digest" != "$digest" ]
python3 "$old_release/infra/verify-release.py" --directory "$old_release" --sha256 "$old_digest"
python3 - "$old_release" "$release" "$review" "$old_digest" "$digest" "$checkpoint" <<'ARTIFACTS'
import json,pathlib,sys
def immutable_inventory(root):
    files=json.loads((pathlib.Path(root)/'release-manifest.json').read_bytes())['files']
    return {name:record for name,record in files.items() if name.startswith('candidate/resources/')}
if immutable_inventory(sys.argv[1])!=immutable_inventory(sys.argv[2]):raise SystemExit('PAEG_PARTIAL_COMPILED_INPUTS_CHANGED')
old=json.loads((pathlib.Path(sys.argv[1])/'release-manifest.json').read_bytes())['files']
new=json.loads((pathlib.Path(sys.argv[2])/'release-manifest.json').read_bytes())['files']
# Existing contract sources stay byte exact. Reviewed missing DeFi source files
# can be added; this neither replaces deployed code nor grants a deployment.
if any(new.get(name)!=record for name,record in old.items() if name.startswith('candidate/contracts/')):raise SystemExit('PAEG_EXISTING_CONTRACT_SOURCE_CHANGED')
if any(not(name.startswith('candidate/contracts/wallet/defi/') and name.endswith('.sol')) for name in new.keys()-old.keys() if name.startswith('candidate/contracts/')):raise SystemExit('PAEG_ADDITIONAL_CONTRACT_SOURCE_SCOPE')
import os,stat,time
review_path=pathlib.Path(sys.argv[3]);st=review_path.lstat()
if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or st.st_uid!=0 or st.st_mode&0o022 or st.st_size>1048576:raise SystemExit('PAEG_RUNTIME_REVIEW_FILE')
r=json.loads(review_path.read_bytes())
if set(r)!={'profile','beforeRelease','afterRelease','capturedCheckpointSHA256','expiresAt','changes'}:raise SystemExit('PAEG_RUNTIME_REVIEW_FIELDS')
if r['profile']!='LIANUM_CAPTURED_RUNTIME_UPGRADE_REVIEW_V7' or r['beforeRelease']!=sys.argv[4] or r['afterRelease']!=sys.argv[5] or r['capturedCheckpointSHA256']!=sys.argv[6]:raise SystemExit('PAEG_RUNTIME_REVIEW_BINDING')
if not isinstance(r['expiresAt'],int) or not time.time()<r['expiresAt']<=time.time()+3600:raise SystemExit('PAEG_RUNTIME_REVIEW_EXPIRED')
changes={name:{'before':old.get(name),'after':new.get(name)} for name in sorted(set(old)|set(new)) if old.get(name)!=new.get(name)}
if changes!=r['changes'] or not changes:raise SystemExit('PAEG_RUNTIME_UNREVIEWED_CHANGES')

ARTIFACTS
report=$(mktemp /run/lianum-partial-birth-audit-v5.XXXXXX)
artifacts=$(mktemp /run/lianum-partial-birth-artifacts-v5.XXXXXX)
cp -- /etc/systemd/system/lianum-paeg-public.service.d/artifacts.conf "$artifacts"
cleanup() { rm -f -- "$report" "$artifacts"; }
trap cleanup EXIT
inspect_checkpoint() {
    sudo -u lianum-testnet-signer env -i LANG=C.UTF-8 PATH=/usr/bin:/bin "$release/candidate/resources/tools/node" --max-old-space-size=384 "$release/infra/inspect-captured-public-package-v6.mjs" > "$report"
    python3 - "$report" "$checkpoint" <<'VERIFY'
import json,pathlib,sys
report=json.loads(pathlib.Path(sys.argv[1]).read_bytes())
if report['checkpointSHA256']!=sys.argv[2]:raise SystemExit('PAEG_PARTIAL_BIRTH_STATE_CHANGED')
VERIFY
}
inspect_checkpoint
rollback() {
    result=$?
    trap - EXIT HUP INT TERM
    for base in /opt/lianum-paeg-public /var/lib/lianum-paeg-public; do
        if [ -L "$base/current.before-partial-birth-upgrade-v5" ]; then
            if [ -L "$base/current" ]; then rm -- "$base/current"; fi
            mv -- "$base/current.before-partial-birth-upgrade-v5" "$base/current"
        fi
    done
    install -o root -g root -m 0644 "$old_release/infra/lianum-paeg-public.service" /etc/systemd/system/lianum-paeg-public.service
    install -o root -g root -m 0644 "$artifacts" /etc/systemd/system/lianum-paeg-public.service.d/artifacts.conf
    systemctl daemon-reload
    cleanup
    exit "$result"
}
trap rollback EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
state=$(systemctl show lianum-paeg-public.service --property=ActiveState --value)
case "$state" in inactive|failed) ;; *) exit 1 ;; esac
[ "$(systemctl show lianum-paeg-public.service --property=MainPID --value)" = 0 ]
mv -- /opt/lianum-paeg-public/current /opt/lianum-paeg-public/current.before-partial-birth-upgrade-v5
mv -- /var/lib/lianum-paeg-public/current /var/lib/lianum-paeg-public/current.before-partial-birth-upgrade-v5
sh "$release/infra/install-public-release-v4.sh" "$release" "$digest"
state=$(systemctl show lianum-paeg-public.service --property=ActiveState --value)
case "$state" in inactive|failed) ;; *) exit 1 ;; esac
[ "$(systemctl show lianum-paeg-public.service --property=MainPID --value)" = 0 ]
[ "$(readlink /opt/lianum-paeg-public/current)" = "/opt/lianum-paeg-public/releases/$digest" ]
[ "$(readlink /var/lib/lianum-paeg-public/current)" = "/var/lib/lianum-paeg-public/releases/$digest" ]
inspect_checkpoint
trap - EXIT HUP INT TERM
rm -- /opt/lianum-paeg-public/current.before-partial-birth-upgrade-v5 /var/lib/lianum-paeg-public/current.before-partial-birth-upgrade-v5
cleanup
echo 'CAPTURED_REVIEWED_RUNTIME_UPGRADED_NOT_STARTED; contracts, keys and captured state preserved.'
