import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock


def module():
    spec = importlib.util.spec_from_file_location('original_base_local',
        Path(__file__).with_name('owned_base_rollup_v1.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


class OriginalBaseLocalTest(unittest.TestCase):
    def test_host_and_null_networks_have_no_subnet_without_adopting_malformed_bridge(self):
        m = module()
        for driver in ('host', 'null'):
            self.assertEqual(m.original_network_subnets({'Driver':driver,'IPAM':{'Config':None}}),[])
        original={'Driver':'bridge','IPAM':{'Config':[{'Subnet':'172.28.16.0/24'}]}}
        self.assertEqual(str(m.original_network_subnets(original)[0]),'172.28.16.0/24')
        for invalid in ({'Driver':'bridge','IPAM':{'Config':None}},
                        {'Driver':'bridge','IPAM':{'Config':[{'Subnet':'invalid'}]}}):
            with self.assertRaisesRegex(m.ClosedError,'^BASE_ORIGINAL_NETWORK_INSPECTION$'):
                m.original_network_subnets(invalid)

    def test_private_read_allows_access_time_but_rejects_mutation(self):
        m = module()
        with tempfile.TemporaryDirectory(prefix='original-private-read-') as value:
            path = Path(value) / 'original.bin'
            path.write_bytes(b'original-public-receipt')
            path.chmod(0o600)
            os.utime(path, ns=(0, path.stat().st_mtime_ns))
            self.assertEqual(m.private_read(path), b'original-public-receipt')
            original_fstat = os.fstat
            calls = 0
            def mutate_before_second_stat(fd):
                nonlocal calls
                calls += 1
                if calls == 2:
                    info = path.stat()
                    os.utime(path, ns=(info.st_atime_ns, info.st_mtime_ns + 1))
                return original_fstat(fd)
            with mock.patch.object(m.os, 'fstat', mutate_before_second_stat):
                with self.assertRaisesRegex(m.ClosedError, '^BASE_ORIGINAL_PRIVATE_FILE_CHANGED$'):
                    m.private_read(path)

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

    def test_economic_profile_changes_only_original_id_before_birth(self):
        m = module()
        files=m.official_files(m.repository()/'.local/dependencies/base-original-v1/public'/f'base-{m.COMMIT}.tar.gz')
        original=m.infrastructure_env(files['etc/docker/devnet-env'].decode(),27)
        self.assertIn('L2_CHAIN_ID=84538453',original)
        m.NATIVE_VALUE=True
        changed=m.infrastructure_env(files['etc/docker/devnet-env'].decode(),27)
        self.assertEqual(changed,original.replace('L2_CHAIN_ID=84538453','L2_CHAIN_ID=8453'))

    def test_original_economic_read_port_is_readonly_and_keeps_network_guards(self):
        m = module()
        m.NATIVE_VALUE=True;m.CHAIN_ID=8453
        cluster=m.OriginalCluster.__new__(m.OriginalCluster)
        cluster.l2='original-private-l2'
        genesis={'number':'0x0','hash':'0x'+'a'*64}
        cluster.l2_genesis=m.header(genesis)
        health=[];cluster.healthy=lambda:health.append(True)
        calls=[]
        def rpc(url,method,params):
            self.assertEqual(url,cluster.l2);calls.append((method,params))
            if method=='eth_chainId':return hex(m.CHAIN_ID)
            if method=='eth_getBlockByNumber':self.assertEqual(params,['0x0',False]);return dict(genesis)
            if method=='debug_traceTransaction':return {'type':'CALL'}
            self.fail('unexpected synthetic port')
        m.rpc=rpc
        trace={'tracer':'callTracer','timeout':'5s','reexec':128,'tracerConfig':{'onlyTopCall':True,'withLog':False}}
        result=cluster.read_original({'method':'debug_traceTransaction','params':['0x'+'b'*64,trace]})
        self.assertEqual(result,{'type':'CALL'});self.assertEqual(len(health),2)
        before=len(calls)
        with self.assertRaisesRegex(m.ClosedError,'^BASE_ORIGINAL_READ_METHOD$'):
            cluster.read_original({'method':'eth_sendRawTransaction','params':['0x01']})
        self.assertEqual(len(calls),before)
        with self.assertRaisesRegex(m.ClosedError,'^BASE_ORIGINAL_READ_PARAMS$'):
            cluster.read_original({'method':'debug_traceTransaction','params':['0x'+'b'*64,dict(trace,timeout='30s')]})
        self.assertEqual(len(calls),before)
        m.NATIVE_VALUE=False
        with self.assertRaisesRegex(m.ClosedError,'^BASE_ORIGINAL_ECONOMIC_PROFILE_REQUIRED$'):
            cluster.read_original({'method':'eth_chainId','params':[]})
        self.assertEqual(len(calls),before)


if __name__ == '__main__':
    unittest.main()
