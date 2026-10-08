"""HOST terminal-boundary metadata regression; no compiler or child is started."""
import importlib.util
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent


def load_builder():
    spec = importlib.util.spec_from_file_location('tron_private_compiler_exit_host', HERE / 'build.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture():
    # Explicitly synthetic metadata: these rows cannot grant OS signal/spawn
    # authority. The regression calls the production boundary predicate.
    original = {'pid': 2147483647, 'ppid': os.getpid(), 'pgrp': 2147483647,
                'session': 2147483647, 'startTimeTicks': '1234',
                'uid': os.getuid(), 'uids': [os.getuid()] * 4}
    child = Mock(name='SyntheticRetainedPopen', pid=original['pid'])
    child.returncode = None
    child.poll.side_effect = lambda: child.returncode

    def wait(timeout):
        child.returncode = 0
        return child.returncode

    child.wait.side_effect = wait
    retained = {'original': original, 'origin': 'ORIGINAL_POPEN_PREEXEC_PIPE',
                'pidfd': 44, 'gone': False}
    inventory = Mock(name='SyntheticRetainedInventory')
    inventory.child, inventory.records = child, {child.pid: retained}
    inventory.unsafe, inventory.unknown = False, {}

    def scan():
        retained['gone'] = True
        return []

    inventory.scan.side_effect = scan
    return original, child, retained, inventory


class CompilerTerminalBoundary(unittest.TestCase):
    def test_missing_exe_after_live_sample_waits_original_pidfd_and_reaps_same_popen(self):
        builder = load_builder()
        sampled, child, retained, inventory = fixture()
        sampled = {**sampled, 'state': 'S', 'rssBytes': 107462656}
        self.assertIsNone(child.poll())
        calls = []

        def ready(read, write, error, timeout):
            calls.append(('pidfd', read, timeout))
            self.assertEqual(read, [retained['pidfd']])
            self.assertGreater(timeout, 0)
            self.assertLessEqual(timeout, .020000000001)
            self.assertIsNone(child.poll())
            return read, [], []

        original_wait = child.wait.side_effect

        def wait(timeout):
            calls.append(('same-popen-wait', child.pid, timeout))
            self.assertEqual(calls[0][0], 'pidfd')
            self.assertGreater(timeout, 0)
            self.assertLessEqual(timeout, .020000000001)
            return original_wait(timeout)

        child.wait.side_effect = wait
        with patch.object(builder, 'process_executable', side_effect=FileNotFoundError), \
             patch.object(builder.time, 'monotonic', return_value=100.0), \
             patch.object(builder.select, 'select', side_effect=ready):
            self.assertIsNone(builder.checked_compiler_executable(inventory, sampled, 101.0))
        self.assertEqual(child.poll(), 0)
        child.wait.assert_called_once()
        inventory.scan.assert_called_once()
        self.assertTrue(retained['gone'])
        self.assertEqual([call[0] for call in calls], ['pidfd', 'same-popen-wait'])

    def test_no_pidfd_readiness_late_deadline_or_wrong_birth_never_waits_or_confirms_exit(self):
        builder = load_builder()
        for failure in ('not-ready', 'deadline', 'pid', 'session', 'uid', 'unsafe', 'missing-pidfd'):
            sampled, child, retained, inventory = fixture()
            if failure == 'pid': sampled = {**sampled, 'pid': sampled['pid'] - 1}
            if failure == 'session': sampled = {**sampled, 'session': sampled['session'] - 1}
            if failure == 'uid': sampled = {**sampled, 'uids': [os.getuid(), os.getuid() + 1, os.getuid(), os.getuid()]}
            if failure == 'unsafe': inventory.unsafe = True
            if failure == 'missing-pidfd': retained['pidfd'] = None
            expected = {'not-ready': 'TERMINAL_PIDFD_UNCONFIRMED', 'deadline': 'COMPILER_DEADLINE',
                        'pid': 'ORIGINAL_POPEN_REQUIRED', 'session': 'SAMPLED_IDENTITY_CHANGED',
                        'uid': 'SAMPLED_IDENTITY_CHANGED', 'unsafe': 'RETAINED_PIDFD_REQUIRED',
                        'missing-pidfd': 'RETAINED_PIDFD_REQUIRED'}[failure]
            with self.subTest(failure=failure), \
                 patch.object(builder, 'process_executable', side_effect=FileNotFoundError), \
                 patch.object(builder.time, 'monotonic', return_value=100.0), \
                 patch.object(builder.select, 'select', return_value=([], [], [])), \
                 self.assertRaisesRegex(RuntimeError, expected):
                builder.checked_compiler_executable(inventory, sampled, 100.0 if failure == 'deadline' else 101.0)
            child.wait.assert_not_called()
            inventory.scan.assert_not_called()
            self.assertFalse(retained['gone'])

    def test_ready_pidfd_still_requires_reap_original_inventory_and_original_deadline(self):
        builder = load_builder()
        for failure in ('wait-timeout', 'still-live', 'unknown', 'unsafe', 'not-gone', 'scan-error', 'late-after-reap'):
            sampled, child, retained, inventory = fixture()
            times = [100.0] * 8
            if failure == 'wait-timeout': child.wait.side_effect = subprocess.TimeoutExpired('synthetic', .020)
            if failure == 'still-live': child.wait.side_effect = None; child.wait.return_value = 0
            if failure == 'unknown': inventory.unknown = {99: {'synthetic': True}}
            if failure == 'unsafe':
                def scan():
                    retained['gone'] = True
                    inventory.unsafe = True
                    return []
                inventory.scan.side_effect = scan
            if failure == 'not-gone': inventory.scan.side_effect = None; inventory.scan.return_value = []
            if failure == 'scan-error': inventory.scan.side_effect = RuntimeError('LEDGER_RETAINED_IDENTITY_CHANGED')
            if failure == 'late-after-reap': times = [100.0] * 4 + [101.0] * 4
            expected = ('DISAPPEARED_WHILE_LIVE' if failure in ('wait-timeout', 'still-live') else
                        'RETAINED_IDENTITY_CHANGED' if failure == 'scan-error' else
                        'COMPILER_DEADLINE' if failure == 'late-after-reap' else 'TERMINAL_INVENTORY_UNCONFIRMED')
            with self.subTest(failure=failure), \
                 patch.object(builder, 'process_executable', side_effect=FileNotFoundError), \
                 patch.object(builder.time, 'monotonic', side_effect=times), \
                 patch.object(builder.select, 'select', return_value=([44], [], [])), \
                 self.assertRaisesRegex(RuntimeError, expected):
                builder.checked_compiler_executable(inventory, sampled, 101.0)
            child.wait.assert_called_once()


if __name__ == '__main__':
    unittest.main()
