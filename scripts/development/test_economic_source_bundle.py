"""Relocate adopted paged/wrapped readers with exact public resources only.

This intentionally excludes the original I84 reader: its authenticated catalogue
requires an absolute installation path. No private account/lab state is copied.
"""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import source_bundle as bundle

ROOT = Path(__file__).resolve().parents[2]
ENTRY = 'tests/integration/proofs/source-generation-portable-readback.mjs'
NODE = '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
PAGED = 'experiments/engine/private-core-proof/funded-graph-paged-v3'
ENGINE = 'omnichain-product'
PROOF = ENGINE + '/experiments/private-core-proof'


def public_resources():
    """The real original inspector selects retained evidence, never rewritten code."""
    node = ROOT / NODE
    reader = ROOT / 'packages/proofs/src/toolchain/paged-artifacts-v3.mjs'
    script = ('const {inspectFundedPagedGraphArtifactsForPreparationV4}=await import(' +
              json.dumps(reader.as_uri()) + ');process.stdout.write(JSON.stringify('
              'inspectFundedPagedGraphArtifactsForPreparationV4()));')
    child = subprocess.run([str(node), '--input-type=module', '-e', script],
                           cwd=ROOT, capture_output=True, text=True, timeout=30)
    if child.returncode:
        raise ValueError('Original retained public artifacts failed: ' + child.stderr)
    inspected = json.loads(child.stdout)
    rows, destinations = [], set()

    def add(source, path, kind='public-artifact', mode='0644', expected=None):
        file = bundle.physical(ROOT, source)
        digest = bundle.sha(file)
        if expected is not None and digest != expected:
            raise ValueError('Original public resource changed: ' + source)
        if path in destinations:
            raise ValueError('Duplicate public resource: ' + path)
        destinations.add(path)
        rows.append({'source': source, 'path': path, 'scope': 'resources',
                     'kind': kind, 'sha256': digest, 'mode': mode})

    add(NODE, 'tools/node', 'toolchain', '0755')
    for variant, digest in [('poseidon-sparse-v3', inspected['originalManifestSHA256']),
                            ('poseidon-sparse-v3-consumer-fix-v1', inspected['manifestSHA256'])]:
        base = PAGED + '/.local/' + variant + '/'
        destination = PROOF + '/funded-graph-paged-v3/.local/' + variant + '/'
        add(base + 'manifest.json', destination + 'manifest.json', expected=digest)
        for role, record in inspected['roles'].items():
            for ext, key in [('json', 'programSHA256'), ('vk', 'keySHA256'), ('sol', 'soliditySHA256')]:
                suffix = 'prepared/' + role + '.' + ext
                add(base + suffix, destination + suffix, expected=record[key])
    evidence = set()
    for row in inspected['hostSources'] + inspected['compilerInputs']:
        if row['sha256'] in evidence:
            continue
        source = row.get('source', row['path'])
        if bundle.physical(ROOT, source).stat().st_size != row['bytes']:
            raise ValueError('Original public source size changed: ' + source)
        add(source, ENGINE + '/evidence/paged-v3/sources/' + row['sha256'] + '.source',
            'historical-source', expected=row['sha256'])
        evidence.add(row['sha256'])
    audit_name = ENGINE + '/evidence/m15-linux-package-provenance.json'
    add('.internal/runtime/' + audit_name, audit_name,
        expected=inspected['toolchain']['auditSHA256'])
    audit = json.loads((ROOT / '.internal/runtime' / audit_name).read_text())
    files = [(row['path'] + '/package.json', row['packageJSONSHA256'])
             for row in audit['packages'] if row['installed']]
    files += [(row['path'], row['sha256']) for row in audit['wasm']]
    files += [('reused-package-lock.json', audit['packageLockSHA256'])]
    for path, digest in files:
        target = PROOF + '/' + path
        add('.internal/runtime/' + target, target, 'toolchain', expected=digest)
    crs = PROOF + '/native-notes/.local/crs/2097152/'
    for row in inspected['crs']['records']:
        add('.internal/runtime/' + crs + row['file'], crs + row['file'],
            'public-parameter', expected=row['sha256'])
    add('.internal/runtime/' + crs + 'provenance.json', crs + 'provenance.json',
        'public-parameter', expected=inspected['crs']['provenanceSHA256'])
    wrapped = 'drafts/wrapped-activation-installation-v2/source-manifest.json'
    add('.internal/runtime/' + wrapped, wrapped)
    return {'schema': bundle.RESOURCE_SCHEMA, 'files': rows}


