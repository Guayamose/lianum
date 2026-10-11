"""Check direct execution and byte-preserving compatibility on small fixtures."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from import_paths import translate
from workspace import node_export


class DirectExecutionTests(unittest.TestCase):
    def test_reviewed_gateway_keeps_one_canonical_capability_owner(self):
        from source_runtime import NODE
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / 'packages/example'
            package.mkdir(parents=True)
            (package / 'package.json').write_text(json.dumps({
                'name': '@lianum/example', 'type': 'module',
                'exports': {'./authority': './authority.mjs'},
            }))
            authority = "const tokens=new WeakSet(); export function issue(){const t={};tokens.add(t);return t;} export const accepts=t=>tokens.has(t);\n"
            (package / 'authority.mjs').write_text(authority)
            link = root / 'node_modules/@lianum/example'
            link.parent.mkdir(parents=True)
            link.symlink_to(package, target_is_directory=True)
            source = 'packages/example/gateway.mjs'
            runtime = 'old/gateway.mjs'
            config = {'files': [
                {'source': source, 'path': runtime},
                {'source': 'packages/example/authority.mjs', 'path': 'old/authority.mjs'},
            ], 'rules': [], '_workspaceExports': {'@lianum/example/authority': 'packages/example/authority.mjs'},
                'canonicalImports': {source: ['@lianum/example/authority']}}
            original = "export {issue, accepts} from '@lianum/example/authority';\n"
            (root / source).write_text(original)
            snapshot = root / '.internal/runtime'
            (snapshot / 'old').mkdir(parents=True)
            (snapshot / runtime).write_text(translate(original, source, runtime, config, 'runtime')[0])
            (snapshot / 'old/authority.mjs').write_text(authority)
            # The exception belongs to this gateway only. Ordinary consumers
            # must still use their own snapshot, not mix capability registries.
            ordinary = translate(original, 'packages/example/ordinary.mjs', 'old/ordinary.mjs', config, 'runtime')[0]
            (snapshot / 'old/ordinary.mjs').write_text(ordinary)
            entry = root / 'entry.mjs'
            entry.write_text("""import assert from 'node:assert/strict';
