"""Use a real source courier for offline release verification, never an operator."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = next((p for p in Path(__file__).resolve().parents if (p / 'dev').is_file() and (p / 'packages').is_dir()), Path(__file__).resolve().parent.parent)
sys.path.insert(0, str(ROOT / 'scripts/development'))
import source_bundle as bundle
import test_source_bundle as fixtures
spec = importlib.util.spec_from_file_location('verify_release', Path(__file__).with_name('verify-release.py'))
verifier = importlib.util.module_from_spec(spec); spec.loader.exec_module(verifier)


class ReleaseVerificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SourceBundleTests.setUpClass()

    @classmethod
    def tearDownClass(cls):
        fixtures.SourceBundleTests.tearDownClass()

    def test_actual_courier_pins_sources_resources_links_and_modes(self):
        fixture = fixtures.SourceBundleTests(methodName='runTest'); fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.adopted_fixture()
        release = fixture.output.parent / 'remote'; release.mkdir()
        fixture.output = release / 'candidate'
        fixture.build(adopted_generation=True)
        files = {}
        for file in sorted(release.rglob('*')):
            if file.is_file() and not file.is_symlink():
                files[file.relative_to(release).as_posix()] = bundle.file_record(file)
        candidate = bundle.verify(fixture.output)
        links = {'candidate/' + name: target for name, target in candidate['links'].items()}
        manifest = release / 'release-manifest.json'
        manifest.write_bytes(bundle.canonical({'schema': 'LIANUM_PAEG_REMOTE_RELEASE_V1',
            'status': 'STAGING_NOT_DEPLOYED', 'financialAcceptance': False, 'files': files, 'links': links}))
        self.assertTrue(verifier.verify(release, bundle.sha(manifest))['verified'])
        public = fixture.output / 'resources/omnichain-product/parameters/public-crs'
        original = public.read_bytes(); public.write_bytes(original + b'altered')
        with self.assertRaisesRegex(ValueError, 'FILE_PIN'):
            verifier.verify(release, bundle.sha(manifest))
        public.write_bytes(original)
        node = fixture.output / 'resources/tools/node'; node.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'FILE_PIN'):
            verifier.verify(release, bundle.sha(manifest))
        node.chmod(0o755)
        self.assertTrue(verifier.verify(release, bundle.sha(manifest))['verified'])
        # A rehashed outer DTO cannot authorize an escaping dependency alias.
        alias = fixture.output / 'node_modules/@lianum/fixture'; alias.unlink(); alias.symlink_to('/tmp')
        raw = json.loads(manifest.read_bytes()); raw['links']['candidate/node_modules/@lianum/fixture'] = '/tmp'
        manifest.write_bytes(bundle.canonical(raw))
        with self.assertRaisesRegex(ValueError, 'RELEASE_LINK'):
            verifier.verify(release, bundle.sha(manifest))


if __name__ == '__main__':
    unittest.main()
