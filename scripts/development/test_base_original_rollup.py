import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest


def module():
    spec = importlib.util.spec_from_file_location('original_base_local',
        Path(__file__).with_name('owned_base_rollup_v1.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


class OriginalBaseLocalTest(unittest.TestCase):
    def test_official_material_is_own_pos_and_bindings_stay_private(self):
        m = module()
        files = m.official_files(m.repository() / '.local/dependencies/base-original-v1/public' / f'base-{m.COMMIT}.tar.gz')
        source = m.active_compose(files['etc/docker/docker-compose.yml'].decode())
        self.assertIn('image: ghcr.io/paradigmxyz/reth:v2.5.2', source)
        self.assertIn('image: sigp/lighthouse:v8.2.2', source)
        self.assertIn('--execution-endpoint=http://l1-el:', source)
        self.assertIn('  op-batcher:', source)
        self.assertNotIn('  base-batcher:', source)
        self.assertNotIn('  base-shadow-validator:', source)
        self.assertNotIn('container_name:', source)
        self.assertNotIn('env_file: devnet-env', source)
        self.assertNotIn('anvil', source.lower())
        env = m.infrastructure_env(files['etc/docker/devnet-env'].decode(), 27)
        self.assertIn('L1_SLOT_DURATION_OVERRIDE=2', env)
        self.assertNotIn('172.30.0.', env)
        with tempfile.TemporaryDirectory(prefix='original-base-host-') as value:
            realm = Path(value)
            images = {name: 'sha256:' + 'a' * 64 for name in m.SERVICES}
            original = {'services': {name: {'image': 'upstream', 'build': {},
                'volumes': [{'type': 'bind', 'source': str(realm / 'data'), 'target': '/data'}]}
                for name in m.SERVICES}, 'networks': {'default': {}}}
            fixed = m.fixed_runtime_compose(original, images, 'lianum-base-' + '1' * 32, realm)
            self.assertEqual(fixed['services']['base-rpc']['ports'], [{'target': 8645,
                'published': '0', 'host_ip': '127.0.0.1', 'protocol': 'tcp'}])
            self.assertTrue(all(x['restart'] == 'no' for x in fixed['services'].values()))
            original['services']['l1-el']['volumes'][0]['source'] = '/tmp/foreign-source'
            with self.assertRaisesRegex(m.ClosedError, '^BASE_ORIGINAL_FOREIGN_MOUNT$'):
                m.fixed_runtime_compose(original, images, 'lianum-base-' + '1' * 32, realm)

    def test_finality_requires_same_original_beacon_and_derived_history(self):
        m = module()
        parent = {'number': '0x4', 'hash': '0x' + 'a' * 64}
        child = {'number': '0x3', 'hash': '0x' + 'b' * 64}
        observed = []
        def rpc(url, method, parameters):
            observed.append((url, method, parameters))
            return dict(parent if url == 'own-l1' else child)
        m.rpc = rpc
        payload = {'execution_optimistic': False, 'finalized': True, 'data': {'message': {
            'body': {'execution_payload': {'block_number': '4', 'block_hash': parent['hash']}}}}}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, maximum): return json.dumps(payload).encode()
        m.urllib.request.urlopen = lambda url, timeout: Response()
        result = m.finalized_pair('own-l1', 'own-l2-rpc', 'own-builder', 'own-beacon')
        self.assertEqual(result['childFinalized'], child)
        self.assertFalse(result['rollupChallengeFinalityEstablished'])
        self.assertFalse(result['privateCreditEstablished'])
        self.assertIn(('own-builder', 'eth_getBlockByNumber', ['0x3', False]), observed)
        payload['data']['message']['body']['execution_payload']['block_hash'] = '0x' + 'c' * 64
        with self.assertRaisesRegex(m.ClosedError, '^BASE_ORIGINAL_BEACON_EXECUTION_MISMATCH$'):
            m.finalized_pair('own-l1', 'own-l2-rpc', 'own-builder', 'own-beacon')

    def test_signed_wire_uncertainty_burns_the_same_admission(self):
        m = module()
        runtime = m.OriginalCluster.__new__(m.OriginalCluster)
        runtime.admitted = set(); runtime.failed = False; runtime.l2 = 'own-l2'
        runtime.healthy = lambda: m.require(not runtime.failed, 'BASE_ORIGINAL_RUNTIME_UNAVAILABLE')
        calls = []
        def rpc(url, method, parameters):
            calls.append(method)
            if method == 'web3_sha3': return '0x' + 'a' * 64
            raise OSError('synthetic lost reply after same admitted original send')
        m.rpc = rpc
        with self.assertRaisesRegex(m.ClosedError, '^BASE_ORIGINAL_OPERATION_UNCERTAIN$'):
            runtime.send_once('0x1234')
        with self.assertRaisesRegex(m.ClosedError, '^BASE_ORIGINAL_RUNTIME_UNAVAILABLE$'):
            runtime.send_once('0x1234')
        self.assertEqual(calls.count('eth_sendRawTransaction'), 1)
        self.assertEqual(len(runtime.admitted), 1)


if __name__ == '__main__':
    unittest.main()
