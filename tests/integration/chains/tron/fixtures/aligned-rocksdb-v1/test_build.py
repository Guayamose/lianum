"""Host metadata and owned compiler cancellation regressions; Java never starts."""
import importlib.util
import json
import os
import re
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location('tron_aligned_test_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


class CandidateMetadata(unittest.TestCase):
    def test_missing_executable_requires_original_exit_pidfd_and_unchanged_retained_birth(self):
        module = load('build')
        original = {'pid': 2147483647, 'ppid': os.getpid(), 'pgrp': 2147483647, 'session': 2147483647,
                    'startTimeTicks': '1234', 'uid': os.getuid(), 'uids': [os.getuid()] * 4}
        def fixture(exit_code=0, gone=True, unsafe=False, unknown=False):
            child = type('SyntheticPopenMetadata', (), {'pid': original['pid'], 'poll': lambda _self: exit_code})()
            retained = {'original': original, 'origin': 'ORIGINAL_POPEN_PREEXEC_PIPE', 'pidfd': 44, 'gone': False}
            inventory = type('SyntheticInventoryMetadata', (), {})()
            inventory.child, inventory.records, inventory.unsafe = child, {child.pid: retained}, unsafe
            inventory.unknown = {123: 'unknown'} if unknown else {}
            def scan():
                retained['gone'] = gone
                return [] if gone else [original]
            inventory.scan = scan
            return inventory
        missing = FileNotFoundError(2, 'synthetic missing /proc/exe')
        with patch.object(module, 'process_executable', side_effect=missing), \
             patch.object(module.select, 'select', return_value=([44], [], [])):
            self.assertIsNone(module.checked_compiler_executable(fixture(), original))
            for changed in ({'uids': [os.getuid(), os.getuid()+1, os.getuid(), os.getuid()]},
                            {'startTimeTicks': '1235'}):
                with self.subTest(sampleChanged=changed), self.assertRaisesRegex(RuntimeError, 'SAMPLED_IDENTITY_CHANGED'):
                    module.checked_compiler_executable(fixture(), {**original, **changed})
            with self.assertRaisesRegex(RuntimeError, 'DISAPPEARED_WHILE_LIVE'):
                module.checked_compiler_executable(fixture(exit_code=None), original)
            for kwargs in ({'gone': False}, {'unknown': True}):
                with self.subTest(terminalUnconfirmed=kwargs), self.assertRaisesRegex(RuntimeError, 'TERMINAL_INVENTORY_UNCONFIRMED'):
                    module.checked_compiler_executable(fixture(**kwargs), original)
            with self.assertRaisesRegex(RuntimeError, 'RETAINED_PIDFD_REQUIRED'):
                module.checked_compiler_executable(fixture(unsafe=True), original)
        with patch.object(module, 'process_executable', side_effect=missing), \
             patch.object(module.select, 'select', return_value=([], [], [])):
            with self.assertRaisesRegex(RuntimeError, 'TERMINAL_PIDFD_UNCONFIRMED'):
                module.checked_compiler_executable(fixture(), original)
        inventory = fixture(); inventory.records[original['pid']]['pidfd'] = None
        with self.assertRaisesRegex(RuntimeError, 'RETAINED_PIDFD_REQUIRED'):
            module.checked_compiler_executable(inventory, original)
        with patch.object(module, 'process_executable', return_value=Path('/usr/bin/false')):
            with self.assertRaisesRegex(RuntimeError, 'EXECUTABLE_CHANGED'):
                module.checked_compiler_executable(fixture(exit_code=None), original)
        # These synthetic rows exercise only the data predicate. The separate
        # OS regression supplies the actual original Popen and retained pidfd.

    def test_exact_two_source_changes_and_unchanged_original(self):
        module = load('build')
        original = module.regular(module.original_path()); candidate = module.regular(module.SOURCE)
        module.validate_source_delta(original, candidate)
        self.assertEqual(module.digest(module.original_path()), module.ORIGINAL_SOURCE_PIN)
        self.assertEqual(module.digest(module.SOURCE), module.SOURCE_PIN)
        with self.assertRaisesRegex(RuntimeError, 'ONLY_TWO_SOURCE_DELTAS'):
            module.validate_source_delta(original, candidate.replace(b'now-preparedAt<30000L', b'now-preparedAt<60000L'))
        with self.assertRaises(RuntimeError):
            module.validate_source_delta(original, original)

    def test_output_inventory_rejects_extra_class_or_wrong_major_and_symlinks(self):
        module = load('build')
        with tempfile.TemporaryDirectory(prefix='tron-aligned-metadata-') as temporary:
            directory = Path(temporary)
            blob = b'\xca\xfe\xba\xbe\0\0\0\x34synthetic-header-only'
            for name in module.OUTPUT_NAMES:
                (directory / name).write_bytes(blob)
            rows = module.output_inventory(directory)
            self.assertEqual(len(rows), 2)  # Header classification; not compiled artifacts.
            (directory / 'Extra.class').write_bytes(blob)
            with self.assertRaisesRegex(RuntimeError, 'EXACT_TWO_CLASS_OUTPUTS'):
                module.output_inventory(directory)
            (directory / 'Extra.class').unlink()
            target = directory / module.OUTPUT_NAMES[0]
            target.write_bytes(blob[:6] + b'\0\x35' + blob[8:])
            with self.assertRaisesRegex(RuntimeError, 'CLASS_MAJOR_52'):
                module.output_inventory(directory)
            target.unlink(); target.symlink_to(directory / module.OUTPUT_NAMES[1])
            with self.assertRaisesRegex(RuntimeError, 'REGULAR_PATH'):
                module.output_inventory(directory)

    def test_namespace_and_input_digest_do_not_accept_caller_directory_or_symlink(self):
        module = load('build')
        with tempfile.TemporaryDirectory(prefix='tron-aligned-metadata-') as temporary:
            directory = Path(temporary); directory.chmod(0o700)
            with self.assertRaisesRegex(RuntimeError, 'FIXED_NAMESPACE'):
                module.assert_owned_destination(directory)
            target = directory / 'public.bin'; target.write_bytes(b'public')
            link = directory / 'caller.bin'; link.symlink_to(target)
            with self.assertRaisesRegex(RuntimeError, 'REGULAR_PATH'):
                module.digest(link)
        with patch.object(module.sys, 'argv', ['build.py', '--caller-output=/tmp']), patch.object(module, 'inputs') as inputs:
            with self.assertRaisesRegex(RuntimeError, 'EXACT_BUILD_OPT_IN'):
                module.main()
            inputs.assert_not_called()

    def test_launcher_reads_only_the_source_owned_gate_and_rejects_null_or_malformed_pin(self):
        module = load('launch')
        source = (HERE.parent.parent / 'tron-aligned-rocksdb-profile.mjs').read_bytes()
        release = module.read_release(source)
        self.assertEqual(release['format'], 'REVIEWED_LOCAL_TRON_ALIGNED_ROCKSDB_CANDIDATE_V1')
        self.assertEqual(release['sourceSHA256'], 'd2f53f3def9995e159587a8c5227a0f8149bf46c0dd673801975f0a9037dffa0')
        self.assertTrue(all(re.fullmatch(r'[0-9a-f]{64}', release[key])
                            for key in ('buildReportSHA256', 'classSHA256', 'innerClassSHA256')))
        with self.assertRaisesRegex(RuntimeError, 'NEW_CANDIDATE_REVIEW_REQUIRED'):
            module.read_release(b'export const TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE = null;')
        value = {'format': 'REVIEWED_LOCAL_TRON_ALIGNED_ROCKSDB_CANDIDATE_V1',
                 'sourceSHA256': 'd2f53f3def9995e159587a8c5227a0f8149bf46c0dd673801975f0a9037dffa0',
                 'buildReportSHA256': 'a' * 64, 'classSHA256': 'b' * 64, 'innerClassSHA256': 'c' * 64}
        literal = b'export const TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE = ' + json.dumps(value).encode() + b';'
        self.assertEqual(module.read_release(literal), value)  # Data only; no JavaScript or launch is executed.
        value['classSHA256'] = 'caller-pin'
        with self.assertRaisesRegex(RuntimeError, 'RELEASE_DIGEST'):
            module.read_release(b'export const TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE = ' + json.dumps(value).encode() + b';')
        with self.assertRaisesRegex(RuntimeError, 'SINGLE_SOURCE_GATE'):
            module.read_release(literal + b'\n' + literal)

        with patch.object(module.select, 'select', return_value=([0], [], [])):
            for payload in (b'', b'GG', b'X'):
                with self.subTest(launcherGrant=payload), patch.object(module.os, 'read', return_value=payload):
                    with self.assertRaisesRegex(RuntimeError, 'STARTUP_GRANT_REQUIRED'): module.wait_original_parent_grant()
            with patch.object(module.os, 'read', return_value=b'G'):
                module.wait_original_parent_grant()  # Framing only; no launcher or Java is executed.
        with patch.object(module.select, 'select', return_value=([], [], [])):
            with self.assertRaisesRegex(RuntimeError, 'STARTUP_DEADLINE'): module.wait_original_parent_grant()


class OwnedCompilerCancellation(unittest.TestCase):
    def exercise(self, pending=False, rss=None, completion=0, capture_failure=None, wrong_uid=False, missing_pidfd=False, recheck_failure=False, cleanup_log_error=False):
        module = load('build'); calls = []; clock = [100.0]; executable_reads = [0]
        fake = type('SyntheticChild', (), {})()
        fake.pid, fake.returncode = 2147483647, None
        fake.poll = lambda: fake.returncode
        fake.stdout, fake.stderr = tempfile.TemporaryFile(), tempfile.TemporaryFile()
        # Neither numeric send_signal nor a Popen kill fallback may be used.
        fake.send_signal = lambda value: self.fail('Numeric PID signalling is forbidden')
        original = {'pid': fake.pid, 'ppid': os.getpid(), 'startTimeTicks': '1234', 'pgrp': fake.pid, 'session': fake.pid,
                    'uid': os.getuid(), 'uids': [os.getuid()] * 4, 'state': 'S', 'rssBytes': 123456}
        current = {**original, 'rssBytes': 123456 if rss is None else rss}
        if wrong_uid:
            current['uids'] = [os.getuid(), os.getuid() + 1, os.getuid(), os.getuid()]
        class Inventory:
            child = None; unsafe = False
            def __init__(self):
                self.records = {}; self.events = []; self.wait_deadline = None
            def activate(self): calls.append(('activate',))
            def constrain_wait_deadline(self, deadline):
                self.wait_deadline = deadline if self.wait_deadline is None else min(self.wait_deadline, deadline)
                calls.append(('deadline', self.wait_deadline))
            def spawn(self, argv, **options):
                calls.append(('spawn', argv, options)); self.child = fake
                if pending: module.forward_signal(signal.SIGTERM, None)
                if capture_failure is not None:
                    self.unsafe = True
                    raise RuntimeError('LEDGER_ORIGINAL_BIRTH_PIPE_INVALID' if capture_failure == 'none' else 'LEDGER_PROCESS_ENROLL_IDENTITY_CHANGED')
                self.records[fake.pid] = {'original': original, 'current': current, 'gone': False,
                    'origin': 'ORIGINAL_POPEN_PREEXEC_PIPE', 'pidfd': None if missing_pidfd else 44}
                return fake
            def scan(self):
                if capture_failure is not None: raise RuntimeError('LEDGER_UNKNOWN_CHILD_UNCONFIRMED')
                if recheck_failure: raise RuntimeError('LEDGER_RETAINED_IDENTITY_CHANGED')
                return [] if fake.poll() is not None else [current]
            def _read_retained(self, pid): return current
            def signal_retained(self, selected):
                self.scan()
                if capture_failure is not None or wrong_uid or missing_pidfd or recheck_failure:
                    raise RuntimeError('LEDGER_SIGNAL_IDENTITY_CHANGED')
                calls.append(('pidfd-signal', selected)); fake.returncode = -selected
                return [{'signal': signal.Signals(selected).name}]
            def finish(self): return capture_failure is None and not wrong_uid and not missing_pidfd and not recheck_failure and fake.poll() is not None
            def receipt(self): return {'syntheticHostInventory': True, 'unsafeIdentityObserved': not self.finish()}
        class Selector:
            def __init__(self): self.members = {}; self.count = 0
            def register(self, stream, events, name): self.members[name] = stream
            def get_map(self): return self.members
            def select(self, timeout):
                if cleanup_log_error and self.count == 0:
                    self.count += 1
                    raise OSError('synthetic ENOSPC/capture failure')
                clock[0] += max(timeout, .001); self.count += 1
                if self.count >= 2:
                    fake.returncode = completion if fake.returncode is None else fake.returncode
                    self.members.clear()
                return []
            def close(self): self.members.clear()
        def observed_executable(pid):
            executable_reads[0] += 1
            return module.PYTHON if executable_reads[0] == 1 else module.RUNTIME / 'jdk8/bin/javac'
        report = {}
        with tempfile.TemporaryDirectory(prefix='tron-aligned-cancellation-') as temporary:
            module.DESTINATION = Path(temporary)
            with patch.object(module, 'load_owned_processes', return_value=type('Owned', (), {'LedgerOwnedProcesses': Inventory})), \
                 patch.object(module, 'process_executable', side_effect=observed_executable), \
                 patch.object(module, 'wait_compiler_reader', return_value={'syntheticReaderOnly': True}), \
                 patch.object(module.selectors, 'DefaultSelector', Selector), \
                 patch.object(module, 'resources', return_value={'availableRAM': 3000000000, 'freeDisk': 6000000000}), \
                 patch.object(module.time, 'monotonic', side_effect=lambda: clock[0]), \
                 patch.object(module.time, 'sleep', side_effect=lambda value: clock.__setitem__(0, clock[0] + value)), \
                 patch.object(module.resource, 'getrusage', return_value=type('Usage', (), {'ru_maxrss': 1234})()):
                try:
                    module.compile_owned(report); error = None
                except (RuntimeError, OSError) as failure:
                    error = str(failure)
            fake.stdout.close(); fake.stderr.close()
            return module, report, calls, error

    def test_compiler_success_requires_zero_exit_and_reviewed_owned_spawn_with_fixed_argv(self):
        module, report, calls, error = self.exercise()
        self.assertIsNone(error)
        row = report['compiler']; self.assertTrue(row['ownedChildStopped']); self.assertEqual(row['exitCode'], 0)
        self.assertTrue(row['startupGranted']); self.assertTrue(row['popenCreated']); self.assertEqual(row['signalsSent'], [])
        _, argv, options = next(value for value in calls if value[0] == 'spawn')
        self.assertEqual(argv, [str(module.PYTHON), str(module.CHILD)])
        self.assertEqual(options['cwd'], module.DESTINATION)
        self.assertEqual(options['env'], module.compiler_environment())
        self.assertEqual(row['argv'], module.compiler_argv()); self.assertIn('-J-Xmx256m', row['argv']); self.assertIn('-proc:none', row['argv'])
        self.assertGreater(len(row['samples']), 0)

    def test_signal_in_spawn_gap_is_only_latched_then_pidfd_forwarded_without_grant(self):
        module, report, calls, error = self.exercise(pending=True)
        self.assertIsNotNone(error); self.assertTrue(module.interrupted)
        self.assertIn(('pidfd-signal', signal.SIGTERM), calls)
        self.assertFalse(report['compiler']['startupGranted'])
        self.assertTrue(report['compiler']['ownedChildStopped']); self.assertEqual(report['compiler']['exitCode'], -signal.SIGTERM)
        deadline = [value[1] for value in calls if value[0] == 'deadline']
        self.assertEqual(deadline[-1], min(deadline))  # No new budget from cleanup entry.
        # Handler must not perform I/O or signal even with a previously active child.
        with patch.object(module, 'process_executable', side_effect=AssertionError('handler I/O')):
            module.forward_signal(signal.SIGINT, None)
        self.assertEqual(module.pending_signal, signal.SIGINT)

    def test_rss_over_cap_or_nonzero_exit_is_rejected_with_owned_cleanup(self):
        for kwargs in ({'rss': 402653185}, {'completion': 1}, {'cleanup_log_error': True}):
            with self.subTest(kwargs=kwargs):
                _, report, _, error = self.exercise(**kwargs)
                self.assertIsNotNone(error); self.assertTrue(report['compiler']['ownedChildStopped'])
                self.assertNotEqual(report['compiler']['exitCode'], 0)
                if kwargs.get('cleanup_log_error'): self.assertEqual(error, 'synthetic ENOSPC/capture failure')

    def test_unknown_birth_pidfd_uid_or_recheck_never_grants_or_signals_and_retains_rejection(self):
        for kwargs in ({'capture_failure': 'none'}, {'capture_failure': 'raise'}, {'wrong_uid': True},
                       {'missing_pidfd': True}, {'recheck_failure': True}):
            with self.subTest(kwargs=kwargs):
                _, report, calls, error = self.exercise(**kwargs)
                self.assertIsNotNone(error); self.assertTrue(report['compiler']['popenCreated'])
                self.assertFalse(report['compiler']['startupGranted']); self.assertFalse(report['compiler']['ownedChildStopped'])
                self.assertFalse(any(value[0] == 'pidfd-signal' for value in calls))
                self.assertEqual(report['compiler']['cleanupBudgetMilliseconds'], 10000)
        child = load('compile-child')
        with patch.object(child.select, 'select', return_value=([44], [], [])):
            for packets, code in (([b''], 'STARTUP_EOF'), ([b'\x01\x01'], 'STARTUP_EXTRA_BYTE'),
                                  ([b'\x02'], 'STARTUP_EXTRA_BYTE')):
                with self.subTest(packets=packets), patch.object(child.os, 'read', side_effect=packets):
                    with self.assertRaisesRegex(RuntimeError, code): child.wait_startup(44, child.time.monotonic() + 1)
            with patch.object(child.os, 'read', side_effect=[b'\x01', b'']):
                child.wait_startup(44, child.time.monotonic() + 1)  # Data framing only; not a compiler grant.
        with patch.object(child.select, 'select', return_value=([], [], [])):
            with self.assertRaisesRegex(RuntimeError, 'STARTUP_DEADLINE'): child.wait_startup(44, child.time.monotonic() + 1)
        with patch.object(child.select, 'select', side_effect=OSError('synthetic read error')):
            with self.assertRaises(OSError): child.wait_startup(44, child.time.monotonic() + 1)


if __name__ == '__main__':
    unittest.main()
