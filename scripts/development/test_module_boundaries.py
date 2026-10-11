"""Small failure-case tests for the boundary check; no networks or proof jobs."""
import json
import hashlib
from pathlib import Path
import tempfile
import unittest

import module_boundaries as boundaries


class ModuleBoundariesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "apps").mkdir()
        self.write("packages/engine/src/api.mjs", "export const value = 1;\n")
        self.write("packages/backend/src/session.mjs", "import {value} from '@lianum/engine/api';\n")
        self.manifest("engine", {"./api": "./src/api.mjs"})
        self.manifest("backend", {}, {"@lianum/engine": "file:../engine"})
        self.policy = {"dependencies": {"packages/backend": ["packages/engine"]},
                       "legacyPrivateImports": {}}

    def write(self, relative, content):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def manifest(self, name, exports, dependencies=None):
        self.write(f"packages/{name}/package.json", json.dumps({
            "name": "@lianum/" + name, "exports": exports,
            "dependencies": dependencies or {}}))

    def report(self):
        return boundaries.inspect(self.root, self.policy)

    def test_public_api_requires_both_allowed_direction_and_dependency(self):
        self.assertEqual(self.report()["errors"], [])
        self.policy["dependencies"]["packages/backend"] = []
        self.assertIn("not allowed", "\n".join(self.report()["errors"]))
        self.policy["dependencies"]["packages/backend"] = ["packages/engine"]
        self.manifest("backend", {})
        self.assertIn("missing from package dependencies", "\n".join(self.report()["errors"]))

    def test_new_private_import_cannot_be_hidden_by_an_existing_exception(self):
        source = "packages/backend/src/session.mjs"
        target = "packages/engine/src/api.mjs"
        self.write(source, "import {value} from '../../engine/src/api.mjs';\n")
        self.assertIn("new private cross-import", "\n".join(self.report()["errors"]))
        self.policy["legacyPrivateImports"][source] = [target]
        self.assertEqual(self.report()["errors"], [])
        self.write("packages/backend/src/another.mjs", "export * from '../../engine/src/api.mjs';\n")
        self.assertIn("another.mjs: new private cross-import", "\n".join(self.report()["errors"]))

    def test_private_package_subpath_and_missing_exports_fail(self):
        self.write("packages/backend/src/session.mjs", "await import('@lianum/engine/src/api.mjs');\n")
        self.assertIn("does not export", "\n".join(self.report()["errors"]))
        self.manifest("engine", {"./api": "./src/missing.mjs"})
        self.assertIn("export target missing", "\n".join(self.report()["errors"]))

    def test_deleting_private_import_retires_exception(self):
        self.policy["legacyPrivateImports"] = {
            "packages/backend/src/session.mjs": ["packages/engine/src/api.mjs"]}
        report = self.report()
        self.assertEqual(report["errors"], [])
        self.assertEqual(report["retiredLegacy"], 1)
        self.assertEqual(report["legacyPrivate"], 0)

    def test_browser_url_can_only_address_an_exported_package_file(self):
        source = "apps/wallet/src/shared.mjs"
        self.write(source, "export * from '../../../packages/engine/src/api.mjs';\n")
        self.policy["dependencies"]["apps/wallet"] = ["packages/engine"]
        self.assertEqual(self.report()["errors"], [])
        self.write("packages/engine/src/private.mjs", "export const secret = 2;\n")
        self.write(source, "export * from '../../../packages/engine/src/private.mjs';\n")
        self.assertIn("new private cross-import", "\n".join(self.report()["errors"]))

    def test_application_inversion_is_rejected_even_if_in_private_baseline(self):
        source = "packages/backend/src/session.mjs"
        target = "apps/wallet/src/shared.mjs"
        self.write(target, "export const value = 1;\n")
        self.write(source, "import {value} from '../../../apps/wallet/src/shared.mjs';\n")
        self.policy["legacyPrivateImports"][source] = [target]
        self.assertIn("cannot depend on application code", "\n".join(self.report()["errors"]))

    def test_support_dependencies_cannot_expand_to_new_consumers(self):
        source = "packages/backend/src/session.mjs"
        target = "tests/fixture.mjs"
        self.write(target, "export const value = 1;\n")
        self.write(source, "import {value} from '../../../tests/fixture.mjs';\n")
        self.assertIn("new execution dependency", "\n".join(self.report()["errors"]))
        self.policy["legacySupportImports"] = {source: [target]}
        self.assertEqual(self.report()["errors"], [])
        self.write("packages/backend/src/another.mjs", "import '../../../tests/fixture.mjs';\n")
        self.assertIn("another.mjs: new execution dependency", "\n".join(self.report()["errors"]))

    def test_frozen_history_remains_present_and_cannot_become_an_active_dependency(self):
        historical = "packages/protocol/src/api.mjs"
        active = "packages/engine/src/api.mjs"
        text = (self.root / active).read_text()
        self.write(historical, text)
        self.manifest("protocol", {"./api": "./src/api.mjs"})
        digest = hashlib.sha256(text.encode()).hexdigest()
        self.policy["historicalPackages"] = ["packages/protocol"]
        self.policy["historicalInventory"] = "scripts/history.json"
        self.write("scripts/history.json", json.dumps({
            "historicalPackage": "packages/protocol", "activePackage": "packages/engine",
            "historicalFiles": [{"path": historical, "sha256": digest}],
            "pairs": [{"active": active, "historical": historical, "historicalSHA256": digest}]}))
        self.assertEqual(self.report()["errors"], [])
        self.write(active, "export const value = 2;\n")
        self.assertEqual(self.report()["errors"], [])  # Editing the active copy is allowed.
        self.write(historical, "export const value = 2;\n")
        self.assertIn("frozen historical source changed", "\n".join(self.report()["errors"]))
        self.write(historical, text)
        self.write("packages/backend/src/session.mjs", "import '@lianum/protocol/api';\n")
        self.assertIn("cannot consume the historical package", "\n".join(self.report()["errors"]))

    def test_package_local_test_support_is_an_execution_dependency(self):
        source = "packages/backend/src/session.mjs"
        target = "packages/backend/tests/fixture.mjs"
        self.write(target, "export const value = 1;\n")
        self.write(source, "import {value} from '../tests/fixture.mjs';\n")
        report = self.report()
        self.assertIn((source, target), report["supportImports"])
        self.assertIn("new execution dependency", "\n".join(report["errors"]))

    def test_parser_handles_literal_dynamic_import_and_ignores_text(self):
        text = '''// import 'comment'
        const message = "import 'not-code'";
        /* export * from 'comment'; */
        import type { X } from '@lianum/a';
        export { X } from '@lianum/b';
        import('@lianum/c'); require('@lianum/d');
        import(`@lianum/e`); import(`./${variable}.mjs`);
        object.from('not-an-import');
        '''
        self.assertEqual(list(boundaries.imports(text)),
                         ['@lianum/a', '@lianum/b', '@lianum/c', '@lianum/d', '@lianum/e'])

    def test_exact_cycles_detect_a_new_reverse_edge_inside_an_existing_component(self):
        original = {('a', 'b'), ('b', 'c'), ('c', 'a')}
        self.assertEqual(boundaries.directed_cycles(original), {('a', 'b', 'c')})
        added = boundaries.directed_cycles(original | {('b', 'a')})
        self.assertEqual(added - boundaries.directed_cycles(original), {('a', 'b')})

    def test_package_and_file_cycles_need_exact_reviewed_exceptions(self):
        self.write('packages/engine/src/api.mjs', "import '@lianum/backend/session'; export const value=1;\n")
        self.manifest('backend', {'./session': './src/session.mjs'}, {'@lianum/engine': 'file:../engine'})
        self.manifest('engine', {'./api': './src/api.mjs'}, {'@lianum/backend': 'file:../backend'})
        self.policy['dependencies']['packages/engine'] = ['packages/backend']
        report = self.report()
        self.assertIn('new package dependency cycle', '\n'.join(report['errors']))
        self.assertIn('new cyclic module import', '\n'.join(report['errors']))
        self.policy['cycles'] = {
            'allowedPackageCycles': [['packages/backend', 'packages/engine']],
            'allowedModuleCycleImports': {
                'packages/backend/src/session.mjs': ['packages/engine/src/api.mjs'],
                'packages/engine/src/api.mjs': ['packages/backend/src/session.mjs']}}
        self.assertEqual(self.report()['errors'], [])
        self.write('packages/engine/src/api.mjs', 'export const value=1;\n')
        retired = self.report()
        self.assertEqual(retired['errors'], [])
        self.assertEqual(retired['retiredPackageCycles'], 1)
        self.assertEqual(retired['retiredModuleCycleImports'], 2)

    def test_new_internal_file_cycle_is_rejected_even_without_a_package_cycle(self):
        self.write('packages/engine/src/api.mjs', "import './other.mjs'; export const value=1;\n")
        self.write('packages/engine/src/other.mjs', "import './api.mjs';\n")
        report = self.report()
        self.assertEqual(report['packageCycles'], [])
        self.assertEqual(len(report['moduleCycleImports']), 2)
        self.assertIn('new cyclic module import', '\n'.join(report['errors']))
        self.assertNotIn('cycles', self.policy)  # Inspection never approves a baseline.


if __name__ == "__main__":
    unittest.main()
