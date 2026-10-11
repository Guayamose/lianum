"""Profile tests use temporary public fixtures; no app install or laboratory runs."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import lab_profiles as labs


class LabProfileTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.data = labs.catalog()
        self.write(labs.NODE, '#!/bin/sh\nexit 99\n')
        (self.root / labs.NODE).chmod(0o755)
        package = {'name': 'fixture', 'version': '1.0.0', 'workspaces': ['packages/core']}
        core = {'name': '@lianum/core', 'version': '1.0.0'}
        self.json('package.json', package)
        self.json('packages/core/package.json', core)
        self.json('package-lock.json', {'lockfileVersion': 3, 'packages': {'': package, 'packages/core': core,
                  'node_modules/@lianum/core': {'resolved': 'packages/core', 'link': True}}})
        link = self.root / 'node_modules/@lianum/core'
        link.parent.mkdir(parents=True)
        link.symlink_to(self.root / 'packages/core', target_is_directory=True)
        for profile in self.data['profiles'].values():
            for entry in profile['entrypoints']:
                self.write(entry, '// public fixture entry\n')

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value)

    def json(self, path, value):
        self.write(path, json.dumps(value))

    def profile(self, name):
        return labs.inspect_profile(name, self.root, self.data)

    def runtime(self):
        source, target, content = 'packages/core/src/run.mjs', 'core/run.mjs', 'export const value = 1;\n'
        self.write(source, content)
        self.write('.internal/runtime/' + target, content)
        self.json('scripts/layout.json', {'files': [{'source': source, 'path': target}],
                  'rules': [{'source': 'packages/core/src/', 'runtime': 'core/'}], 'importSpellings': {}})
        sha = hashlib.sha256(content.encode()).hexdigest()
        self.json('.internal/dev/reports/workspace-build.json', {'schema': 'LIANUM_WORKSPACE_BUILD_V1',
                  'files': {target: {'source': source, 'sourceSHA256': sha, 'sha256': sha}}})
        return source, target

    def test_catalog_rejects_effectful_preparation_and_escaping_paths(self):
        for change in [lambda d: d['profiles']['evm']['prepare'].append('run'),
                       lambda d: d['profiles']['host']['prepare'].append('compatibility-runtime'),
                       lambda d: d['requirements']['node'].update(path='../outside'),
                       lambda d: d['requirements']['node'].update(path='.env.local'),
                       lambda d: d['profiles']['wallet']['entrypoints'].append('.local/wallet.json')]:
            data = copy.deepcopy(self.data)
            change(data)
            self.json('fixture-catalog.json', data)
            with self.assertRaises(ValueError):
                labs.catalog(self.root / 'fixture-catalog.json')

    def test_plan_and_check_only_read_public_inventory_without_processes_or_side_effects(self):
        self.write('.env', 'PRIVATE_SENTINEL')
        self.write('.local/custody/wallet.json', 'PRIVATE_SENTINEL')
        before = sorted(str(path.relative_to(self.root)) for path in self.root.rglob('*'))
        original_read = Path.read_text
        def public_read(path, *args, **kwargs):
            self.assertNotIn('.env', path.parts)
            self.assertNotIn('custody', path.parts)
            return original_read(path, *args, **kwargs)
        with patch('lab_profiles.subprocess.run', side_effect=AssertionError('process forbidden')), patch.object(Path, 'read_text', public_read):
            for name in ('host', 'wallet'):
                report = self.profile(name)
                self.assertEqual(report['status'], 'available')
                self.assertFalse(report['financialAcceptance'])
                self.assertFalse(report['artifactIntegrityChecked'])
                self.assertEqual(labs.preparation_commands(report, self.root), [])
        self.assertEqual(before, sorted(str(path.relative_to(self.root)) for path in self.root.rglob('*')))

    def test_lock_drift_and_missing_workspace_link_are_distinct(self):
        self.assertEqual(self.profile('host')['status'], 'available')
        (self.root / 'node_modules/@lianum/core').unlink()
        self.assertEqual(self.profile('host')['status'], 'missing')
        (self.root / 'node_modules/@lianum/core').symlink_to(self.root / 'packages/core', target_is_directory=True)
        package = labs.read_json(self.root / 'packages/core/package.json')
        package['dependencies'] = {'unreviewed': '1.0.0'}
        self.json('packages/core/package.json', package)
        self.assertEqual(self.profile('host')['status'], 'stale-dependencies')

    def mobile_local_link(self, hoisted=False):
        package = {'name': '@lianum/mobile', 'version': '1.0.0',
                   'dependencies': {'@lianum/core': 'file:../../packages/core'}}
        core = labs.read_json(self.root / 'packages/core/package.json')
        self.json('apps/mobile/package.json', package)
        self.json('apps/mobile/package-lock.json', {'lockfileVersion': 3, 'packages': {
            '': package, '../../packages/core': core,
            'node_modules/@lianum/core': {'resolved': '../../packages/core', 'link': True}}})
        link = self.root / ('node_modules/@lianum/core' if hoisted else 'apps/mobile/node_modules/@lianum/core')
        if not hoisted:
            link.parent.mkdir(parents=True)
            link.symlink_to(self.root / 'packages/core', target_is_directory=True)
        return link, core

    def test_app_local_link_uses_resolved_lock_manifest_and_checks_drift(self):
        link, core = self.mobile_local_link()
        self.assertEqual(labs.npm_status(self.root, 'apps/mobile')[0], 'available')
        for update in ({'version': '2.0.0'}, {'dependencies': {'unexpected': '1.0.0'}}):
            self.json('packages/core/package.json', {**core, **update})
            self.assertEqual(labs.npm_status(self.root, 'apps/mobile')[0], 'stale-dependencies')
        self.json('packages/core/package.json', core)
        self.json('packages/copied-core/package.json', core)
        link.unlink()
        link.symlink_to(self.root / 'packages/copied-core', target_is_directory=True)
        self.assertEqual(labs.npm_status(self.root, 'apps/mobile')[0], 'stale-dependencies')
        link.unlink()
        link.symlink_to(self.root / 'packages/core', target_is_directory=True)
        lock = labs.read_json(self.root / 'apps/mobile/package-lock.json')
        del lock['packages']['../../packages/core']
        self.json('apps/mobile/package-lock.json', lock)
        self.assertEqual(labs.npm_status(self.root, 'apps/mobile')[0], 'stale-dependencies')

    def test_app_local_link_can_be_hoisted_only_to_its_exact_locked_target(self):
        link, core = self.mobile_local_link(hoisted=True)
        self.assertEqual(labs.npm_status(self.root, 'apps/mobile')[0], 'available')
        self.json('packages/copied-core/package.json', core)
        link.unlink()
        link.symlink_to(self.root / 'packages/copied-core', target_is_directory=True)
        self.assertEqual(labs.npm_status(self.root, 'apps/mobile')[0], 'stale-dependencies')
        link.unlink()
        self.assertEqual(labs.npm_status(self.root, 'apps/mobile')[0], 'missing')

    def test_runtime_missing_current_source_drift_and_generated_drift_are_separate(self):
        self.assertEqual(labs.runtime_status(self.root)[0], 'missing')
        source, target = self.runtime()
        self.assertEqual(labs.runtime_status(self.root)[0], 'available')
        self.write(source, 'export const value = 2;\n')
        self.assertEqual(labs.runtime_status(self.root)[0], 'stale-generation')
        self.runtime()
        self.write('.internal/runtime/' + target, 'tampered\n')
        self.assertEqual(labs.runtime_status(self.root)[0], 'stale-generation')
        self.runtime()
        self.json('scripts/layout.json', {'files': [{'source': source, 'path': 'changed/run.mjs'}], 'rules': []})
        self.assertEqual(labs.runtime_status(self.root)[0], 'stale-generation')

    def retained_runtime_entry(self, source, content='public retained fixture\n'):
        self.runtime()
        config = labs.read_json(self.root / 'scripts/layout.json')
        target = 'retained/' + Path(source).name
        config['files'].append({'source': source, 'path': target})
        self.json('scripts/layout.json', config)
        report = labs.read_json(self.root / '.internal/dev/reports/workspace-build.json')
        sha = hashlib.sha256(content.encode()).hexdigest()
        report['files'][target] = {'source': source, 'sourceSHA256': sha, 'sha256': sha}
        self.json('.internal/dev/reports/workspace-build.json', report)
        self.write(source, content)
        self.write('.internal/runtime/' + target, content)
        return target

    def test_real_retained_public_sources_require_exact_original_mappings(self):
        for source in ('docs/reference/wallet/owned-tron-native-value-runtime.md',
                       'archive/legacy-client/app.mjs', 'archive/legacy-engine/package.json',
                       'archive/source-evidence/native-value-genuine-deployment-artifacts/w39-adapter/source-manifest.json'):
            with self.subTest(source=source):
                self.retained_runtime_entry(source)
                self.assertEqual(labs.runtime_status(self.root)[0], 'available')
                self.write(source, 'changed public source\n')
                self.assertEqual(labs.runtime_status(self.root)[0], 'stale-generation')
                self.retained_runtime_entry(source)
                config = labs.read_json(self.root / 'scripts/layout.json')
                config['files'] = config['files'][:1]
                self.json('scripts/layout.json', config)
                self.assertEqual(labs.runtime_status(self.root)[0], 'stale-generation')

    def test_only_the_exact_archived_lock_is_excluded_and_its_bytes_are_never_read(self):
        original = next(iter(labs.EXCLUDED_HISTORICAL_METADATA))
        target = self.retained_runtime_entry(original, 'PRIVATE_SENTINEL_NOT_TO_BE_READ')
        read_bytes = Path.read_bytes
        def public_read(path):
            self.assertNotEqual(path, self.root / original)
            self.assertNotEqual(path, self.root / '.internal/runtime' / target)
            return read_bytes(path)
        with patch.object(Path, 'read_bytes', public_read):
            status, detail = labs.runtime_status(self.root)
        self.assertEqual(status, 'available')
        self.assertIn('excluded without reading or authenticating', detail)
        self.assertIn(original, detail)
        for rejected in ('archive/source-evidence/another/active.lock', 'archive/private/wallet.json',
                         'archive/legacy-client/active.lock'):
            self.retained_runtime_entry(rejected, 'PRIVATE_SENTINEL_NOT_TO_BE_READ')
            self.assertEqual(labs.runtime_status(self.root)[0], 'stale-generation')

    def test_runtime_never_reads_private_sources_named_in_forged_metadata(self):
        self.runtime()
        self.json('.internal/dev/reports/workspace-build.json', {'schema': 'LIANUM_WORKSPACE_BUILD_V1',
                  'files': {'core/run.mjs': {'source': '.local/custody/wallet.json'}}})
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('private source must not be opened')):
            self.assertEqual(labs.runtime_status(self.root)[0], 'stale-generation')

    def test_each_profile_preparation_excludes_runs_proofs_funding_and_custody(self):
        for name in self.data['profiles']:
            report = self.profile(name)
            commands = labs.preparation_commands(report, self.root)
            encoded = json.dumps(commands)
            for forbidden in ('evm_lab.py', 'btc_sol_lab.py', 'paired_original_account_lab.py', 'setup.py',
                              'prepare-development', 'run-bounded', 'reopen', 'fund', 'keygen'):
                # --no-fund is npm metadata output suppression, not a funding action.
                self.assertNotIn(forbidden, encoded.replace('--no-fund', ''), name)
            runtime = any('workspace.py' in command[2] for command in commands if len(command) > 2)
            self.assertEqual(runtime, name in {'evm', 'btc-sol', 'defi', 'mobile-original'})
            self.assertEqual(any('--prefix' in command for command in commands), name in {'platform', 'mobile-original'})

    def test_preparation_selects_only_missing_app_dependencies_and_propagates_runner_failure(self):
        calls = []
        def install(command, **kwargs):
            calls.append(command)
            self.assertEqual(kwargs['env']['npm_config_cache'], str(self.root / '.local/cache/npm'))
            self.assertNotIn('NPM_CONFIG_CACHE', kwargs['env'])
            self.assertEqual(command[-4:], ['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
            package = {'name': '@lianum/platform', 'version': '1.0.0'}
            self.json('apps/platform/package.json', package)
            self.json('apps/platform/package-lock.json', {'lockfileVersion': 3, 'packages': {'': package}})
        report = labs.prepare_profile('platform', self.root, self.data, runner=install)
        self.assertEqual(report['status'], 'available')
        self.assertEqual(report['preparationsExecuted'], 1)
        self.assertEqual(labs.prepare_profile('platform', self.root, self.data, runner=install)['preparationsExecuted'], 0)
        self.assertEqual(len(calls), 1)
        failure = RuntimeError('injected preparation failure')
        with self.assertRaises(RuntimeError) as caught:
            labs.prepare_profile('mobile-original', self.root, self.data, runner=lambda *a, **k: (_ for _ in ()).throw(failure))
        self.assertIs(caught.exception, failure)

    def test_unknown_profile_does_not_create_preparation_state(self):
        with self.assertRaises(ValueError):
            labs.prepare_profile('unregistered', self.root, self.data)
        self.assertFalse((self.root / '.local').exists())


if __name__ == '__main__':
    unittest.main()
