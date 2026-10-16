#!/usr/bin/env python3
"""Offline courier for the actual Original Paged operator and public tools."""
import argparse
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

# Validation imports must never create an unlisted .pyc in the immutable courier.
sys.dont_write_bytecode = True

ROOT = next((p for p in Path(__file__).resolve().parents if (p / 'dev').is_file() and (p / 'packages').is_dir()), Path(__file__).resolve().parent.parent)
if (ROOT / 'scripts/development/source_bundle.py').is_file():
    sys.path.insert(0, str(ROOT / 'scripts/development'))
    import source_bundle as bundle
else:
    spec = importlib.util.spec_from_file_location('source_bundle', Path(__file__).parent.parent / 'candidate/run-source-bundle.py')
    bundle = importlib.util.module_from_spec(spec); spec.loader.exec_module(bundle)

ENTRY = 'packages/backend/src/operations/local/funded-paged-native-operator-v3.mjs'
PUBLIC_ENTRY = 'packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs'
ADDITIONAL = ['packages/proofs/src/jobs/worker.mjs',
              'packages/proofs/src/toolchain/paged-proof-process-v3.mjs']
# These are loaded by the delivered service helpers through a fixed candidate
# locator, rather than an import reachable from PUBLIC_ENTRY.
PUBLIC_RUNTIME_ROOTS = [
    'packages/backend/src/operations/recovery/paged-public-full-storage-financial-review-v9.mjs',
    'packages/backend/src/operations/recovery/paged-public-source-financial-window-v5.mjs',
    'packages/backend/src/operations/recovery/paged-uniswap-flat-read-recovery-v8.mjs',
    'packages/backend/src/api/mobile/device-paged-uniswap-flat-read-http-v8.mjs',
    'packages/backend/src/providers/paged-public-sepolia-defi-extension-v8.mjs',
    'packages/backend/src/operations/recovery/paged-captured-sepolia-defi-read-v8.mjs',
    'packages/backend/src/api/mobile/device-paged-sepolia-defi-read-http-v8.mjs',
    'packages/backend/src/operations/recovery/paged-source-read-recovery-issuer-v4.mjs',
    'packages/backend/src/api/mobile/device-paged-source-read-recovery-http-v4.mjs',
    'packages/backend/src/operations/deployments/defi/aave-sepolia-compilation-v4.mjs',
    'packages/backend/src/operations/deployments/defi/morpho-v2-sepolia-compilation-v4.mjs',
]
# These compilers read Solidity by a fixed filesystem locator, not a JS import.
PUBLIC_SOLIDITY_ROOTS = [
    'contracts/wallet/defi/PrivateSepoliaUniswapDeliveryV4.sol',
    'contracts/wallet/defi/PrivateAaveStaticDeliverySepoliaV4.sol',
    'contracts/wallet/defi/BoundedAaveStaticExitSepoliaV4.sol',
    'contracts/wallet/defi/PrivateMorphoVaultV2DeliverySepoliaV4.sol',
    'contracts/wallet/defi/BoundedMorphoVaultV2ExitSepoliaV4.sol',
]
BOOTSTRAP = 'services/paeg-engine/src/bootstrap/paged-native-bootstrap-v3.mjs'


def write_new(path, value):
    raw = bundle.canonical(value)
    with path.open('xb') as file:
        file.write(raw)
        file.flush(); os.fsync(file.fileno())
    path.chmod(0o644)


def delivery_module_bytes(source):
    """Infrastructure tools share the courier's single runtime module directory.

    The checkout keeps these modules under services; the explicit delivery
    layout remains stable for existing private state and systemd units.
    """
    raw = source.read_bytes()
    if source.suffix != '.mjs':
        return raw
    text = raw.decode()
    text = re.sub(r"(from\s+)(['\"])[^'\"]*services/paeg-engine/src/public/([A-Za-z0-9_-]+\.mjs)\2",
                  lambda match: match[1] + match[2] + './' + match[3] + match[2], text)
    # The service helpers live beside candidate/, outside its node_modules
    # lookup tree. Resolve this public DATA export to the same candidate file
    # rather than creating another package or permitting new release symlinks.
    candidate_imports = {
        '@lianum/mobile-protocol/device/sepolia-defi-connection-v7':
            'packages/mobile-protocol/src/device-sepolia-defi-connection-v7.mjs',
        '@lianum/mobile-protocol/device/paged-owner-v3':
            'packages/mobile-protocol/src/device-paged-owner-v3.mjs',
        '../../../../packages/backend/src/operations/recovery/paged-empty-source-replacement-data-v9.mjs':
            'packages/backend/src/operations/recovery/paged-empty-source-replacement-data-v9.mjs',
    }
    for original, candidate_path in candidate_imports.items():
        text = re.sub(r"(from\s+)(['\"])" + re.escape(original) + r"\2",
                      lambda match, path=candidate_path:
                          match[1] + match[2] + '../candidate/' + path + match[2], text)
    return text.encode()


