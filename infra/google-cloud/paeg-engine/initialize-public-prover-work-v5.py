"""Offline writable prover workspace, with exact public CRS inputs retained.
No wallet, Source policy, signing key, approval or financial journal is opened.
"""
import hashlib
import os
from pathlib import Path
import pwd
import re
import stat
import sys

ROOT_UID = 0
WORK = Path('/var/lib/lianum-paeg-public/prover-work-v5')
PUBLIC_CRS = Path('candidate/resources/omnichain-product/experiments/private-core-proof/native-notes/.local/crs/2097152')
PINS = {
    'bn254_g1_compressed.dat': ('3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37', 67108864),
    'bn254_g2.dat': ('01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f', 128),
}


def checked_file(path, digest, size, mode=None):
    if path.resolve() != path:
        raise ValueError('PAEG_PROVER_PUBLIC_INPUT_ALIAS')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid != ROOT_UID or before.st_nlink != 1 or before.st_size != size:
            raise ValueError('PAEG_PROVER_PUBLIC_INPUT_FILE')
        if mode is not None and stat.S_IMODE(before.st_mode) != mode:
            raise ValueError('PAEG_PROVER_PUBLIC_INPUT_MODE')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            data = stream.read()
        after = os.fstat(fd)
        fields = ['st_dev','st_ino','st_size','st_mtime_ns','st_ctime_ns']
        if any(getattr(before,k) != getattr(after,k) for k in fields) or path.stat().st_ino != before.st_ino:
            raise ValueError('PAEG_PROVER_PUBLIC_INPUT_CHANGED')
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError('PAEG_PROVER_PUBLIC_INPUT_HASH')
        return data
    finally:
        os.close(fd)


def owned_directory(path, owner):
    if path.exists() or path.is_symlink():
        state = path.lstat()
        if not stat.S_ISDIR(state.st_mode) or state.st_uid != owner.pw_uid or stat.S_IMODE(state.st_mode) != 0o700 or path.resolve() != path:
            raise ValueError('PAEG_PROVER_WORK_DIRECTORY')
    else:
        if path.parent.resolve() != path.parent or not path.parent.is_dir():
            raise ValueError('PAEG_PROVER_WORK_PARENT')
        path.mkdir(mode=0o700)
        os.chown(path, owner.pw_uid, owner.pw_gid)


def prepare_public_prover_work(workspace, work, owner):
    inputs = {name: checked_file(workspace / PUBLIC_CRS / name, *pin) for name,pin in PINS.items()}
    owned_directory(work, owner)
    cache = work / '.bb-crs'
    owned_directory(cache, owner)
    for name, data in inputs.items():
        path = cache / name
        if path.exists() or path.is_symlink():
            checked_file(path, *PINS[name], mode=0o444)
            continue
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444)
        try:
            with os.fdopen(os.dup(fd), 'wb') as stream:
                stream.write(data); stream.flush(); os.fsync(stream.fileno())
            os.fchown(fd, ROOT_UID, ROOT_UID); os.fchmod(fd, 0o444); os.fsync(fd)
        finally:
            os.close(fd)
        checked_file(path, *PINS[name], mode=0o444)
    for path in [cache, work]:
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try: os.fsync(fd)
        finally: os.close(fd)


def main():
    if os.getuid() != 0 or len(sys.argv) != 2:
        raise ValueError('PAEG_PROVER_WORK_ARGUMENTS')
    workspace = Path(sys.argv[1])
    if workspace.parent != Path('/var/lib/lianum-paeg-public/releases') or not re.fullmatch('[a-f0-9]{64}',workspace.name) or workspace.resolve() != workspace:
        raise ValueError('PAEG_PROVER_RELEASE_LOCATOR')
    prepare_public_prover_work(workspace, WORK, pwd.getpwnam('lianum-testnet-signer'))
    print('PAEG_PROVER_OFFLINE_WORK_PREPARED; pinned public CRS only; no proof or financial action.')


if __name__ == '__main__':
    try: main()
    except (OSError, ValueError):
        print('PAEG_PROVER_WORK_REJECTED',file=sys.stderr)
        raise SystemExit(1)
