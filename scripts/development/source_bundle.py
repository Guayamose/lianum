#!/usr/bin/env python3
"""Package and run a source candidate with explicitly pinned external resources.

No downloads, npm installation, compatibility build, proof/key generation or
financial acceptance occur here. Original validators run unchanged in the child.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = 'LIANUM_SOURCE_BUNDLE_V1'
RESOURCE_SCHEMA = 'LIANUM_EXTERNAL_RESOURCES_V1'
FAMILIES = {'engine': 'omnichain-product', 'protocol': 'golden-overlay-v17',
            'wallet': 'omnichain-flat-profile/flat-wallet',
            'crypto': 'omnichain-flat-profile/candidate-poseidon',
            'components': 'omnichain-flat-profile'}
PUBLIC_KINDS = {'toolchain', 'public-parameter', 'public-artifact', 'historical-source', 'npm-package'}
SOURCE_AREAS = {'apps', 'packages', 'contracts', 'experiments', 'scripts', 'tests'}
# Already declared by CurrentSourceInputs; immutable evidence is DATA, never
# an executable historical source alias. Do not broaden the archive prefix.
SOURCE_EVIDENCE_PATHS = frozenset({
    'archive/source-evidence/tron-original-builder-v1/provenance.json',
    'archive/source-evidence/tron-original-builder-v1/88bfed03dc18587fe2282479d6e36316047ae68e1fb9086f1caac6d8e3079c09.source',
})
IGNORED = {'node_modules', '.git', '.local', '.internal', '__pycache__', 'dist', 'build'}
URL_RESOURCE = re.compile(r"\bnew\s+URL\(\s*['\"]([^'\"]+)['\"]\s*,\s*import\.meta\.url\s*\)")
SOURCE_RESOURCE = re.compile(r"\b(?:sourceURL|sourcePath)\(\s*['\"]([^'\"]+)['\"]\s*\)")


def canonical(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def safe_relative(value):
    if (not isinstance(value, str) or not value or '\\' in value or '\x00' in value
            or any(part in {'', '.', '..'} for part in value.split('/'))
            or PurePosixPath(value).is_absolute()):
        raise ValueError(f'Expected a normalized relative path: {value!r}')
    return value


def physical(root, relative, *, regular=True):
    """Do not follow source/resource links outside the explicitly supplied root."""
    target = root / safe_relative(relative)
    current = root
    for part in PurePosixPath(relative).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f'Symlink input is not a pinned regular file: {relative}')
    if regular and not target.is_file():
        raise ValueError(f'Missing required file: {relative}')
    return target


def file_record(path):
    return {'sha256': sha(path), 'bytes': path.stat().st_size,
            'mode': f'{stat.S_IMODE(path.stat().st_mode):04o}'}


def source_allowed(relative):
    parts = PurePosixPath(safe_relative(relative)).parts
    if relative in SOURCE_EVIDENCE_PATHS:
        return relative
    if parts[0] not in SOURCE_AREAS or set(parts).intersection(IGNORED):
        raise ValueError(f'Not a public source path: {relative}')
    if any(part.startswith('.env') for part in parts):
        raise ValueError(f'Environment files cannot enter a source bundle: {relative}')
    if relative.startswith(('packages/protocol/', 'experiments/protocol/')):
        raise ValueError(f'Historical generation cannot become active source: {relative}')
    return relative


def source_closure(root, entry, additional):
    # Import the repository scanner only for building. The copied launcher uses
    # the standard library alone, even in an empty destination checkout.
    from module_boundaries import TOKEN, packages, resolve_package

    def literal_imports(content):
        tokens = [(match.lastgroup, match.group()) for match in TOKEN.finditer(content)
                  if match.lastgroup != 'comment']
        for index, (kind, word) in enumerate(tokens):
            if kind != 'word' or word not in {'import', 'from', 'require'}:
                continue
            if index and tokens[index - 1][1] in {'.', '?.'}:
                continue
            target = index + 1
            call = target < len(tokens) and tokens[target][1] == '(' and word in {'import', 'require'}
            if call:
                target += 1
            if target >= len(tokens) or tokens[target][0] not in {'string', 'template'}:
                continue
            if call and (target + 1 >= len(tokens) or tokens[target + 1][1] not in {')', ','}):
                continue  # A concatenated prefix is not a literal import.
            value = tokens[target][1][1:-1]
            if '${' not in value:
                yield '!escaped-import:' + value if '\\' in value else value
    manifests = packages(root)
    queue, files, dependencies = [source_allowed(entry)], set(), set()
    for relative in additional:
        path = physical(root, source_allowed(relative), regular=False)
        if path.is_dir():
            for parent, directories, names in os.walk(path, followlinks=False):
                directories[:] = sorted(name for name in directories if name not in IGNORED)
                for name in directories:
                    physical(root, (Path(parent) / name).relative_to(root).as_posix(), regular=False)
                for name in sorted(names):
                    queue.append(source_allowed((Path(parent) / name).relative_to(root).as_posix()))
        else:
            queue.append(relative)
    while queue:
        relative = queue.pop()
        if relative in files:
            continue
        path = physical(root, source_allowed(relative))
        files.add(relative)
        if path.suffix not in {'.mjs', '.js', '.cjs', '.ts', '.mts', '.tsx'}:
            continue
        content = path.read_text()
        for specifier in literal_imports(content):
            if specifier.startswith('node:'):
                continue
            if specifier.startswith('.'):
                target = Path(os.path.normpath(path.parent / specifier))
                if not target.is_relative_to(root):
                    raise ValueError(f'Import escapes source root: {relative}: {specifier}')
                queue.append(target.relative_to(root).as_posix())
            elif specifier.startswith('@lianum/'):
                target, error = resolve_package(specifier, manifests)
                if error:
                    raise ValueError(f'{relative}: {error}')
                queue.append(target)
            elif specifier.startswith(('!escaped-import:', '/', 'file:', 'http:', 'https:', 'data:')):
                raise ValueError(f'Nonportable import: {relative}: {specifier}')
            else:
                dependencies.add((relative, specifier))
        for raw in URL_RESOURCE.findall(content):
            target = Path(os.path.normpath(path.parent / raw))
            if target.is_relative_to(root) and target.is_file():
                queue.append(target.relative_to(root).as_posix())
        for raw in SOURCE_RESOURCE.findall(content):
            target = physical(root, source_allowed(raw), regular=False)
            if target.is_file():
                queue.append(raw)
    # Preserve package identity/exports and module interpretation at every level.
    for relative in list(files):
        directory = (root / relative).parent
        while directory != root:
            manifest = directory / 'package.json'
            if manifest.is_file():
                files.add(manifest.relative_to(root).as_posix())
            directory = directory.parent
    return files, dependencies, manifests


def external_resources(document):
    if (not isinstance(document, dict) or set(document) != {'schema', 'files'}
            or document['schema'] != RESOURCE_SCHEMA or not isinstance(document['files'], list)):
        raise ValueError('Expected LIANUM_EXTERNAL_RESOURCES_V1 with an explicit files list')
    result, seen = [], set()
    for row in document['files']:
        if (not isinstance(row, dict) or set(row) != {'source', 'path', 'scope', 'kind', 'sha256', 'mode'}
                or not all(isinstance(value, str) for value in row.values())
                or row['kind'] not in PUBLIC_KINDS or row['scope'] not in {'resources', 'dependency'}
                or row['mode'] not in {'0644', '0755'}
                or not isinstance(row['sha256'], str) or not re.fullmatch('[0-9a-f]{64}', row['sha256'])):
            raise ValueError('Every external file needs source, path, scope, public kind, SHA-256 and mode')
        safe_relative(row['source'])
        safe_relative(row['path'])
        if row['scope'] == 'dependency':
            if not row['path'].startswith('node_modules/') or row['kind'] != 'npm-package':
                raise ValueError('Dependencies must be pinned npm-package files under node_modules/')
            destination = row['path']
        else:
            destination = 'resources/' + row['path']
        if destination in seen:
            raise ValueError(f'Duplicate external resource destination: {destination}')
        seen.add(destination)
        result.append({**row, 'destination': destination})
    return sorted(result, key=lambda row: row['destination'])


ADOPTION = 'scripts/development/adopted-generation.json'
ADOPTION_READER = 'packages/proofs/src/toolchain/current-source-generation.mjs'
NATIVE_NPM_POLICY = 'scripts/development/source-pins.json'
NATIVE_NPM_PACKAGES = {'@noble/ciphers', '@noble/curves', '@noble/hashes', '@scure/base',
                       '@scure/bip32', '@scure/bip39', '@scure/btc-signer',
                       'micro-eth-signer', 'micro-key-producer', 'micro-sol-signer',
                       'micro-packed'}
NATIVE_NPM_ROOTS = {('node_modules/' + name): name for name in NATIVE_NPM_PACKAGES}
NATIVE_NPM_ROOTS.update({
    'node_modules/micro-sol-signer/node_modules/@scure/base': '@scure/base',
    'node_modules/micro-sol-signer/node_modules/micro-packed': 'micro-packed',
})
# Two retained public compiler records also occur in the adopted inventory.
# Keep their exact original bytes; this grants no general access to .local and
# does not turn either record into executable source. The manifest is separately
# checked by the paged reader; the complete consumer program is retained evidence.
ADOPTED_RETAINED_PUBLIC_FILES = {
    'experiments/engine/private-core-proof/funded-graph-paged-v3/.local/exact-payouts-v4/consumer.json':
        '27649ee59274bc12b5602d10f87af2322cddebcb2263278aefe40c1e7eed0eca',
    'experiments/engine/private-core-proof/funded-graph-paged-v3/.local/exact-payouts-v4/manifest.json':
        'b9ea61d9944b74cafa59b79e2049767d00aa65e06dbf3eed7deb0590919715d9',
    'experiments/engine/private-core-proof/funded-graph-paged-v3/.local/poseidon-sparse-v3-consumer-fix-v1/consumer.json':
        'd3ad4ad81918ef832f35f4399ad64aa15a47f7fe99359b8d0a719a7eb9287fc3',
    'experiments/engine/private-core-proof/funded-graph-paged-v3/.local/poseidon-sparse-v3-consumer-fix-v1/manifest.json':
        'a3cfb7d05246a5876590f1c5c0a50ab8313c7d1e863dfe7636f18aa8199fe8aa',
}


def adopted_npm_package(parts):
    """Transport only reviewed application inventories and the closed native one.

    Ordinary source discovery still refuses node_modules. This path is reached
    only for an exact row of an already adopted, hash-authenticated inventory.
    """
    if parts[0] == 'node_modules':
        name = '/'.join(parts)
        for package_root in sorted(NATIVE_NPM_ROOTS, key=len, reverse=True):
            if name.startswith(package_root + '/'):
                suffix = name[len(package_root) + 1:]
                if 'node_modules' not in suffix.split('/'):
                    return 'native-wallet', package_root, NATIVE_NPM_ROOTS[package_root]
        raise ValueError('Root npm file is outside the reviewed native-wallet package names')
    if (len(parts) < 5 or parts[:2] not in {('apps', 'mobile'), ('apps', 'platform')}
            or parts[2] != 'node_modules' or parts.count('node_modules') != 1):
        raise ValueError('Adopted npm file is outside a reviewed application inventory')
    count = 5 if parts[3].startswith('@') else 4
    if len(parts) <= count or parts[3] == '@':
        raise ValueError('Adopted npm package path is incomplete')
    return '/'.join(parts[:2]), '/'.join(parts[:count]), '/'.join(parts[3:count])


def validate_adopted_npm(root, files, packages):
    def pinned_json(name):
        if name not in files:
            raise ValueError('Adopted npm dependency lacks its pinned manifest or lock: ' + name)
        raw = physical(root, name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != files[name]:
            raise ValueError('Adopted npm manifest or lock changed: ' + name)
        return json.loads(raw)

    locks = {}
    for application, package_root, name in sorted(packages):
        if application == 'native-wallet':
            continue
        if application not in locks:
            owner = pinned_json(application + '/package.json')
            if owner.get('name') != '@lianum/' + application.split('/')[1]:
                raise ValueError('Adopted npm dependency has no reviewed application owner')
            locks[application] = pinned_json(application + '/package-lock.json')
        manifest = pinned_json(package_root + '/package.json')
        locked = locks[application].get('packages', {}).get('node_modules/' + name)
        if (not isinstance(locked, dict) or manifest.get('name') != name
                or not isinstance(manifest.get('version'), str)
                or locked.get('version') != manifest['version'] or locked.get('link')
                or not isinstance(locked.get('integrity'), str)
                or not re.fullmatch(r'sha(?:1|256|384|512)-[A-Za-z0-9+/]+=*', locked['integrity'])
                or not isinstance(locked.get('resolved'), str)
                or not locked['resolved'].startswith('https://registry.npmjs.org/')):
            raise ValueError('Adopted npm dependency differs from its public manifest and lock: ' + name)
    roots = {package_root for application, package_root, _ in packages if application == 'native-wallet'}
    if not roots:
        return
    policy = pinned_json(NATIVE_NPM_POLICY).get('nativeWalletNpm')
    if (not isinstance(policy, dict)
            or set(policy) != {'schema', 'manifest', 'lock', 'consumerPrefixes', 'directDependencies', 'packages'}
            or policy['schema'] != 'LIANUM_REVIEWED_NATIVE_WALLET_NPM_V1'
            or policy['manifest'] != 'packages/crypto/package.json' or policy['lock'] != 'package-lock.json'
            or policy['consumerPrefixes'] != ['packages/crypto/src/']
            or not isinstance(policy['packages'], list) or not 0 < len(policy['packages']) <= 16):
        raise ValueError('Root npm transport requires the exact reviewed native-wallet policy')
    owner, lock = pinned_json(policy['manifest']), pinned_json(policy['lock'])
    direct = policy['directDependencies']
    if (owner.get('name') != '@lianum/crypto' or not isinstance(direct, dict)
            or not direct or not set(direct).issubset(NATIVE_NPM_PACKAGES)
            or any(owner.get('dependencies', {}).get(name) != version for name, version in direct.items())):
        raise ValueError('Native-wallet direct dependencies differ from their adopted manifest')
    approved, expected_files, total = set(), {}, 0
    for row in policy['packages']:
        if (not isinstance(row, dict)
                or set(row) != {'path', 'name', 'version', 'resolved', 'integrity', 'dependencies', 'files'}
                or NATIVE_NPM_ROOTS.get(row['path']) != row['name']
                or row['path'] in approved or not isinstance(row['files'], list)
                or not 0 < len(row['files']) <= 4096):
            raise ValueError('Root npm package is outside the reviewed native-wallet policy')
        approved.add(row['path'])
        installed = pinned_json(row['path'] + '/package.json')
        locked = lock.get('packages', {}).get(row['path'])
        if (not isinstance(locked, dict) or locked.get('link')
                or not isinstance(row['resolved'], str) or not row['resolved'].startswith('https://registry.npmjs.org/')
                or not isinstance(row['integrity'], str)
                or not re.fullmatch(r'sha(?:1|256|384|512)-[A-Za-z0-9+/]+=*', row['integrity'])
                or any(locked.get(key) != row[key] for key in ('version', 'resolved', 'integrity'))
                or installed.get('name') != row['name'] or installed.get('version') != row['version']
                or installed.get('dependencies', {}) != row['dependencies']
                or locked.get('dependencies', {}) != row['dependencies']):
            raise ValueError('Root npm package differs from its adopted manifest, lock or SRI: ' + row['name'])
        if not any(item.get('path') in {'LICENSE', 'LICENSE.md', 'LICENSE.txt'}
                   for item in row['files'] if isinstance(item, dict)):
            raise ValueError('Native-wallet npm package lacks its public license: ' + row['name'])
        for item in row['files']:
            if (not isinstance(item, dict) or set(item) != {'path', 'bytes', 'sha256'}
                    or type(item['bytes']) is not int or not 0 <= item['bytes'] <= 16 * 1024 * 1024
                    or not isinstance(item['sha256'], str) or not re.fullmatch('[0-9a-f]{64}', item['sha256'])):
                raise ValueError('Invalid bounded native-wallet npm file')
            name = row['path'] + '/' + safe_relative(item['path'])
            if name in expected_files or files.get(name) != item['sha256']:
                raise ValueError('Root npm file differs from its exact adopted policy: ' + name)
            path = physical(root, name)
            if path.stat().st_size != item['bytes'] or sha(path) != item['sha256']:
                raise ValueError('Root npm bytes changed: ' + name)
            expected_files[name] = item['sha256']; total += item['bytes']
            if total > 128 * 1024 * 1024:
                raise ValueError('Native-wallet npm transport byte bound exceeded')
    actual = {name for name in files if name.startswith('node_modules/')}
    if roots != approved or actual != set(expected_files):
        raise ValueError('Native-wallet npm inventory has extra or missing package files')


def adopted_source_inventory(root):
    """Transport the existing generation unchanged; its real reader validates it.

    Current code must already be canonical. Historical rows in sources.json are
    evidence only and never cause copies under .internal to be recreated.
    """
    pointer = physical(root, ADOPTION)
    adoption = json.loads(pointer.read_text())
    generation = adoption.get('generation')
    if not isinstance(generation, str) or not re.fullmatch('[0-9a-f]{64}', generation):
        raise ValueError('Invalid adopted source generation digest')
    base = '.local/generations/' + generation
    source_name, candidate_name = base + '/sources.json', base + '/candidate-release.json'
    sources_path = physical(root, source_name)
    if sha(sources_path) != generation:
        raise ValueError('Adopted source generation bytes changed')
    candidate_path = physical(root, candidate_name)
    if sha(candidate_path) != adoption.get('candidateSHA256'):
        raise ValueError('Adopted candidate bytes changed')
    sources = json.loads(sources_path.read_text())
    rows = sources.get('currentSourceContract', {}).get('files')
    if not isinstance(rows, list) or not 0 < len(rows) <= 8192:
        raise ValueError('Invalid adopted current source inventory')
    evidence = sources['currentSourceContract'].get('retainedEvidenceRoots', [])
    if not isinstance(evidence, list) or not all(isinstance(name, str) for name in evidence):
        raise ValueError('Invalid adopted retained evidence inventory')
    files, npm_packages = {}, set()
    for row in rows:
        name = safe_relative(row['source'])
        parts = PurePosixPath(name).parts
        if row['path'] != name or name.startswith('.internal/'):
            raise ValueError('Adopted execution still requires a compatibility alias: ' + row['path'])
        if (name not in {'dev', 'package.json', 'package-lock.json'} and not name.startswith('node_modules/') and
                not (parts[0] in SOURCE_AREAS or name.startswith('archive/source-evidence/'))):
            raise ValueError('Adoption names a non-source path: ' + name)
        npm = 'node_modules' in parts
        if npm:
            npm_packages.add(adopted_npm_package(parts))
        # Published npm dist/build files are exact adopted resources. Other
        # private/generated directories and all environment files stay forbidden.
        forbidden = IGNORED - {'node_modules', 'dist', 'build'} if npm else IGNORED
        if name in ADOPTED_RETAINED_PUBLIC_FILES:
            if name not in evidence or row['sourceSHA256'] != ADOPTED_RETAINED_PUBLIC_FILES[name]:
                raise ValueError('Adopted retained public record differs from its original evidence: ' + name)
            forbidden = forbidden - {'.local'}
        if set(parts).intersection(forbidden) or any(part.startswith('.env') for part in parts):
            raise ValueError('Adoption names private/generated data: ' + name)
        digest = row['sourceSHA256']
        if (not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest)
                or name in files or row['sha256'] != digest):
            raise ValueError('Invalid or duplicate adopted source owner: ' + name)
        files[name] = digest
    validate_adopted_npm(root, files, npm_packages)
    if ADOPTION_READER not in files:
        raise ValueError('The adopted generation must include its actual validation owner')
    metadata = {ADOPTION: sha(pointer), source_name: generation,
                candidate_name: adoption['candidateSHA256']}
    return files, metadata, generation


def validate_transported_adoption(root, node):
    """Use the unmodified production owner, including all race/hash checks."""
    script = ('const {assertAdoptedSourceGeneration}=await import(' +
              json.dumps((root / ADOPTION_READER).as_uri()) + ');' +
              'const value=assertAdoptedSourceGeneration();' +
              'process.stdout.write(JSON.stringify({generation:value.generation,sources:value.sources}));')
    child = subprocess.run([str(node), '--input-type=module'], input=script,
                           cwd=root, env={'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'},
                           text=True, capture_output=True, timeout=30)
    if child.returncode != 0:
        raise ValueError('Transported source adoption failed its production reader: ' + child.stderr[-2000:])
    return json.loads(child.stdout)


def build(root, output, entry, resource_document, external_root, node_resource, additional=(), cwd_family=None,
          state_directories=(), adopted_generation=False):
    root, external_root, output = root.resolve(), external_root.resolve(), output.absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('Bundle destination must not exist; existing originals are never overwritten')
    if output.is_relative_to(root / 'archive') or output.is_relative_to(root / '.internal/runtime'):
        raise ValueError('A candidate must not replace original or compatibility resources')
    files, dependencies, manifests = source_closure(root, entry, additional)
    adopted, metadata, generation = adopted_source_inventory(root) if adopted_generation else ({}, {}, None)
    files.update(adopted)
    resources = external_resources(resource_document)
    errors = []
    for row in resources:
        try:
            path = physical(external_root, row['source'])
            if sha(path) != row['sha256']:
                raise ValueError(f'External resource SHA-256 mismatch: {row["source"]}')
        except ValueError as error:
            errors.append(str(error))
    node_destination = 'resources/' + safe_relative(node_resource)
    if not any(row['destination'] == node_destination and row['kind'] == 'toolchain'
               and row['mode'] == '0755' for row in resources):
        errors.append('Node must be an explicitly pinned executable toolchain resource')
    destinations = {row['destination'] for row in resources}
    writable = sorted({'resources/' + safe_relative(path) for path in state_directories})
    for path in writable:
        if any(target == path or target.startswith(path + '/') for target in destinations):
            raise ValueError(f'Writable state overlaps a pinned resource: {path}')
    for consumer, specifier in sorted(dependencies):
        parts = specifier.split('/')
        name = '/'.join(parts[:2]) if specifier.startswith('@') else parts[0]
        package_manifest = 'node_modules/' + name + '/package.json'
        # The adopted reader already checks the complete, closed native-wallet
        # npm inventory, public licenses and lock/SRI. Its files are copied as
        # adopted sources; duplicating them as resources would collide. Only an
        # authenticated crypto consumer may use this separately reviewed path.
        adopted_crypto_dependency = (adopted_generation and consumer in adopted
            and consumer.startswith('packages/crypto/src/')
            and name in NATIVE_NPM_PACKAGES and package_manifest in adopted)
        if package_manifest not in destinations and not adopted_crypto_dependency:
            errors.append(f'Missing pinned npm dependency: {consumer}: {specifier}')
    if errors:
        raise ValueError('\n'.join(errors))
    files.update({'package.json', 'package-lock.json', 'scripts/layout.json'})
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.source-bundle-', dir=output.parent))
    try:
        inventory, links = {}, {}

        def copy(source, destination, expected=None, mode=None):
            if destination in inventory:
                raise ValueError(f'Bundle destination collision: {destination}')
            target = stage / destination
            target.parent.mkdir(parents=True, exist_ok=True)
            before = sha(source)
            shutil.copyfile(source, target)
            target.chmod(int(mode, 8) if mode else (0o755 if source.stat().st_mode & 0o111 else 0o644))
            record = file_record(target)
            if record['sha256'] != before or (expected and record['sha256'] != expected):
                raise ValueError(f'Input changed during bundle creation: {destination}')
            inventory[destination] = record

        for relative in sorted(files):
            copy(physical(root, relative), relative, adopted.get(relative))
        for relative, expected in metadata.items():
            copy(physical(root, relative), relative, expected)
        for row in resources:
            copy(physical(external_root, row['source']), row['destination'], row['sha256'], row['mode'])
        for manifest in manifests.values():
            if manifest['root'] + '/package.json' not in files:
                continue
            relative = 'node_modules/' + manifest['name']
            link = stage / relative
            if link.exists() or relative in inventory:
                raise ValueError(f'Workspace dependency collision: {relative}')
            link.parent.mkdir(parents=True, exist_ok=True)
            target = os.path.relpath(stage / manifest['root'], link.parent)
            link.symlink_to(target, target_is_directory=True)
            links[relative] = target
        locations = {'schema': 'LIANUM_RUNTIME_RESOURCES_V1', 'status': 'candidate',
                     'financialAcceptance': False, 'root': 'resources'}
        (stage / 'runtime-resources.json').write_bytes(canonical(locations))
        inventory['runtime-resources.json'] = file_record(stage / 'runtime-resources.json')
        copy(Path(__file__).resolve(), 'run-source-bundle.py')
        cwd = 'resources/' + FAMILIES[cwd_family] if cwd_family else '.'
        (stage / cwd).mkdir(parents=True, exist_ok=True)
        manifest = {'schema': SCHEMA, 'status': 'candidate', 'financialAcceptance': False,
                    'entry': entry, 'node': node_destination, 'cwd': cwd,
                    'stateDirectories': writable,
                    'sourceFiles': sorted(files), 'additionalSources': sorted(additional),
                    'closure': 'literal-imports-and-explicit-additional-sources',
                    'adoptedGeneration': generation,
                    'adoptedSourceFiles': sorted(adopted),
                    'adoptionMetadata': sorted(metadata),
                    'resources': [{key: value for key, value in row.items() if key != 'source'} for row in resources],
                    'files': dict(sorted(inventory.items())), 'links': dict(sorted(links.items()))}
        (stage / 'source-bundle.json').write_bytes(canonical(manifest))
        verify(stage)
        if generation:
            validated = validate_transported_adoption(stage, stage / node_destination)
            if validated['generation'] != generation or validated['sources'] != len(adopted):
                raise ValueError('Transported adoption identity changed')
        stage.rename(output)
        return {'bundleSHA256': sha(output / 'source-bundle.json'), 'status': 'candidate',
                'financialAcceptance': False, 'sourceFiles': len(files), 'resourceFiles': len(resources)}
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def verify(root):
    root = root.resolve()
    manifest = json.loads(physical(root, 'source-bundle.json').read_text())
    if (manifest.get('schema') != SCHEMA or manifest.get('status') != 'candidate'
            or manifest.get('financialAcceptance') is not False):
        raise ValueError('Invalid source candidate manifest')
    if not isinstance(manifest.get('files'), dict) or not isinstance(manifest.get('links'), dict):
        raise ValueError('Invalid source candidate inventory')
    for relative, expected in manifest['files'].items():
        path = physical(root, relative)
        if file_record(path) != expected:
            raise ValueError(f'Source bundle file changed: {relative}')
    for relative, target in manifest['links'].items():
        safe_relative(relative)
        link = root / relative
        if not link.is_symlink() or os.readlink(link) != target:
            raise ValueError(f'Source bundle workspace link changed: {relative}')
        if not link.resolve().is_relative_to(root) or not link.resolve().is_dir():
            raise ValueError(f'Source bundle workspace link escapes candidate: {relative}')
    # Reject undeclared code and resources. Writable worker state is created only
    # after launch and belongs in its explicit resource family, not this snapshot.
    expected_paths = set(manifest['files']) | set(manifest['links']) | {'source-bundle.json'}
    writable = manifest.get('stateDirectories', [])
    for directory in writable:
        safe_relative(directory)
        if not directory.startswith('resources/') or any(
                path == directory or path.startswith(directory + '/') for path in expected_paths):
            raise ValueError(f'Writable state overlaps bundle content: {directory}')
    for parent, directories, names in os.walk(root, followlinks=False):
        for name in directories + names:
            path = Path(parent) / name
            if name in names or path.is_symlink():
                relative = path.relative_to(root).as_posix()
                state = any(relative.startswith(directory + '/') for directory in writable)
                if relative not in expected_paths and (not state or path.is_symlink()):
                    raise ValueError(f'Unlisted source bundle file: {relative}')
    for key in ('entry', 'node'):
        relative = safe_relative(manifest.get(key))
        if relative not in manifest['files']:
            raise ValueError(f'Unlisted {key}: {relative}')
    cwd = manifest.get('cwd')
    if cwd != '.':
        physical(root, cwd, regular=False)
    return manifest


def run(root, arguments, expected_digest=None):
    if expected_digest and sha(root / 'source-bundle.json') != expected_digest:
        raise ValueError('Source bundle manifest differs from the expected release candidate')
    manifest = verify(root)
    os.chdir(root / manifest['cwd'])
    os.execve(root / manifest['node'], [str(root / manifest['node']), str(root / manifest['entry']), *arguments],
              {'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    pack = commands.add_parser('build')
    pack.add_argument('--root', type=Path, default=ROOT)
    pack.add_argument('--output', type=Path, required=True)
    pack.add_argument('--entry', required=True)
    pack.add_argument('--resources', type=Path, required=True)
    pack.add_argument('--resource-root', type=Path, required=True)
    pack.add_argument('--node-resource', required=True)
    pack.add_argument('--include-source', action='append', default=[])
    pack.add_argument('--adopted-generation', action='store_true',
                      help='Carry unchanged adopted metadata and all canonical owners; rejects runtime aliases')
    pack.add_argument('--cwd-family', choices=sorted(FAMILIES))
    pack.add_argument('--state-directory', action='append', default=[],
                      help='Explicit writable resource-relative directory; cannot overlap pinned files')
    for command in ('verify', 'run'):
        sub = commands.add_parser(command)
        sub.add_argument('--bundle', type=Path, default=Path(__file__).resolve().parent)
        sub.add_argument('--expected-sha256')
        if command == 'run':
            sub.add_argument('arguments', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if args.command == 'build':
            result = build(args.root, args.output, args.entry, json.loads(args.resources.read_text()),
                           args.resource_root, args.node_resource, args.include_source, args.cwd_family,
                           args.state_directory, args.adopted_generation)
            print(json.dumps(result, sort_keys=True))
        else:
            root = args.bundle.resolve()
            if args.command == 'run':
                arguments = args.arguments[1:] if args.arguments[:1] == ['--'] else args.arguments
                run(root, arguments, args.expected_sha256)
            else:
                if args.expected_sha256 and sha(root / 'source-bundle.json') != args.expected_sha256:
                    raise ValueError('Source bundle manifest differs from expected SHA-256')
                manifest = verify(root)
                print(json.dumps({'status': manifest['status'], 'financialAcceptance': False,
                                  'files': len(manifest['files']), 'bundleSHA256': sha(root / 'source-bundle.json')}))
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