def prepare(output, profile='local'):
    if profile not in {'local', 'public-testnet'}:
        raise ValueError('REMOTE_RELEASE_PROFILE')
    entry = PUBLIC_ENTRY if profile == 'public-testnet' else ENTRY
    spec = importlib.util.spec_from_file_location('paeg_public_resources', Path(__file__).with_name('public-resources.py'))
    resources_module = importlib.util.module_from_spec(spec); spec.loader.exec_module(resources_module)
    collect, state_directories = resources_module.collect, resources_module.STATE_DIRECTORIES
    if output.exists() or output.is_symlink():
        raise ValueError('REMOTE_RELEASE_ALREADY_EXISTS')
    resources = collect(ROOT)
    # The platform bootstrap is already exact adopted source. Its unused CLI
    # entry keeps its original absolute Node-location guard; we call only the
    # private startup/reopen functions, never rewrite that guard or alias it.
    adopted, _, _ = bundle.adopted_source_inventory(ROOT)
    if BOOTSTRAP not in adopted:
        raise ValueError('REMOTE_ORIGINAL_BOOTSTRAP_NOT_ADOPTED')
    output.mkdir(parents=True, mode=0o755)
    try:
        candidate = output / 'candidate'
        # Immutable courier only. Runtime resources live in a separate private
        # working copy, with public artifact files bound read-only by systemd.
        # This does not weaken bundle.verify's no-writable-overlap predicate.
        built = bundle.build(ROOT, candidate, entry, resources, ROOT, 'tools/node',
                             additional=ADDITIONAL + (PUBLIC_RUNTIME_ROOTS + PUBLIC_SOLIDITY_ROOTS if profile == 'public-testnet' else []),
                             adopted_generation=True)
        generation = bundle.verify(candidate)['adoptedGeneration']
        infra = output / 'infra'; infra.mkdir()
        for source in sorted(Path(__file__).parent.iterdir()):
            if source.is_file() and (source.suffix in {'.mjs', '.py', '.json', '.service', '.sh', '.md'}
                                     or source.name == 'Caddyfile.example'):
                target = infra / source.name
                target.write_bytes(delivery_module_bytes(source))
                target.chmod(0o755 if source.suffix in {'.sh', '.py'} else 0o644)
        runtime = ROOT / 'services/paeg-engine/src'
        for source in sorted((runtime / 'public').glob('*.mjs')):
            (infra / source.name).write_bytes(delivery_module_bytes(source))
            (infra / source.name).chmod(0o644)
        if profile == 'public-testnet':
            # Exercise the delivered lookup tree, not the checkout's workspace
            # aliases. This module only defines public routing/DATA functions.
            subprocess.run([str((candidate / 'resources/tools/node').resolve()),
                            '--input-type=module', '-e',
                            "await import('./infra/public-sepolia-defi-mode-v8.mjs')"],
                           cwd=output, env={'PATH': '/usr/bin:/bin'}, check=True)
        shutil.copyfile(runtime / 'local/run-operator.mjs', infra / 'run-operator.mjs')
        write_new(output / 'public-resources.json', resources)
        write_new(output / 'deployment-readiness.json', {
            'schema': 'LIANUM_PAEG_REMOTE_RELEASE_READINESS_V1',
            'profile': 'NEW_PUBLIC_TESTNET_STAGING' if profile == 'public-testnet' else 'NEW_LOCAL_SYNTHETIC_MIXED_STAGING',
            'sourceGeneration': generation,
            'sourceBundleSHA256': built['bundleSHA256'],
            'publicMobileIngressReady': False, 'publicChainDeployment': False,
            'publicTestnetProvidersReady': False, 'automaticFunding': False,
            'secretsIncluded': False, 'historicalWalletsIncluded': False,
            'workingStateDirectories': state_directories,
            'proverThreads': 12, 'maximumHeavyJobs': 1,
            'heavyJobQueue': {'maximumJobs': 1, 'scheduling': 'PHYSICAL_DIRECTORY_FLOCK_V4',
                             'clients': ['ORIGINAL_PAGED_NATIVE_V3', 'ORIGINAL_PC23_TWO_PRIVATE_IPC_V4']},
            'remoteExecutionAcceptance': False})
        files, links = {}, {}
        for parent, directories, names in os.walk(output, followlinks=False):
            for name in directories[:]:
                path = Path(parent) / name
                if path.is_symlink():
                    links[path.relative_to(output).as_posix()] = os.readlink(path)
                    directories.remove(name)
            for name in names:
                path = Path(parent) / name
                if path.is_symlink():
                    links[path.relative_to(output).as_posix()] = os.readlink(path)
                else:
                    files[path.relative_to(output).as_posix()] = bundle.file_record(path)
        write_new(output / 'release-manifest.json', {
            'schema': 'LIANUM_PAEG_REMOTE_RELEASE_V1', 'status': 'STAGING_NOT_DEPLOYED',
            'financialAcceptance': False, 'files': files, 'links': links})
        return {'profile': 'LIANUM_PAEG_REMOTE_RELEASE_V1', 'directory': str(output),
                'manifestSHA256': bundle.sha(output / 'release-manifest.json'),
                'sourceGeneration': generation, 'files': len(files),
                'publicResourceBytes': sum(bundle.physical(ROOT, row['source']).stat().st_size for row in resources['files']),
                'privateStateIncluded': False, 'publicMobileIngressReady': False}
    except BaseException:
        # Keep a rejected candidate visible for diagnosis; never replace it.
        raise


