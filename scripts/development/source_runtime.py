"""Prepare standard npm workspace links without materializing legacy sources."""
import json
import fcntl
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
NODE_DIRECTORY = ROOT / '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin'
NODE = NODE_DIRECTORY / 'node'
NPM = NODE_DIRECTORY.parent / 'lib/node_modules/npm/bin/npm-cli.js'
DEPENDENCY_FIELDS = ('dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies')
UPDATE_LOCK = './dev npm install --package-lock-only --ignore-scripts --no-audit --no-fund'


def installation_inputs():
    """Read only manifests, and reject stale locks before trusting an install."""
    paths = ['package.json', 'package-lock.json']
    try:
        raw = {path: (ROOT / path).read_bytes() for path in paths}
        config, lock = (json.loads(raw[path]) for path in paths)
        workspace = config['workspaces']
        locked = lock['packages']
        if lock.get('lockfileVersion', 0) < 2 or not isinstance(workspace, list):
            raise ValueError('formato no compatible')
        packages = []
        for path in workspace:
            file = path + '/package.json'
            raw[file] = (ROOT / file).read_bytes()
            packages.append((ROOT / path, json.loads(raw[file])))
        manifests = [(ROOT, config), *packages]
        for directory, manifest in manifests:
            key = '' if directory == ROOT else directory.relative_to(ROOT).as_posix()
            saved = locked.get(key)
            if not isinstance(saved, dict):
                raise ValueError(f'falta {key or "raíz"} en el lock')
            for field in DEPENDENCY_FIELDS:
                if manifest.get(field, {}) != saved.get(field, {}):
                    raise ValueError(f'{key or "raíz"}: {field}')
            for field in ('name', 'version'):
                if manifest.get(field) != saved.get(field):
                    raise ValueError(f'{key or "raíz"}: {field}')
        if locked[''].get('workspaces') != workspace:
            raise ValueError('lista de workspaces')
        for directory, manifest in packages:
            entry = locked.get('node_modules/' + manifest['name'], {})
            if entry.get('link') is not True or entry.get('resolved') != directory.relative_to(ROOT).as_posix():
                raise ValueError(f'enlace de {manifest["name"]}')
    except (FileNotFoundError, KeyError, TypeError, ValueError) as error:
        raise SystemExit(f'package-lock.json ausente o desfasado ({error}). Ejecuta: {UPDATE_LOCK}') from error
    fingerprint = hashlib.sha256()
    for path, content in sorted(raw.items()):
        fingerprint.update(path.encode() + b'\0' + content + b'\0')
    return {'fingerprint': fingerprint.hexdigest(), 'packages': packages,
            'manifests': manifests, 'locked': locked}


def installed(inputs):
    """Check links and direct dependency manifests, never scan dependency trees."""
    for directory, manifest in inputs['packages']:
        if (ROOT / 'node_modules' / manifest['name']).resolve() != directory.resolve():
            return False
    local_names = {manifest['name'] for _, manifest in inputs['packages']}
    for directory, manifest in inputs['manifests']:
        dependencies = {**manifest.get('dependencies', {}), **manifest.get('devDependencies', {})}
        for name in dependencies:
            if name in local_names:
                continue
            ancestor = directory
            while True:
                module = ancestor / 'node_modules' / name
                declaration = module / 'package.json'
                if declaration.is_file():
                    try:
                        actual = json.loads(declaration.read_text())
                        expected = inputs['locked'][module.relative_to(ROOT).as_posix()]
                    except (KeyError, ValueError, OSError):
                        return False
                    if actual.get('name') != name or actual.get('version') != expected.get('version'):
                        return False
                    break
                if ancestor == ROOT:
                    return False
                ancestor = ancestor.parent
    return True


def stamp_matches(path, inputs):
    try:
        saved = json.loads(path.read_text())
        return (saved.get('schema') == 'LIANUM_SOURCE_INSTALLATION_V1'
                and saved.get('fingerprint') == inputs['fingerprint'])
    except (FileNotFoundError, ValueError, AttributeError):
        return False


def record_installation(path, inputs):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', prefix='.source-runtime-', dir=path.parent,
                                         delete=False) as stream:
            temporary = Path(stream.name)
            json.dump({'schema': 'LIANUM_SOURCE_INSTALLATION_V1',
                       'fingerprint': inputs['fingerprint']}, stream)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def prepare(quiet=False):
    if not NODE.is_file():
        raise SystemExit('Falta Node local. Ejecuta: python3 scripts/development/prepare-host-runtime.py')
    inputs = installation_inputs()
    directory = ROOT / '.local/development'
    stamp = directory / 'source-runtime.json'
    if not stamp_matches(stamp, inputs) or not installed(inputs):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (directory / 'source-runtime.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            inputs = installation_inputs()
            if not stamp_matches(stamp, inputs) or not installed(inputs):
                env = dict(os.environ, PATH=str(NODE_DIRECTORY) + os.pathsep + os.environ.get('PATH', ''))
                env.pop('NODE_OPTIONS', None)
                env.pop('NODE_PATH', None)
                env.pop('NPM_CONFIG_CACHE', None)
                env['npm_config_cache'] = str(ROOT / '.local/cache/npm')
                subprocess.run([str(NODE), str(NPM), 'ci', '--ignore-scripts', '--include=dev',
                                '--no-audit', '--no-fund'], cwd=ROOT, env=env, check=True)
                after = installation_inputs()
                if after['fingerprint'] != inputs['fingerprint']:
                    raise RuntimeError('Los manifiestos cambiaron durante npm ci. Repite ./dev build.')
                if not installed(after):
                    raise RuntimeError('Dependencias incompletas tras npm ci. Revisa ./dev npm ci --ignore-scripts --include=dev.')
                record_installation(stamp, after)
    if not quiet:
        print(f'Source runtime ready: {len(inputs["packages"])} local packages; apps/ and packages/ execute directly.')


if __name__ == '__main__':
    import sys
    prepare(quiet='--quiet' in sys.argv[1:])
