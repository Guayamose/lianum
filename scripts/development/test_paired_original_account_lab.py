"""Real Python-child startup boundaries only; no Node/native/economic lab.

The tiny fixture records whether it received the single original start grant.
Synthetic closure metadata establishes no original economic observation.
Every fixture is closed with this test's separate causal Popen capability.
"""
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

HELPERS = Path(__file__).resolve().parent
PROJECT = next(path for path in HELPERS.parents if (path / "PROJECT-VISION.md").is_file())
sys.path.insert(0, str(PROJECT / "scripts/development"))
spec = importlib.util.spec_from_file_location("paired_cli_startup_fixture", HELPERS / "paired_original_account_lab.py")
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

FIXTURE = r'''
import json,os,sys,uuid
from pathlib import Path
root=Path.cwd()
fd=int(os.environ["LIANUM_PAIRED_ORIGINAL_START_FD_V2"])
grant=os.read(fd,2)
extra=os.read(fd,2)
os.close(fd)
if grant!=b"G" or extra:
    sys.exit(2)
(root/"startup-granted").write_text("one-grant")
value=Path(f"/proc/{os.getpid()}/stat").read_text().rsplit(") ",1)[1].split()
identity={"pid":os.getpid(),"ppid":int(value[1]),"pgrp":int(value[2]),
    "session":int(value[3]),"startTimeTicks":value[19]}
attempt=root/".local/paired-native-note-v2"/("attempt-"+str(uuid.uuid4()))
attempt.mkdir(parents=True,mode=0o700)
receipt={"format":"LIANUM_PAIRED_NATIVE_NOTE_RESOURCES_V2", "supervisorPID":os.getpid(),
    "supervisorIdentity":identity,"ownedGroupCleanupConfirmed":True,"lockReleased":True,
    "workerSpawned":False,"workerPID":None}
path=attempt/"resources.json"
with path.open("x") as stream:
    os.chmod(path,0o600);json.dump(receipt,stream)
'''


class StartupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="lianum-paired-cli-startup-")
        self.root = Path(self.directory.name).resolve()
        self.entry = self.root / "fixture.py"
        self.entry.write_text(FIXTURE)
        self.children = []
        self.start_popen = lab.subprocess.Popen
        def retain_own_child(*args, **kwargs):
            child = self.start_popen(*args, **kwargs)
            self.children.append(child)
            return child
        self.patches = [
            patch.object(lab, "FLAT", self.root), patch.object(lab, "DEV", self.root / ".internal/dev"),
            patch.object(lab, "DIRECTORY", self.root / ".local/paired-native-note-v2"),
            patch.object(lab, "NODE", Path(sys.executable)), patch.object(lab, "ENTRY", self.entry),
            patch.object(lab.subprocess, "Popen", side_effect=retain_own_child),
        ]
        for item in self.patches: item.start()
        lab.active = lab.active_identity = lab.active_pidfd = None
        lab.interrupted = False; lab.pending_signal = None
        self.lock = (self.root / "admission.lock").open("w+")
        os.chmod(self.lock.name, 0o600)

    def tearDown(self):
        # Only Popen objects spawned by this fixture are signalled. This
        # independent test capability does not enrol a failed CLI child.
        try:
            for child in self.children:
                if child.poll() is None:
                    child.terminate()
                child.wait(timeout=2)
                self.assertFalse(Path(f"/proc/{child.pid}").exists())
            self.assertIsNone(lab.active)
            self.assertIsNone(lab.active_pidfd)
        finally:
            self.lock.close()
            for item in reversed(self.patches): item.stop()
            self.directory.cleanup()

    def receipt(self):
        paths = list((self.root / ".internal/dev/reports/paired-original-account-cli-v2").glob("*.json"))
        self.assertEqual(len(paths), 1)
        return json.loads(paths[0].read_text())

    def assert_cancelled(self, cause):
        self.assertEqual(len(self.children), 1)
        self.assertIsNotNone(self.children[0].poll())
        self.assertFalse((self.root / "startup-granted").exists())
        value = self.receipt()
        self.assertEqual(value["failure"], cause)
        self.assertFalse(value["startupGrantDelivered"])
        self.assertTrue(value["originalSupervisorExited"])
        self.assertFalse(value["originalCleanupConfirmed"])
        self.assertTrue(value["admissionRetained"])
        self.lock.seek(0)
        self.assertEqual(json.load(self.lock)["launchId"], value["launchId"])

    def test_capture_none_closes_pipe_and_child_without_starting_worker(self):
        with patch.object(lab, "capture_child_identity", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "CAPTURE_UNCONFIRMED"):
                lab._run_original_supervisor(self.lock)
        self.assert_cancelled("PAIRED_CLI_SUPERVISOR_CAPTURE_UNCONFIRMED")

    def test_capture_exception_closes_pipe_and_retains_first_failure(self):
        with patch.object(lab, "capture_child_identity", side_effect=ValueError("private details")):
            with self.assertRaisesRegex(RuntimeError, "STARTUP_OR_OBSERVATION_EXCEPTION"):
                lab._run_original_supervisor(self.lock)
        self.assert_cancelled("PAIRED_CLI_STARTUP_OR_OBSERVATION_EXCEPTION")
        self.assertNotIn("private details", json.dumps(self.receipt()))

    def test_pidfd_open_exception_does_not_signal_numeric_pid_or_admit(self):
        with patch.object(lab.os, "pidfd_open", side_effect=PermissionError("private")), \
             patch.object(lab.signal, "pidfd_send_signal") as send:
            with self.assertRaisesRegex(RuntimeError, "STARTUP_OR_OBSERVATION_EXCEPTION"):
                lab._run_original_supervisor(self.lock)
        send.assert_not_called()
        self.assert_cancelled("PAIRED_CLI_STARTUP_OR_OBSERVATION_EXCEPTION")

    def test_recheck_changed_rejects_before_grant_and_closes_retained_pidfd(self):
        original = lab.capture_child_identity
        calls = 0
        def changed(child):
            nonlocal calls
            calls += 1
            value = original(child)
            return value if calls == 1 else {**value, "startTimeTicks": str(int(value["startTimeTicks"]) + 1)}
        with patch.object(lab, "capture_child_identity", side_effect=changed), \
             patch.object(lab.signal, "pidfd_send_signal") as send:
            with self.assertRaisesRegex(RuntimeError, "IDENTITY_CHANGED"):
                lab._run_original_supervisor(self.lock)
        send.assert_not_called()
        self.assert_cancelled("PAIRED_CLI_SUPERVISOR_IDENTITY_CHANGED")

    def test_recheck_exception_is_inside_cleanup_frontier(self):
        original = lab.capture_child_identity
        calls = 0
        def broken(child):
            nonlocal calls
            calls += 1
            if calls == 2: raise RuntimeError("private recheck failure")
            return original(child)
        with patch.object(lab, "capture_child_identity", side_effect=broken):
            with self.assertRaisesRegex(RuntimeError, "STARTUP_OR_OBSERVATION_EXCEPTION"):
                lab._run_original_supervisor(self.lock)
        self.assert_cancelled("PAIRED_CLI_STARTUP_OR_OBSERVATION_EXCEPTION")

    def test_actual_signal_during_capture_is_latched_and_prevents_start(self):
        original = lab.capture_child_identity
        previous = signal.signal(signal.SIGTERM, lab.forward_signal)
        sent = False
        def interrupted_capture(child):
            nonlocal sent
            if not sent:
                sent = True
                os.kill(os.getpid(), signal.SIGTERM)
            return original(child)
        try:
            with patch.object(lab, "capture_child_identity", side_effect=interrupted_capture), \
                 patch.object(lab.signal, "pidfd_send_signal") as send:
                with self.assertRaisesRegex(RuntimeError, "INTERRUPTED_DURING_STARTUP"):
                    lab._run_original_supervisor(self.lock)
            send.assert_not_called()
            self.assert_cancelled("PAIRED_CLI_INTERRUPTED_DURING_STARTUP")
        finally: signal.signal(signal.SIGTERM, previous)

    def test_valid_start_grants_once_and_requires_original_closure_receipt(self):
        attempt, pid, code, captured = lab._run_original_supervisor(self.lock)
        self.assertEqual(code, 0)
        self.assertEqual(captured["pid"], pid)
        self.assertEqual((self.root / "startup-granted").read_text(), "one-grant")
        self.assertEqual(attempt.parent, lab.DIRECTORY)
        value = self.receipt()
        self.assertTrue(value["startupGrantDelivered"])
        self.assertTrue(value["originalCleanupConfirmed"])
        self.assertFalse(value["admissionRetained"])
        self.lock.seek(0); self.assertEqual(self.lock.read(), "")

    def test_marker_precedes_popen_and_no_child_is_retained_after_spawn_failure(self):
        def failed_spawn(*_args, **_kwargs):
            self.lock.seek(0)
            self.assertEqual(json.load(self.lock)["phase"], "admitted")
            raise OSError("spawn failed before child was returned")
        with patch.object(lab.subprocess, "Popen", side_effect=failed_spawn):
            with self.assertRaisesRegex(RuntimeError, "STARTUP_OR_OBSERVATION_EXCEPTION"):
                lab._run_original_supervisor(self.lock)
        value = self.receipt()
        self.assertIsNone(value["supervisorPID"])
        self.assertTrue(value["originalCleanupConfirmed"])
        self.lock.seek(0); self.assertEqual(self.lock.read(), "")

    def test_actual_signal_during_popen_prevents_startup_grant(self):
        original = lab.subprocess.Popen
        previous = signal.signal(signal.SIGINT, lab.forward_signal)
        def pending(*args, **kwargs):
            os.kill(os.getpid(), signal.SIGINT)
            return original(*args, **kwargs)
        try:
            with patch.object(lab.subprocess, "Popen", side_effect=pending):
                with self.assertRaisesRegex(RuntimeError, "INTERRUPTED_DURING_STARTUP"):
                    lab._run_original_supervisor(self.lock)
            self.assert_cancelled("PAIRED_CLI_INTERRUPTED_DURING_STARTUP")
        finally: signal.signal(signal.SIGINT, previous)

    def test_uncertain_child_exit_keeps_persistent_admission_and_one_deadline(self):
        # The deliberately nonconforming fixture never waits for the start
        # grant; it cannot run any proof/native operation. Only this test's
        # separate causal Popen capability closes it in tearDown.
        self.entry.write_text("import time\ntime.sleep(2)\n")
        began = time.monotonic()
        with patch.object(lab, "CLEANUP_SECONDS", 0.1), \
             patch.object(lab, "capture_child_identity", return_value=None), \
             patch.object(lab.signal, "pidfd_send_signal") as send:
            with self.assertRaisesRegex(RuntimeError, "CAPTURE_UNCONFIRMED"):
                lab._run_original_supervisor(self.lock)
        elapsed = time.monotonic() - began
        send.assert_not_called()
        self.assertLess(elapsed, 0.3)
        value = self.receipt()
        self.assertFalse(value["originalSupervisorExited"])
        self.assertFalse(value["originalCleanupConfirmed"])
        self.assertTrue(value["admissionRetained"])
        self.assertEqual(value["failure"], "PAIRED_CLI_SUPERVISOR_CAPTURE_UNCONFIRMED")
        self.lock.seek(0); self.assertEqual(json.load(self.lock)["launchId"], value["launchId"])


if __name__ == "__main__":
    unittest.main()