def verify(root, expected):
    manifest_path = bundle.physical(root, 'release-manifest.json')
    if bundle.sha(manifest_path) != expected:
        raise ValueError('REMOTE_RELEASE_MANIFEST_PIN')
    manifest = json.loads(manifest_path.read_bytes())
    if manifest.get('schema') != 'LIANUM_PAEG_REMOTE_RELEASE_V1':
        raise ValueError('REMOTE_RELEASE_MANIFEST_SCHEMA')
    actual_files, actual_links = set(), {}
    for parent, directories, names in os.walk(root, followlinks=False):
        for name in directories[:]:
            path = Path(parent) / name
            if path.is_symlink():
                actual_links[path.relative_to(root).as_posix()] = os.readlink(path)
                directories.remove(name)
        for name in names:
            path = Path(parent) / name; relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                actual_links[relative] = os.readlink(path)
            elif relative != 'release-manifest.json':
                actual_files.add(relative)
                if manifest['files'].get(relative) != bundle.file_record(bundle.physical(root, relative)):
                    raise ValueError('REMOTE_RELEASE_FILE_PIN')
    if actual_files != set(manifest['files']) or actual_links != manifest['links']:
        raise ValueError('REMOTE_RELEASE_CLOSED_INVENTORY')
    candidate = bundle.verify(root / 'candidate')
    for path, target in actual_links.items():
        expected_link = candidate['links'].get(path.removeprefix('candidate/'))
        if not path.startswith('candidate/') or target != expected_link or not (root / path).resolve().is_relative_to(root / 'candidate'):
            raise ValueError('REMOTE_RELEASE_LINK')
    return {'verified': True, 'manifestSHA256': expected, 'files': len(actual_files), 'secretsIncluded': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    plan = sub.add_parser('plan'); plan.add_argument('--profile', choices=['local', 'public-testnet'], default='local')
    make = sub.add_parser('build'); make.add_argument('--out', type=Path, required=True); make.add_argument('--profile', choices=['local', 'public-testnet'], default='local')
    check = sub.add_parser('verify'); check.add_argument('--directory', type=Path, required=True); check.add_argument('--sha256', required=True)
    archive = sub.add_parser('archive'); archive.add_argument('--directory', type=Path, required=True); archive.add_argument('--sha256', required=True); archive.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'plan':
        entry = PUBLIC_ENTRY if args.profile == 'public-testnet' else ENTRY
        files, dependencies, _ = bundle.source_closure(ROOT, entry, ADDITIONAL)
        adopted, _, generation = bundle.adopted_source_inventory(ROOT)
        if BOOTSTRAP not in adopted:
            raise ValueError('REMOTE_ORIGINAL_BOOTSTRAP_NOT_ADOPTED')
        # Match the build's already authenticated native-wallet inventory.
        # Discovery reports bare imports even when their exact npm bytes are
        # included in the adopted generation; unknown consumers still fail.
        unresolved = []
        for consumer, specifier in sorted(dependencies):
            parts = specifier.split('/')
            name = '/'.join(parts[:2]) if specifier.startswith('@') else parts[0]
            if not (consumer in adopted and consumer.startswith('packages/crypto/src/')
                    and name in bundle.NATIVE_NPM_PACKAGES
                    and 'node_modules/' + name + '/package.json' in adopted):
                unresolved.append((consumer, specifier))
        if unresolved:
            raise ValueError('REMOTE_UNPINNED_SOURCE_DEPENDENCY')
        result = {'entry': entry, 'sourceClosureFiles': len(files), 'adoptedInventoryFiles': len(adopted),
                  'adoptedGeneration': generation, 'sourceAndArtifactCurrentnessVerified': False,
                  'publicMobileIngressReady': False, 'runtimeStarted': False, 'proofGenerated': False}
    elif args.command == 'build':
        result = prepare(args.out.absolute(), args.profile)
    else:
        directory = args.directory.resolve(); result = verify(directory, args.sha256)
        if args.command == 'archive':
            if args.out.exists():
                raise ValueError('REMOTE_ARCHIVE_ALREADY_EXISTS')
            with tarfile.open(args.out, 'x:gz', dereference=False) as archive:
                archive.add(directory, arcname='release', recursive=True)
            result['archiveSHA256'] = bundle.sha(args.out); result['archiveBytes'] = args.out.stat().st_size
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as error:
        # Packaging sees only public paths. Still avoid emitting unbounded
        # exception text; a failed build never becomes a deployable release.
        first = str(error).split('\n', 1)[0]
        code = first if len(first) <= 160 and first.startswith(('PUBLIC_', 'REMOTE_')) else 'REMOTE_PACKAGE_VALIDATION_FAILED'
        print(json.dumps({'status': 'BLOCKED', 'code': code, 'runtimeStarted': False,
                          'proofGenerated': False, 'financialAcceptance': False}))
        raise SystemExit(1)