import * as source from './packages/example/gateway.mjs';
import * as canonical from '@lianum/example/authority';
import * as gateway from './.internal/runtime/old/gateway.mjs';
import * as ordinary from './.internal/runtime/old/ordinary.mjs';
assert.equal(gateway.issue, source.issue);
assert.equal(gateway.issue, canonical.issue);
const token=source.issue();
assert.equal(gateway.accepts(token), true);
assert.equal(gateway.accepts({...token}), false);
assert.equal(ordinary.accepts(token), false);
assert.equal(gateway.accepts(ordinary.issue()), false);
""")
            subprocess.run([str(NODE), str(entry)], cwd=root, capture_output=True, text=True, check=True)

    def test_edits_execute_without_touching_stale_runtime_and_exports_keep_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / 'packages/example'
            package.mkdir(parents=True)
            (root / 'package.json').write_text(json.dumps({'workspaces': ['packages/example']}))
            (package / 'package.json').write_text(json.dumps({
                'name': '@lianum/example', 'type': 'module', 'exports': {'./value': './value.mjs'},
            }))
            (root / 'package-lock.json').write_text(json.dumps({'lockfileVersion': 3, 'packages': {
                '': {'workspaces': ['packages/example']},
                'packages/example': {'name': '@lianum/example'},
                'node_modules/@lianum/example': {'link': True, 'resolved': 'packages/example'},
            }}))
            value = package / 'value.mjs'
            value.write_text('export const state = {value: 1};\n')
            (package / 'private.mjs').write_text('export default 42;\n')
            link = root / 'node_modules/@lianum/example'
            link.parent.mkdir(parents=True)
            link.symlink_to(package, target_is_directory=True)
            stale = root / '.internal/runtime/stale.mjs'
            stale.parent.mkdir(parents=True)
            stale.write_text('export const state = {value: 999};\n')
            original_stat = stale.stat()
            entry = root / 'entry.mjs'
            entry.write_text('''import {state as publicState} from '@lianum/example/value';
import {state as directState} from './packages/example/value.mjs';
if (publicState !== directState) throw new Error('DUPLICATED_MODULE_AUTHORITY');
try {
  await import('@lianum/example/private.mjs');
  throw new Error('PRIVATE_EXPORT_EXPOSED');
} catch (error) {
  if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
}
console.log(publicState.value);
''')
            runner = root / 'run.py'
            runner.write_text(f'''import sys
from pathlib import Path
sys.path.insert(0, {str(Path(__file__).resolve().parent)!r})
import run_node, source_runtime
source_runtime.ROOT = run_node.ROOT = Path({str(root)!r})
stamp = source_runtime.ROOT / '.local/development/source-runtime.json'
stamp.parent.mkdir(parents=True, exist_ok=True)
if not stamp.exists():
    source_runtime.record_installation(stamp, source_runtime.installation_inputs())
def forbidden_build(*args, **kwargs):
    raise AssertionError('DIRECT_EXECUTION_MUST_NOT_BUILD_COMPATIBILITY')
run_node.build = forbidden_build
sys.argv = ['run_node.py', '../../entry.mjs']
run_node.main()
''')
            for expected in (1, 2):
                value.write_text(f'export const state = {{value: {expected}}};\n')
                result = subprocess.run(['python3', '-B', str(runner)], cwd=package,
                                        capture_output=True, text=True, check=True)
                self.assertEqual(result.stdout.strip(), str(expected))
            self.assertEqual(stale.read_text(), 'export const state = {value: 999};\n')
            self.assertEqual(stale.stat().st_mtime_ns, original_stat.st_mtime_ns)
            self.assertEqual(stale.stat().st_ino, original_stat.st_ino)


class CompatibilityTranslationTests(unittest.TestCase):
    def setUp(self):
        self.source = 'packages/example/src/nested/entry.mjs'
        self.runtime = 'old/src/entry.mjs'
        self.config = {
            'files': [
                {'source': self.source, 'path': self.runtime},
                {'source': 'packages/example/src/value.mjs', 'path': 'old/src/value.mjs'},
            ],
            'rules': [{'source': 'packages/example/src/', 'runtime': 'old/src/'}],
            '_workspaceExports': {'@lianum/example/value': 'packages/example/src/value.mjs'},
        }

    def translated(self, text, spellings=None):
        return translate(text, self.source, self.runtime, self.config, 'runtime', spellings)[0]

    def test_public_import_retains_original_byte_spelling(self):
        self.assertEqual(
            self.translated("import value from '@lianum/example/value';", {'../value.mjs': '././value.mjs'}),
            "import value from '././value.mjs';")

    def test_conditional_exports_select_node_esm_target_in_declared_order(self):
        self.assertEqual(node_export({'types': './types.d.mts', 'default': './value.mjs'}), './value.mjs')
        self.assertEqual(node_export({'browser': './web.mjs', 'node': {'import': './node.mjs'},
                                      'default': './fallback.mjs'}), './node.mjs')

    def test_unknown_public_export_fails_instead_of_mixing_module_instances(self):
        with self.assertRaisesRegex(RuntimeError, r'(?i)unknown public workspace import: @lianum/example/private'):
            self.translated("import '@lianum/example/private';")

    def test_canonical_gateway_does_not_allow_undeclared_exports(self):
        self.config['canonicalImports'] = {self.source: ['@lianum/example/private']}
        with self.assertRaisesRegex(RuntimeError, r'(?i)unknown public workspace import: @lianum/example/private'):
            self.translated("import '@lianum/example/private';")

    def test_mock_and_source_resource_move_together(self):
        self.assertEqual(
            self.translated("mock.module('../value.mjs', {}); new URL('../value.mjs', import.meta.url);"),
            "mock.module('./value.mjs', {}); new URL('./value.mjs', import.meta.url);")

    def test_unknown_artifact_resource_is_not_rewritten(self):
        expression = "new URL('../retained-artifacts/proof.json', import.meta.url)"
        self.assertEqual(self.translated(expression), expression)

    def test_unchanged_directory_url_preserves_frozen_source_bytes(self):
        config = {'files': [], 'rules': [{'source': 'packages/crypto/', 'runtime': 'old/crypto/'}]}
        with tempfile.TemporaryDirectory() as directory:
            config['_workspaceRoot'] = directory
            (Path(directory) / 'packages/crypto/src').mkdir(parents=True)
            original = "const ROOT = new URL('../', import.meta.url);"
            rendered, _ = translate(original, 'packages/crypto/src/tooling.mjs',
                                    'old/crypto/src/tooling.mjs', config, 'runtime')
            self.assertEqual(rendered.encode(), original.encode())

    def test_moved_directory_url_keeps_trailing_slash(self):
        with tempfile.TemporaryDirectory() as directory:
            self.config['_workspaceRoot'] = directory
            (Path(directory) / 'packages/example/src').mkdir(parents=True)
            self.assertEqual(self.translated("new URL('../', import.meta.url)"),
                             "new URL('./', import.meta.url)")


if __name__ == '__main__':
    unittest.main()
