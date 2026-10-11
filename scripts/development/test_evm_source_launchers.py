"""Fixed source classification only; no EVM or proof worker starts."""
from pathlib import Path
import unittest
import subprocess
import evm_lab

class EvmSourceLaunchers(unittest.TestCase):
    def test_all_seven_commands_select_existing_canonical_sources(self):
        self.assertEqual(len(evm_lab.SOURCE_ENTRIES), 7)
        for name, source in evm_lab.SOURCE_ENTRIES.items():
            path = evm_lab.source_entry(name)
            self.assertEqual(path, evm_lab.ROOT / source)
            self.assertEqual(path, path.resolve())
            self.assertNotIn('.internal', path.parts)
            self.assertTrue(path.is_file())

    def test_no_caller_selected_source_or_legacy_copy(self):
        for name in ['../run.mjs', str(evm_lab.FLAT / 'proof-workers/run-bounded.mjs'),
                     'packages/proofs/src/jobs/run-bounded.mjs', 'integration/unreviewed.mjs']:
            with self.assertRaisesRegex(ValueError, 'EVM_LAB_FIXED_SOURCE_ENTRY'):
                evm_lab.source_entry(name)

class PlatformSourceLaunchers(unittest.TestCase):
    def test_canonical_platform_launchers_reject_unreviewed_arguments_before_resources(self):
        node = evm_lab.ROOT / '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
        if not node.is_file():
            self.skipTest('Pinned Node is unavailable')
        for name in ['run-device-external-flat-local-v1.mjs',
                     'run-device-external-flat-ordered-local-v1.mjs',
                     'run-original-device-paged-graph-v3.mjs',
                     'run-original-device-paged-owner-v3.mjs',
                     'run-original-native-source-v1.mjs']:
            with self.subTest(entry=name):
                child = subprocess.run([str(node), '--max-old-space-size=384',
                                        str(evm_lab.ROOT / 'apps/platform/src' / name), '--unreviewed-run'],
                                       cwd='/', env={'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'},
                                       text=True, capture_output=True, timeout=5)
                self.assertEqual(child.returncode, 1)
                self.assertIn('AssertionError', child.stderr)
                self.assertNotIn('ERR_MODULE_NOT_FOUND', child.stderr)
                self.assertNotIn('ENOENT', child.stderr)
                self.assertEqual(child.stdout, '')


if __name__ == '__main__':
    unittest.main()
