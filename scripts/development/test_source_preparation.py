"""Fast installation-readiness regressions using a tiny npm layout fixture."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import source_runtime as runtime


class SourcePreparationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.addCleanup(patch.stopall)
        patch.object(runtime, 'ROOT', self.root).start()
        node = self.root / 'node'
        node.write_text('fixture executable; subprocess is mocked')
        patch.object(runtime, 'NODE', node).start()
        self.config = {'name': 'lianum', 'version': '0.0.0',
                       'workspaces': ['packages/example'], 'devDependencies': {'example-tool': '1.0.0'}}
        self.package = {'name': '@lianum/example', 'version': '0.1.0',
                        'type': 'module', 'exports': {'./value': './src/value.mjs'}}
        self.lock = {'lockfileVersion': 3, 'packages': {
            '': dict(self.config), 'packages/example': dict(self.package),
            'node_modules/@lianum/example': {'link': True, 'resolved': 'packages/example'},
            'node_modules/example-tool': {'version': '1.0.0'}}}
        self.write('package.json', self.config)
        self.write('packages/example/package.json', self.package)
        self.write('package-lock.json', self.lock)
        self.install()
        self.npm = patch.object(runtime.subprocess, 'run', side_effect=self.install).start()

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(content))

    def install(self, *args, **kwargs):
        link = self.root / 'node_modules/@lianum/example'
        link.parent.mkdir(parents=True, exist_ok=True)
        if not link.is_symlink():
            link.symlink_to(self.root / 'packages/example', target_is_directory=True)
        for key, value in self.lock['packages'].items():
            if key.startswith('node_modules/') and not value.get('link'):
                self.write(key + '/package.json', {'name': key[len('node_modules/'):], 'version': value['version']})

    def prepare(self):
        runtime.prepare(quiet=True)

    def test_common_path_skips_npm_but_only_after_recorded_install(self):
        self.prepare()
        self.prepare()
        self.assertEqual(self.npm.call_count, 1)
        command = self.npm.call_args.args[0]
        self.assertIn('ci', command)
        self.assertIn('--ignore-scripts', command)
        self.assertIn('--include=dev', command)
        self.write('packages/example/src/value.mjs', 'an implementation edit')
        self.prepare()
        self.assertEqual(self.npm.call_count, 1)
        stamp = self.root / '.local/development/source-runtime.json'
        self.assertEqual(stamp.stat().st_mode & 0o777, 0o600)

    def test_stale_dependency_lock_is_rejected_even_with_valid_links_and_stamp(self):
        self.prepare()
        self.package['dependencies'] = {'new-tool': '2.0.0'}
        self.write('packages/example/package.json', self.package)
        with self.assertRaisesRegex(SystemExit, 'package-lock.*desfasado.*--package-lock-only'):
            self.prepare()
        self.assertEqual(self.npm.call_count, 1)

    def test_matching_updated_manifests_and_lock_require_a_new_install(self):
        self.prepare()
        self.config['devDependencies'] = {'example-tool': '1.0.0', 'new-tool': '2.0.0'}
        self.lock['packages'][''] = dict(self.config)
        self.lock['packages']['node_modules/new-tool'] = {'version': '2.0.0'}
        self.write('package.json', self.config)
        self.write('package-lock.json', self.lock)
        self.prepare()
        self.assertEqual(self.npm.call_count, 2)
        self.assertTrue((self.root / 'node_modules/new-tool/package.json').is_file())

    def test_missing_or_wrong_root_dependency_is_repaired_despite_existing_links(self):
        self.prepare()
        dependency = self.root / 'node_modules/example-tool/package.json'
        dependency.unlink()
        self.prepare()
        self.assertEqual(self.npm.call_count, 2)
        self.write('node_modules/example-tool/package.json', {'name': 'example-tool', 'version': '9.0.0'})
        self.prepare()
        self.assertEqual(self.npm.call_count, 3)
        self.assertEqual(json.loads(dependency.read_text())['version'], '1.0.0')

    def test_manifest_change_during_install_is_not_recorded_as_ready(self):
        def concurrent_edit(*args, **kwargs):
            self.package['description'] = 'edited during installation'
            self.write('packages/example/package.json', self.package)
        self.npm.side_effect = concurrent_edit
        with self.assertRaisesRegex(RuntimeError, 'manifiestos cambiaron'):
            self.prepare()
        self.assertFalse((self.root / '.local/development/source-runtime.json').exists())

    def test_failed_install_never_gets_a_readiness_stamp(self):
        self.npm.side_effect = subprocess.CalledProcessError(1, ['npm', 'ci'])
        with self.assertRaises(subprocess.CalledProcessError):
            self.prepare()
        self.assertFalse((self.root / '.local/development/source-runtime.json').exists())


if __name__ == '__main__':
    unittest.main()
