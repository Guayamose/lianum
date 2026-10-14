"""Explicit public artifacts/tools only, selected by original read-only loaders."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/development'))
import source_bundle as bundle

NODE = '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
ENGINE = 'omnichain-product'
PROOF = ENGINE + '/experiments/private-core-proof'
WALLET = 'omnichain-flat-profile/flat-wallet'
STATE_DIRECTORIES = [ENGINE + '/.local/integrations', ENGINE + '/evidence/paeg-proof-attempts',
                     WALLET + '/.local/proof-workers/attempts', WALLET + '/.local/proof-workers/operations']


def inspect(root=ROOT):
    result = subprocess.run([str(root / NODE), str(Path(__file__).with_name('inspect-public-resources.mjs')), str(root)],
                            cwd=root, env={'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'},
                            capture_output=True, timeout=90)
    if len(result.stdout) > 4 * 1024 * 1024 or result.stderr:
        raise ValueError('PUBLIC_INSPECTOR_OUTPUT_REJECTED')
    data = json.loads(result.stdout)
    if result.returncode or data.get('ok') is False:
        raise ValueError('PUBLIC_INSPECTION_' + data.get('stage', 'UNKNOWN') + ':' + data.get('code', 'FAILED'))
    return data


def collect(root=ROOT):
    inspected = inspect(root)
    rows, destinations = [], {}

    def add(source, path, kind='public-artifact', mode='0644', expected=None):
        # No secret, account state, ledger, witness or existing operator is read.
        bundle.safe_relative(source); bundle.safe_relative(path)
        if re.search(r'(?i)(?:^|/)(?:operator|journal|supervisor|wallet-state|witness|request|input)(?:[.-]|/|$)', path) or path.endswith(('.vault', '.pem', '.log')):
            raise ValueError('PRIVATE_RESOURCE_FORBIDDEN')
        file = bundle.physical(root, source)
        size, digest = file.stat().st_size, bundle.sha(file)
        if size > 512 * 1024 * 1024 or (expected is not None and digest != expected):
            raise ValueError('PUBLIC_RESOURCE_PIN_OR_SIZE')
        if path in destinations:
            if destinations[path] != digest:
                raise ValueError('PUBLIC_RESOURCE_COLLISION')
            return
        destinations[path] = digest
        rows.append({'source': source, 'path': path, 'scope': 'resources',
                     'kind': kind, 'sha256': digest, 'mode': mode})

    add(NODE, 'tools/node', 'toolchain', '0755')
    for source in inspected['files']:
        if not source.startswith('.internal/runtime/'):
            raise ValueError('PUBLIC_RESOURCE_ROOT')
        path = source[len('.internal/runtime/'):]
        add(source, path, 'toolchain' if '/node_modules/' in path else 'public-artifact')
    paged = inspected['pagedArtifactSource']
    expected = 'experiments/engine/private-core-proof/funded-graph-paged-v3/.local/exact-payouts-v4'
    if paged != expected or inspected['paged']['securityGeneration'] != 'EXACT_PAYOUT_SET_V4':
        raise ValueError('PUBLIC_ACTIVE_PAGED_GENERATION')
    destination = PROOF + '/funded-graph-paged-v3/.local/exact-payouts-v4'
    info = inspected['paged']
    add(paged + '/manifest.json', destination + '/manifest.json', expected=info['manifestSHA256'])
    for role, record in info['roles'].items():
        for ext, key in [('json', 'programSHA256'), ('vk', 'keySHA256'), ('sol', 'soliditySHA256')]:
            suffix = '/prepared/' + role + '.' + ext
            add(paged + suffix, destination + suffix, expected=record[key])
    add(paged + '/consumer.json', destination + '/consumer.json', expected=inspected['consumerSHA256'])
    for row in info['hostSources'] + info['compilerInputs']:
        add(row.get('source', row['path']), ENGINE + '/evidence/paged-v3/sources/' + row['sha256'] + '.source',
            'historical-source', expected=row['sha256'])
    # N32 reads these nine archived host inputs solely as data. Its hard-pinned
    # compiled manifest authenticates every path, byte count and digest. Do not
    # install them under old executable aliases or current host-source paths.
    n32 = 'omnichain-flat-profile/candidate-poseidon/.local/component/compiled/29084da7f9d90365578b32a87e54b9e4ce165ae7e3701b803df250db738c4004/manifest.json'
    n32_source = '.internal/runtime/' + n32
    if bundle.sha(bundle.physical(root, n32_source)) != '29084da7f9d90365578b32a87e54b9e4ce165ae7e3701b803df250db738c4004':
        raise ValueError('PUBLIC_N32_COMPILED_MANIFEST_PIN')
    evidence = json.loads(bundle.physical(root, n32_source).read_bytes())['executionSources']
    roots = {'candidate': 'omnichain-flat-profile/candidate-poseidon',
             'flat-reference': 'omnichain-flat-profile', 'golden': ENGINE}
    if not isinstance(evidence, list) or len(evidence) != 9:
        raise ValueError('PUBLIC_N32_EXECUTION_SOURCE_COUNT')
    names = set()
    for row in evidence:
        if set(row) != {'root', 'path', 'bytes', 'sha256'} or row['root'] not in roots:
            raise ValueError('PUBLIC_N32_EXECUTION_SOURCE_RECORD')
        name = roots[row['root']] + '/' + bundle.safe_relative(row['path'])
        if name in names or type(row['bytes']) is not int or not 0 < row['bytes'] <= 1024 * 1024:
            raise ValueError('PUBLIC_N32_EXECUTION_SOURCE_BOUND')
        names.add(name)
        source = 'archive/delivery/source-snapshot/' + name
        if bundle.physical(root, source).stat().st_size != row['bytes']:
            raise ValueError('PUBLIC_N32_EXECUTION_SOURCE_BYTES')
        add(source, 'omnichain-flat-profile/candidate-poseidon/evidence/retained-n32/sources/' + row['sha256'] + '.source',
            'historical-source', expected=row['sha256'])
    for path, digest in list(inspected['linuxRuntimePins'].values()) + inspected['solanaPins']:
        resource = ENGINE + '/.local/linux-runtimes/' + path
        add('.internal/runtime/' + resource, resource, 'toolchain', '0755', digest)
    # The original fixture validates this entire manifest before any deployment.
    fixture = WALLET + '/wallet-platform/artifacts/private-external-v1/'
    manifest = fixture + 'protocol-fixture-artifact-pins.json'
    add('.internal/runtime/' + manifest, manifest, expected='9913e72be559a10c7340ba291f88b067eab2dd3a0c290052c4c024db14bff2e8')
    for row in json.loads(bundle.physical(root, '.internal/runtime/' + manifest).read_bytes())['files']:
        add('.internal/runtime/' + fixture + row['path'], fixture + row['path'],
            'toolchain' if row['path'].startswith('abi-tools/') else 'public-artifact', expected=row['sha256'])
    # Complete published npm files (including LICENSE) from the original public
    # package lock. No npm install/download, .bin aliases or arbitrary root npm.
    def npm_tree(base, lock_name):
        lock_source = '.internal/runtime/' + base + '/' + lock_name
        locked = json.loads(bundle.physical(root, lock_source).read_bytes())['packages']
        add(lock_source, base + '/' + lock_name, 'toolchain')
        add('.internal/runtime/' + base + '/package.json', base + '/package.json', 'toolchain')
        for package, record in sorted(locked.items()):
            if not package.startswith('node_modules/') or record.get('link'):
                continue
            package_root = root / '.internal/runtime' / base / package
            if not package_root.exists():
                continue  # The audit independently requires installed originals.
            manifest_path = bundle.physical(root, '.internal/runtime/' + base + '/' + package + '/package.json')
            installed = json.loads(manifest_path.read_bytes())
            if installed.get('version') != record.get('version') or not re.fullmatch(r'sha(?:1|256|384|512)-[A-Za-z0-9+/]+=*', record.get('integrity', '')) or not record.get('resolved', '').startswith('https://registry.npmjs.org/'):
                raise ValueError('PUBLIC_NPM_LOCK')
            count = 0
            for parent, directories, names in os.walk(package_root, followlinks=False):
                directories[:] = sorted(name for name in directories if name not in {'node_modules', '.bin'})
                for directory in directories:
                    if (Path(parent) / directory).is_symlink():
                        raise ValueError('PUBLIC_NPM_ALIAS')
                for name in sorted(names):
                    path = (Path(parent) / name).relative_to(root / '.internal/runtime').as_posix()
                    mode = '0755' if path == PROOF + '/node_modules/@aztec/bb.js/build/amd64-linux/bb' else '0644'
                    add('.internal/runtime/' + path, path, 'toolchain', mode,
                        inspected['nativeProverSHA256'] if mode == '0755' else None)
                    count += 1
                    if count > 4096:
                        raise ValueError('PUBLIC_NPM_FILE_BOUND')
    npm_tree(PROOF, 'reused-package-lock.json')
    npm_tree(ENGINE + '/tools/solidity-js', 'package-lock.json')
    total = sum(bundle.physical(root, row['source']).stat().st_size for row in rows)
    if len(rows) > 30000 or total > 2 * 1024 ** 3:
        raise ValueError('PUBLIC_RELEASE_RESOURCE_BOUND')
    return {'schema': bundle.RESOURCE_SCHEMA, 'files': sorted(rows, key=lambda row: row['path'])}


if __name__ == '__main__':
    print(json.dumps(collect(), sort_keys=True, indent=2))
