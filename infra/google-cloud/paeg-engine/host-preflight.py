#!/usr/bin/env python3
"""Read ELF metadata and hashes; never execute a shipped ledger/prover binary."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess

FILES = {
    'node': ('resources/tools/node', None),
    'anvil': ('resources/omnichain-product/.local/linux-runtimes/foundry-v1.8.4/anvil', 'be5129d636ea18440d43908536f13ba6578859b695f2ca33f1f09a00aa9dc176'),
    'bitcoin': ('resources/omnichain-product/.local/linux-runtimes/bitcoin-v31.1/bitcoin-31.1/bin/bitcoind', '986e63b3c8770f08d0059820ad3dd085d1ab9e1bea23946c243f858a06888a08'),
    'bitcoin-cli': ('resources/omnichain-product/.local/linux-runtimes/bitcoin-v31.1/bitcoin-31.1/bin/bitcoin-cli', '4e3a0fde23ec768a61cdd193602be937b29b6e8f21bcb614af87a2786bf86034'),
    'solana': ('resources/omnichain-product/.local/linux-runtimes/agave-v2.3.13-loopback-memtable128m-candidate-20261005/solana-test-validator', 'a159dd521869c60e317b0db6d4f5ac7b24cfbb400308e6349a0fd63586d58517'),
    'bb': ('resources/omnichain-product/experiments/private-core-proof/node_modules/@aztec/bb.js/build/amd64-linux/bb', '5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b'),
}


def version(value):
    return tuple(map(int, value.split('.')))


def inspect(file):
    child = subprocess.run(['/usr/bin/readelf', '--version-info', '--dynamic', str(file)],
                           capture_output=True, env={'LANG': 'C', 'PATH': '/usr/bin:/bin'}, timeout=10)
    if child.returncode or child.stderr or len(child.stdout) > 2 * 1024 * 1024:
        raise ValueError('PAEG_HOST_ELF_INSPECTION')
    text = child.stdout.decode('ascii', 'strict')
    glibc = sorted(set(re.findall(r'GLIBC_(\d+\.\d+)', text)), key=version)
    cpp = sorted(set(re.findall(r'GLIBCXX_([0-9.]+)', text)), key=version)
    needed = sorted(set(re.findall(r'\(NEEDED\).*\[([A-Za-z0-9_.+-]+)\]', text)))
    return {'glibc': glibc[-1] if glibc else None, 'glibcxx': cpp[-1] if cpp else None, 'libraries': needed}


def check(release):
    if platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise ValueError('PAEG_HOST_LINUX_X64_REQUIRED')
    candidate = release.resolve() / 'candidate'
    manifest = json.loads((candidate / 'source-bundle.json').read_bytes())
    libc = os.confstr('CS_GNU_LIBC_VERSION').removeprefix('glibc ')
    cache = subprocess.run(['/sbin/ldconfig', '-p'], capture_output=True, timeout=5,
                           env={'LANG': 'C', 'PATH': '/usr/bin:/bin'})
    if cache.returncode or len(cache.stdout) > 2 * 1024 * 1024:
        raise ValueError('PAEG_HOST_LIBRARY_CACHE')
    available = set(re.findall(r'^\s*([A-Za-z0-9_.+-]+)\s+\(.*x86-64', cache.stdout.decode('ascii', 'strict'), re.M))
    records = {}
    for name, (relative, original) in FILES.items():
        path = candidate / relative; expected = manifest['files'][relative]['sha256']
        if original is not None and original != expected:
            raise ValueError('PAEG_HOST_ORIGINAL_BINARY_PIN')
        state = path.lstat()
        if not path.is_file() or path.is_symlink() or state.st_nlink != 1 or path.resolve() != path:
            raise ValueError('PAEG_HOST_BINARY_ALIAS')
        with path.open('rb') as file:
            if hashlib.file_digest(file, 'sha256').hexdigest() != expected:
                raise ValueError('PAEG_HOST_BINARY_BYTES')
        record = inspect(path)
        if record['glibc'] and version(libc) < version(record['glibc']):
            raise ValueError('PAEG_HOST_GLIBC_TOO_OLD')
        if set(record['libraries']) - available:
            raise ValueError('PAEG_HOST_SHARED_LIBRARY_MISSING')
        records[name] = {**record, 'sha256': expected}
    # Check actual system libstdc++ version definitions too, without loading it.
    match = re.search(r'libstdc\+\+\.so\.6\s+\(.*x86-64[^\n]*=>\s+([^\n ]+)', cache.stdout.decode('ascii'), re.M)
    if not match:
        raise ValueError('PAEG_HOST_LIBSTDCXX_MISSING')
    system_cpp = inspect(Path(match[1]))['glibcxx']
    required_cpp = max((version(row['glibcxx']) for row in records.values() if row['glibcxx']), default=(0,))
    if system_cpp is None or version(system_cpp) < required_cpp:
        raise ValueError('PAEG_HOST_LIBSTDCXX_TOO_OLD')
    return {'profile': 'LIANUM_PAEG_READONLY_HOST_ABI_V1', 'passed': True,
            'hostGLIBC': libc, 'hostGLIBCXX': system_cpp, 'binaries': records,
            'runtimeStarted': False, 'proofGenerated': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(check(args.release), sort_keys=True))
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        value=str(error)
        code=value if re.fullmatch(r'PAEG_HOST_[A-Z_]{1,80}', value) else 'PAEG_HOST_ABI_REJECTED'
        print(json.dumps({'passed': False, 'code': code, 'runtimeStarted': False, 'proofGenerated': False}))
        raise SystemExit(1)
