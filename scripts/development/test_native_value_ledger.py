"""Host watchdog fixtures only; no Solidity, native node, proof or release.

Production constants are patched only in isolated imported modules. Each real
process is our own Python fixture, and fixtures verify their own final closure.
Never remove a production lock or infer genuine ledger acceptance here.
"""
from contextlib import redirect_stdout
import ctypes
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import selectors
import signal
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ledger_owned_processes as processes


def load_guard():
    spec = importlib.util.spec_from_file_location("isolated_native_value_ledger_guard", HERE / "native_value_ledger.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture_absent(pid, birth):
    try:
        return processes.proc_stat(pid)["startTimeTicks"] != birth
    except (FileNotFoundError, ProcessLookupError):
        return True


def fixture_wait(predicate, deadline=3):
    began = time.monotonic()
    while not predicate():
        if time.monotonic() - began > deadline:
            raise AssertionError("OWNED_HOST_FIXTURE_CLOSURE_DEADLINE")
        time.sleep(0.01)


def fixture_direct_children():
    return [row for row in processes.process_table().values() if row["ppid"] == os.getpid()]


def restore_fixture_subreaper():
    # Only this unittest process; called after every own fixture PID is absent.
    if fixture_direct_children():
        raise AssertionError("HOST_TEST_LEFT_CHILDREN")
    if ctypes.CDLL(None, use_errno=True).prctl(36, 0, 0, 0, 0) != 0:
        raise AssertionError("HOST_FIXTURE_SUBREAPER_RESTORE_FAILED")


class LedgerWatchdog(unittest.TestCase):
    def exercise(self, code=None, *, source_error=False, source_changed=False, cleanup_error=False,
                 rss_exceeded=False, output_limit=None, inventory_class=None, compile_seconds=4, cleanup_seconds=2):
        module = load_guard()
        code = code or "from pathlib import Path\nprint('fixture stdout')\nimport sys\nprint('fixture stderr',file=sys.stderr)\np=Path('.local/development-native-value-ledger/v5');p.mkdir(parents=True)\n(p/'compiled.json').write_text('{}')\n(p/'receipt.json').write_text('{}')\n"
        with tempfile.TemporaryDirectory(prefix="lianum-ledger-guard-host-") as temporary:
            root = Path(temporary); dev = root / "dev"; flat = root / "runtime"
            dev.mkdir(); flat.mkdir()
            entry = flat / "owned-fixture.py"; entry.write_text(code)
            script_path = root / "scripts/development/native_value_ledger.py"
            script_path.parent.mkdir(parents=True); script_path.write_text("# isolated fixture selector\n")
            saved_cwd = Path.cwd()
            fixed_node = {"version": "HOST_PYTHON_FIXTURE", "archiveSHA256": "a" * 64, "nodeSHA256": "b" * 64}
            sources = [{"fixture": True, "nativeAcceptance": False}]
            changed_sources = [{"fixture": True, "nativeAcceptance": False, "sourceChanged": True}]
            original_finish = processes.LedgerOwnedProcesses.finish
            def broken_finish(inventory):
                original_finish(inventory)
                raise ValueError("private cleanup fixture detail")
            owned_class = inventory_class or processes.LedgerOwnedProcesses
            original_scan = processes.LedgerOwnedProcesses.scan
            def measured_rss_exceeded(inventory):
                return [{**row, "rssBytes": 3221225473} for row in original_scan(inventory)]
            try:
                os.chdir(root)
                options = {"ROOT": root, "DEV": dev, "FLAT": flat, "NODE": Path(sys.executable), "ENTRY": entry,
                    "OUTPUT": flat / ".local/development-native-value-ledger/v5", "REPORTS": dev / "reports",
                    "PROOF_LOCK": root / "OWNED-HOST-FIXTURE.lock", "__file__": str(script_path),
                    "LedgerOwnedProcesses": owned_class, "COMPILE_SECONDS": compile_seconds, "CLEANUP_SECONDS": cleanup_seconds,
                    "SIGNAL_GRACE_SECONDS": 0.1, "SAMPLE_SECONDS": 0.01}
                if output_limit is not None:
                    options["OUTPUT_LIMIT"] = output_limit
                with patch.multiple(module, **options), patch.object(sys, "argv", [str(script_path)]), \
                     patch.object(module, "checked_node", return_value=fixed_node), \
                     patch.object(module, "source_capsule", side_effect=([sources, ValueError("private parser fixture detail"), sources] if source_error
                                  else [sources, changed_sources, changed_sources] if source_changed else None),
                                  return_value=sources), \
                     patch.object(module, "AVAILABLE_FLOOR", 0), patch.object(module, "DISK_FLOOR", 0), \
                     patch.object(processes.LedgerOwnedProcesses, "finish", broken_finish if cleanup_error else original_finish), \
                     patch.object(processes.LedgerOwnedProcesses, "scan", measured_rss_exceeded if rss_exceeded else original_scan), \
                     redirect_stdout(io.StringIO()) as public_output:
                    status = module.main()
                attempts = list((dev / "reports").glob("attempt-*"))
                self.assertEqual(len(attempts), 1)
                attempt = attempts[0]
                report = json.loads((attempt / "resources.json").read_text())
                lock_present = (root / "OWNED-HOST-FIXTURE.lock").exists()
                logs = {name: (attempt / (name + ".log")).read_bytes() for name in ("stdout", "stderr")
                        if (attempt / (name + ".log")).exists()}
                for name, data in logs.items():
                    self.assertEqual(report["output"][name]["storedBytes"], len(data))
                    self.assertEqual(report["output"][name]["storedSHA256"], hashlib.sha256(data).hexdigest())
                    self.assertEqual((attempt / (name + ".log")).stat().st_mode & 0o777, 0o600)
                self.assertNotIn("private parser fixture detail", public_output.getvalue())
                self.assertNotIn("private cleanup fixture detail", public_output.getvalue())
                private_errors = [json.loads((attempt / row["path"]).read_text()) for row in report["privateErrors"]]
                return status, report, lock_present, logs, private_errors
            finally:
                # A deliberately rejected/missing birth is closed by the own
                # fixture capability, never by fabricating a watchdog identity.
                if inventory_class is not None:
                    inventory_class.close_fixture()
                os.chdir(saved_cwd)
                restore_fixture_subreaper()

    def test_completed_host_fixture_requires_zero_exit_source_join_closure_and_lock_release(self):
        status, report, present, logs, _errors = self.exercise()
        self.assertEqual(status, 0); self.assertEqual(report["phase"], "completed")
        self.assertIsNone(report["failure"]); self.assertTrue(report["ownedCleanupConfirmed"])
        self.assertTrue(report["sourceClosureUnchanged"]); self.assertTrue(report["proofLockReleased"])
        self.assertFalse(present); self.assertIn(b"fixture stdout", logs["stdout"])
        self.assertIn(b"fixture stderr", logs["stderr"])
        self.assertTrue(all(row["gone"] for row in report["processInventory"]["retained"]))

    def test_unexpected_post_compile_parser_exception_stays_failed_and_private(self):
        status, report, present, _logs, errors = self.exercise(source_error=True)
        self.assertEqual(status, 1); self.assertEqual(report["phase"], "failed")
        self.assertEqual(report["failure"], "LEDGER_WATCHDOG_UNEXPECTED_EXCEPTION")
        self.assertEqual(report["childExitCode"], 0); self.assertTrue(report["ownedCleanupConfirmed"])
        self.assertFalse(present)
        self.assertTrue(any("private parser fixture detail" in row["traceback"] for row in errors))

    def test_unexpected_cleanup_exception_stays_failed_and_retains_exclusivity(self):
        status, report, present, _logs, errors = self.exercise(cleanup_error=True)
        self.assertEqual(status, 1); self.assertEqual(report["phase"], "failed")
        self.assertEqual(report["failure"], "LEDGER_WATCHDOG_UNEXPECTED_EXCEPTION")
        self.assertFalse(report["ownedCleanupConfirmed"])
        self.assertTrue(report["proofLockRetained"]); self.assertFalse(report["proofLockReleased"])
        self.assertTrue(present)
        self.assertTrue(any(row["stage"] == "owned-process-cleanup" for row in errors))

    def test_compiler_failure_remains_first_even_when_cleanup_also_throws(self):
        class EnrolledFailureFixture(processes.LedgerOwnedProcesses):
            def spawn(self, *args, **kwargs):
                child = super().spawn(*args, **kwargs)
                (Path(kwargs["cwd"]) / "fixture-enrolled").touch()
                return child
            @classmethod
            def close_fixture(cls):
                pass  # The original child is exited/reaped by the guard.
        status, report, present, logs, _errors = self.exercise(
            "import sys,time\nfrom pathlib import Path\nprint('original private compiler cause',file=sys.stderr)\nwhile not Path('fixture-enrolled').exists():time.sleep(.001)\nsys.exit(7)\n",
            cleanup_error=True, inventory_class=EnrolledFailureFixture)
        self.assertEqual(status, 1); self.assertEqual(report["failure"], "LEDGER_COMPILER_EXIT_NONZERO")
        self.assertEqual(report["childExitCode"], 7); self.assertTrue(present)
        self.assertIn(b"original private compiler cause", logs["stderr"])

    def test_private_combined_output_bound_is_preserved_on_rejection(self):
        status, report, _present, logs, _errors = self.exercise(
            "import os\nos.write(1,b'x'*4096)\nos.write(2,b'y'*4096)\n", output_limit=1024)
        self.assertEqual(status, 1); self.assertEqual(report["failure"], "LEDGER_COMPILER_OUTPUT_LIMIT")
        self.assertLessEqual(sum(len(value) for value in logs.values()), 1024)
        self.assertTrue(any(row["truncated"] for row in report["output"].values()))
        self.assertTrue(report["ownedCleanupConfirmed"])

    def test_missing_original_birth_cannot_signal_or_release_a_live_child(self):
        class MissingBirth(processes.LedgerOwnedProcesses):
            instance = None
            fixture_identity = None
            def __init__(self):
                super().__init__()
                type(self).instance = self
            def spawn(self, *args, **kwargs):
                child = super().spawn(*args, **kwargs)
                type(self).instance = self
                type(self).fixture_identity = self.records[child.pid]["original"]
                for row in self.records.values():
                    if row["pidfd"] is not None:
                        os.close(row["pidfd"])
                self.records.clear(); self.unsafe = True
                raise processes.LedgerProcessError("LEDGER_ORIGINAL_BIRTH_PIPE_INVALID")
            @classmethod
            def close_fixture(cls):
                if cls.instance is None or cls.instance.child is None:
                    return
                child = cls.instance.child
                if child.poll() is None:
                    current = processes.identity(child.pid)
                    if cls.fixture_identity is None:
                        # Only the fixture's actual Popen object, never a
                        # discovered process, supplies this cleanup capability.
                        if current["ppid"] != os.getpid() or current["pgrp"] != child.pid or current["session"] != child.pid:
                            raise AssertionError("OWNED_TEST_FIXTURE_IDENTITY_CHANGED")
                        cls.fixture_identity = current
                    elif not processes.stable_equal(cls.fixture_identity, current):
                        raise AssertionError("OWNED_TEST_FIXTURE_IDENTITY_CHANGED")
                    child.terminate(); child.wait(timeout=2)
                if cls.fixture_identity is not None:
                    fixture_wait(lambda: fixture_absent(child.pid, cls.fixture_identity["startTimeTicks"]))
        status, report, present, _logs, _errors = self.exercise("import signal\nsignal.pause()\n", inventory_class=MissingBirth)
        self.assertEqual(status, 1); self.assertEqual(report["failure"], "LEDGER_ORIGINAL_BIRTH_PIPE_INVALID")
        self.assertTrue(report["workerSpawned"]); self.assertFalse(report["ownedCleanupConfirmed"])
        self.assertEqual(report["signals"], []); self.assertTrue(present); self.assertTrue(report["proofLockRetained"])

    def test_changed_source_rejects_completed_fixture_without_republishing_or_retry(self):
        status, report, present, _logs, _errors = self.exercise(source_changed=True)
        self.assertEqual(status, 1); self.assertEqual(report["failure"], "LEDGER_SOURCE_CHANGED")
        self.assertEqual(report["phase"], "failed"); self.assertFalse(report["sourceClosureUnchanged"])
        self.assertEqual(report["childExitCode"], 0); self.assertTrue(report["ownedCleanupConfirmed"])
        self.assertFalse(present)

    def test_sample_above_the_original_three_gib_policy_rejects_without_large_allocation(self):
        # Controlled measurement fixture, not a claim that this Python process
        # used 3 GiB. The production comparator is exercised at 3 GiB + 1 byte.
        status, report, present, _logs, _errors = self.exercise(
            "import signal\nprint('fixture ready',flush=True)\nsignal.pause()\n", rss_exceeded=True)
        self.assertEqual(status, 1); self.assertEqual(report["failure"], "LEDGER_PROCESS_RSS_LIMIT")
        self.assertTrue(report["ownedCleanupConfirmed"]); self.assertFalse(present)

    def test_exhausted_cleanup_budget_is_shared_with_finally_and_never_restarted(self):
        class UncooperativeFixture(processes.LedgerOwnedProcesses):
            instance = None
            requested = []
            def __init__(self):
                super().__init__(); type(self).instance = self
            def signal_retained(self, selected):
                # Only the own test fixture suppresses effect. Production still
                # uses pidfd signals; the fixture's separate capability closes it.
                self.scan(); type(self).requested.append(selected); return []
            @classmethod
            def close_fixture(cls):
                if cls.instance is None or cls.instance.child is None:
                    return
                child = cls.instance.child
                original = cls.instance.records[child.pid]["original"]
                if child.poll() is None:
                    if not processes.stable_equal(original, processes.identity(child.pid)):
                        raise AssertionError("OWNED_TEST_FIXTURE_IDENTITY_CHANGED")
                    child.kill(); child.wait(timeout=2)
                fixture_wait(lambda: fixture_absent(child.pid, original["startTimeTicks"]))
        status, report, present, _logs, _errors = self.exercise(
            "import signal\nprint('fixture ready',flush=True)\nsignal.pause()\n", inventory_class=UncooperativeFixture,
            compile_seconds=0.2, cleanup_seconds=0.2)
        self.assertEqual(status, 1); self.assertEqual(report["failure"], "LEDGER_COMPILATION_DEADLINE")
        self.assertEqual(UncooperativeFixture.requested, [signal.SIGTERM, signal.SIGKILL])
        self.assertAlmostEqual(report["cleanupDeadlineElapsedMilliseconds"] - report["firstFailureElapsedMilliseconds"], 200, places=4)
        self.assertFalse(report["ownedCleanupConfirmed"]); self.assertTrue(present)


class OwnedProcessInventory(unittest.TestCase):
    def fixture(self, adopted=False):
        """Own protocol supplies an extra cleanup capability only to the test.

        The watchdog inventory never reads this fixture's stdout descriptor.
        It therefore cannot convert that unknown adopted child into authority.
        """
        temporary = tempfile.TemporaryDirectory(prefix="lianum-ledger-owned-host-")
        root = Path(temporary.name); release = root / "parent-release"
        child_source = """import json,os,pathlib,subprocess,sys,time
child=subprocess.Popen([sys.executable,'-c','import signal;signal.pause()'],start_new_session=True)
value=pathlib.Path('/proc/'+str(child.pid)+'/stat').read_text().rsplit(') ',1)[1].split()
print(json.dumps({'pid':child.pid,'ppid':os.getpid(),'pgrp':int(value[2]),'session':int(value[3]),'startTimeTicks':value[19]}),flush=True)
while not pathlib.Path(sys.argv[1]).exists():time.sleep(.01)
"""
        inventory = processes.LedgerOwnedProcesses(); child = None; pidfd = None; selector = None
        inventory.constrain_wait_deadline(time.monotonic() + 10)
        try:
            inventory.activate()
            child = inventory.spawn([sys.executable, "-c", child_source, str(release)], cwd=root,
                                    env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
            selector = selectors.DefaultSelector(); selector.register(child.stdout, selectors.EVENT_READ)
            if not selector.select(3):
                raise AssertionError("OWNED_FIXTURE_DESCRIPTOR_DEADLINE")
            descriptor = json.loads(child.stdout.readline()); selector.close(); selector = None
            # Test-only custody is derived from the live original fixture parent,
            # not from matching a name/UID or discovering a reparented process.
            original_parent = processes.identity(child.pid)
            current = processes.identity(descriptor["pid"])
            self.assertEqual(current["ppid"], child.pid)
            self.assertTrue(all(current[key] == descriptor[key] for key in descriptor))
            pidfd = os.pidfd_open(current["pid"], 0)
            self.assertTrue(processes.stable_equal(current, processes.identity(current["pid"])))
            self.assertTrue(processes.stable_equal(original_parent, processes.identity(child.pid)))
            if adopted:
                release.touch(); child.wait(timeout=2)
            return temporary, inventory, child, current, pidfd, release
        except Exception:
            # Parent-release is not written until we hold the fixture's private
            # descriptor capability. A setup failure therefore still has the
            # live original parent chain available for strict inventory cleanup.
            if inventory.active and inventory.child is not None:
                inventory.signal_retained(signal.SIGKILL)
                inventory.child.wait(timeout=2)
                fixture_wait(lambda: not inventory.scan())
                inventory.finish()
            if child is not None:
                for name in ("stdout", "stderr"):
                    getattr(child, name).close()
            if selector is not None:
                selector.close()
            if pidfd is not None:
                os.close(pidfd)
            temporary.cleanup(); restore_fixture_subreaper()
            raise

    def close_fixture(self, state):
        temporary, inventory, child, descendant, pidfd, _release = state
        try:
            # The separate test fixture capability closes any intentionally
            # unknown child. It never modifies inventory.records or unsafe.
            if not fixture_absent(descendant["pid"], descendant["startTimeTicks"]):
                current = processes.identity(descendant["pid"], allow_terminal_read=True)
                self.assertTrue(processes.immutable_equal(descendant, current))
                if current["state"] not in ("Z", "X"):
                    signal.pidfd_send_signal(pidfd, signal.SIGKILL, None, 0)
            if child.poll() is None:
                self.assertTrue(processes.immutable_equal(inventory.records[child.pid]["original"], processes.identity(child.pid)))
                child.kill(); child.wait(timeout=2)
            # Reap only the own retained descendant if kernel adopted it here.
            fixture_wait(lambda: self.reap_fixture(descendant))
            fixture_wait(lambda: fixture_absent(child.pid, inventory.records[child.pid]["original"]["startTimeTicks"]))
            for name in ("stdout", "stderr"):
                getattr(child, name).close()
            for row in inventory.records.values():
                if row["pidfd"] is not None:
                    os.close(row["pidfd"]); row["pidfd"] = None
        finally:
            os.close(pidfd); temporary.cleanup()
            restore_fixture_subreaper()

    def reap_fixture(self, descendant):
        if fixture_absent(descendant["pid"], descendant["startTimeTicks"]):
            return True
        if processes.proc_stat(descendant["pid"])["state"] not in ("Z", "X"):
            return False
        current = processes.identity(descendant["pid"], allow_terminal_read=True)
        if current["ppid"] == os.getpid() and current["state"] in ("Z", "X"):
            os.waitpid(descendant["pid"], os.WNOHANG)
        return fixture_absent(descendant["pid"], descendant["startTimeTicks"])

    def test_escaped_session_descendant_is_authenticated_by_ancestry_and_closed(self):
        state = self.fixture()
        _temporary, inventory, child, descendant, _pidfd, _release = state
        try:
            live = inventory.scan()
            self.assertEqual({row["pid"] for row in live}, {child.pid, descendant["pid"]})
            self.assertNotEqual(descendant["pgrp"], inventory.records[child.pid]["original"]["pgrp"])
            self.assertEqual(inventory.records[descendant["pid"]]["origin"], "AUTHENTICATED_LIVE_ANCESTRY")
            guard = load_guard()
            with self.assertRaisesRegex(guard.GuardError, "LEDGER_UNEXPECTED_DESCENDANT"):
                guard.sample(inventory)
            inventory.signal_retained(signal.SIGKILL)
            child.wait(timeout=2)
            fixture_wait(lambda: not inventory.scan())
            self.assertTrue(inventory.finish())
            self.assertTrue(fixture_absent(descendant["pid"], descendant["startTimeTicks"]))
            self.assertTrue(any(row["kind"] == "reaped-authenticated-child" for row in inventory.events))
        finally:
            self.close_fixture(state)

    def test_reparenting_without_observed_chain_grants_no_signal_or_cleanup_authority(self):
        state = self.fixture(adopted=True)
        _temporary, inventory, _child, descendant, _pidfd, _release = state
        try:
            self.assertEqual(inventory.scan(), [])
            self.assertTrue(inventory.unsafe); self.assertIn(descendant["pid"], inventory.unknown)
            self.assertNotIn(descendant["pid"], inventory.records)
            self.assertEqual(inventory.signal_retained(signal.SIGKILL), [])
            self.assertFalse(inventory.cleanup_confirmed()); self.assertFalse(inventory.finish())
            self.assertFalse(fixture_absent(descendant["pid"], descendant["startTimeTicks"]))
        finally:
            self.close_fixture(state)

    def test_uid_mutation_after_enrolment_refuses_every_signal(self):
        state = self.fixture()
        _temporary, inventory, child, _descendant, _pidfd, _release = state
        original_identity = processes.identity
        def substituted_identity(pid, **options):
            row = original_identity(pid, **options)
            if pid == child.pid:
                return {**row, "uid": row["uid"] + 1, "uids": [row["uid"] + 1] * 4}
            return row
        try:
            with patch.object(processes, "identity", side_effect=substituted_identity), \
                 patch.object(signal, "pidfd_send_signal") as signal_call:
                with self.assertRaisesRegex(processes.LedgerProcessError, "LEDGER_RETAINED_IDENTITY_CHANGED"):
                    inventory.signal_retained(signal.SIGKILL)
                signal_call.assert_not_called()
            self.assertTrue(inventory.unsafe)
        finally:
            self.close_fixture(state)

    def test_terminal_uid_four_mismatch_remains_rejected_even_with_root_proc_inode(self):
        state = self.fixture()
        _temporary, inventory, child, descendant, pidfd, _release = state
        try:
            inventory.scan()  # Retain the original live ancestry first.
            signal.pidfd_send_signal(pidfd, signal.SIGKILL, None, 0)
            fixture_wait(lambda: processes.proc_stat(descendant["pid"])["state"] == "Z")
            original_read_text = Path.read_text
            def changed_status(path, *args, **kwargs):
                value = original_read_text(path, *args, **kwargs)
                if str(path) == f"/proc/{descendant['pid']}/status":
                    replacement = "Uid:\t" + "\t".join([str(os.getuid() + 1)] * 4)
                    return __import__('re').sub(r"^Uid:.*$", replacement, value, flags=__import__('re').M)
                return value
            with patch.object(Path, "read_text", changed_status), patch.object(signal, "pidfd_send_signal") as send:
                with self.assertRaisesRegex(processes.LedgerProcessError, "LEDGER_PROCESS_UID_CHANGED"):
                    inventory._read_retained(descendant["pid"])
                send.assert_not_called()
            self.assertTrue(inventory.unsafe)
        finally:
            self.close_fixture(state)

    def test_an_unenrolled_zombie_never_opens_pidfd_or_becomes_signal_authority(self):
        state = self.fixture()
        _temporary, inventory, _child, descendant, pidfd, _release = state
        try:
            signal.pidfd_send_signal(pidfd, signal.SIGKILL, None, 0)
            fixture_wait(lambda: processes.proc_stat(descendant["pid"])["state"] == "Z")
            with patch.object(os, "pidfd_open") as opened, patch.object(signal, "pidfd_send_signal") as sent:
                with self.assertRaisesRegex(processes.LedgerProcessError, "LEDGER_PROCESS_PROC_OWNER_CHANGED|LEDGER_TERMINAL_ENROLLMENT_FORBIDDEN"):
                    inventory.scan()
                opened.assert_not_called(); sent.assert_not_called()
            self.assertNotIn(descendant["pid"], inventory.records)
            self.assertTrue(inventory.unsafe)
        finally:
            self.close_fixture(state)

    def test_live_proc_inode_owner_change_without_kernel_exit_is_rejected(self):
        state = self.fixture()
        _temporary, inventory, child, _descendant, _pidfd, _release = state
        original_stat = Path.stat
        def changed_proc_owner(path, *args, **kwargs):
            value = original_stat(path, *args, **kwargs)
            if str(path) == f"/proc/{child.pid}/stat":
                fields = list(value); fields[4] = 0; return os.stat_result(fields)
            return value
        try:
            with patch.object(Path, "stat", changed_proc_owner), patch.object(signal, "pidfd_send_signal") as sent:
                with self.assertRaisesRegex(processes.LedgerProcessError, "LEDGER_PROCESS_PROC_OWNER_CHANGED"):
                    inventory._read_retained(child.pid)
                sent.assert_not_called()
            self.assertTrue(inventory.unsafe); self.assertIsNone(child.poll())
        finally:
            self.close_fixture(state)


if __name__ == "__main__":
    unittest.main()
