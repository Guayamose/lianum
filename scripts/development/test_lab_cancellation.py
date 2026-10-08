"""CLI spawn races and Python parent-death probes; no chain or prover starts."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


class FakeOwnedChild:
    def __init__(self, module, signum, after_assignment=False):
        self.module, self.signum = module, signum
        self.pid, self.returncode = 424242, None
        self.signals = []
        self.after_assignment = after_assignment

    def poll(self):
        if self.after_assignment:
            self.after_assignment = False
            self.module.forward_signal(self.signum, None)
        return self.returncode

    def send_signal(self, signum):
        self.signals.append(signum)
        self.returncode = -signum


class LabCancellation(unittest.TestCase):
    def exercise(self, filename, timing, signum):
        spec = importlib.util.spec_from_file_location("synthetic_lab", HERE / filename)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if filename == "evm_lab.py":
            module.ENTRY = Path("integration/run-manual-wallet-acceptance.mjs")
        child = FakeOwnedChild(module, signum, after_assignment=timing == "after")
        launches = []

        def spawn(*args, **kwargs):
            self.assertIsNone(module.active)
            self.assertTrue(callable(kwargs["preexec_fn"]))
            self.assertEqual(kwargs["env"], {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
            launches.append(args)
            if timing == "during":
                # Popen has started, but the assignment to active has not run.
                module.forward_signal(signum, None)
            return child

        if timing == "before":
            module.forward_signal(signum, None)
        with tempfile.TemporaryDirectory(prefix="lianum-cli-signal-") as temporary:
            module.DEV = Path(temporary)
            module.DIRECTORY = Path(temporary) / "attempts"
            module.DIRECTORY.mkdir()
            with patch.object(module.subprocess, "Popen", side_effect=spawn), \
                 patch.object(module.signal, "signal"), \
                 patch.object(module, "build"), \
                 patch.object(module.sys, "argv", [str(HERE / filename)]):
                with self.assertRaises(SystemExit):
                    if filename in ("native_claim_lab.py", "evm_lab.py"):
                        module.run(module.ENTRY, observe=False)
                    else:
                        module.main()
        if timing == "before":
            self.assertEqual(launches, [])
            self.assertEqual(child.signals, [])
        else:
            self.assertEqual(len(launches), 1)
            self.assertEqual(child.signals, [signum])

    def test_pending_and_live_signals_reach_only_the_new_owned_child(self):
        for filename in ("native_claim_lab.py", "evm_lab.py", "defi_lab.py", "defi_entry_lab.py"):
            for signum in (signal.SIGINT, signal.SIGTERM):
                for timing in ("before", "during", "after"):
                    with self.subTest(filename=filename, signum=signum, timing=timing):
                        self.exercise(filename, timing, signum)

    @unittest.skipUnless(sys.platform == "linux", "PDEATHSIG is Linux-specific")
    def test_parent_sigkill_terminates_the_real_owned_python_child(self):
        fixture = """import ctypes, json, os, signal, time
from pathlib import Path
def write(name, value):
    temporary = name + '.tmp'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary, name)
def terminate(signum, _frame):
    write('terminated.json', {'pid': os.getpid(), 'signal': signum})
    os._exit(0)
signal.signal(signal.SIGTERM, terminate)
death_signal = ctypes.c_int()
if ctypes.CDLL(None, use_errno=True).prctl(2, ctypes.byref(death_signal), 0, 0, 0) != 0:
    raise RuntimeError('PDEATHSIG_READ_FAILED')
stat = Path('/proc/self/stat').read_text().rsplit(') ', 1)[1].split()
write('ready.json', {'pid': os.getpid(), 'parent': os.getppid(), 'startTicks': stat[19],
    'deathSignal': death_signal.value, 'environment': dict(os.environ)})
while True: time.sleep(1)
"""
        wrapper = """import importlib.util, sys
from pathlib import Path
source, directory = Path(sys.argv[1]), Path(sys.argv[2])
sys.path.insert(0, str(source.parent))
spec = importlib.util.spec_from_file_location('original_owned_lab', source)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.DEV = directory / 'dev'; module.FLAT = directory
module.DIRECTORY = directory / 'attempts'; module.DIRECTORY.mkdir()
module.NODE = Path(sys.executable); module.ENTRY = directory / 'child.py'
module.build = lambda **kwargs: None
module.sys.argv = ['owned-parent-death-probe']
if source.name in ('native_claim_lab.py', 'evm_lab.py'): module.run(module.ENTRY)
else: module.main()
"""
        for filename in ("native_claim_lab.py", "evm_lab.py", "defi_lab.py", "defi_entry_lab.py"):
            with self.subTest(filename=filename), tempfile.TemporaryDirectory(prefix="lianum-parent-death-") as temporary:
                directory = Path(temporary)
                (directory / "child.py").write_text(fixture)
                ready = None
                parent = subprocess.Popen([sys.executable, "-c", wrapper, str(HERE / filename), str(directory)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                try:
                    deadline = time.monotonic() + 5
                    while not (directory / "ready.json").exists() and time.monotonic() < deadline:
                        self.assertIsNone(parent.poll(), "Owned wrapper failed before its fixture became ready")
                        time.sleep(0.01)
                    self.assertTrue((directory / "ready.json").exists(), "Owned fixture did not start within five seconds")
                    ready = json.loads((directory / "ready.json").read_text())
                    self.assertEqual(ready["parent"], parent.pid)
                    self.assertEqual(ready["deathSignal"], signal.SIGTERM)
                    self.assertEqual(ready["environment"], {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
                    self.assertEqual(Path(f"/proc/{ready['pid']}/exe").resolve(), Path(sys.executable).resolve())
                    parent.kill()  # This exact Popen object owns the wrapper being killed.
                    self.assertEqual(parent.wait(timeout=5), -signal.SIGKILL)
                    deadline = time.monotonic() + 5
                    while not (directory / "terminated.json").exists() and time.monotonic() < deadline:
                        time.sleep(0.01)
                    self.assertEqual(json.loads((directory / "terminated.json").read_text()),
                        {"pid": ready["pid"], "signal": signal.SIGTERM})
                    deadline = time.monotonic() + 5
                    while self.child_is_live(ready) and time.monotonic() < deadline:
                        time.sleep(0.01)
                    self.assertFalse(self.child_is_live(ready))
                finally:
                    if parent.poll() is None:
                        parent.kill(); parent.wait(timeout=5)
                    if ready is not None and self.child_is_live(ready):
                        # Only the authenticated child launched by this probe can
                        # be cancelled; PID reuse or another executable rejects.
                        self.assertEqual(Path(f"/proc/{ready['pid']}/exe").resolve(), Path(sys.executable).resolve())
                        descriptor = os.pidfd_open(ready["pid"])
                        try:
                            self.assertTrue(self.child_is_live(ready))
                            signal.pidfd_send_signal(descriptor, signal.SIGKILL)
                        finally:
                            os.close(descriptor)
                    if parent.stderr is not None:
                        parent.stderr.close()

    @staticmethod
    def child_is_live(ready):
        try:
            path = Path(f"/proc/{ready['pid']}/stat")
            if path.stat().st_uid != os.getuid():
                raise AssertionError("Owned child identity changed")
            fields = path.read_text().rsplit(") ", 1)[1].split()
            if fields[19] != ready["startTicks"]:
                raise AssertionError("Owned child PID was reused")
            return fields[0] not in ("Z", "X")
        except FileNotFoundError:
            return False


if __name__ == "__main__":
    unittest.main()
