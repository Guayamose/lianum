"""Actual note workers with explicit original public artifacts, no laboratory copy."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import source_bundle as bundle

ROOT = Path(__file__).resolve().parents[2]
ENTRY = 'packages/proofs/tests/jobs/wallet-note-worker-bundle-probe.mjs'
NODE = '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
NOTES = 'omnichain-product/experiments/private-core-proof/wallet-notes'


class WalletNoteSourceBundleTests(unittest.TestCase):
    def test_real_workers_relocate_with_original_public_profiles_and_reject_invalid_ipc(self):
        self.exercise_real_workers(adopted_generation=False)

    def exercise_real_workers(self, *, adopted_generation):
        node = ROOT / NODE
        if not node.is_file():
            self.skipTest('Pinned local Node v24.19.0 is required for this integration test')
        resources = [{'source': NODE, 'path': 'tools/node', 'scope': 'resources',
                      'kind': 'toolchain', 'sha256': bundle.sha(node), 'mode': '0755'}]
        for mode in ('deposit_balance', 'withdraw_balance'):
            for suffix in (f'.local/prepared/{mode}.key.json', f'.local/prepared/{mode}.vk',
                           f'.local/prepared/{mode}.sol', f'.local/compiled/{mode}.json',
                           f'circuits/{mode}/src/main.nr'):
                target = NOTES + '/' + suffix
                source = '.internal/runtime/' + target
                if not (ROOT / source).is_file():
                    self.skipTest('Original public note artifact unavailable: ' + target)
                resources.append({'source': source, 'path': target, 'scope': 'resources',
                                  'kind': 'public-artifact', 'sha256': bundle.sha(ROOT / source),
                                  'mode': '0644'})
        with tempfile.TemporaryDirectory(prefix='lianum-note-bundle-') as temporary:
            output = Path(temporary) / 'candidate'
            result = bundle.build(ROOT, output, ENTRY,
                                  {'schema': bundle.RESOURCE_SCHEMA, 'files': resources},
                                  ROOT, 'tools/node', cwd_family='engine', adopted_generation=adopted_generation)
            self.assertFalse((output / '.internal').exists())
            self.assertFalse(list((output / 'resources').rglob('*.mjs')))
            moved = Path(temporary) / 'moved'
            output.rename(moved)
            # Empty private state location only; no historical code or artifacts are copied here.
            (moved / 'resources/omnichain-flat-profile/flat-wallet').mkdir(parents=True)
            manifest = bundle.verify(moved)
            if adopted_generation:
                actual = bundle.validate_transported_adoption(moved, moved / 'resources/tools/node')
                self.assertEqual(actual['generation'], manifest['adoptedGeneration'])
                self.assertEqual(actual['sources'], len(manifest['adoptedSourceFiles']))
            child = subprocess.run(['python3', str(moved / 'run-source-bundle.py'), 'run',
                                    '--expected-sha256', result['bundleSHA256']],
                                   cwd='/', capture_output=True, text=True, timeout=20)
            self.assertEqual(child.returncode, 0, child.stderr)
            self.assertEqual(json.loads(child.stdout), {
                'profiles': 2, 'constructors': 4, 'malformedIPCRejected': 3,
                'privateRuntimePresent': False, 'proofGenerated': False})
            # The original artifact and executable inventories remain enforced after relocation.
            artifact = moved / 'resources' / NOTES / '.local/prepared/deposit_balance.vk'
            artifact.write_bytes(b'changed-original-key')
            with self.assertRaisesRegex(ValueError, 'file changed'):
                manifest = bundle.verify(moved)
            if adopted_generation:
                actual = bundle.validate_transported_adoption(moved, moved / 'resources/tools/node')
                self.assertEqual(actual['generation'], manifest['adoptedGeneration'])
                self.assertEqual(actual['sources'], len(manifest['adoptedSourceFiles']))


if __name__ == '__main__':
    unittest.main()
