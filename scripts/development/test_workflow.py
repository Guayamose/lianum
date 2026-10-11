"""Selection boundaries, real Git changes and side-effect-free planning."""
from contextlib import redirect_stdout
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import workflow


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = "packages/a/src/value.mjs"
        self.consumer = "apps/b/src/client.mjs"
        self.test = "apps/b/tests/client.test.mjs"
        self.smoke = "packages/a/tests/smoke.test.mjs"
        for path, text in {
            self.source: "export const value = 1;\n",
            self.consumer: "import {value} from '../../../packages/a/src/value.mjs';\n",
            self.test: "import '../src/client.mjs';\n",
            self.smoke: "import {value} from '../src/value.mjs';\n",
            "packages/a/src/unrelated.mjs": "export const other = 2;\n",
        }.items():
            self.write(path, text)
        self.files = [str(path.relative_to(self.root)) for path in self.root.rglob("*.mjs")]
        self.data = {"components": {
            "a": {"watch": ["packages/a/"], "tests": [self.smoke]},
            "b": {"watch": ["apps/b/"], "tests": [self.test]},
            "contracts": {"watch": ["contracts/"], "tests": [], "manual": "Compile the changed contract."},
        }}

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def plan(self, changed=(), components=()):
        return workflow.test_plan(list(changed), self.data, self.files, components, self.root)

    def test_import_chain_selects_consumer_checks_across_component_boundary(self):
        plan = self.plan([self.source])
        self.assertEqual(set(plan["testFiles"]), {self.test, self.smoke})
        self.assertFalse(plan["economicCommandsSelected"])
        self.assertEqual(plan["smokeOnlyChanges"], [])

    def test_named_package_exports_and_manifest_changes_select_consumers(self):
        manifest = "packages/a/package.json"
        self.write(manifest, '{"name":"@lianum/a","exports":{"./value":{"default":"./src/value.mjs"}}}')
        self.write(self.consumer, "import {value} from '@lianum/a/value';\n")
        self.files.append(manifest)
        self.assertIn(self.test, self.plan([self.source])["testFiles"])
        self.assertIn(self.test, self.plan([manifest])["testFiles"])

    def test_conditional_exports_follow_declared_order(self):
        manifest = "packages/a/package.json"
        self.write(manifest, '{"name":"@lianum/a","exports":{"./value":{"default":"./src/value.mjs","import":"./src/unrelated.mjs"}}}')
        self.write(self.consumer, "import {value} from '@lianum/a/value';\n")
        self.files.append(manifest)
        self.assertIn(self.test, self.plan([self.source])["testFiles"])
        self.assertNotIn(self.test, self.plan(["packages/a/src/unrelated.mjs"])["testFiles"])

    def test_unknown_dynamic_dependency_is_explicit_component_smoke_only(self):
        changed = "packages/a/src/unrelated.mjs"
        plan = self.plan([changed])
        self.assertEqual(plan["testFiles"], [self.smoke])
        self.assertEqual(plan["smokeOnlyChanges"], [changed])

    def test_frozen_sources_do_not_connect_current_test_dependencies(self):
        for prefix in ("archive/delivery", "packages/protocol/src"):
            historical = prefix + "/old.mjs"
            self.write(historical, "import '@lianum/a/value';\n")
            self.write(self.consumer, "import '../../../" + historical + "';\n")
            self.write("packages/a/package.json", '{"name":"@lianum/a","exports":{"./value":"./src/value.mjs"}}')
            self.files.extend([historical, "packages/a/package.json"])
            plan = self.plan([self.source])
            self.assertEqual(plan["testFiles"], [self.smoke])
        # An edited historical file still needs explicit review; it is not a pass.
        self.assertEqual(self.plan(["archive/delivery/old.mjs"])["unmappedChanges"],
                         ["archive/delivery/old.mjs"])

    def test_documentation_only_selects_no_execution(self):
        self.assertEqual(self.plan(["packages/a/README.md"])["testFiles"], [])
        self.assertEqual(self.plan(["README.md"])["unmappedChanges"], [])
        mixed = self.plan(["packages/a/README.md", self.test])
        self.assertEqual(mixed["testFiles"], [self.test])
        self.assertEqual(mixed["smokeOnlyChanges"], [])

    def test_unmapped_code_and_contracts_cannot_report_automatic_pass(self):
        for plan in (self.plan(["unknown/code.mjs"]), self.plan(["contracts/A.sol"]),
                     self.plan(components=["contracts"])):
            with patch.object(workflow.subprocess, "run") as run, redirect_stdout(io.StringIO()):
                self.assertEqual(workflow.run_plan(plan, 24), 2)
                run.assert_not_called()

    def test_budget_never_launches_partial_selection(self):
        with patch.object(workflow.subprocess, "run") as run, redirect_stdout(io.StringIO()):
            self.assertEqual(workflow.run_plan(self.plan([self.source]), 1), 2)
            run.assert_not_called()

    def test_runner_preserves_failure_and_uses_explicit_source_paths(self):
        with patch.object(workflow, "ROOT", self.root), patch.object(workflow, "run_bounded") as run:
            run.return_value = {'exitCode': 19, 'status': 'FAIL'}
            plan = self.plan(components=["b"])
            self.assertEqual(workflow.run_plan(plan, 24), 19)
            command = run.call_args.args[0]
            self.assertEqual(command[:3], [str(self.root / 'dev'), 'test', '--timeout'])
            self.assertEqual(command[-1], self.test)
            self.assertLessEqual(float(command[3]), 120)
            self.assertEqual(run.call_args.kwargs['cwd'], self.root)

    def test_git_detects_committed_staged_unstaged_deleted_and_untracked_changes(self):
        def git(*arguments):
            return subprocess.check_output(["git", *arguments], cwd=self.root, stderr=subprocess.DEVNULL).decode().strip()
        git("init")
        git("config", "user.name", "Fixture")
        git("config", "user.email", "fixture@example.invalid")
        git("add", ".")
        git("commit", "-m", "fixture")
        base = git("rev-parse", "HEAD")
        self.write(self.source, "export const value = 2;\n")
        git("add", ".")
        git("commit", "-m", "branch change")
        self.write(self.consumer, "// staged\n")
        git("add", self.consumer)
        self.write(self.test, "// unstaged\n")
        (self.root / self.smoke).unlink()
        self.write("new file.mjs", "// untracked\n")
        current = workflow.changed_files(root=self.root)
        self.assertEqual(set(current), {self.consumer, self.test, self.smoke, "new file.mjs"})
        self.assertEqual(set(workflow.changed_files(base, self.root)), {*current, self.source})

    def test_repository_catalog_points_to_existing_tests_and_entrypoints(self):
        data = workflow.catalog()
        for row in data["entrypoints"]:
            self.assertTrue((workflow.ROOT / row["entry"]).is_file(), row["entry"])
        for row in data["components"].values():
            self.assertFalse(any("/integration/" in path for path in row["tests"]))


if __name__ == "__main__":
    unittest.main()
