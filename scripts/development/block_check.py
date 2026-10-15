#!/usr/bin/env python3
"""Complete maintained test inventory and sequential revision-bound block checks."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

from bounded_process import run_bounded
from run_tests import revision
from module_boundaries import imports as literal_imports

ROOT = Path(__file__).resolve().parents[2]
NODE = ROOT / '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
EXCLUDED = {
    'node_modules': 'Installed dependency code, not maintained repository tests.',
    'archive': 'Retained historical evidence, not the active test/source tree.',
    '.local': 'Private state, artifacts and one-off work directories.',
    '.internal': 'Materialized runtime/resources and reports; active sources are checked separately.',
    '.git': 'Git metadata.',
    'dist': 'Generated output.', 'build': 'Generated output.',
    '__pycache__': 'Generated Python bytecode.',
}
SOURCE_SUFFIXES = {'.mjs', '.js', '.cjs', '.ts', '.tsx', '.mts', '.cts'}
NODE_TEST = re.compile(r'\.test\.(?:mjs|cjs|js|mts|cts|ts)$')
UNSUPPORTED_TEST = re.compile(r'\.test\.[^.]+$')


def walk(root, directory, exclusions):
    """No symlink traversal and no broad recursive app/package discovery."""
    base = root / directory
    if not base.is_dir():
        return
    for current, folders, names in os.walk(base, followlinks=False):
        current_path = Path(current)
        kept = []
        for name in sorted(folders):
            child = current_path / name
            relative = child.relative_to(root).as_posix()
            if child.is_symlink():
                exclusions.append({'path': relative, 'reason': 'Symlink directory is not followed.'})
            elif name in EXCLUDED:
                exclusions.append({'path': relative, 'reason': EXCLUDED[name]})
            else:
                kept.append(name)
        folders[:] = kept
        for name in sorted(names):
            path = current_path / name
            if path.is_symlink():
                exclusions.append({'path': path.relative_to(root).as_posix(),
                                   'reason': 'Symlink file requires separate review.'})
            elif path.is_file():
                yield path.relative_to(root).as_posix()


def discover(root=ROOT):
    root = Path(root)
    directories = []
    for area in ('packages', 'apps', 'services'):
        parent = root / area
        if parent.is_dir():
            directories.extend(path.relative_to(root).as_posix() for path in sorted(parent.glob('*/tests'))
                               if path.is_dir() and not path.is_symlink())
    directories.extend(path for path in ('tests', 'scripts/development', 'infra/google-cloud/paeg-engine') if (root / path).is_dir())
    nodes, python, unsupported, exclusions = set(), set(), [], []
    for directory in directories:
        for path in walk(root, directory, exclusions):
            name = Path(path).name
            if NODE_TEST.search(name):
                nodes.add(path)
            elif re.match(r'^test[-_].*\.py$', name):
                python.add(path)
            elif UNSUPPORTED_TEST.search(name):
                unsupported.append({'path': path, 'reason': 'Unsupported maintained test format; closure fails rather than omitting it.'})
    sources = set()
    for area in ('packages', 'apps', 'services'):
        parent = root / area
        if not parent.is_dir():
            continue
        for source in sorted(parent.glob('*/src')):
            if source.is_dir() and not source.is_symlink():
                for path in walk(root, source.relative_to(root).as_posix(), exclusions):
                    if Path(path).suffix in SOURCE_SUFFIXES and not re.search(r'\.d\.(ts|mts|cts)$', path):
                        sources.add(path)
    # Application entry/config/plugin/build scripts are active consumers too.
    apps = root / 'apps'
    if apps.is_dir():
        for app in sorted(apps.iterdir()):
            if not app.is_dir() or app.is_symlink():
                continue
            for path in sorted(app.iterdir()):
                if path.is_file() and not path.is_symlink() and path.suffix in SOURCE_SUFFIXES:
                    sources.add(path.relative_to(root).as_posix())
            for name in ('scripts', 'plugins'):
                for path in walk(root, (app / name).relative_to(root).as_posix(), exclusions):
                    if Path(path).suffix in SOURCE_SUFFIXES and not NODE_TEST.search(path):
                        sources.add(path)
    for path in walk(root, 'scripts/development', exclusions):
        if Path(path).suffix in SOURCE_SUFFIXES and not NODE_TEST.search(path):
            sources.add(path)
    historical = historical_policy(root, sources)
    sources.difference_update(row['path'] for row in historical['excluded'])
    exclusions.extend(historical['excluded'])
    manifests = {'package.json', 'package-lock.json', 'dev',
                 'scripts/development/dev', 'scripts/module-boundaries.json',
                 'scripts/development/static-check-exceptions.json',
                 'scripts/development/static-bindings.json',
                 'scripts/development/static-operation-ports.json',
                 'scripts/development/tsconfig.checkjs.json', 'scripts/historical-module-inventory.json'}
    for area in ('packages', 'apps', 'services'):
        if (root / area).is_dir():
            for pattern in ('*/package.json', '*/package-lock.json', '*/tsconfig*.json'):
                manifests.update(path.relative_to(root).as_posix() for path in (root / area).glob(pattern)
                                 if path.is_file() and not path.is_symlink())
    return {'testDirectories': directories, 'nodeTests': sorted(nodes), 'pythonTests': sorted(python),
            'sourceFiles': sorted(sources), 'unsupportedTests': unsupported,
            'historicalEvidence': historical['verified'], 'historicalEvidenceIssues': historical['issues'],
            'explicitExclusions': sorted(exclusions, key=lambda row: (row['path'], row['reason'])),
            'excludedDirectoryPolicy': EXCLUDED,
            'revisionFiles': sorted(nodes | python | sources | {row['path'] for row in historical['verified']} | {path for path in manifests if (root / path).is_file()}),
            'outsideScope': ['Standalone browser/economic drivers without a .test.* filename are separate acceptance paths.',
                             'Historical archive/.internal code and installed dependencies are not active authored sources.',
                             'Physical devices, deployed merchant configuration and real-network payments are not implied by a host test pass.']}


def historical_policy(root, sources):
    """Frozen bytes are evidence; reachable compatibility exports stay active."""
    root = Path(root)
    inventory = root / 'scripts/historical-module-inventory.json'
    if not inventory.is_file():
        return {'excluded': [], 'verified': [], 'issues': []}
    data = json.loads(inventory.read_text())
    if data.get('schema') != 'LIANUM_HISTORICAL_MODULE_INVENTORY_V1':
        raise ValueError('Unknown historical inventory schema')
    pairs = {row['historical']: row for row in data['pairs']}
    # The inventory also retains originals without a promoted successor. They
    # must be hash-verified too; seeding them as active reaches frozen workers.
    for row in data.get('historicalFiles', []):
        pairs.setdefault(row['path'], {'historical': row['path'],
                                      'historicalSHA256': row['sha256'], 'active': None})
    verified, issues = [], []
    for path, row in pairs.items():
        target = root / path
        actual = None
        if target.is_file() and not target.is_symlink():
            with target.open('rb') as stream:
                actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        item = {'path': path, 'sha256': actual, 'expectedSHA256': row['historicalSHA256'],
                'activeSuccessor': row['active']}
        verified.append(item)
        if actual != row['historicalSHA256']:
            issues.append({'path': path, 'kind': 'HISTORICAL_BYTES_CHANGED_OR_MISSING'})
    packages = {}
    for manifest in (root / 'packages').glob('*/package.json'):
        value = json.loads(manifest.read_text())
        packages[value.get('name')] = (manifest.parent, value)
    def target_for_exports(value):
        if isinstance(value, str):
            return [value]
        if isinstance(value, dict):
            # Runtime condition variants are all active, declarations are not.
            return [path for condition, target in value.items() if condition != 'types'
                    for path in target_for_exports(target)]
        if isinstance(value, list):
            return [path for target in value for path in target_for_exports(target)]
        return []
    reachable = set(sources) - set(pairs)
    for directory, manifest in packages.values():
        if manifest.get('lianum', {}).get('status') != 'compatibility':
            continue
        for target in target_for_exports(manifest.get('exports', {})):
            if '*' not in target:
                reachable.add((directory / target).relative_to(root).as_posix())
    todo = list(reachable)
    scanned = set()
    while todo:
        path = todo.pop()
        if path in scanned:
            continue
        scanned.add(path)
        source = root / path
        if not source.is_file() or source.is_symlink() or source.suffix not in SOURCE_SUFFIXES:
            continue
        for specifier in literal_imports(source.read_text()):
            target = None
            if specifier.startswith('.'):
                candidate = (source.parent / specifier).resolve()
                try:
                    target = candidate.relative_to(root.resolve()).as_posix()
                except ValueError:
                    continue
            elif specifier.startswith('@lianum/'):
                package_name = '/'.join(specifier.split('/')[:2])
                selected = packages.get(package_name)
                if selected:
                    directory, manifest = selected
                    subpath = '.' + ('/' + '/'.join(specifier.split('/')[2:]) if len(specifier.split('/')) > 2 else '')
                    exports = manifest.get('exports', {})
                    value = exports.get(subpath) if isinstance(exports, dict) else exports if subpath == '.' else None
                    for exported in target_for_exports(value):
                        if '*' not in exported:
                            child = (directory / exported).relative_to(root).as_posix()
                            if child not in reachable:
                                reachable.add(child); todo.append(child)
            if target and target not in reachable:
                reachable.add(target); todo.append(target)
    excluded = [{'path': path, 'reason': 'Exact frozen historical inventory entry; bytes verified and not reachable from active sources or exported compatibility routes.',
                 'inventory': 'scripts/historical-module-inventory.json', 'activeSuccessor': row['active']}
                for path, row in pairs.items() if path not in reachable and not any(issue['path'] == path for issue in issues)]
    return {'excluded': excluded, 'verified': verified, 'issues': issues}


def content_revision(plan, root=ROOT):
    digest = hashlib.sha256()
    for path in plan['revisionFiles']:
        digest.update(path.encode() + b'\0')
        target = Path(root) / path
        if target.is_file():
            with target.open('rb') as stream:
                digest.update(hashlib.file_digest(stream, 'sha256').digest())
        else:
            digest.update(b'MISSING')
    return digest.hexdigest()


def python_command(path, root=ROOT):
    """unittest loader counts tests/skips even when a file has no main block."""
    module = ('import importlib.util,json,sys,unittest; '
              'path=sys.argv[1]; sys.path.insert(0,str(__import__("pathlib").Path(path).parent)); '
              'spec=importlib.util.spec_from_file_location("block_test_module",path); '
              'module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module); '
              'suite=unittest.defaultTestLoader.loadTestsFromModule(module); '
              'result=unittest.TextTestRunner(verbosity=2).run(suite); '
              'print("LIANUM_BLOCK_UNITTEST "+json.dumps({"tests":result.testsRun,"fail":len(result.failures),'
              '"errors":len(result.errors),"skipped":len(result.skipped),"expectedFailures":len(result.expectedFailures),'
              '"unexpectedSuccesses":len(result.unexpectedSuccesses)})); '
              'sys.exit(0 if result.wasSuccessful() else 1)')
    return [sys.executable, '-B', '-c', module, str(Path(root) / path)]


def stages(plan, root=ROOT):
    root = Path(root)
    node = root / NODE.relative_to(ROOT)
    result = [
        {'id': 'runtime-imports', 'command': [str(node), '--max-old-space-size=768',
                                           str(root / 'scripts/development/block-imports.mjs')], 'cwd': str(root)},
        {'id': 'boundaries', 'command': [sys.executable, '-B', str(root / 'scripts/development/module_boundaries.py')], 'cwd': str(root)},
        {'id': 'static', 'command': [str(node), '--max-old-space-size=768', str(root / 'scripts/development/static-check.mjs')], 'cwd': str(root)},
        {'id': 'mobile-types', 'command': [str(node), str(root / 'apps/mobile/node_modules/typescript/bin/tsc'), '--noEmit'], 'cwd': str(root / 'apps/mobile')},
    ]
    for path in plan['pythonTests']:
        result.append({'id': 'python:' + path, 'file': path, 'kind': 'python', 'command': python_command(path, root), 'cwd': str(root)})
    # Individual Node files keep an honest per-file result if a later suite fails
    # and avoid feeding six hundred test names through a shell/argument limit.
    for path in plan['nodeTests']:
        # The complete closure runs the real isolated PostgreSQL fixture. The
        # ordinary app command may opt out; a block may never report that skip
        # as success. Keep the activation visible in its exact command.
        activation = {
            'services/api-server/tests/postgres.test.mjs': 'LIANUM_TEST_POSTGRES_DOCKER=1',
            'packages/engine/tests/assembly/private-assembly-history.test.mjs': 'PC18_RUN_POOL_COMPILE_TEST=1',
        }
        environment = ['/usr/bin/env', activation[path]] if path in activation else []
        result.append({'id': 'node:' + path, 'file': path, 'kind': 'node',
                       'command': [*environment, str(node), '--max-old-space-size=768', '--test-concurrency=1',
                                   '--experimental-test-module-mocks', '--test-reporter=tap', '--test', str(root / path)], 'cwd': str(root)})
    return result


def test_counts(stage, output):
    if stage.get('kind') == 'node':
        counts = {key: int(value) for key, value in re.findall(
            r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', output, re.MULTILINE)}
        complete = bool(counts.get('tests')) and counts.get('pass') == counts.get('tests') and not any(
            counts.get(key, 0) for key in ('fail', 'cancelled', 'skipped', 'todo'))
        return counts, complete
    if stage.get('kind') == 'python':
        matches = re.findall(r'^LIANUM_BLOCK_UNITTEST (\{.*\})$', output, re.MULTILINE)
        counts = json.loads(matches[-1]) if matches else {}
        complete = bool(counts.get('tests')) and not any(counts.get(key, 0) for key in
                                                       ('fail', 'errors', 'skipped', 'expectedFailures', 'unexpectedSuccesses'))
        return counts, complete
    return None, True


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', action='store_true', help='Print the complete inventory and commands; execute nothing.')
    parser.add_argument('--timeout', type=float, default=7200, help='Global wall-time budget for the entire sequential closure (default 7200s).')
    parser.add_argument('--stage-timeout', type=float, default=600, help='Maximum seconds for one test/check (default 600s).')
    args = parser.parse_args(arguments)
    if any(not math.isfinite(value) or value <= 0 for value in (args.timeout, args.stage_timeout)):
        parser.error('Timeouts must be finite and positive')
    plan = discover()
    plan.update(profile='LIANUM_BLOCK_CHECK_PLAN_V1', commands=stages(plan),
                contentSHA256=content_revision(plan), timeoutSeconds=args.timeout,
                stageTimeoutSeconds=args.stage_timeout)
    if args.plan:
        print(json.dumps(plan, indent=2))
        return 0
    run_id = str(uuid.uuid4())
    directory = ROOT / '.internal/dev/reports' / ('block-check-' + run_id)
    directory.mkdir(parents=True, mode=0o700)
    report = {'profile': 'LIANUM_BLOCK_CHECK_RESULT_V1', 'runId': run_id, 'status': 'RUNNING',
              'startedAt': datetime.now(timezone.utc).isoformat(), 'plan': plan,
              'revision': revision(), 'stages': [], 'noSkippedTestsAllowed': True,
              'scope': 'All maintained Node/unittest test files discovered in the declared exact roots plus import/static/boundary/mobile type gates. Outside-scope acceptance paths remain explicit.'}
    report_path = directory / 'report.json'
    def save():
        report_path.write_text(json.dumps(report, indent=2) + '\n')
    save()
    if plan['unsupportedTests'] or plan['historicalEvidenceIssues'] or not plan['nodeTests'] or not plan['pythonTests']:
        report['status'] = 'INCOMPLETE_DISCOVERY'; save()
        print('INCOMPLETE_DISCOVERY: ' + str(report_path)); return 2
    if not NODE.is_file():
        report['status'] = 'TOOL_MISSING'; save()
        print('TOOL_MISSING: run ./dev prepare host before closure. ' + str(report_path)); return 2
    # Do not silently prepare/adopt a source generation or install dependencies.
    exceptions = json.loads((ROOT / 'scripts/development/static-check-exceptions.json').read_text())['missingHistoricalImports']
    import_input = directory / 'imports-input.json'
    import_input.write_text(json.dumps({'root': str(ROOT), 'files': plan['sourceFiles'], 'exceptions': exceptions}))
    import_input.chmod(0o600)
    started = time.monotonic()
    failure = False
    for index, stage in enumerate(plan['commands']):
        remaining = args.timeout - (time.monotonic() - started)
        if remaining <= 0:
            report['status'] = 'TIMEOUT'; failure = True; break
        if content_revision(discover()) != plan['contentSHA256'] or revision() != report['revision']:
            report['status'] = 'SOURCE_CHANGED'; failure = True; break
        command = stage['command']
        # Public source inventory is report DATA, not an adopted config/source.
        # A file avoids shell interpolation and the operating system argv limit.
        if stage['id'] == 'runtime-imports':
            command = [*command, str(import_input)]
        print(f"[{index + 1}/{len(plan['commands'])}] {stage['id']}", flush=True)
        result = run_bounded(command, cwd=stage['cwd'], timeout_seconds=min(remaining, args.stage_timeout),
                             log_path=directory / f'{index + 1:04d}.log', max_output_bytes=16 * 1024 * 1024)
        counts, complete = test_counts(stage, result['stdout'])
        record = {'id': stage['id'], 'status': result['status'], 'exitCode': result['exitCode'],
                  'durationSeconds': result['durationSeconds'], 'counts': counts,
                  'log': f'{index + 1:04d}.log'}
        if result['status'] == 'PASS' and not complete:
            record.update(status='INCOMPLETE_TEST_PASS', exitCode=2)
        if stage['id'] == 'runtime-imports':
            try:
                audit = json.loads(result['stdout'])
                record['audit'] = audit
            except ValueError:
                record.update(status='IMPORT_REPORT_INVALID', exitCode=2)
        report['stages'].append(record); save()
        if record['status'] != 'PASS':
            failure = True
            if record['status'] in ('CANCELLED', 'TIMEOUT', 'ORPHANED_PROCESS', 'OUTPUT_LIMIT'):
                report['status'] = record['status']; break
            # Keep going after ordinary failures so the full report names every
            # completed family; it never turns a partial result into a pass.
    report['revisionAtEnd'] = revision()
    ending_plan = discover()
    report['contentSHA256AtEnd'] = content_revision(ending_plan)
    report['sourceChangedDuringRun'] = report['revision'] != report['revisionAtEnd'] or plan['contentSHA256'] != report['contentSHA256AtEnd']
    if report['sourceChangedDuringRun']:
        report['status'] = 'SOURCE_CHANGED'
    elif report['status'] == 'RUNNING':
        report['status'] = 'FAIL' if failure else 'PASS' if len(report['stages']) == len(plan['commands']) else 'INCOMPLETE'
    report['finishedAt'] = datetime.now(timezone.utc).isoformat()
    report['durationSeconds'] = round(time.monotonic() - started, 3)
    report['completedStages'] = len(report['stages'])
    report['totalStages'] = len(plan['commands'])
    save(); print(report['status'] + ': ' + str(report_path))
    return 0 if report['status'] == 'PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())
