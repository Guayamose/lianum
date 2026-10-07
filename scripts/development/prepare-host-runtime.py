#!/usr/bin/env python3
"""Install the pinned Linux x64 Node runtime for host tests and new applications."""
import hashlib
import platform
import subprocess
import tarfile

from setup import DEV, checked, download, extract

VERSION = '24.19.0'
ARCHIVE_SHA256 = '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647'


def main():
    if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'AMD64'):
        raise SystemExit('This bootstrap requires Linux/WSL x64 and Python 3.12 or newer.')
    name = f'node-v{VERSION}-linux-x64'
    archive = download(f'https://nodejs.org/dist/v{VERSION}/{name}.tar.xz',
                       name + '.tar.xz', ARCHIVE_SHA256)
    destination = DEV / 'toolchains' / name
    extract(archive, destination, name)
    # Reuse is allowed only when the executable matches the verified archive.
    with tarfile.open(archive) as bundle:
        with bundle.extractfile(name + '/bin/node') as node:
            node_sha256 = hashlib.file_digest(node, 'sha256').hexdigest()
    checked(destination / 'bin/node', node_sha256)
    actual = subprocess.check_output([str(destination / 'bin/node'), '--version'], text=True).strip()
    if actual != 'v' + VERSION:
        raise RuntimeError('Installed Node version differs from the pinned release.')
    print(f'Host runtime ready: {actual}; verified official archive and executable.')
    print('Scope: host tests and mobile/platform dependencies; no native runtimes or proof acceptance restored.')


if __name__ == '__main__':
    main()
