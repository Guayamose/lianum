"""Offline packaging/execution from a clean source checkout without legacy data."""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import source_bundle as bundle


class SourceBundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.shared = tempfile.TemporaryDirectory()
        cls.resources = Path(cls.shared.name)
        node = shutil.which('node')
        if not node:
            raise unittest.SkipTest('Node is required for the offline source-worker fixture')
        shutil.copyfile(Path(node).resolve(), cls.resources / 'node')
        (cls.resources / 'public-crs').write_bytes(b'fixture-public-parameter\n')
        cls.external = {'schema': bundle.RESOURCE_SCHEMA, 'files': [
            {'source': 'node', 'path': 'tools/node', 'scope': 'resources', 'kind': 'toolchain',
             'sha256': bundle.sha(cls.resources / 'node'), 'mode': '0755'},
            {'source': 'public-crs', 'path': 'omnichain-product/parameters/public-crs',
             'scope': 'resources', 'kind': 'public-parameter',
             'sha256': bundle.sha(cls.resources / 'public-crs'), 'mode': '0644'},
        ]}

    @classmethod
    def tearDownClass(cls):
        cls.shared.cleanup()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / 'checkout'
        self.output = Path(self.temporary.name) / 'candidate'
        self.write('package.json', json.dumps({'name': 'lianum', 'type': 'module'}))
        self.write('package-lock.json', json.dumps({'lockfileVersion': 3, 'packages': {}}))
        self.write('scripts/layout.json', json.dumps({'schema': 'fixture'}))
        self.write('packages/environment/package.json', json.dumps({
            'name': '@lianum/environment', 'type': 'module', 'exports': {'.': './src/paths.mjs'}}))
        environment = bundle.ROOT / 'packages/environment/src/paths.mjs'
        self.write('packages/environment/src/paths.mjs', environment.read_text())
        self.write('packages/fixture/package.json', json.dumps({
            'name': '@lianum/fixture', 'type': 'module', 'exports': {'./state': './src/state.mjs'}}))
        self.write('packages/fixture/src/state.mjs', 'export const state = Object.freeze({value: 7});\n')
        self.write('packages/fixture/src/worker.mjs', '''import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resourcePath, legacyDataRoot, resourceRoot, resourceMode, projectRoot} from '@lianum/environment';
import {state as exported} from '@lianum/fixture/state';
import {state as direct} from './state.mjs';
assert.equal(exported, direct);
assert.equal(resourceMode, 'candidate');
assert.equal(legacyDataRoot('engine'), resourceRoot('engine'));
assert.equal(existsSync(projectRoot + '/.internal'), false);
assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
assert.deepEqual(process.execArgv, []);
assert.equal(readFileSync(resourcePath('engine', 'parameters/public-crs'), 'utf8'), 'fixture-public-parameter\\n');
assert.throws(() => resourcePath('engine', '../escape'), /LIANUM_RESOURCE_RELATIVE_PATH/);
console.log(JSON.stringify({state: exported.value, arguments: process.argv.slice(2)}));
''')

    def write(self, relative, text):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def build(self, **kwargs):
        return bundle.build(self.root, self.output, 'packages/fixture/src/worker.mjs',
                            kwargs.pop('external', self.external), self.resources, 'tools/node', **kwargs)

    def test_clean_checkout_executes_worker_and_reproduces_candidate(self):
        result = self.build()
        self.assertFalse((self.root / '.internal').exists())
        self.assertFalse(result['financialAcceptance'])
        self.assertEqual(bundle.verify(self.output)['status'], 'candidate')
        args = [sys.executable, str(self.output / 'run-source-bundle.py'), 'run',
                '--expected-sha256', result['bundleSHA256'], '--', 'one', 'two']
        child = subprocess.run(args, cwd='/', env={**os.environ, 'UNTRUSTED_PARENT_ENV': 'absent'},
                               capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(child.stdout), {'state': 7, 'arguments': ['one', 'two']})
        second = self.output.with_name('second-candidate')
        original = self.output
        self.output = second
        self.assertEqual(self.build()['bundleSHA256'], result['bundleSHA256'])
        # Relocation and deletion of all original sources cannot change execution.
        shutil.rmtree(self.root)
        moved = original.with_name('relocated')
        original.rename(moved)
        child = subprocess.run([sys.executable, str(moved / 'run-source-bundle.py'), 'run'],
                               cwd='/', capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(child.stdout)['state'], 7)

    def adopted_fixture(self, alias=False, retained_evidence=()):
        # Production adoption entry AND its actual owner/export closure. The
        # entry may re-export a lower package; copying only that facade would
        # omit the implementation whose validation this fixture must exercise.
        reader_files, dependencies, _ = bundle.source_closure(bundle.ROOT, bundle.ADOPTION_READER, [])
        self.assertFalse(dependencies)
        for relative in reader_files:
            self.write(relative, (bundle.ROOT / relative).read_text())
        evidence = 'packages/proofs/evidence/test-original.source'
        self.write(evidence, 'original publication remains immutable\n')
        rows = []
        for path in sorted(self.root.rglob('*')):
            if not path.is_file():
                continue
            name = path.relative_to(self.root).as_posix()
            rows.append({'path': name, 'source': name, 'sha256': bundle.sha(path),
                         'sourceSHA256': bundle.sha(path), 'bytes': path.stat().st_size, 'status': 'PRESENT'})
        if alias:
            rows[0]['path'] = '.internal/runtime/obsolete.mjs'
        source_hash = hashlib.sha256(bundle.canonical(rows)).hexdigest()
        sources = bundle.canonical({'schema': 'LIANUM_DEVELOPMENT_SOURCE_GENERATION_V1',
                                    'currentSourceContract': {'files': rows, 'sourceClosureSHA256': source_hash,
                                                              'retainedEvidenceRoots': list(retained_evidence)}})
        generation = hashlib.sha256(sources).hexdigest()
        base = '.local/generations/' + generation
        self.write(base + '/sources.json', sources.decode())
        candidate = bundle.canonical({'schema': 'LIANUM_DEVELOPMENT_RELEASE_CANDIDATE_V7',
                                      'sourceGeneration': generation, 'currentSourceClosureSHA256': source_hash,
                                      'artifactInspection': {'status': 'VERIFIED_RETAINED_ARTIFACTS'},
                                      'pagedReuseReceipt': {'manifestSHA256': 'f' * 64}})
        self.write(base + '/candidate-release.json', candidate.decode())
        self.write(bundle.ADOPTION, json.dumps({'schema': 'LIANUM_ADOPTED_SOURCE_GENERATION_V1',
                                               'generation': generation,
                                               'candidateSHA256': hashlib.sha256(candidate).hexdigest()}))
        return generation

    def test_adopted_generation_relocates_with_exact_metadata_and_real_reader(self):
        generation = self.adopted_fixture()
        self.build(adopted_generation=True)
        moved = self.output.with_name('moved-adopted-worker')
        self.output.rename(moved)
        shutil.rmtree(self.root)
        manifest = bundle.verify(moved)
        self.assertEqual(manifest['adoptedGeneration'], generation)
        self.assertFalse((moved / '.internal').exists())
        validated = bundle.validate_transported_adoption(moved, moved / 'resources/tools/node')
        self.assertEqual(validated['generation'], generation)
        self.assertEqual(validated['sources'], len(manifest['adoptedSourceFiles']))
        (moved / 'packages/fixture/src/state.mjs').write_text('export const state={value:99};')
        with self.assertRaisesRegex(ValueError, 'CURRENT_SOURCE_PIN'):
            bundle.validate_transported_adoption(moved, moved / 'resources/tools/node')

    def test_adopted_generation_refuses_aliases_and_changed_metadata(self):
        self.adopted_fixture(alias=True)
        with self.assertRaisesRegex(ValueError, 'requires a compatibility alias'):
            self.build(adopted_generation=True)
        self.assertFalse(self.output.exists())
        pointer = json.loads((self.root / bundle.ADOPTION).read_text())
        candidate = self.root / '.local/generations' / pointer['generation'] / 'candidate-release.json'
        candidate.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'Adopted candidate bytes changed'):
            self.build(adopted_generation=True)
        self.assertFalse(self.output.exists())

    def test_adopted_public_npm_inventory_requires_exact_package_and_lock(self):
        package = 'apps/mobile/node_modules/@noble/hashes'
        self.write('apps/mobile/package.json', json.dumps({'name': '@lianum/mobile', 'type': 'module'}))
        self.write(package + '/package.json', json.dumps({'name': '@noble/hashes', 'version': '2.0.0'}))
        self.write(package + '/sha2.js', 'export const fixture = 1;\n')
        self.write('apps/mobile/package-lock.json', json.dumps({'packages': {
            'node_modules/@noble/hashes': {'version': '2.0.0',
                'integrity': 'sha512-Zml4dHVyZQ==',
                'resolved': 'https://registry.npmjs.org/@noble/hashes/-/hashes-2.0.0.tgz'}}}))
        self.adopted_fixture()
        files, _, _ = bundle.adopted_source_inventory(self.root)
        self.assertIn(package + '/sha2.js', files)
        # Local unreviewed changes cannot become transportable dependencies.
        (self.root / package / 'package.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'manifest or lock changed'):
            bundle.adopted_source_inventory(self.root)
        (self.root / package / 'package.json').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing required file'):
            bundle.adopted_source_inventory(self.root)
        with self.assertRaises(ValueError):
            bundle.adopted_npm_package(('packages', 'fixture', 'node_modules', 'unreviewed', 'index.js'))
        with self.assertRaises(ValueError):
            bundle.source_allowed(package + '/sha2.js')

    def test_adopted_generation_rejects_arbitrary_private_state(self):
        self.write('apps/fixture/.local/account.json', '{"privateState":"fixture"}')
        self.adopted_fixture()
        with self.assertRaisesRegex(ValueError, 'private/generated data'):
            bundle.adopted_source_inventory(self.root)

    def test_adopted_retained_label_cannot_replace_original_public_bytes(self):
        path = next(iter(bundle.ADOPTED_RETAINED_PUBLIC_FILES))
        self.write(path, '{"substitutedProgram":true}')
        self.adopted_fixture(retained_evidence=[path])
        with self.assertRaisesRegex(ValueError, 'differs from its original evidence'):
            bundle.adopted_source_inventory(self.root)

    def test_tamper_and_unlisted_files_stop_before_worker(self):
        self.build()
        source = self.output / 'packages/fixture/src/state.mjs'
        original = source.read_bytes()
        source.write_bytes(b'throw new Error("should never execute");\n')
        with self.assertRaisesRegex(ValueError, 'file changed'):
            bundle.verify(self.output)
        source.write_bytes(original)
        resource = self.output / 'resources/omnichain-product/parameters/public-crs'
        original_resource = resource.read_bytes()
        resource.write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'file changed'):
            bundle.verify(self.output)
        resource.write_bytes(original_resource)
        (self.output / 'unlisted.mjs').write_text('')
        with self.assertRaisesRegex(ValueError, 'Unlisted source bundle file'):
            bundle.verify(self.output)

    def test_explicit_state_can_be_reopened_without_weakening_resource_pins(self):
        self.build(state_directories=['omnichain-product/jobs'])
        state = self.output / 'resources/omnichain-product/jobs/request.json'
        state.parent.mkdir(parents=True)
        state.write_text('{}')
        bundle.verify(self.output)
        state.unlink()
        state.symlink_to(self.resources / 'public-crs')
        with self.assertRaisesRegex(ValueError, 'Unlisted source bundle file'):
            bundle.verify(self.output)

    def test_missing_and_mismatched_resources_never_publish_a_bundle(self):
        for kind in ('missing', 'mismatch'):
            external = copy.deepcopy(self.external)
            if kind == 'missing':
                external['files'][1]['source'] = 'absent-original'
            else:
                external['files'][1]['sha256'] = '0' * 64
            with self.assertRaisesRegex(ValueError, 'Missing required file|SHA-256 mismatch'):
                self.build(external=external)
            self.assertFalse(self.output.exists())

    def test_rejects_state_overlapping_pins_and_dependency_absence(self):
        with self.assertRaisesRegex(ValueError, 'Writable state overlaps'):
            self.build(state_directories=['tools'])
        self.write('packages/fixture/src/worker.mjs', 'import "missing-package";\n')
        with self.assertRaisesRegex(ValueError, 'Missing pinned npm dependency'):
            self.build()

    def test_rejects_symlink_sources_private_areas_and_historical_sources(self):
        worker = self.root / 'packages/fixture/src/worker.mjs'
        worker.unlink()
        worker.symlink_to(self.root / 'packages/fixture/src/state.mjs')
        with self.assertRaisesRegex(ValueError, 'Symlink input'):
            self.build()
        for value in ('../escape', '.internal/runtime/worker.mjs', 'packages/protocol/src/original.mjs',
                      'packages/fixture/.env', 'packages/fixture/node_modules/injected.mjs'):
            with self.assertRaises(ValueError):
                bundle.source_allowed(value)

    def test_changed_workspace_link_is_rejected(self):
        self.build()
        link = self.output / 'node_modules/@lianum/fixture'
        link.unlink()
        link.symlink_to(self.root / 'packages/fixture', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'workspace link changed'):
            bundle.verify(self.output)

    def test_invalid_explicit_descriptor_never_falls_back_to_legacy(self):
        node = str(Path(shutil.which('node')).resolve())
        for descriptor in (None, False, {'schema': 'unknown'}):
            self.write('runtime-resources.json', json.dumps(descriptor))
            child = subprocess.run([node, str(self.root / 'packages/environment/src/paths.mjs')],
                                   capture_output=True, text=True)
            self.assertNotEqual(child.returncode, 0)
            self.assertIn('LIANUM_RESOURCE_DESCRIPTOR', child.stderr)

    def test_additional_sources_cover_computed_worker_imports(self):
        self.write('packages/fixture/src/worker.mjs',
                   'const module = await import("./" + process.argv[2] + ".mjs"); console.log(module.state.value);\n')
        self.build(additional=['packages/fixture/src/state.mjs'])
        child = subprocess.run([sys.executable, str(self.output / 'run-source-bundle.py'), 'run', '--', 'state'],
                               capture_output=True, text=True, check=True)
        self.assertEqual(child.stdout.strip(), '7')


if __name__ == '__main__':
    unittest.main()
