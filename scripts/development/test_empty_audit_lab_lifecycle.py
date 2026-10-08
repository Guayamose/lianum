"""Fixed CLI dispatch/order and cancellation joins; no Node/chain/prover starts."""
import importlib.util
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


class FixedEmptyAuditLifecycle(unittest.TestCase):
    def exercise(self, preparation_code=0, interrupted_during_preparation=False, invalid_options=False):
        spec = importlib.util.spec_from_file_location("empty_audit_lifetime", HERE / "empty_audit_lab.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        calls = []
        child = type("OwnedChild", (), {})()
        child.pid, child.returncode = 424242, preparation_code
        child.poll = lambda: child.returncode
        child.send_signal = lambda value: calls.append(("signal", value))

        def spawn(command, **kwargs):
            calls.append(("spawn", command, kwargs))
            if command[1] == str(module.ENTRY):
                # Synthetic fixed audit phase creates its single fresh attempt.
                (module.DIRECTORY / "attempt-synthetic").mkdir()
            if interrupted_during_preparation and command[1] == str(module.PREPARE):
                module.forward_signal(signal.SIGTERM, None)
            return child

        with tempfile.TemporaryDirectory(prefix="empty-audit-cli-lifetime-") as temporary:
            module.DEV = Path(temporary)
            module.DIRECTORY = Path(temporary) / "attempts"
            module.DIRECTORY.mkdir()
            with patch.object(module, "build") as build, patch.object(module.subprocess, "Popen", side_effect=spawn), \
                 patch.object(module.signal, "signal"), patch.object(module, "capture_child_identity", return_value={"synthetic": True}), \
                 patch.object(module, "retain_summary") as retain, \
                 patch.object(module.sys, "argv", [str(HERE / "empty_audit_lab.py"), *(["--endpoint=external"] if invalid_options else [])]):
                try:
                    module.main()
                    code = 0
                except SystemExit as error:
                    code = error.code
                return module, calls, code, build.call_count, retain.call_count

    def test_fixed_public_preparation_must_complete_before_the_single_empty_audit_supervisor(self):
        module, calls, code, builds, summaries = self.exercise()
        spawns = [row for row in calls if row[0] == "spawn"]
        self.assertEqual(code, 0)
        self.assertEqual(builds, 1)
        self.assertEqual(summaries, 1)
        self.assertEqual([row[1] for row in spawns], [[str(module.NODE), str(module.PREPARE)], [str(module.NODE), str(module.ENTRY)]])
        for _, command, options in spawns:
            self.assertEqual(options["cwd"], module.FLAT)
            self.assertEqual(options["env"], {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
            self.assertTrue(callable(options["preexec_fn"]))

    def test_failed_or_interrupted_preparation_never_starts_the_audit_or_publishes_its_summary(self):
        for preparation_code, interrupted in [(1, False), (-15, False), (0, True)]:
            with self.subTest(preparation_code=preparation_code, interrupted=interrupted):
                module, calls, code, builds, summaries = self.exercise(preparation_code, interrupted)
                self.assertNotEqual(code, 0)
                self.assertEqual(builds, 1)
                self.assertEqual(summaries, 0)
                self.assertEqual([row[1] for row in calls if row[0] == "spawn"], [[str(module.NODE), str(module.PREPARE)]])

    def test_options_are_rejected_before_build_or_preparation(self):
        module, calls, code, builds, summaries = self.exercise(invalid_options=True)
        self.assertNotEqual(code, 0)
        self.assertEqual(builds, 0)
        self.assertEqual(summaries, 0)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
