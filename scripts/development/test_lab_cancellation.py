"""Deterministic CLI spawn races; no node, prover or native process starts."""
import importlib.util
from pathlib import Path
import signal
import tempfile
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
                    if filename == "native_claim_lab.py":
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
        for filename in ("native_claim_lab.py", "defi_lab.py", "defi_entry_lab.py"):
            for signum in (signal.SIGINT, signal.SIGTERM):
                for timing in ("before", "during", "after"):
                    with self.subTest(filename=filename, signum=signum, timing=timing):
                        self.exercise(filename, timing, signum)


if __name__ == "__main__":
    unittest.main()
