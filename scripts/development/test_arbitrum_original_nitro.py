import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import stat
import unittest
from unittest import mock


class OriginalNitroNamespaceTest(unittest.TestCase):
    def test_pos_genesis_publishes_same_original_execution_header_before_init(self):
        spec = importlib.util.spec_from_file_location('original_nitro_paired_genesis', Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        # Compose data is an explicitly synthetic public configuration port;
        # no native process, clock, contract, key or accepted finality is made.
        commands = ['testnet', 'generate-genesis', '--fork=deneb',
                    '--num-validators=64', '--genesis-time-delay=15',
                    '--output-ssz=/consensus/genesis.ssz',
                    '--chain-config-file=/config/prysm.yaml',
                    '--geth-genesis-json-in=/config/geth_genesis.json']
        original = {'services': {name: {'image': 'upstream', 'command': []}
                                    for name in m.SERVICES}, 'volumes': {}, 'networks': {}}
        original['services']['create_beacon_chain_genesis']['command'] = commands
        original['services']['geth']['command'] = ['--dev', '--dev.period=1', '--mine',
             '--miner.etherbase=0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E', '--state.scheme=hash']
        original['services']['rollupcreator']['depends_on'] = {
            'geth': {'condition': 'service_started', 'required': True},
            'sequencer': {'condition': 'service_started', 'required': True}}
        images = {name: 'sha256:' + 'a' * 64 for name in m.SERVICES}
        fixed = m.fixed_runtime_compose(original, images, 'lianum-nitro-' + '3' * 32)
        self.assertEqual(fixed['services']['create_beacon_chain_genesis']['command'],
                         commands + ['--geth-genesis-json-out=/config/geth_genesis.json'])
        self.assertEqual(original['services']['create_beacon_chain_genesis']['command'], commands)
        self.assertEqual(fixed['services']['geth']['command'], ['--state.scheme=hash'])
        altered = json.loads(json.dumps(original))
        altered['services']['create_beacon_chain_genesis']['command'][-1] = '--geth-genesis-json-in=/foreign/genesis.json'
        with self.assertRaisesRegex(m.ClosedError, '^ARBITRUM_ORIGINAL_PAIRED_GENESIS_COMMAND_CHANGED$'):
            m.fixed_runtime_compose(altered, images, 'lianum-nitro-' + '3' * 32)

    def test_official_prague_schedule_precedes_paired_genesis_generation(self):
        spec = importlib.util.spec_from_file_location('original_nitro_prague_schedule', Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        material = m.repository() / '.local/dependencies/arbitrum-nitro-v1/public' / f'nitro-testnode-{m.COMMIT}.tar.gz'
        original = m.official_files(material)['test-node.bash'].decode()
        launcher = m.fixed_launcher(original, 'lianum-nitro-' + '7' * 32)
        command = 'docker compose run --rm --entrypoint node scripts -e '
        self.assertEqual(launcher.count(command), 1)
        self.assertLess(launcher.index('run_script write-geth-genesis-config'), launcher.index(command))
        self.assertLess(launcher.index(command), launcher.index('run_script write-prysm-config'))
        self.assertIn('g.config.blobSchedule.prague={target:6,max:9,baseFeeUpdateFraction:5007716}', launcher)
        self.assertNotIn('g.config.pragueTime=', launcher)
        self.assertNotIn('g.timestamp=', launcher)
        self.assertIn('docker compose run --rm geth init --state.scheme hash', launcher)
        altered = original.replace('    run_script write-geth-genesis-config\n', '')
        with self.assertRaisesRegex(m.ClosedError, '^ARBITRUM_ORIGINAL_GENESIS_LAUNCHER_CHANGED$'):
            m.fixed_launcher(altered, 'lianum-nitro-' + '7' * 32)

    def test_same_paired_genesis_is_not_regenerated_after_original_geth_init(self):
        spec = importlib.util.spec_from_file_location('original_nitro_single_genesis', Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        material = m.repository() / '.local/dependencies/arbitrum-nitro-v1/public' / f'nitro-testnode-{m.COMMIT}.tar.gz'
        original = m.official_files(material)['test-node.bash'].decode()
        fixed = m.fixed_launcher(original, 'lianum-nitro-' + '7' * 32)
        generator = 'docker compose run --rm create_beacon_chain_genesis'
        init = 'docker compose run --rm geth init --state.scheme hash'
        startup = ('      docker compose up --wait geth\n'
                   '      docker compose up --wait --no-deps prysm_beacon_chain\n'
                   '      docker compose up --wait --no-deps prysm_validator\n')
        self.assertEqual(fixed.count(generator), 1)
        self.assertEqual(fixed.count(startup), 1)
        self.assertLess(fixed.index(generator), fixed.index(init))
        self.assertLess(fixed.index(init), fixed.index(startup))
        self.assertNotIn('up --wait prysm_beacon_chain', fixed)
        self.assertNotIn('up --wait prysm_validator', fixed)
        self.assertEqual(m.FINALITY_MS, 180_000)
        changed = original.replace('      docker compose up --wait prysm_beacon_chain\n', '')
        with self.assertRaisesRegex(m.ClosedError, '^ARBITRUM_ORIGINAL_PAIRED_GENESIS_STARTUP_CHANGED$'):
            m.fixed_launcher(changed, 'lianum-nitro-' + '7' * 32)

    def test_creator_never_starts_sequencer_before_original_config(self):
        spec = importlib.util.spec_from_file_location('original_nitro_creator_birth', Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        material = m.repository() / '.local/dependencies/arbitrum-nitro-v1/public' / f'nitro-testnode-{m.COMMIT}.tar.gz'
        files = m.official_files(material)
        launcher = m.fixed_launcher(files['test-node.bash'].decode(), 'lianum-nitro-' + '8' * 32)
        # Exact Docker Compose config shape is an explicitly synthetic port;
        # native birth/finality/transactions are not simulated or accepted.
        original = {'services': {name: {'image': 'upstream', 'command': []}
                                 for name in m.SERVICES}, 'volumes': {}, 'networks': {}}
        original['services']['create_beacon_chain_genesis']['command'] = [
            'testnet', 'generate-genesis', '--geth-genesis-json-in=/config/geth_genesis.json']
        original['services']['geth']['command'] = ['--dev', '--dev.period=1', '--mine',
            '--miner.etherbase=0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E', '--state.scheme=hash']
        dependencies = {'geth': {'condition': 'service_started', 'required': True},
                        'sequencer': {'condition': 'service_started', 'required': True}}
        original['services']['rollupcreator']['depends_on'] = dependencies
        original['services']['sequencer']['depends_on'] = {'geth': {'condition': 'service_started', 'required': True}}
        images = {name: 'sha256:' + 'a' * 64 for name in m.SERVICES}
        fixed = m.fixed_runtime_compose(original, images, 'lianum-nitro-' + '8' * 32)
        self.assertEqual(fixed['services']['rollupcreator']['depends_on'], {'geth': dependencies['geth']})
        self.assertEqual(original['services']['rollupcreator']['depends_on'], dependencies)
        self.assertEqual(fixed['services']['sequencer']['depends_on'], original['services']['sequencer']['depends_on'])
        self.assertEqual(fixed['services']['rollupcreator']['command'], original['services']['rollupcreator']['command'])
        deployment = launcher.index('rollupcreator create-rollup-testnode')
        configuration = launcher.index('run_script write-config')
        sequencer_start = launcher.index('docker compose up --wait $INITIAL_SEQ_NODES')
        self.assertLess(deployment, configuration)
        self.assertLess(configuration, sequencer_start)
        self.assertEqual(launcher.count('docker compose run --rm create_beacon_chain_genesis'), 1)
        self.assertEqual(len(m.LIVE_SERVICES), 8)
        self.assertEqual(m.FINALITY_MS, 180_000)
        altered = json.loads(json.dumps(original))
        altered['services']['rollupcreator']['depends_on']['sequencer']['condition'] = 'service_healthy'
        with self.assertRaisesRegex(m.ClosedError, '^ARBITRUM_ORIGINAL_CREATOR_DEPENDENCIES_CHANGED$'):
            m.fixed_runtime_compose(altered, images, 'lianum-nitro-' + '8' * 32)

    def test_private_read_allows_access_time_but_rejects_mutation(self):
        spec = importlib.util.spec_from_file_location('original_nitro_private_reader', Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
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
                with self.assertRaisesRegex(m.ClosedError, '^ARBITRUM_ORIGINAL_PRIVATE_FILE_CHANGED$'):
                    m.private_read(path)

    def test_private_parent_birth_and_existing_mode_denial(self):
        path = Path(__file__).with_name('owned_arbitrum_nitro_v1.py')
        spec = importlib.util.spec_from_file_location('original_nitro_directory', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix='original-nitro-private-') as value:
            root = Path(value)
            leaf = root / 'new-base' / 'public'
            self.assertEqual(module.directory(leaf), leaf)
            self.assertEqual(stat.S_IMODE((root / 'new-base').stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(leaf.stat().st_mode), 0o700)
            os.chmod(root / 'new-base', 0o755)
            with self.assertRaisesRegex(module.ClosedError, '^ARBITRUM_ORIGINAL_DIRECTORY$'):
                module.directory(root / 'new-base')
            self.assertEqual(stat.S_IMODE((root / 'new-base').stat().st_mode), 0o755)
            link = root / 'foreign-link'
            link.symlink_to(leaf, target_is_directory=True)
            with self.assertRaisesRegex(module.ClosedError, '^ARBITRUM_ORIGINAL_DIRECTORY$'):
                module.directory(link)

    def test_enumeration_excludes_original_ephemeral_compose_jobs(self):
        path = Path(__file__).with_name('owned_arbitrum_nitro_v1.py')
        spec = importlib.util.spec_from_file_location('original_nitro_enumeration', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        runtime = module.OriginalCluster.__new__(module.OriginalCluster)
        runtime.project = 'lianum-nitro-' + '3' * 32
        runtime.realm = Path.cwd()
        runtime.log = io.BytesIO()
        calls = []
        def inspect_ids(command, _cwd, _log):
            calls.append(command)
            # Docker's label-filter port is synthetic, never a runtime birth.
            self.assertEqual(command[-2:], ['--filter', 'label=com.docker.compose.oneoff=False'])
            return ('a' * 64 + '\n').encode()
        module.run = inspect_ids
        self.assertEqual(runtime.ids(), ['a' * 64])
        self.assertEqual(calls[0][4:6], ['--filter',
            'label=com.docker.compose.project=' + runtime.project])

    def test_birth_waits_for_real_pid_and_close_denies_unretained_id(self):
        path = Path(__file__).with_name('owned_arbitrum_nitro_v1.py')
        spec = importlib.util.spec_from_file_location('original_nitro_lifecycle', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        # Only Docker inspection/stop is synthetic. The kernel identity belongs
        # to this original HOST process; no native runtime or brand is issued.
        runtime = module.OriginalCluster.__new__(module.OriginalCluster)
        runtime.containers = {}
        runtime.project = 'lianum-nitro-' + '2' * 32
        runtime.closed = False
        runtime.realm = Path.cwd()
        runtime.log = io.BytesIO()
        original = {'id': 'a' * 64, 'service': 'geth', 'image': 'sha256:' + 'b' * 64,
                    'created': '2026-10-10T00:00:00Z', 'running': False, 'pid': 0,
                    'ports': {}, 'oneoff': False}
        rows = {original['id']: original}
        runtime.ids = lambda: list(rows)
        runtime.inspect = lambda identifier: dict(rows[identifier])
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            runtime.enroll()
        self.assertEqual(output.getvalue(), '')
        auxiliary = dict(original, id='d' * 64, service='create_beacon_chain_genesis',
                         running=True, pid=os.getpid())
        rows[auxiliary['id']] = auxiliary
        with contextlib.redirect_stdout(output):
            runtime.enroll()
        self.assertEqual(output.getvalue(), '')
        self.assertIsNone(runtime.containers[auxiliary['id']]['process'])
        self.assertEqual(runtime.containers[auxiliary['id']]['id'], auxiliary['id'])
        # The official setup service can complete and run again without being
        # published as a live node or replacing any live kernel identity.
        rows[auxiliary['id']]['running'] = False
        rows[original['id']]['running'] = True
        rows[original['id']]['pid'] = os.getpid()
        with contextlib.redirect_stdout(output):
            runtime.enroll()
        birth = json.loads(output.getvalue())['originalContainers']
        self.assertEqual(len(birth), 1)
        self.assertEqual(birth[0]['process'], module.process_identity(os.getpid()))
        self.assertEqual(birth[0]['service'], 'geth')
        self.assertNotIn(auxiliary['id'], {row['id'] for row in birth})
        rows[original['id']]['pid'] = os.getpid() + 999000
        with self.assertRaisesRegex(module.ClosedError, '^ARBITRUM_ORIGINAL_NATIVE_CHANGED$'):
            runtime.enroll()
        rows[original['id']]['pid'] = os.getpid()
        unknown = dict(original, id='c' * 64)
        rows[unknown['id']] = unknown
        stopped = []
        def stop(command, _cwd, _log, _seconds):
            self.assertEqual(command[:5], ['/usr/bin/docker', 'container', 'stop', '--time', '10'])
            stopped.extend(command[5:])
            for identifier in command[5:]:
                rows[identifier]['running'] = False
            return b''
        module.run = stop
        with self.assertRaisesRegex(module.ClosedError, '^ARBITRUM_ORIGINAL_UNRETAINED_CONTAINER$'):
            runtime.close()
        self.assertEqual(stopped, [original['id']])
        self.assertNotIn(unknown['id'], stopped)

    def test_creator_retains_new_id_before_other_native_identity_fails(self):
        spec = importlib.util.spec_from_file_location('original_nitro_failure_retention', Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        runtime = m.OriginalCluster.__new__(m.OriginalCluster)
        runtime.project = 'lianum-nitro-' + '9' * 32
        runtime.realm = Path.cwd()
        runtime.log = io.BytesIO()
        runtime.closed = False
        original = {'id': 'a' * 64, 'service': 'sequencer', 'image': 'sha256:' + 'b' * 64,
                    'created': '2026-10-10T00:00:00Z', 'running': True, 'pid': os.getpid(),
                    'ports': {}, 'oneoff': False, 'process': m.process_identity(os.getpid())}
        runtime.containers = {original['id']: dict(original)}
        later = {'id': 'c' * 64, 'service': 'redis', 'image': 'sha256:' + 'd' * 64,
                 'created': '2026-10-10T00:00:01Z', 'running': True, 'pid': os.getpid(),
                 'ports': {}, 'oneoff': False}
        # Docker inspection/stop ports are explicitly synthetic; the recorded
        # first kernel identity is this real HOST process, with no native brand.
        rows = {original['id']: dict(original, pid=os.getpid() + 999000), later['id']: dict(later)}
        runtime.ids = lambda: list(rows)
        runtime.inspect = lambda identifier: dict(rows[identifier])
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(m.ClosedError, '^ARBITRUM_ORIGINAL_NATIVE_CHANGED$'):
                runtime.enroll()
        self.assertEqual(output.getvalue(), '')
        retained = runtime.containers[later['id']]
        self.assertEqual({key: retained[key] for key in ('id', 'service', 'image', 'created')},
                         {key: later[key] for key in ('id', 'service', 'image', 'created')})
        self.assertIsNone(retained['process'])
        self.assertEqual(runtime.containers[original['id']]['process'], original['process'])
        rows[original['id']].update(running=False, pid=0)
        stopped = []
        def stop(command, _cwd, _log, _seconds):
            self.assertEqual(command[:5], ['/usr/bin/docker', 'container', 'stop', '--time', '10'])
            stopped.extend(command[5:])
            for identifier in command[5:]:
                rows[identifier].update(running=False, pid=0)
            return b''
        m.run = stop
        runtime.close()
        self.assertEqual(stopped, [later['id']])
        self.assertEqual(runtime.containers[later['id']]['process'], m.process_identity(os.getpid()))
        self.assertEqual(runtime.containers[original['id']]['process'], original['process'])

    def test_official_pos_has_external_consensus_and_exclusive_resources(self):
        path = Path(__file__).with_name('owned_arbitrum_nitro_v1.py')
        spec = importlib.util.spec_from_file_location('original_nitro', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        root = module.repository()
        material = root / '.local/dependencies/arbitrum-nitro-v1/public' / f'nitro-testnode-{module.COMMIT}.tar.gz'
        files = module.official_files(material)
        compose = module.active_compose(files['docker-compose.yaml'].decode())
        self.assertNotIn('container_name:', compose)
        self.assertNotIn('env_file:', compose)
        self.assertIn('--dev.period=1', compose)  # Actual upstream defect.
        project = 'lianum-nitro-' + '1' * 32
        launcher = module.fixed_launcher(files['test-node.bash'].decode(), project)
        self.assertTrue('com.docker.compose.project=nitro-testnode' not in launcher)
        self.assertNotIn('docker volume prune', launcher)
        self.assertTrue('send-l1 --ethamount 0.0001 --from user_l1user' not in launcher)
        self.assertNotIn('docker pull $NITRO_NODE_VERSION', launcher)
        self.assertIn('docker compose run --rm geth init --state.scheme hash', launcher)
        self.assertIn('docker compose up --wait --no-deps prysm_validator', launcher)
        self.assertIn('create-rollup-testnode', launcher)
        # This is a synthetic Compose-config port with the exact physical Docker
        # shape; the transform above used the pinned official source itself.
        images = {name: 'sha256:' + 'a' * 64 for name in module.SERVICES}
        source = {'services': {name: {'image': 'upstream', 'pid': 'host', 'ports': [],
                   'volumes': [{'type': 'volume', 'source': 'config', 'target': '/config'}]}
                   for name in module.SERVICES}, 'volumes': {'config': {'name': 'old_config'}},
                   'networks': {'default': {'name': 'old_default'}}}
        source['services']['geth']['command'] = ['--dev', '--dev.period=1', '--mine',
            '--miner.etherbase=0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E',
            '--authrpc.jwtsecret=/config/jwt.hex', '--http', '--datadir=/datadir']
        source['services']['create_beacon_chain_genesis']['command'] = [
            'testnet', 'generate-genesis', '--geth-genesis-json-in=/config/geth_genesis.json']
        source['services']['rollupcreator']['depends_on'] = {
            'geth': {'condition': 'service_started', 'required': True},
            'sequencer': {'condition': 'service_started', 'required': True}}
        saved = json.loads(json.dumps(source))
        value = module.fixed_runtime_compose(source, images, project)
        self.assertEqual(source, saved)
        self.assertEqual(value['volumes']['config']['name'], project + '_config')
        self.assertEqual(value['networks']['default']['name'], project + '_default')
        self.assertNotIn('--dev', value['services']['geth']['command'])
        self.assertIn('--authrpc.jwtsecret=/config/jwt.hex', value['services']['geth']['command'])
        self.assertNotIn('pid', value['services']['validator'])
        self.assertEqual(value['services']['sequencer']['ports'], [{'target': 8547,
            'published': '0', 'host_ip': '127.0.0.1', 'protocol': 'tcp'}])
        source['volumes']['config']['external'] = True
        with self.assertRaisesRegex(module.ClosedError, '^ARBITRUM_ORIGINAL_EXTERNAL_RESOURCE$'):
            module.fixed_runtime_compose(source, images, project)
        with self.assertRaisesRegex(module.ClosedError, '^ARBITRUM_ORIGINAL_PROJECT$'):
            module.fixed_runtime_compose(saved, images, 'arbitrary-project')

    def test_economic_profile_changes_only_original_id_before_birth(self):
        spec=importlib.util.spec_from_file_location('original_nitro_native_value',Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        files=m.official_files(m.repository()/'.local/dependencies/arbitrum-nitro-v1/public'/f'nitro-testnode-{m.COMMIT}.tar.gz')
        self.assertEqual(m.economic_files(files),files)
        m.NATIVE_VALUE=True
        changed=m.economic_files(files)
        self.assertEqual(set(changed),set(files))
        self.assertEqual(changed['scripts/config.ts'],files['scripts/config.ts'].replace(b'412346',b'42161'))
        self.assertEqual({k:v for k,v in changed.items() if k!='scripts/config.ts'},
                         {k:v for k,v in files.items() if k!='scripts/config.ts'})

    def test_original_economic_read_port_is_readonly_and_keeps_network_guards(self):
        spec=importlib.util.spec_from_file_location('original_nitro_native_value',Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        m.NATIVE_VALUE=True;m.CHAIN_ID=42161
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
        with self.assertRaisesRegex(m.ClosedError,'^ARBITRUM_ORIGINAL_READ_METHOD$'):
            cluster.read_original({'method':'eth_sendRawTransaction','params':['0x01']})
        self.assertEqual(len(calls),before)
        with self.assertRaisesRegex(m.ClosedError,'^ARBITRUM_ORIGINAL_READ_PARAMS$'):
            cluster.read_original({'method':'debug_traceTransaction','params':['0x'+'b'*64,dict(trace,timeout='30s')]})
        self.assertEqual(len(calls),before)
        m.NATIVE_VALUE=False
        with self.assertRaisesRegex(m.ClosedError,'^ARBITRUM_ORIGINAL_ECONOMIC_PROFILE_REQUIRED$'):
            cluster.read_original({'method':'eth_chainId','params':[]})
        self.assertEqual(len(calls),before)


    def test_original_unknown_wire_blocks_all_fresh_broadcasts_and_keeps_original_reads(self):
        spec=importlib.util.spec_from_file_location('original_nitro_once',Path(__file__).with_name('owned_arbitrum_nitro_v1.py'))
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        m.NATIVE_VALUE=True;m.CHAIN_ID=42161
        cluster=m.OriginalCluster.__new__(m.OriginalCluster)
        cluster.l2='original-private-l2';cluster.admitted=set();cluster.failed=False
        cluster.healthy=lambda:m.require(not cluster.failed,'ARBITRUM_ORIGINAL_RUNTIME_UNAVAILABLE')
        genesis={'number':'0x0','hash':'0x'+'a'*64};cluster.l2_genesis=m.header(genesis)
        calls=[]
        def rpc(url,method,params):
            self.assertEqual(url,cluster.l2);calls.append(method)
            if method=='web3_sha3':return '0x'+'b'*64
            if method=='eth_sendRawTransaction':raise m.ClosedError('HOST_ORIGINAL_REPLY_LOST')
            if method=='eth_chainId':return hex(m.CHAIN_ID)
            if method=='eth_getBlockByNumber':return dict(genesis)
            if method=='eth_getTransactionCount':return '0x1'
            if method=='eth_gasPrice':return '0x3b9aca00'
            if method=='eth_estimateGas':return '0x7530'
            self.fail('unexpected synthetic native RPC')
        m.rpc=rpc
        with self.assertRaisesRegex(m.ClosedError,'^ARBITRUM_ORIGINAL_OPERATION_UNCERTAIN$'):
            cluster.send_once('0x01')
        self.assertFalse(cluster.failed);self.assertTrue(cluster.dispatch_uncertain)
        before=len(calls)
        for wire in ('0x01','0x02'):
            with self.assertRaisesRegex(m.ClosedError,'^ARBITRUM_ORIGINAL_UNKNOWN_NO_FRESH_SEND$'):
                cluster.send_once(wire)
        self.assertEqual(len(calls),before);self.assertEqual(calls.count('eth_sendRawTransaction'),1)
        self.assertEqual(cluster.read_original({'method':'eth_getTransactionCount','params':['0x'+'c'*40,'pending']}),'0x1')
        self.assertEqual(cluster.read_original({'method':'eth_gasPrice','params':[]}),'0x3b9aca00')
        tx={'from':'0x'+'c'*40,'to':'0x'+'d'*40,'value':'0x1','data':'0x'+'00'*70,
            'gas':'0x186a0','gasPrice':'0x3b9aca00','nonce':'0x0','chainId':hex(42161),'type':'0x0'}
        self.assertEqual(cluster.read_original({'method':'eth_estimateGas','params':[tx,'latest']}),'0x7530')
        before=len(calls)
        with self.assertRaisesRegex(m.ClosedError,'^ARBITRUM_ORIGINAL_READ_PARAMS$'):
            cluster.read_original({'method':'eth_estimateGas','params':[dict(tx,chainId='0x1'),'latest']})
        self.assertEqual(len(calls),before)


if __name__ == '__main__':
    unittest.main()