class EconomicSourceBundleTests(unittest.TestCase):
    def test_adopted_paged_and_wrapped_readers_relocate_without_external_reads(self):
        resources = public_resources()
        resource_bytes = sum((ROOT / row['source']).stat().st_size for row in resources['files'])
        self.assertLess(resource_bytes, 256 * 1024 * 1024)
        with tempfile.TemporaryDirectory(prefix='lianum-economic-bundle-') as temporary:
            original = Path(temporary) / 'candidate'
            result = bundle.build(ROOT, original, ENTRY, resources, ROOT, 'tools/node',
                                  adopted_generation=True)
            moved = Path(temporary) / 'relocated'
            original.rename(moved)
            # The original resource helper traverses wallet-notes/../ before
            # reading its audit. This public family needs an empty directory,
            # even though this read-only subset includes no note proof files.
            (moved / 'resources' / PROOF / 'wallet-notes').mkdir()
            manifest = bundle.verify(moved)
            bundle_bytes = sum(row['bytes'] for row in manifest['files'].values())
            bundle_bytes += (moved / 'source-bundle.json').stat().st_size
            self.assertFalse((moved / '.internal').exists())
            self.assertFalse(any(path.startswith('.internal/') for path in manifest['sourceFiles']))
            self.assertFalse(list((moved / 'resources').rglob('*.mjs')))
            # Node's permission boundary denies reads outside the moved bundle,
            # including the checkout, home, /workspace and retained laboratory.
            command = [str(moved / 'resources/tools/node'), '--permission',
                       '--allow-fs-read=' + str(moved), str(moved / ENTRY)]
            child = subprocess.run(command, cwd='/', env={'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'},
                                   capture_output=True, text=True, timeout=30)
            self.assertEqual(child.returncode, 0, child.stderr)
            actual = json.loads(child.stdout)
            self.assertEqual(actual['generation'], manifest['adoptedGeneration'])
            self.assertEqual(actual['pagedRoles'], ['reserve', 'fold', 'terminal', 'admission', 'withdraw'])
            self.assertEqual(actual['resourceMode'], 'candidate')
            self.assertFalse(actual['nativeFixedPathReaderIncluded'])
            self.assertFalse(actual['proofGenerated'])
            self.assertFalse(actual['financialExecution'])
            # The production reader, independently of the bundle inventory,
            # must still reject a changed original verification key.
            key = moved / 'resources' / PROOF / 'funded-graph-paged-v3/.local/poseidon-sparse-v3/prepared/reserve.vk'
            key.write_bytes(b'changed-original-verification-key')
            rejected = subprocess.run(command, cwd='/', env={'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'},
                                      capture_output=True, text=True, timeout=30)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn('PAEG_PAGED_ARTIFACT_PIN', rejected.stderr)
            print(json.dumps({'bundleSHA256': result['bundleSHA256'],
                              'generation': manifest['adoptedGeneration'],
                              'resourceFiles': len(resources['files']), 'resourceBytes': resource_bytes,
                              'bundleBytes': bundle_bytes,
                              'sourceFiles': len(manifest['sourceFiles']),
                              'outsideBundleReads': False, 'originalKeyTamperRejected': True,
                              'nativeFixedPathReaderIncluded': False}))


if __name__ == '__main__':
    unittest.main()
