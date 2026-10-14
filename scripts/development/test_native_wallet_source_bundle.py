"""Transport the reviewed root npm inventory; no wallet, RPC or proof is opened."""
import json
import unittest

import source_bundle as bundle
import test_source_bundle as fixtures


class NativeWalletInventoryTests(unittest.TestCase):
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

    def inventory(self, *, extra=False, license=True, lock_integrity=None):
        roots = [('node_modules/@scure/base', '@scure/base'),
                 ('node_modules/micro-sol-signer', 'micro-sol-signer'),
                 ('node_modules/micro-sol-signer/node_modules/@scure/base', '@scure/base')]
        rows, locked = [], {}
        for path, name in roots:
            installed = {'name': name, 'version': '2.4.0', 'type': 'module', 'dependencies': {}}
            self.fixture.write(path + '/package.json', json.dumps(installed))
            self.fixture.write(path + '/index.js', 'export const publicFixture = true;\n')
            if license:
                self.fixture.write(path + '/LICENSE', 'MIT public fixture license\n')
            files = [{'path': file.name, 'bytes': file.stat().st_size, 'sha256': bundle.sha(file)}
                     for file in sorted((self.root / path).iterdir()) if file.is_file()]
            row = {'path': path, 'name': name, 'version': installed['version'],
                   'resolved': 'https://registry.npmjs.org/' + name + '/-/public-fixture.tgz',
                   'integrity': 'sha512-' + 'YQ==', 'dependencies': {}, 'files': files}
            rows.append(row)
            locked[path] = {key: row[key] for key in ('version', 'resolved', 'integrity', 'dependencies')}
        if lock_integrity is not None:
            locked[roots[0][0]]['integrity'] = lock_integrity
        if extra:
            self.fixture.write('node_modules/@scure/base/unreviewed.js', 'export const unreviewed = true;\n')
        dependencies = {'@scure/base': '2.4.0', 'micro-sol-signer': '2.4.0'}
        self.fixture.write('packages/crypto/package.json', json.dumps({
            'name': '@lianum/crypto', 'type': 'module', 'dependencies': dependencies}))
        self.fixture.write('package-lock.json', json.dumps({'lockfileVersion': 3, 'packages': locked}))
        self.fixture.write(bundle.NATIVE_NPM_POLICY, json.dumps({'nativeWalletNpm': {
            'schema': 'LIANUM_REVIEWED_NATIVE_WALLET_NPM_V1',
            'manifest': 'packages/crypto/package.json', 'lock': 'package-lock.json',
            'consumerPrefixes': ['packages/crypto/src/'], 'directDependencies': dependencies,
            'packages': rows}}))
        self.fixture.adopted_fixture()
        return rows

    def test_exact_packages_nested_roots_and_licenses_remain_pinned(self):
        rows = self.inventory()
        files, _, _ = bundle.adopted_source_inventory(self.root)
        self.assertEqual(sum(name.startswith('node_modules/') for name in files), 9)
        package = self.root / rows[0]['path'] / 'LICENSE'
        original = package.read_bytes()
        package.write_bytes(original + b'changed')
        with self.assertRaisesRegex(ValueError, 'Root npm bytes changed'):
            bundle.adopted_source_inventory(self.root)

    def test_added_file_cannot_expand_reviewed_inventory(self):
        self.inventory(extra=True)
        with self.assertRaisesRegex(ValueError, 'extra or missing'):
            bundle.adopted_source_inventory(self.root)
    def test_missing_license_cannot_expand_reviewed_inventory(self):
        # An isolated inventory can be internally hashed, but that alone is
        # insufficient authority to omit the required public license.
        self.inventory(license=False)
        with self.assertRaisesRegex(ValueError, 'public license'):
            bundle.adopted_source_inventory(self.root)

    def test_unknown_root_and_changed_locked_sri_are_rejected(self):
        self.inventory(lock_integrity='sha512-Yg==')
        with self.assertRaisesRegex(ValueError, 'manifest, lock or SRI'):
            bundle.adopted_source_inventory(self.root)
        with self.assertRaisesRegex(ValueError, 'reviewed native-wallet'):
            bundle.adopted_npm_package(('node_modules', 'unreviewed', 'index.js'))

    def test_adopted_crypto_import_builds_without_duplicate_npm_resources(self):
        entry = 'packages/crypto/src/public-provider-fixture.mjs'
        self.fixture.write(entry, "import {publicFixture} from '@scure/base';\nexport {publicFixture};\n")
        self.inventory()
        result = bundle.build(self.root, self.fixture.output, entry,
                              fixtures.SourceBundleTests.external,
                              fixtures.SourceBundleTests.resources, 'tools/node',
                              adopted_generation=True)
        verified = bundle.verify(self.fixture.output)
        self.assertEqual(result['bundleSHA256'], bundle.sha(self.fixture.output / 'source-bundle.json'))
        self.assertTrue(verified['adoptedGeneration'])
        manifest = json.loads((self.fixture.output / 'source-bundle.json').read_bytes())
        self.assertEqual(sum(path.startswith('node_modules/') for path in manifest['files']), 9)
        self.assertFalse(any(row['scope'] == 'dependency' for row in manifest['resources']))

    def test_adopted_npm_does_not_enable_foreign_or_unadopted_consumers(self):
        entry = 'packages/fixture/src/foreign-import.mjs'
        self.fixture.write(entry, "import {publicFixture} from '@scure/base';\nexport {publicFixture};\n")
        self.inventory()
        with self.assertRaisesRegex(ValueError, 'Missing pinned npm dependency'):
            bundle.build(self.root, self.fixture.output, entry,
                         fixtures.SourceBundleTests.external,
                         fixtures.SourceBundleTests.resources, 'tools/node',
                         adopted_generation=True)
        crypto_entry = 'packages/crypto/src/not-adopted.mjs'
        self.fixture.write(crypto_entry, "import {publicFixture} from '@scure/base';\nexport {publicFixture};\n")
        with self.assertRaisesRegex(ValueError, 'Missing pinned npm dependency'):
            bundle.build(self.root, self.fixture.output, crypto_entry,
                         fixtures.SourceBundleTests.external,
                         fixtures.SourceBundleTests.resources, 'tools/node',
                         adopted_generation=True)

    def test_unadopted_build_still_requires_explicit_npm_resources(self):
        entry = 'packages/crypto/src/public-provider-fixture.mjs'
        self.fixture.write(entry, "import {publicFixture} from '@scure/base';\nexport {publicFixture};\n")
        self.inventory()
        with self.assertRaisesRegex(ValueError, 'Missing pinned npm dependency'):
            bundle.build(self.root, self.fixture.output, entry,
                         fixtures.SourceBundleTests.external,
                         fixtures.SourceBundleTests.resources, 'tools/node')


if __name__ == '__main__':
    unittest.main()
