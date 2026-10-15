"""Exact published DATA paths only; no Tron process, compiler or key starts."""
import json
import unittest

import source_bundle as bundle
import test_source_bundle as fixtures


class SourceEvidenceBundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SourceBundleTests.setUpClass()

    @classmethod
    def tearDownClass(cls):
        fixtures.SourceBundleTests.tearDownClass()

    def setUp(self):
        self.fixture = fixtures.SourceBundleTests(methodName='runTest')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.names = sorted(bundle.SOURCE_EVIDENCE_PATHS)
        self.source = next(name for name in self.names if name.endswith('.source'))
        self.provenance = next(name for name in self.names if name.endswith('.json'))
        self.fixture.write(self.source, 'SYNTHETIC_NONEXECUTABLE_EVIDENCE_ONLY\n')
        self.fixture.write(self.provenance, json.dumps({'classification': 'SYNTHETIC_DATA_ONLY'}))

    def adopt_and_build(self):
        self.fixture.adopted_fixture(retained_evidence=tuple(self.names))
        return self.fixture.build(adopted_generation=True)

    def test_exact_data_paths_keep_adopted_bytes_and_reject_digest_changes(self):
        self.adopt_and_build()
        document = bundle.verify(self.fixture.output)
        self.assertEqual(set(self.names).intersection(document['sourceFiles']), set(self.names))
        self.assertIsNotNone(document['adoptedGeneration'])
        self.assertFalse(document['financialAcceptance'])
        self.assertEqual(document['files'][self.source]['mode'], '0644')
        copied = self.fixture.output / self.source
        self.assertEqual(copied.read_bytes(), (self.root / self.source).read_bytes())
        copied.write_bytes(copied.read_bytes() + b'tampered')
        with self.assertRaises(ValueError):
            bundle.verify(self.fixture.output)

    def test_no_archive_prefix_alias_or_executable_neighbor_is_allowed(self):
        for name in self.names:
            self.assertEqual(bundle.source_allowed(name), name)
        for name in [self.source.replace('88bf', '99bf'), self.source + '.mjs',
                     self.provenance.replace('provenance.json', 'other.json'),
                     'packages/proofs/evidence/tron-original-builder-v1/active.mjs',
                     'packages/proofs/evidence/other/provenance.json',
                     'packages/proofs/evidence/tron-original-builder-v1/../provenance.json']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                bundle.source_allowed(name)

    def test_symlink_and_directory_cannot_substitute_a_data_file(self):
        path = self.root / self.source
        path.unlink()
        path.symlink_to(self.root / self.provenance)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            bundle.source_closure(self.root, 'packages/fixture/src/worker.mjs', [self.source])
        path.unlink()
        path.mkdir()
        self.fixture.write(self.source + '/active.mjs', 'throw Error("NEVER_EXECUTED");')
        with self.assertRaises(ValueError):
            bundle.source_closure(self.root, 'packages/fixture/src/worker.mjs', [self.source])


if __name__ == '__main__':
    unittest.main()
