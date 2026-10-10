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


class OriginalNitroNamespaceTest(unittest.TestCase):
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
        self.assertIn('docker compose up --wait prysm_validator', launcher)
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


if __name__ == '__main__':
    unittest.main()
