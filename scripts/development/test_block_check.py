"""Full discovery, truthful result counts and no-evaluation runtime import audit."""
import contextlib
import io
import json
import hashlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import block_check


class BlockCheckTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def write(self, path, text='export const value=1;'):
        destination = self.root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text)

    def audit(self, files, exceptions=()):
        command = [str(block_check.NODE), str(block_check.ROOT / 'scripts/development/block-imports.mjs')]
        result = subprocess.run(command, input=json.dumps({'root': str(self.root), 'files': files,
                                                          'exceptions': list(exceptions)}),
                                text=True, capture_output=True, timeout=20)
        self.assertIn(result.returncode, (0, 1), result.stderr)
        return json.loads(result.stdout)

    def test_discovery_enumerates_all_exact_roots_without_dependency_or_private_trees(self):
        wanted = ['packages/a/tests/deep/a.test.mjs', 'packages/b/tests/b.test.cjs',
                  'apps/mobile/tests/new.test.mjs', 'apps/wallet/tests/ui.test.mjs',
                  'tests/integration/sub/real.test.mjs', 'scripts/development/scanner.test.mjs']
        for path in wanted:
            self.write(path)
        self.write('scripts/development/test_runner.py', 'import unittest')
        self.write('infra/paeg-demo/test-release.py', 'import unittest')
        for path in ['apps/mobile/node_modules/vendor/tests/wrong.test.mjs',
                     'packages/a/tests/node_modules/vendor/wrong.test.mjs',
                     'tests/.local/private.test.mjs', 'tests/archive/old.test.mjs',
                     '.local/new.test.mjs']:
            self.write(path)
        self.write('apps/mobile/src/Native.tsx', 'export default () => null;')
        self.write('apps/mobile/App.tsx', 'export default () => null;')
        self.write('apps/mobile/plugins/native.cjs', 'module.exports = {};')
        (self.root / 'tests/linked').symlink_to(self.root / 'packages/a/tests', target_is_directory=True)
        plan = block_check.discover(self.root)
        self.assertEqual(plan['nodeTests'], sorted(wanted))
        self.assertEqual(plan['pythonTests'], ['infra/paeg-demo/test-release.py','scripts/development/test_runner.py'])
        self.assertEqual(plan['sourceFiles'], ['apps/mobile/App.tsx', 'apps/mobile/plugins/native.cjs', 'apps/mobile/src/Native.tsx'])
        self.assertTrue(any(row['path'] == 'tests/linked' for row in plan['explicitExclusions']))
        self.assertTrue(any(row['path'] == 'tests/.local' for row in plan['explicitExclusions']))

    def test_new_tests_change_content_revision_and_unsupported_tests_are_not_silent(self):
        self.write('packages/a/tests/a.test.mjs')
        first = block_check.content_revision(block_check.discover(self.root), self.root)
        self.write('packages/a/tests/a.test.mjs', 'export const changed=2;')
        second = block_check.content_revision(block_check.discover(self.root), self.root)
        self.assertNotEqual(first, second)
        self.write('apps/mobile/tests/mounted.test.tsx', '<View/>')
        self.assertEqual(block_check.discover(self.root)['unsupportedTests'][0]['path'],
                         'apps/mobile/tests/mounted.test.tsx')

    def test_runtime_named_exports_and_missing_files_fail_without_executing_modules(self):
        self.write('apps/mobile/src/api.mjs', 'throw Error("MUST_NOT_EXECUTE"); export const real=1;')
        self.write('apps/mobile/src/api.d.mts', 'export declare const invented: number;')
        self.write('apps/mobile/src/View.tsx', 'import {invented} from "./api.mjs"; import "./missing.mjs"; export default () => <View/>;')
        result = self.audit(['apps/mobile/src/View.tsx'])
        self.assertEqual({row['kind'] for row in result['issues']}, {'EXPORT_NOT_FOUND', 'MODULE_NOT_FOUND'})
        self.assertTrue(any(row.get('name') == 'invented' for row in result['issues']))

    def test_type_imports_star_aliases_and_commonjs_named_imports(self):
        self.write('apps/mobile/src/api.ts', 'export type Terms={value:number}; export const real=1;')
        self.write('apps/mobile/src/barrel.ts', 'export {real as renamed} from "./api"; export * from "./cycle";')
        self.write('apps/mobile/src/cycle.ts', 'export * from "./barrel";')
        self.write('apps/mobile/src/plugin.cjs', 'throw Error("MUST_NOT_EXECUTE"); module.exports={good:1};')
        self.write('apps/mobile/src/types.d.mts', 'export type OnlyType=number;')
        self.write('apps/mobile/src/View.tsx', 'import type {Terms} from "./api"; import {type OnlyType} from "./types.d.mts"; import {type Terms as T,renamed} from "./barrel"; const {good}=require("./plugin.cjs"); export default () => <View/>;')
        result = self.audit(['apps/mobile/src/View.tsx'])
        self.assertEqual(result['issues'], [])
        self.assertEqual(result['typeOnlyImports'], 2)
        self.write('apps/mobile/src/Bad.cjs', 'const {absent}=require("./plugin.cjs");')
        result = self.audit(['apps/mobile/src/Bad.cjs'])
        self.assertEqual(result['issues'][0]['name'], 'absent')

    def test_package_runtime_exports_conditions_and_computed_imports_are_explicit(self):
        self.write('packages/a/package.json', json.dumps({'name': '@lianum/a', 'exports': {
            './api': {'types': './src/api.d.mts', 'react-native': './src/native.mjs',
                      'import': './src/api.mjs', 'require': './src/api.cjs'}}}))
        self.write('packages/a/src/api.d.mts', 'export declare const fake: number;')
        self.write('packages/a/src/native.mjs', 'export const native=1;')
        self.write('packages/a/src/api.mjs', 'export const node=1;')
        self.write('packages/a/src/api.cjs', 'exports.requireValue=1;')
        self.write('apps/mobile/src/View.tsx', 'import {native} from "@lianum/a/api"; import(sourceURL);')
        self.write('packages/b/src/client.mjs', 'import {node} from "@lianum/a/api";')
        self.write('packages/b/src/client.cjs', 'const {requireValue}=require("@lianum/a/api");')
        result = self.audit(['apps/mobile/src/View.tsx', 'packages/b/src/client.mjs', 'packages/b/src/client.cjs'])
        self.assertEqual(result['issues'], [])
        self.assertEqual(len(result['computedImports']), 1)
        self.write('packages/b/src/bad.mjs', 'import {fake} from "@lianum/a/api"; import "@lianum/a/private";')
        result = self.audit(['packages/b/src/bad.mjs'])
        self.assertEqual({row['kind'] for row in result['issues']}, {'EXPORT_NOT_FOUND', 'MODULE_NOT_FOUND'})

    def test_full_pass_requires_test_counts_without_skips_todos_or_expected_failures(self):
        counts, complete = block_check.test_counts({'kind': 'node'}, '# tests 2\n# pass 1\n# skipped 1\n')
        self.assertFalse(complete)
        self.assertEqual(counts['skipped'], 1)
        self.assertFalse(block_check.test_counts({'kind': 'node'}, '# tests 0\n# pass 0\n')[1])
        self.assertFalse(block_check.test_counts({'kind': 'python'}, 'LIANUM_BLOCK_UNITTEST {"tests":2,"expectedFailures":1}\n')[1])
        self.assertTrue(block_check.test_counts({'kind': 'node'}, '# tests 2\n# pass 2\n# fail 0\n# skipped 0\n# todo 0\n')[1])

    def test_unittest_loader_runs_files_without_main_and_counts_skips(self):
        self.write('scripts/development/test_fixture.py', 'import unittest\nclass Sample(unittest.TestCase):\n @unittest.skip("fixture")\n def test_example(self): pass\n')
        result = subprocess.run(block_check.python_command('scripts/development/test_fixture.py', self.root),
                                text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0)
        counts, complete = block_check.test_counts({'kind': 'python'}, result.stdout)
        self.assertEqual(counts['tests'], 1)
        self.assertEqual(counts['skipped'], 1)
        self.assertFalse(complete)

    def test_complete_block_activates_only_the_real_postgres_fixture(self):
        paths = ['apps/platform/tests/postgres.test.mjs', 'packages/a/tests/a.test.mjs']
        plan = {'pythonTests': [], 'nodeTests': paths}
        commands = block_check.stages(plan, self.root)[4:]
        self.assertEqual(commands[0]['command'][:2], ['/usr/bin/env', 'LIANUM_TEST_POSTGRES_DOCKER=1'])
        self.assertEqual(commands[0]['file'], paths[0])
        self.assertNotIn('LIANUM_TEST_POSTGRES_DOCKER=1', commands[1]['command'])
        self.assertEqual(commands[1]['file'], paths[1])

    def test_complete_block_runs_actual_retained_pool_compiler(self):
        path = 'packages/engine/tests/assembly/private-assembly-history.test.mjs'
        commands = block_check.stages({'pythonTests': [], 'nodeTests': [path, 'packages/a/tests/a.test.mjs']}, self.root)[4:]
        self.assertEqual(commands[0]['command'][:2], ['/usr/bin/env', 'PC18_RUN_POOL_COMPILE_TEST=1'])
        self.assertNotIn('PC18_RUN_POOL_COMPILE_TEST=1', commands[1]['command'])

    def test_plan_does_not_launch_or_create_reports(self):
        with patch.object(block_check, 'ROOT', self.root), patch.object(block_check, 'stages', return_value=[]), \
                patch.object(block_check, 'run_bounded') as run, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(block_check.main(['--plan']), 0)
        run.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())['profile'], 'LIANUM_BLOCK_CHECK_PLAN_V1')
        self.assertFalse((self.root / '.internal').exists())

    def test_historical_inventory_is_verified_but_exported_and_reachable_routes_stay_audited(self):
        self.write('packages/protocol/package.json', json.dumps({'name':'@lianum/protocol',
                   'lianum':{'status':'compatibility'},'exports':{'./live':'./src/live.mjs'}}))
        for path,text in [('packages/protocol/src/live.mjs','export * from "./dependency.mjs";'),
                          ('packages/protocol/src/dependency.mjs','export const live=1;'),
                          ('packages/protocol/src/unused.mjs','import "./missing-historical.mjs";')]:
            self.write(path,text)
        pairs=[{'historical':path,'active':path.replace('protocol','engine'),
                'historicalSHA256':hashlib.sha256((self.root/path).read_bytes()).hexdigest()}
               for path in ['packages/protocol/src/live.mjs','packages/protocol/src/dependency.mjs','packages/protocol/src/unused.mjs']]
        self.write('packages/protocol/src/unpromoted.mjs','import "./unused.mjs";')
        self.write('scripts/historical-module-inventory.json',json.dumps({'schema':'LIANUM_HISTORICAL_MODULE_INVENTORY_V1','pairs':pairs,
                   'historicalFiles':[{'path':'packages/protocol/src/unpromoted.mjs',
                   'sha256':hashlib.sha256((self.root/'packages/protocol/src/unpromoted.mjs').read_bytes()).hexdigest()}]}))
        plan=block_check.discover(self.root)
        self.assertEqual(plan['sourceFiles'],['packages/protocol/src/dependency.mjs','packages/protocol/src/live.mjs'])
        self.assertEqual(plan['historicalEvidenceIssues'],[])
        self.assertEqual(len(plan['historicalEvidence']),4)
        self.write('apps/mobile/src/consumer.mjs','import "../../../packages/protocol/src/unused.mjs";')
        self.assertIn('packages/protocol/src/unused.mjs',block_check.discover(self.root)['sourceFiles'])
        self.write('packages/protocol/src/unused.mjs','export const changed=1;')
        self.assertEqual(block_check.discover(self.root)['historicalEvidenceIssues'][0]['kind'],'HISTORICAL_BYTES_CHANGED_OR_MISSING')


if __name__ == '__main__':
    unittest.main()
