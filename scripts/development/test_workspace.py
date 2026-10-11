"""Exercise executable behavior after moving sources into domain folders."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import workspace
from import_paths import translate

NODE = workspace.DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"


class WorkspaceExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.runtime = self.root / ".internal/runtime"
        self.runtime.mkdir(parents=True)
        self.entry = "apps/wallet/src/server/run.mjs"
        self.value = "apps/wallet/src/client/state/value.mjs"
        originals = {
            "app/run.mjs": (self.entry, 'import value from "./public/value.mjs"; console.log(value);\n'),
            "app/public/value.mjs": (self.value, 'export default 1;\n'),
        }
        config = {
            "sourceRoots": ["apps/wallet/"],
            "rules": [
                {"source": "apps/wallet/src/server/", "runtime": "app/"},
                {"source": "apps/wallet/src/client/state/", "runtime": "app/public/"},
            ],
            "files": [{"path": runtime, "source": source,
                       "sha256": hashlib.sha256(content.encode()).hexdigest()}
                      for runtime, (source, content) in originals.items()],
        }
        spellings = {}
        for runtime, (source, content) in originals.items():
            rendered, spellings[source] = translate(content, source, runtime, config, "workspace")
            path = self.root / source
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(rendered)
        self.entry_content = (self.root / self.entry).read_text()
        self.originals = originals
        config["importSpellings"] = spellings
        config.pop("_pathIndexes", None)
        layout_path = self.root / "layout.json"
        layout_path.write_text(json.dumps(config))
        self.overrides = patch.multiple(workspace, ROOT=self.root, RUNTIME=self.runtime,
                                       DEV=self.root / ".internal/dev", LAYOUT=layout_path)
        self.overrides.start()
        self.addCleanup(self.overrides.stop)

    def run_entry(self):
        result = subprocess.run([str(NODE), str(self.runtime / "app/run.mjs")],
                                text=True, capture_output=True, check=True)
        return result.stdout.strip()

    def test_reorganized_imports_execute_with_original_source_bytes(self):
        workspace.build(quiet=True)
        for runtime, (_, content) in self.originals.items():
            path = self.runtime / runtime
            self.assertEqual(path.read_bytes(), content.encode())
            self.assertEqual(path.stat().st_nlink, 1)
        self.assertEqual(self.run_entry(), "1")

    def test_retired_worker_copy_is_removed_and_canonical_owner_is_never_regenerated(self):
        workspace.build(quiet=True)
        path = workspace.LAYOUT
        config = json.loads(path.read_text())
        config['canonicalRuntimeSources'] = {'app/public/value.mjs': self.value}
        config['files'] = [row for row in config['files'] if row['source'] != self.value]
        path.write_text(json.dumps(config))
        result = workspace.build(quiet=True)
        self.assertIn('app/public/value.mjs', result['removed'])
        self.assertFalse((self.runtime / 'app/public/value.mjs').exists())
        self.assertEqual(self.run_entry(), '1')
        (self.root / self.value).write_text('export default 9;\n')
        workspace.build(quiet=True)
        self.assertFalse((self.runtime / 'app/public/value.mjs').exists())
        self.assertEqual(self.run_entry(), '9')
        self.assertNotIn(self.value, {row['source'] for row in workspace.source_files(workspace.layout()).values()})

    def test_new_file_edits_and_deletion_change_actual_execution(self):
        workspace.build(quiet=True)
        extra = self.root / "apps/wallet/src/server/extra.mjs"
        entry = self.root / self.entry
        entry.write_text('import value from "./extra.mjs"; console.log(value);\n')
        extra.write_text('export default 2;\n')
        workspace.build(quiet=True)
        self.assertEqual(self.run_entry(), "2")
        extra.write_text('export default 3;\n')
        workspace.build(quiet=True)
        self.assertEqual(self.run_entry(), "3")
        extra.unlink()
        entry.write_text(self.entry_content)
        workspace.build(quiet=True)
        self.assertFalse((self.runtime / "app/extra.mjs").exists())
        self.assertEqual(self.run_entry(), "1")

    def test_new_interface_tests_do_not_require_generated_execution_copies(self):
        test = self.root / 'apps/wallet/tests/transport/closed-entry.test.mjs'
        test.parent.mkdir(parents=True)
        test.write_text('import test from "node:test"; test("current interface", () => {});\n')
        workspace.build(quiet=True)
        sources = {row['source'] for row in workspace.source_files(workspace.layout()).values()}
        self.assertNotIn(str(test.relative_to(self.root)), sources)
        self.assertEqual(self.run_entry(), '1')
        # A similarly unmapped application module is not silently omitted.
        execution = self.root / 'apps/wallet/src/unknown/entry.mjs'
        execution.parent.mkdir(parents=True)
        execution.write_text('throw Error("HOST_UNMAPPED_EXECUTION");\n')
        with self.assertRaisesRegex(RuntimeError, 'No compatibility mapping for execution source'):
            workspace.build(quiet=True)


if __name__ == "__main__":
    unittest.main()
