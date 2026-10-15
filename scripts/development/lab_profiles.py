#!/usr/bin/env python3
"""Inspect and prepare explicit lab prerequisites without starting a laboratory."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

from bounded_process import run_bounded
from import_paths import map_path, translate
from workspace import layout

ROOT = Path(__file__).resolve().parents[2]
CATALOG = Path(__file__).with_name('lab-profiles.json')
NODE = '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
NPM = '.internal/dev/toolchains/node-v24.19.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js'
ACTIONS = {'source-runtime', 'platform-dependencies', 'mobile-dependencies', 'compatibility-runtime'}
PUBLIC_ROOTS = {'apps', 'services', 'packages', 'scripts', 'tests', 'contracts', 'experiments'}
# Retained source paths must also have an exact original layout mapping below.
RETAINED_PUBLIC_PREFIXES = ('docs/reference/wallet/', 'scripts/engine/demos/client/',)
RETAINED_PUBLIC_FILES = frozenset({
    'packages/proofs/evidence/native-value-genuine-deployment-artifacts/w39-adapter/' + filename
    for filename in ('compiler-pin.mjs', 'read-original-w39.mjs', 'verifier-ast.mjs',
                     'original-file-pins.mjs', 'source-manifest.json')
} | {'packages/proofs/evidence/wrapped-activation-installation-v2/source-manifest.json'})
# This archived execution lock is bookkeeping, not public executable source.
# Its content/hash is intentionally not read or authenticated by this inventory.
EXCLUDED_HISTORICAL_METADATA = frozenset({
    'packages/proofs/evidence/wrapped-key-preparation-bound-20261006/execution-receipts/'
    'ci-prepare-key-20261006/failure-preservation-e84fb980-fbaf-428d-b7b3-ab5080623921/active.lock',
})


def relative(value, allow_dot=False):
    if allow_dot and value == '.':
        return value
    if not isinstance(value, str) or not value or value.startswith('/') or '\\' in value:
        raise ValueError('Expected a public repository-relative path')
    if any(part in {'', '.', '..', '.git'} or part.startswith('.env') for part in value.split('/')):
        raise ValueError('Refusing an escaping or environment-file path')
    return value


def read_json(path):
    # Only fixed public manifests/reports are passed here. Never inspect .env,
    # credentials, pairing descriptors, wallets or private laboratory evidence.
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError('Public metadata exceeds inspection bound')
    return json.loads(path.read_text())


def catalog(path=CATALOG):
    data = read_json(path)
    if data.get('schema') != 'LIANUM_LAB_PROFILES_V1' or data.get('coverage') != 'curated-minimum-inventory':
        raise ValueError('Unsupported lab profile catalog')
    for name, requirement in data['requirements'].items():
        if requirement['kind'] not in {'file', 'executable', 'npm', 'runtime'}:
            raise ValueError('Unsupported requirement kind: ' + name)
        if 'path' in requirement:
            relative(requirement['path'], allow_dot=requirement['kind'] == 'npm')
    for name, profile in data['profiles'].items():
        if not profile['requirements'] or not profile['entrypoints'] or not profile['commands']:
            raise ValueError('Empty lab profile: ' + name)
        if any(item not in data['requirements'] for item in profile['requirements']):
            raise ValueError('Unknown lab requirement: ' + name)
        if type(profile.get('economic')) is not bool:
            raise ValueError('Expected an explicit economic profile classification')
        if 'compatibility-runtime' in profile['prepare'] and not profile['economic']:
            raise ValueError('Host profiles cannot materialize a compatibility runtime')
        for action in profile['prepare']:
            requirement = 'source-dependencies' if action == 'source-runtime' else action
            if requirement not in profile['requirements']:
                raise ValueError('Preparation must match a declared prerequisite')
        if set(profile['prepare']) - ACTIONS:
            raise ValueError('Unsupported preparation action: ' + name)
        for entry in profile['entrypoints']:
            relative(entry)
            if entry.split('/')[0] not in PUBLIC_ROOTS:
                raise ValueError('Entry must be a public source')
    return data


def npm_status(root, directory):
    base = root / directory
    try:
        package, lock = (read_json(base / name) for name in ('package.json', 'package-lock.json'))
        locked = lock['packages']
        workspaces = package.get('workspaces', []) if directory == '.' else []
        manifests = [('', base, package)]
        for workspace in workspaces:
            relative(workspace)
            manifests.append((workspace, root / workspace, read_json(root / workspace / 'package.json')))
        manifest_fields = ('name', 'version', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'workspaces')
        for key, path, manifest in manifests:
            expected = locked.get(key, {})
            for field in manifest_fields:
                if manifest.get(field, {} if field.endswith('Dependencies') or field == 'dependencies' else None) != expected.get(field, {} if field.endswith('Dependencies') or field == 'dependencies' else None):
                    return 'stale-dependencies', 'Public manifest and lock disagree; update the lock explicitly'
            if key:
                link = locked.get('node_modules/' + manifest['name'], {})
                if link.get('link') is not True or link.get('resolved') != key:
                    return 'stale-dependencies', 'A workspace link differs from the public lock'
                if (base / 'node_modules' / manifest['name']).resolve() != path.resolve():
                    return 'missing', 'Workspace links require preparation'
            for dependency in {**manifest.get('dependencies', {}), **manifest.get('devDependencies', {})}:
                location = path
                while not (location / 'node_modules' / dependency / 'package.json').is_file():
                    if location == root:
                        return 'missing', 'An installed direct dependency is missing'
                    location = location.parent
                module = location / 'node_modules' / dependency
                if dependency in {item[2].get('name') for item in manifests[1:]}:
                    continue
                # Root packages can resolve dependencies from a nested workspace.
                # An app's declared local link may instead resolve at the repo root.
                hoisted = not module.is_relative_to(base)
                lock_key = 'node_modules/' + dependency if hoisted else module.relative_to(base).as_posix()
                pinned = locked.get(lock_key, {})
                if pinned.get('link') is True:
                    resolved = pinned['resolved']
                    target = Path(os.path.abspath(base / resolved))
                    target_source = relative(target.relative_to(root).as_posix())
                    if target_source.split('/')[0] not in PUBLIC_ROOTS or module.resolve() != target:
                        return 'stale-dependencies', 'An installed local link differs from the public lock'
                    actual = read_json(module / 'package.json')
                    pinned = locked.get(resolved, {})
                    for field in manifest_fields:
                        default = {} if field.endswith('Dependencies') or field == 'dependencies' else None
                        if actual.get(field, default) != pinned.get(field, default):
                            return 'stale-dependencies', 'A linked package manifest differs from the public lock'
                else:
                    if hoisted:
                        return 'stale-dependencies', 'An installed dependency has no matching local link in the public lock'
                    actual = read_json(module / 'package.json')
                if actual.get('name') != dependency or actual.get('version') != pinned.get('version'):
                    return 'stale-dependencies', 'An installed direct dependency differs from the public lock'
        return 'available', 'Public lock matches manifests, workspace links and direct package versions; package bytes not authenticated'
    except FileNotFoundError:
        return 'missing', 'Public package metadata or installation is missing'
    except (ValueError, TypeError, KeyError, OSError):
        return 'stale-dependencies', 'Public package metadata is invalid or inconsistent'


def runtime_status(root):
    path = root / '.internal/dev/reports/workspace-build.json'
    try:
        report, config = read_json(path), layout(root)
        if report.get('schema') != 'LIANUM_WORKSPACE_BUILD_V1' or not report.get('files'):
            return 'stale-generation', 'Compatibility build metadata is invalid'
        originals = {row['source']: row['path'] for row in config['files']}
        excluded = []
        for target, row in report['files'].items():
            relative(target)
            source = relative(row['source'])
            if '.local' in Path(source).parts:
                return 'stale-generation', 'Build metadata contains a non-public source'
            retained = originals.get(source) == target
            if retained and source in EXCLUDED_HISTORICAL_METADATA:
                excluded.append(source)
                continue
            retained_public = retained and (source.startswith(RETAINED_PUBLIC_PREFIXES)
                and Path(source).suffix in {'.mjs', '.json', '.css', '.html', '.md'}
                or source in RETAINED_PUBLIC_FILES)
            if ((source.split('/')[0] not in PUBLIC_ROOTS
                 or source.startswith('packages/proofs/evidence/')) and not retained_public):
                return 'stale-generation', 'Build metadata contains a non-public source'
            source_path = root / source
            destination = root / '.internal/runtime' / target
            if source_path.resolve() != source_path.absolute() or destination.resolve() != destination.absolute():
                return 'stale-generation', 'Compatibility source or destination is aliased'
            content = source_path.read_bytes()
            if map_path(source, config, 'runtime') != target or hashlib.sha256(content).hexdigest() != row['sourceSHA256']:
                return 'stale-generation', 'Editable sources differ from the recorded compatibility build'
            if source_path.suffix == '.mjs':
                content = translate(content.decode(), source, target, config, 'runtime', config.get('importSpellings', {}).get(source))[0].encode()
            if hashlib.sha256(content).hexdigest() != row['sha256'] or destination.read_bytes() != content:
                return 'stale-generation', 'Compatibility bytes or current import mappings changed'
        detail = 'Recorded public runtime sources match; financial releases and unrecorded files are not authenticated'
        if excluded:
            detail += '. Historical metadata excluded without reading or authenticating it: ' + ', '.join(excluded)
        return 'available', detail
    except FileNotFoundError:
        return ('missing' if not path.is_file() else 'stale-generation'), 'Compatibility build or recorded source file is missing'
    except (ValueError, TypeError, KeyError, OSError):
        return 'stale-generation', 'Compatibility metadata cannot be verified'


def inspect_profile(name, root=ROOT, data=None):
    data = data or catalog()
    if name not in data['profiles']:
        raise ValueError('Unknown lab profile: ' + name)
    profile_name, profile = name, data['profiles'][name]
    rows = []
    host_ok = sys.version_info >= (3, 12) and platform.system() == 'Linux' and platform.machine() in {'x86_64', 'AMD64'}
    rows.append({'id': 'host', 'status': 'available' if host_ok else 'missing', 'detail': 'Linux/WSL x64 and Python >=3.12 required'})
    for name in profile['requirements']:
        item = data['requirements'][name]
        if item['kind'] == 'npm':
            status, detail = npm_status(root, item['path'])
        elif item['kind'] == 'runtime':
            status, detail = runtime_status(root)
        else:
            path = root / item['path']
            present = path.is_file() and (item['kind'] != 'executable' or os.access(path, os.X_OK))
            status, detail = ('available' if present else 'missing'), item['scope']
        rows.append({'id': name, 'status': status, 'detail': detail, **({'path': item['path']} if 'path' in item else {})})
    for entry in profile['entrypoints']:
        rows.append({'id': 'entry:' + entry, 'path': entry, 'status': 'available' if (root / entry).is_file() else 'missing', 'detail': 'Public entrypoint presence only'})
    statuses = {row['status'] for row in rows}
    status = next((value for value in ('missing', 'stale-dependencies', 'stale-generation') if value in statuses), 'available')
    return {'schema': 'LIANUM_LAB_PROFILE_CHECK_V1', 'profile': profile_name,
            'status': status, 'coverage': data['coverage'], 'requirements': rows,
            'preparationActions': profile['prepare'], 'executionCommands': profile['commands'],
            'artifactIntegrityChecked': False, 'financialSourceGeneration': 'NOT_CHECKED',
            'financialAcceptance': False, 'nodesStarted': False,
            'scope': 'Available means this explicit minimum inventory only. Original loaders still authenticate tools, artifacts and economic sources.'}


def preparation_commands(report, root=ROOT):
    states = {row['id']: row['status'] for row in report['requirements']}
    commands = []
    if states.get('node') != 'available':
        commands.append([sys.executable, '-B', str(root / 'scripts/development/prepare-host-runtime.py')])
    for action in report['preparationActions']:
        prerequisite = 'source-dependencies' if action == 'source-runtime' else action
        if states.get(prerequisite) == 'available':
            continue
        if action == 'source-runtime':
            commands.append([sys.executable, '-B', str(root / 'scripts/development/source_runtime.py'), '--quiet'])
        elif action == 'compatibility-runtime':
            commands.append([sys.executable, '-B', str(root / 'scripts/development/workspace.py'), '--quiet'])
        else:
            application = 'services/api-server' if action == 'platform-dependencies' else 'apps/mobile'
            commands.append([str(root / NODE), str(root / NPM), '--prefix', application,
                             'ci', '--ignore-scripts', '--no-audit', '--no-fund'])
    return commands


def run_preparation(command, *, cwd, env, timeout, **_options):
    # Own and reap the entire preparation process group, including npm children.
    wrapped = ['/usr/bin/env', '-u', 'NODE_OPTIONS', '-u', 'NODE_PATH', '-u', 'NPM_CONFIG_CACHE',
               'PATH=' + env['PATH'], 'npm_config_cache=' + env['npm_config_cache'], *command]
    with open(os.devnull, 'w') as output:
        result = run_bounded(wrapped, cwd=cwd, timeout_seconds=timeout, output=output)
    if result['exitCode']:
        raise subprocess.CalledProcessError(result['exitCode'], command)


def prepare_profile(name, root=ROOT, data=None, runner=run_preparation):
    # Only preparation commands are compiled here. Catalog execution commands
    # are display-only and never become subprocess arguments.
    initial = inspect_profile(name, root, data)
    if initial['requirements'][0]['status'] != 'available':
        raise ValueError('Unsupported host for this profile')
    lock_dir = root / '.local/development'
    lock_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (lock_dir / 'lab-profile-prepare.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        before = inspect_profile(name, root, data)
        commands = preparation_commands(before, root)
        env = dict(os.environ, PATH=str(root / Path(NODE).parent) + os.pathsep + '/usr/bin:/bin')
        env.pop('NODE_OPTIONS', None)
        env.pop('NODE_PATH', None)
        env.pop('NPM_CONFIG_CACHE', None)
        env['npm_config_cache'] = str(root / '.local/cache/npm')
        for command in commands:
            runner(command, cwd=root, env=env, check=True, timeout=120,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        report = inspect_profile(name, root, data)
        report['preparationsExecuted'] = len(commands)
        return report


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('profiles').add_argument('--json', action='store_true')
    for command in ('plan', 'check', 'prepare-profile'):
        child = sub.add_parser(command)
        child.add_argument('profile')
        child.add_argument('--json', action='store_true')
    args = parser.parse_args(arguments)
    try:
        data = catalog()
        if args.command == 'profiles':
            result = {name: value['description'] for name, value in data['profiles'].items()}
        else:
            result = prepare_profile(args.profile, data=data) if args.command == 'prepare-profile' else inspect_profile(args.profile, data=data)
            result['preparationCommands'] = preparation_commands(result)
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        elif args.command == 'profiles':
            for name, description in result.items():
                print(name + ': ' + description)
        else:
            print(result['profile'] + ': ' + result['status'])
            for row in result['requirements']:
                print('  ' + row['id'] + ': ' + row['status'] + ' — ' + row['detail'])
            for command in result['preparationCommands']:
                print('  prepare: ' + ' '.join(command))
            print(result['scope'])
        return 0 if args.command in {'profiles', 'plan'} or result['status'] == 'available' else 1
    except (ValueError, TypeError, KeyError, OSError, subprocess.SubprocessError) as error:
        # Do not echo subprocess output or configuration values in diagnostics.
        print('Lab profile preparation/inspection failed: ' + type(error).__name__, file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
