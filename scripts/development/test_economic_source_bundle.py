"""Relocate adopted paged/wrapped/I84 readers with exact public resources only.

I84 authenticates the sealed result of the original reader and all its inputs.
No private account/lab state is copied and no historical driver is executed.
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
    rows, destinations = [], {}

    def add(source, path, kind='public-artifact', mode='0644', expected=None):
        file = bundle.physical(ROOT, source)
        digest = bundle.sha(file)
        if expected is not None and digest != expected:
            raise ValueError('Original public resource changed: ' + source)
        if path in destinations:
            if destinations[path] != digest:
                raise ValueError('Conflicting public resource: ' + path)
            return
        destinations[path] = digest
        rows.append({'source': source, 'path': path, 'scope': 'resources',
                     'kind': kind, 'sha256': digest, 'mode': mode})

    add(NODE, 'tools/node', 'toolchain', '0755')
    selection = json.loads((ROOT / 'scripts/development/active-paged-generation.json').read_text())
    if selection['securityGeneration'] != inspected['securityGeneration']:
        raise ValueError('Active public generation differs from inspected artifacts')
    variant = selection['directory'].removeprefix('.local/')
    if variant != 'exact-payouts-v4':
        raise ValueError('Active exact payout artifact directory changed')
    for variant, digest in [(variant, inspected['manifestSHA256'])]:
        base = PAGED + '/.local/' + variant + '/'
        destination = PROOF + '/funded-graph-paged-v3/.local/' + variant + '/'
        add(base + 'manifest.json', destination + 'manifest.json', expected=digest)
        add(base + 'consumer.json', destination + 'consumer.json',
            expected=inspected['consumerSHA256'])
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
    publication = json.loads((ROOT / 'packages/proofs/src/native-value/metadata/retained-i84-publication-v1.json').read_text())
    capsule_name = publication['path']
    add('.internal/runtime/' + capsule_name, capsule_name, expected=publication['sha256'])
    capsule = json.loads((ROOT / '.internal/runtime' / capsule_name).read_text())
    for row in capsule['files']:
        resource = row['resource']
        kind = ('historical-source' if resource.endswith('.source') else
                'public-parameter' if '/crs/' in resource else
                'toolchain' if '/node_modules/' in resource else 'public-artifact')
        add('.internal/runtime/' + resource, resource, kind, expected=row['sha256'])
    # Official SDK dependencies and the C compiler are public executable tools,
    # not historical backend/driver implementations or a private laboratory.
    abi = 'omnichain-flat-profile/flat-wallet/wallet-platform/artifacts/private-external-v1/'
    abi_manifest = abi + 'protocol-fixture-artifact-pins.json'
    add('.internal/runtime/' + abi_manifest, abi_manifest,
        expected='9913e72be559a10c7340ba291f88b067eab2dd3a0c290052c4c024db14bff2e8')
    pins = json.loads((ROOT / '.internal/runtime' / abi_manifest).read_text())
    for row in pins['files']:
        if row['path'].startswith('abi-tools/'):
            add('.internal/runtime/' + abi + row['path'], abi + row['path'],
                'toolchain', expected=row['sha256'])
    solc = ENGINE + '/tools/solidity-js/'
    for name in ['package.json', 'node_modules/solc/package.json']:
        add('.internal/runtime/' + solc + name, solc + name, 'toolchain')
    add('.internal/runtime/' + solc + 'package-lock.json', solc + 'package-lock.json',
        'toolchain', expected='01676bb5abe650970edb26246286dec92d8ce05d38c797723e129f4814b369c4')
    add('.internal/runtime/' + solc + 'node_modules/solc/soljson.js',
        solc + 'node_modules/solc/soljson.js', 'toolchain',
        expected='221d7a667378b5068d913e75fe092507e061363cd1d23b64c49ae82febabad4c')
    # New V3 public compilation is separately pinned; no old V2 publication,
    # proof job, native key or private wallet state is recreated here.
    minimum_loader = ROOT / 'packages/backend/src/operations/deployments/system/append-only-deployment-artifacts-v3.mjs'
    minimum_pins = ROOT / 'packages/backend/src/operations/deployments/system/append-only-build-v3.mjs'
    minimum_script = ('const loader=await import(' + json.dumps(minimum_loader.as_uri()) +
                      ');loader.loadMinimumDepositLedgerArtifacts();const pins=await import(' +
                      json.dumps(minimum_pins.as_uri()) +
                      ');process.stdout.write(JSON.stringify(pins.FLAT_MINIMUM_ARTIFACT_FILES));')
    minimum_child = subprocess.run([str(node), '--input-type=module', '-e', minimum_script],
                                   cwd=ROOT, capture_output=True, text=True, timeout=30)
    if minimum_child.returncode:
        raise ValueError('New V3 public compilation failed readback: ' + minimum_child.stderr)
    for row in json.loads(minimum_child.stdout).values():
        destination = 'omnichain-flat-profile/flat-wallet/' + row['path']
        add('.internal/runtime/' + destination, destination, expected=row['sha256'])
    return {'schema': bundle.RESOURCE_SCHEMA, 'files': rows}


class EconomicSourceBundleTests(unittest.TestCase):
    def test_adopted_paged_wrapped_and_i84_readers_relocate_without_external_reads(self):
        resources = public_resources()
        resource_bytes = sum((ROOT / row['source']).stat().st_size for row in resources['files'])
        self.assertLess(resource_bytes, 288 * 1024 * 1024)
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
            # Retained drivers remain .source evidence. Only the original,
            # manifest-authenticated SDK may carry executable vendor modules.
            for path in (moved / 'resources').rglob('*.mjs'):
                self.assertIn('/abi-tools/node_modules/', path.as_posix())
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
            self.assertTrue(actual['retainedI84ReaderIncluded'])
            self.assertEqual(actual['i84PublicWords'], 84)
            self.assertTrue(actual['originalSolidityCompilerLoaded'])
            self.assertEqual(actual['solcVersion'], '0.8.37+commit.f401782d.Emscripten.clang')
            self.assertTrue(actual['originalAbiToolsLoaded'])
            self.assertTrue(actual['originalClaimDriverLoaded'])
            self.assertFalse(actual['claimProfileConstructorCalled'])
            self.assertFalse(actual['solidityCompiled'])
            self.assertEqual(actual['i84FixtureProfiles'], ['ethereum', 'base', 'arbitrum', 'bnb', 'tron'])
            self.assertFalse(actual['proofGenerated'])
            self.assertFalse(actual['financialExecution'])
            # The current reader independently rejects changed original I84
            # VK, program, verification receipt and the sealed public result.
            publication = json.loads((ROOT / 'packages/proofs/src/native-value/metadata/retained-i84-publication-v1.json').read_text())
            capsule_path = moved / 'resources' / publication['path']
            capsule = json.loads(capsule_path.read_text())
            inventory = capsule['files']
            selected = [next(row for row in inventory if row['logical'].endswith('/key.vk')),
                        next(row for row in inventory if row['logical'].endswith('/public/program.json')),
                        next(row for row in inventory if '/attempts/' + capsule['data']['proofs']['ethereum']['verificationPointer']['runId'] + '/result.json' in row['logical'])]
            for row in selected + [{'resource': publication['path']}]:
                target = moved / 'resources' / row['resource']
                retained = target.read_bytes()
                altered = bytearray(retained)
                altered[0] ^= 1
                try:
                    target.write_bytes(altered)
                    rejected = subprocess.run(command, cwd='/', env={'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'},
                                              capture_output=True, text=True, timeout=30)
                    self.assertNotEqual(rejected.returncode, 0)
                    self.assertIn('I84_PUBLIC_RESOURCE_PIN', rejected.stderr)
                finally:
                    target.write_bytes(retained)
            abi = 'omnichain-flat-profile/flat-wallet/wallet-platform/artifacts/private-external-v1/'
            solc = ENGINE + '/tools/solidity-js/'
            tool_changes = [
                (abi + 'protocol-fixture-artifact-pins.json', 'FIXED_PROTOCOL_ARTIFACT_MANIFEST'),
                (abi + 'abi-tools/node_modules/ethers/lib.commonjs/index.js', 'PROTOCOL_FIXTURE_ARTIFACT_PIN'),
                (solc + 'package-lock.json', 'GENERIC_SOLC_LOCK_HASH'),
                (solc + 'node_modules/solc/soljson.js', 'GENERIC_SOLJSON_HASH'),
                ('omnichain-flat-profile/flat-wallet/.local/development-flat-minimum/v3/compiled.json', 'APPEND_ONLY_EXACT_FILE_PIN'),
            ]
            for name, reason in tool_changes:
                target = moved / 'resources' / name
                retained = target.read_bytes()
                altered = bytearray(retained)
                altered[0] ^= 1
                try:
                    target.write_bytes(altered)
                    rejected = subprocess.run(command, cwd='/', env={'LANG': 'C.UTF-8', 'PATH': '/usr/bin:/bin'},
                                              capture_output=True, text=True, timeout=30)
                    self.assertNotEqual(rejected.returncode, 0)
                    self.assertIn(reason, rejected.stderr)
                finally:
                    target.write_bytes(retained)
            # The production reader, independently of the bundle inventory,
            # must still reject a changed original verification key.
            key = moved / 'resources' / PROOF / 'funded-graph-paged-v3/.local/exact-payouts-v4/prepared/reserve.vk'
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
                              'nativeFixedPathReaderIncluded': False,
                              'retainedI84ReaderIncluded': True, 'i84TamperCasesRejected': 4,
                              'originalCompilerLoaded': True, 'originalAbiToolsLoaded': True,
                              'originalClaimDriverLoaded': True, 'claimProfileConstructorCalled': False,
                              'toolTamperCasesRejected': 4, 'newMinimumLedgerTamperRejected': True}))


if __name__ == '__main__':
    unittest.main()
