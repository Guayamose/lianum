"""Host fixed-task integration only; own Python children, no compiler/proof.

The unchanged fifteen ledger watchdog regressions run separately. These six
checks cover the added task identity, entry fence and output/receipt dispatch.
"""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import os
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import native_artifact_tasks as tasks
import test_native_value_ledger as prior


class ProducedW39Task(unittest.TestCase):
    def test_retained_task_is_immutable_and_has_only_fixed_w39_paths_and_heap(self):
        task=tasks.fixed_w39_task()
        self.assertEqual(task.exec_args,("--max-old-space-size=384",))
        self.assertEqual(task.entry.name,"prepare-development-native-value-w39-v5.mjs")
        self.assertEqual(task.output.name,"v6");self.assertEqual(task.output.parent.name,"development-native-value-w39")
        self.assertEqual(len(task.output_names),8)
        with self.assertRaises(AttributeError):task.entry=Path("/caller/entry")
        with self.assertRaises(TypeError):tasks.fixed_w39_task("caller")

    def test_copy_of_task_data_cannot_select_a_child_command(self):
        module=prior.load_guard();task=tasks.fixed_w39_task()
        with self.assertRaisesRegex(module.GuardError,"LEDGER_FIXED_TASK_REQUIRED"):
            module._run_fixed_task(SimpleNamespace(**task._asdict()))

    def test_w39_entry_rejects_extra_caller_options_before_any_native_child(self):
        module=prior.load_guard();task=tasks.fixed_w39_task()
        with patch.object(sys,"argv",[str(task.wrapper),"/caller/receipt.json"]), self.assertRaisesRegex(module.GuardError,"FIXED_W39_WRAPPER_INVOCATION"):
            module.run_w39()

    def test_w39_entry_rejects_an_unrelated_wrapper_path_before_any_native_child(self):
        module=prior.load_guard()
        with patch.object(sys,"argv",["/caller/native_value_w39.py"]), self.assertRaisesRegex(module.GuardError,"FIXED_W39_WRAPPER_INVOCATION"):
            module.run_w39()

    def exercise(self,omit_receipt=False):
        module=prior.load_guard()
        with tempfile.TemporaryDirectory(prefix="lianum-w39-watchdog-host-") as temporary:
            root=Path(temporary);dev=root/"dev";flat=root/"runtime";dev.mkdir();flat.mkdir()
            script=root/"scripts/development/native_value_ledger.py";script.parent.mkdir(parents=True);script.write_text("# own host selector")
            wrapper=script.with_name("native_value_w39.py");wrapper.write_text("# own host selector")
            output=flat/".local/development-native-value-w39/v6"
            names=tasks.fixed_w39_task().output_names
            fixture=flat/"owned-fixture.py"
            fixture.write_text("from pathlib import Path\np=Path('.local/development-native-value-w39/v6');p.mkdir(parents=True)\n"+"\n".join("(p/"+repr(name)+").write_text('{}')" for name in names if not(omit_receipt and name=='receipt.json'))+"\n")
            task=tasks.fixed_w39_task()._replace(wrapper=wrapper,entry=fixture,output=output,reports=dev/"reports",exec_args=())
            cwd=Path.cwd()
            try:
                os.chdir(root)
                options={"ROOT":root,"DEV":dev,"FLAT":flat,"NODE":Path(sys.executable),"__file__":str(script),"PROOF_LOCK":root/"OWNED-HOST-FIXTURE.lock","AVAILABLE_FLOOR":0,"DISK_FLOOR":0,"SAMPLE_SECONDS":0.01,"SIGNAL_GRACE_SECONDS":0.1,"COMPILE_SECONDS":4,"CLEANUP_SECONDS":2}
                with patch.multiple(module,**options),patch.object(tasks,"_W39",task),patch.object(sys,"argv",[str(wrapper)]),patch.object(module,"checked_node",return_value={"hostFixture":True}),patch.object(module,"_task_source_capsule",return_value=[{"hostFixture":True,"nativeAcceptance":False}]),redirect_stdout(io.StringIO()):
                    status=module.run_w39()
                attempt=next((dev/"reports").glob("attempt-*"));report=json.loads((attempt/"resources.json").read_text())
                self.assertTrue(report['ownedCleanupConfirmed']);self.assertTrue(report['proofLockReleased']);self.assertFalse((root/"OWNED-HOST-FIXTURE.lock").exists())
                self.assertEqual(report['childExitCode'],0)
                self.assertTrue(all(row['gone'] for row in report['processInventory']['retained']))
                for row in report['processInventory']['retained']:self.assertTrue(prior.fixture_absent(row['original']['pid'],row['original']['startTimeTicks']))
                return status,report
            finally:
                os.chdir(cwd);prior.restore_fixture_subreaper()

    def test_own_host_child_requires_all_eight_new_w39_files_and_retains_w39_schema(self):
        status,report=self.exercise()
        self.assertEqual(status,0);self.assertEqual(report['schema'],'LIANUM_NEW_PC15_W39_RESOURCE_RECEIPT_V6')
        self.assertTrue(all(name in report for name in tasks.fixed_w39_task().output_names))

    def test_own_host_child_missing_new_w39_receipt_is_failed_without_retry(self):
        status,report=self.exercise(omit_receipt=True)
        self.assertEqual(status,1);self.assertEqual(report['failure'],'LEDGER_OUTPUT_ABSENT');self.assertEqual(report['phase'],'failed')


if __name__=='__main__':
    unittest.main()
