"""Small failure-case tests for the boundary check; no networks or proof jobs."""
import json
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


if __name__ == "__main__":
    unittest.main()
