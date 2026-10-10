#!/usr/bin/env python3
"""Fixed official Nitro/Prysm/Geth local constructor; no Anvil or wallet adopter."""
import hashlib
import json
import os
from pathlib import Path
import re
import select
import signal
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request
import uuid

PROFILE = 'OWNED_ARBITRUM_NITRO_POS_V1'
PREPARED_PROFILE = PROFILE
NATIVE_VALUE_PROFILE = 'OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1'
NATIVE_VALUE = False
CHAIN_ID = 412346
COMMIT = '72ac4bb1f07fadc108448ad5fae01ea2e044fe69'
ARCHIVE_SHA = 'bafdf1a22c302424903d88419543f862aba77610ff3194a4fb48d761398eeee4'
CONTRACT_COMMIT = '9d0e90ef588f94a9d2ffa4dc22713d91a76f57d4'
NITRO = 'offchainlabs/nitro-node:v3.11.3-beb2108'
IMAGES = {'geth': 'ethereum/client-go:v1.16.4', 'redis': 'redis:6.2.6',
          'create_beacon_chain_genesis': 'gcr.io/prysmaticlabs/prysm/cmd/prysmctl:v6.1.1',
          'prysm_beacon_chain': 'gcr.io/prysmaticlabs/prysm/beacon-chain:v6.1.1',
          'prysm_validator': 'gcr.io/prysmaticlabs/prysm/validator:v6.1.1',
          'nitro': NITRO}
SERVICES = ('geth', 'redis', 'create_beacon_chain_genesis', 'prysm_beacon_chain',
            'prysm_validator', 'sequencer', 'poster', 'validator', 'validation_node',
            'scripts', 'rollupcreator')
LIVE_SERVICES = frozenset(('geth', 'redis', 'prysm_beacon_chain', 'prysm_validator',
                          'sequencer', 'poster', 'validator', 'validation_node'))
INIT_MS = 600_000
FINALITY_MS = 180_000


class ClosedError(Exception):
    pass


def require(predicate, code):
    if not predicate:
        raise ClosedError(code)


def repository():
    for parent in Path(__file__).resolve().parents:
        path = parent / 'package.json'
        if path.is_file() and (parent / 'scripts/layout.json').is_file():
            if json.loads(path.read_text())['name'] == 'lianum':
                return parent
    raise ClosedError('ARBITRUM_ORIGINAL_REPOSITORY_REQUIRED')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def private_read(path, maximum=8 * 1024 * 1024):
    path = Path(path)
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
            and 0 <= info.st_size <= maximum,
            'ARBITRUM_ORIGINAL_PRIVATE_FILE')
    # Reading may update atime; identity and content metadata must stay exact.
    def identity(value):
        return (value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
                value.st_uid, value.st_gid, value.st_size,
                value.st_mtime_ns, value.st_ctime_ns)
    expected = identity(info)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        require(identity(os.fstat(fd)) == expected, 'ARBITRUM_ORIGINAL_PRIVATE_FILE_CHANGED')
        with os.fdopen(fd, 'rb', closefd=False) as handle:
            data = handle.read(maximum + 1)
        require(len(data) == info.st_size and len(data) <= maximum
                and identity(os.fstat(fd)) == expected
                and identity(path.lstat()) == expected,
                'ARBITRUM_ORIGINAL_PRIVATE_FILE_CHANGED')
        return data
    finally:
        os.close(fd)

def private_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as handle:
            handle.write(data)
            handle.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    require(private_read(path, max(len(data), 1)) == data, 'ARBITRUM_ORIGINAL_WRITE_READBACK')


def data_bytes(value):
    return json.dumps(value, separators=(',', ':'), sort_keys=True).encode()


def directory(path):
    path = Path(path)
    # mkdir(parents=True) applies mode only to the leaf. Retain each new
    # intermediate directory privately; never chmod/adopt an existing parent.
    missing, parent = [], path
    while not parent.exists():
        require(not parent.is_symlink(), 'ARBITRUM_ORIGINAL_DIRECTORY')
        missing.append(parent)
        parent = parent.parent
    ancestor = parent.lstat()
    require(stat.S_ISDIR(ancestor.st_mode) and ancestor.st_uid == os.getuid()
            and parent.resolve() == parent.absolute(), 'ARBITRUM_ORIGINAL_DIRECTORY')
    for child in reversed(missing):
        child.mkdir(mode=0o700, exist_ok=True)
        created = child.lstat()
        require(stat.S_ISDIR(created.st_mode) and created.st_uid == os.getuid()
                and stat.S_IMODE(created.st_mode) == 0o700
                and child.resolve() == child.absolute(), 'ARBITRUM_ORIGINAL_DIRECTORY')
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o700 and path.resolve() == path.absolute(),
            'ARBITRUM_ORIGINAL_DIRECTORY')
    return path


def official_files(archive):
    data = private_read(archive)
    require(digest(data) == ARCHIVE_SHA, 'ARBITRUM_ORIGINAL_ARCHIVE_CHANGED')
    result = {}
    with tarfile.open(archive) as package:
        members = package.getmembers()
        require(len(members) <= 100, 'ARBITRUM_ORIGINAL_ARCHIVE_BOUND')
        for member in members:
            parts = Path(member.name).parts
            require(parts and parts[0] == f'nitro-testnode-{COMMIT}'
                    and '..' not in parts and not member.issym() and not member.islnk(),
                    'ARBITRUM_ORIGINAL_ARCHIVE_PATH')
            if member.isfile():
                require(member.size <= 2 * 1024 * 1024, 'ARBITRUM_ORIGINAL_ARCHIVE_BOUND')
                result['/'.join(parts[1:])] = package.extractfile(member).read()
    return result


def economic_files(files):
    result = dict(files)
    if NATIVE_VALUE:
        name = 'scripts/config.ts'
        source = result[name].decode()
        require(source.count('412346') == 3, 'ARBITRUM_ORIGINAL_ECONOMIC_CONFIG_CHANGED')
        # Exactly the official L2 config ID, node ID and filterer ID. All
        # contracts, keys, forks, settlement and validation settings unchanged.
        result[name] = source.replace('412346', '42161').encode()
    return result


def active_compose(source):
    """Keep original blocks for the exact exercised official services only."""
    require(source.startswith('services:\n'), 'ARBITRUM_ORIGINAL_COMPOSE')
    lines = source.splitlines(keepends=True)
    starts = [(i, re.fullmatch(r'  ([a-zA-Z0-9_-]+):\n', line))
              for i, line in enumerate(lines)]
    starts = [(i, match.group(1)) for i, match in starts if match]
    volumes = next(i for i, line in enumerate(lines) if line == 'volumes:\n')
    result = 'services:\n'
    seen = set()
    for index, (start, name) in enumerate(starts):
        if start >= volumes or name not in SERVICES:
            continue
        end = starts[index + 1][0] if index + 1 < len(starts) else volumes
        end = min(end, volumes)
        seen.add(name)
        result += ''.join(lines[start:end])
    require(seen == set(SERVICES), 'ARBITRUM_ORIGINAL_COMPOSE_SERVICES')
    return result + ''.join(lines[volumes:])


def fixed_launcher(source, project):
    require(re.fullmatch(r'lianum-nitro-[0-9a-f]{32}', project), 'ARBITRUM_ORIGINAL_PROJECT')
    source = source.replace('com.docker.compose.project=nitro-testnode',
                            'com.docker.compose.project=' + project)
    begin = source.index('    echo == Removing old data..\n')
    end = source.index('    echo == Generating l1 keys\n', begin)
    # This is a fresh original namespace, not an adoption or cleanup selector.
    source = source[:begin] + '    echo == Original fresh namespace\n' + source[end:]
    pull = '  docker pull $NITRO_NODE_VERSION\n  docker tag $NITRO_NODE_VERSION nitro-node-dev-testnode\n'
    require(source.count(pull) == 1, 'ARBITRUM_ORIGINAL_LAUNCHER_CHANGED')
    source = source.replace(pull, '  : # Fixed prepared image ID in original compose\n')
    traffic = '    run_script send-l1 --ethamount 0.0001 --from user_l1user --to user_l1user --wait --delay 1000 --times 1000000 > /dev/null &\n'
    require(source.count(traffic) == 1, 'ARBITRUM_ORIGINAL_LAUNCHER_CHANGED')
    source = source.replace(traffic, '    : # No background fixture transaction generator\n')
    require('docker volume prune' not in source and 'docker rm -f' not in source
            and 'docker volume rm -f' not in source, 'ARBITRUM_ORIGINAL_UNSCOPED_CLEANUP')
    return source


def fixed_runtime_compose(original, images, project):
    value = json.loads(json.dumps(original))
    require(re.fullmatch(r'lianum-nitro-[0-9a-f]{32}', project), 'ARBITRUM_ORIGINAL_PROJECT')
    require(set(value['services']) == set(SERVICES), 'ARBITRUM_ORIGINAL_COMPOSE_SERVICES')
    value['name'] = project
    # `compose config` has already expanded these names using its preparation
    # project. Rebind every resource to this new birth before any Docker call.
    for category in ('volumes', 'networks'):
        for name, resource in value.get(category, {}).items():
            require(not resource.get('external', False), 'ARBITRUM_ORIGINAL_EXTERNAL_RESOURCE')
            resource['name'] = project + '_' + name
    for name, service in value['services'].items():
        service.pop('build', None)
        service.pop('pid', None)
        service.pop('container_name', None)
        service['image'] = images[name]
        require(re.fullmatch(r'sha256:[0-9a-f]{64}', service['image']), 'ARBITRUM_ORIGINAL_IMAGE')
        service['ports'] = []
        service['volumes'] = [mount for mount in service.get('volumes', [])
                              if mount.get('source') != '/var/run/docker.sock']
    # Prysm's official generator derives the execution header used in the SSZ
    # state (genesis timestamp and fork times). Publish that SAME generated
    # genesis before the original launcher runs geth init; an input-only file
    # otherwise leaves Geth on a different genesis and forkchoice stays SYNCING.
    genesis = value['services']['create_beacon_chain_genesis']['command']
    require(type(genesis) is list
            and genesis.count('--geth-genesis-json-in=/config/geth_genesis.json') == 1
            and not any(flag.startswith('--geth-genesis-json-out') for flag in genesis),
            'ARBITRUM_ORIGINAL_PAIRED_GENESIS_COMMAND_CHANGED')
    genesis.append('--geth-genesis-json-out=/config/geth_genesis.json')
    geth = value['services']['geth']
    old = geth['command']
    # EngineAPI must be driven by the actual Prysm client, not SimulatedBeacon.
    removed = ['--dev', '--dev.period=1', '--mine',
               '--miner.etherbase=0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E']
    require(all(old.count(flag) == 1 for flag in removed), 'ARBITRUM_ORIGINAL_GETH_COMMAND')
    geth['command'] = [flag for flag in old if flag not in removed]
    for name, target in [('geth', 8545), ('sequencer', 8547), ('prysm_beacon_chain', 3500)]:
        value['services'][name]['ports'] = [{'target': target, 'published': '0',
                                           'host_ip': '127.0.0.1', 'protocol': 'tcp'}]
    return value


def run(command, cwd, log, seconds=30, env=None):
    try:
        result = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE,
                                stderr=log, timeout=seconds, env=env, check=False)
    except subprocess.TimeoutExpired:
        raise ClosedError('ARBITRUM_ORIGINAL_COMMAND_TIMEOUT') from None
    require(result.returncode == 0, 'ARBITRUM_ORIGINAL_COMMAND_FAILED')
    require(len(result.stdout) <= 8 * 1024 * 1024, 'ARBITRUM_ORIGINAL_COMMAND_BOUND')
    return result.stdout


def docker_json(arguments, cwd, log):
    return json.loads(run(['/usr/bin/docker', *arguments], cwd, log))


def fetch(root):
    public = directory(root / '.local/dependencies/arbitrum-nitro-v1/public')
    path = public / f'nitro-testnode-{COMMIT}.tar.gz'
    if not path.exists():
        url = f'https://codeload.github.com/OffchainLabs/nitro-testnode/tar.gz/{COMMIT}'
        with urllib.request.urlopen(url, timeout=30) as response:
            data = response.read(2 * 1024 * 1024 + 1)
        require(len(data) <= 2 * 1024 * 1024 and digest(data) == ARCHIVE_SHA,
                'ARBITRUM_ORIGINAL_ARCHIVE_CHANGED')
        private_write(path, data)
    official_files(path)
    return path


def prepare(root):
    archive = fetch(root)
    base = directory(root / '.local/dependencies/arbitrum-nitro-v1')
    prepared = base / ('prepared-native-value-v1' if NATIVE_VALUE else 'prepared-v1')
    require(not prepared.exists(), 'ARBITRUM_ORIGINAL_PREPARATION_EXISTS')
    work = directory(base / ('.prepare-' + uuid.uuid4().hex))
    files = economic_files(official_files(archive))
    for name, content in files.items():
        target = work / name
        directory(target.parent)
        private_write(target, content)
    os.chmod(work / 'test-node.bash', 0o700)
    compose = active_compose(files['docker-compose.yaml'].decode())
    private_write(work / 'fixed-source.yaml', compose.encode())
    log_path = work / 'prepare.private.log'
    with open(os.open(log_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb') as log:
        original = docker_json(['compose', '-p', 'lianum-nitro-prepare', '-f',
                                str(work / 'fixed-source.yaml'), 'config', '--format', 'json'], work, log)
        images = {}
        for role, reference in IMAGES.items():
            run(['/usr/bin/docker', 'pull', reference], work, log, 600)
            details = docker_json(['image', 'inspect', reference], work, log)
            require(len(details) == 1, 'ARBITRUM_ORIGINAL_IMAGE')
            images[role] = details[0]['Id']
        scripts_tag = 'lianum-nitro-scripts-' + ('native-value-' if NATIVE_VALUE else '') + COMMIT
        creator_tag = 'lianum-nitro-creator-' + CONTRACT_COMMIT
        run(['/usr/bin/docker', 'build', '-t', scripts_tag, str(work / 'scripts')], work, log, 900)
        run(['/usr/bin/docker', 'build', '--build-arg', 'NITRO_CONTRACTS_BRANCH=' + CONTRACT_COMMIT,
             '-t', creator_tag, str(work / 'rollupcreator')], work, log, 900)
        for role, reference in [('scripts', scripts_tag), ('rollupcreator', creator_tag)]:
            images[role] = docker_json(['image', 'inspect', reference], work, log)[0]['Id']
        fixed_images = {name: images[name] if name in images else images['nitro'] for name in SERVICES}
        receipt = {'schema': 'ORIGINAL_ARBITRUM_NITRO_PREPARED_V1', 'profile': PROFILE,
                   'archiveSHA256': ARCHIVE_SHA, 'sourceCommit': COMMIT,
                   'contractsCommit': CONTRACT_COMMIT, 'images': fixed_images,
                   'configurationSHA256': digest(files['scripts/config.ts']),
                   'sourceCompose': original, 'nativeFinalityEstablished': False,
                   'privateCreditEstablished': False}
        private_write(work / 'receipt.json', data_bytes(receipt))
    os.rename(work, prepared)
    require(json.loads(private_read(prepared / 'receipt.json')) == receipt,
            'ARBITRUM_ORIGINAL_PREPARATION_READBACK')
    return {'profile': PROFILE, 'prepared': True, 'imageCount': len(images),
            'nativeFinalityEstablished': False, 'privateCreditEstablished': False}


def process_identity(pid):
    root = Path('/proc') / str(pid)
    fields = (root / 'stat').read_text().rsplit(') ', 1)[1].split()
    return {'pid': pid, 'startTicks': fields[19], 'pgrp': int(fields[2]),
            'session': int(fields[3]), 'uid': root.stat().st_uid}


def rpc(url, method, parameters):
    body = data_bytes({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': parameters})
    request = urllib.request.Request(url, body, {'content-type': 'application/json'})
    with urllib.request.urlopen(request, timeout=5) as response:
        data = response.read(4 * 1024 * 1024 + 1)
    require(len(data) <= 4 * 1024 * 1024, 'ARBITRUM_ORIGINAL_RPC_BOUND')
    value = json.loads(data)
    if (method == 'eth_getBlockByNumber' and parameters == ['finalized', False]
            and value.get('jsonrpc') == '2.0' and value.get('id') == 1
            and 'result' not in value and value.get('error') == {
                'code': -32000, 'message': 'finalized block not found'}):
        return None  # Actual Geth not-yet-finalized, never an accepted head.
    require(value.get('jsonrpc') == '2.0' and value.get('id') == 1
            and 'error' not in value and 'result' in value, 'ARBITRUM_ORIGINAL_RPC_REJECTED')
    return value['result']


def header(value):
    require(isinstance(value, dict) and re.fullmatch(r'0x[0-9a-fA-F]{64}', value.get('hash', ''))
            and re.fullmatch(r'0x[0-9a-f]+', value.get('number', '')),
            'ARBITRUM_ORIGINAL_HEADER_REQUIRED')
    return {'number': value['number'], 'hash': value['hash'].lower()}


def finalized_pair(l1, l2):
    # Nitro's finalized tag follows this node's parent-chain reader. Full rollup
    # assertion/challenge finality is a distinct requirement, never inferred here.
    parent = header(rpc(l1, 'eth_getBlockByNumber', ['finalized', False]))
    child = header(rpc(l2, 'eth_getBlockByNumber', ['finalized', False]))
    require(int(parent['number'], 16) > 0 and int(child['number'], 16) > 0,
            'ARBITRUM_ORIGINAL_FINALITY_PENDING')
    require(header(rpc(l1, 'eth_getBlockByNumber', [parent['number'], False])) == parent
            and header(rpc(l2, 'eth_getBlockByNumber', [child['number'], False])) == child,
            'ARBITRUM_ORIGINAL_CANONICAL_CHANGED')
    return {'profile': PROFILE, 'parentFinalized': parent, 'childFinalized': child,
            'scope': 'owned-local-nitro-parent-finality', 'rollupChallengeFinalityEstablished': False,
            'independentOperators': False, 'privateCreditEstablished': False}


class OriginalCluster:
    def __init__(self, root):
        self.root, self.closed, self.failed = root, False, False
        self.admitted, self.containers = set(), {}
        self.project = 'lianum-nitro-' + uuid.uuid4().hex
        self.realm = directory(root / '.local/owned-arbitrum-nitro-v1' / self.project)
        self.log = open(os.open(self.realm / 'native.private.log',
                                os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb')
        prepared = root / '.local/dependencies/arbitrum-nitro-v1' / ('prepared-native-value-v1' if NATIVE_VALUE else 'prepared-v1')
        self.receipt = json.loads(private_read(prepared / 'receipt.json'))
        require(self.receipt['schema'] == 'ORIGINAL_ARBITRUM_NITRO_PREPARED_V1'
                and self.receipt['profile'] == PROFILE
                and self.receipt['archiveSHA256'] == ARCHIVE_SHA
                and self.receipt['sourceCommit'] == COMMIT
                and self.receipt['contractsCommit'] == CONTRACT_COMMIT,
                'ARBITRUM_ORIGINAL_PREPARATION_CHANGED')
        for image in set(self.receipt['images'].values()):
            require(docker_json(['image', 'inspect', image], self.realm, self.log)[0]['Id'] == image,
                    'ARBITRUM_ORIGINAL_IMAGE_CHANGED')
        for name, reference in IMAGES.items():
            actual = docker_json(['image', 'inspect', reference], self.realm, self.log)[0]['Id']
            expected = self.receipt['images']['sequencer' if name == 'nitro' else name]
            require(actual == expected, 'ARBITRUM_ORIGINAL_IMAGE_CHANGED')
        for name, reference in [('scripts', 'lianum-nitro-scripts-' + ('native-value-' if NATIVE_VALUE else '') + COMMIT),
                                ('rollupcreator', 'lianum-nitro-creator-' + CONTRACT_COMMIT)]:
            require(docker_json(['image', 'inspect', reference], self.realm, self.log)[0]['Id']
                    == self.receipt['images'][name], 'ARBITRUM_ORIGINAL_IMAGE_CHANGED')
        files = economic_files(official_files(fetch(root)))
        for name, content in files.items():
            target = self.realm / name
            directory(target.parent)
            private_write(target, content)
        if NATIVE_VALUE or 'configurationSHA256' in self.receipt:
            require(self.receipt.get('configurationSHA256') == digest(files['scripts/config.ts']),
                    'ARBITRUM_ORIGINAL_CONFIG_CHANGED')
        launcher = fixed_launcher(files['test-node.bash'].decode(), self.project)
        private_write(self.realm / 'fixed-launcher.bash', launcher.encode())
        # Derive commands, mounts and dependencies again from the physically
        # pinned upstream material. Prepared JSON metadata is not an adopter.
        private_write(self.realm / 'fixed-source.yaml', active_compose(files['docker-compose.yaml'].decode()).encode())
        original = docker_json(['compose', '-p', self.project, '-f', str(self.realm / 'fixed-source.yaml'),
                                'config', '--format', 'json'], self.realm, self.log)
        fixed = fixed_runtime_compose(original, self.receipt['images'], self.project)
        private_write(self.realm / 'fixed-compose.json', data_bytes(fixed))
        self.env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8',
                    'COMPOSE_PROJECT_NAME': self.project,
                    'COMPOSE_FILE': str(self.realm / 'fixed-compose.json'),
                    'NITRO_CONTRACTS_BRANCH': CONTRACT_COMMIT, 'NITRO_NODE_VERSION': NITRO}
        require(not self.ids(), 'ARBITRUM_ORIGINAL_NAMESPACE_NOT_EMPTY')
        self.launch = subprocess.Popen(['/bin/bash', 'fixed-launcher.bash', '--init-force', '--pos',
            '--validate', '--detach', '--no-l2-traffic', '--no-l3-traffic', '--no-build', '--no-build-utils',
            '--no-build-dev-nitro'], cwd=self.realm, env=self.env, stdout=self.log, stderr=self.log,
            start_new_session=True)
        self.launch_identity = process_identity(self.launch.pid)
        try:
            deadline = time.monotonic() + INIT_MS / 1000
            while self.launch.poll() is None:
                self.enroll()
                require(time.monotonic() < deadline, 'ARBITRUM_ORIGINAL_BIRTH_TIMEOUT')
                time.sleep(.2)
            require(self.launch.returncode == 0, 'ARBITRUM_ORIGINAL_INITIALIZATION_FAILED')
            self.enroll()
            require({item['service'] for item in self.containers.values()
                     if item['running']} == LIVE_SERVICES, 'ARBITRUM_ORIGINAL_NATIVE_MEMBERSHIP')
            self.l1 = self.endpoint('geth', '8545/tcp')
            self.l2 = self.endpoint('sequencer', '8547/tcp')
            require(rpc(self.l1, 'eth_chainId', []) == '0x539'
                    and rpc(self.l2, 'eth_chainId', []) == hex(CHAIN_ID), 'ARBITRUM_ORIGINAL_CHAIN_CHANGED')
            self.l1_genesis = header(rpc(self.l1, 'eth_getBlockByNumber', ['0x0', False]))
            self.l2_genesis = header(rpc(self.l2, 'eth_getBlockByNumber', ['0x0', False]))
            deadline = time.monotonic() + FINALITY_MS / 1000
            while True:
                self.healthy()
                try:
                    self.finalized = finalized_pair(self.l1, self.l2)
                    break
                except ClosedError as error:
                    require(str(error) in ('ARBITRUM_ORIGINAL_HEADER_REQUIRED',
                            'ARBITRUM_ORIGINAL_FINALITY_PENDING'), str(error))
                    require(time.monotonic() < deadline, 'ARBITRUM_ORIGINAL_FINALITY_STARTUP_TIMEOUT')
                    time.sleep(.5)
        except BaseException:
            self.failed = True
            self.close()
            raise

    def ids(self):
        result = run(['/usr/bin/docker', 'container', 'ls', '-aq', '--filter',
                      'label=com.docker.compose.project=' + self.project, '--filter',
                      'label=com.docker.compose.oneoff=False'], self.realm, self.log).decode().split()
        require(len(result) <= 32 and all(re.fullmatch(r'[0-9a-f]{12,64}', item) for item in result),
                'ARBITRUM_ORIGINAL_CONTAINER_BOUND')
        return result

    def inspect(self, identifier):
        item = docker_json(['container', 'inspect', identifier], self.realm, self.log)[0]
        labels = item['Config']['Labels']
        service = labels['com.docker.compose.service']
        require(labels['com.docker.compose.project'] == self.project and service in SERVICES
                and item['Image'] == self.receipt['images'][service], 'ARBITRUM_ORIGINAL_CONTAINER_CHANGED')
        return {'id': item['Id'], 'service': service, 'image': item['Image'],
                'created': item['Created'], 'running': item['State']['Running'],
                'pid': item['State']['Pid'], 'ports': item['NetworkSettings']['Ports'],
                'oneoff': labels.get('com.docker.compose.oneoff', '').lower() == 'true'}

    def enroll(self):
        changed = False
        for identifier in self.ids():
            item = self.inspect(identifier)
            if item['oneoff']:
                continue
            previous = self.containers.get(item['id'])
            if previous:
                require(all(previous[key] == item[key] for key in ('id', 'service', 'image', 'created')),
                        'ARBITRUM_ORIGINAL_CONTAINER_CHANGED')
                birth = previous.get('process')
                if birth and item['running']:
                    require(item['pid'] == birth['pid'] and process_identity(item['pid']) == birth,
                            'ARBITRUM_ORIGINAL_NATIVE_CHANGED')
            else:
                birth = None
            if not birth and item['service'] in LIVE_SERVICES and item['running'] and item['pid'] > 0:
                birth = process_identity(item['pid'])
                changed = True
            item['process'] = birth
            self.containers[item['id']] = item
        if changed:
            print(json.dumps({'ownedBirth': True, 'profile': PROFILE, 'project': self.project,
                'originalParent': process_identity(os.getppid()),
                'originalBackend': process_identity(os.getpid()),
                'originalContainers': [{**{key: row[key] for key in ('id', 'service', 'image', 'created')},
                    'pid': row['process']['pid'], 'process': row['process']}
                    for row in self.containers.values() if row.get('process')]}), flush=True)

    def endpoint(self, service, port):
        rows = [item for item in self.containers.values() if item['service'] == service and item['running']]
        require(len(rows) == 1, 'ARBITRUM_ORIGINAL_NATIVE_MEMBERSHIP')
        value = rows[0]['ports'][port]
        require(len(value) == 1 and value[0]['HostIp'] == '127.0.0.1'
                and re.fullmatch(r'[1-9][0-9]{1,4}', value[0]['HostPort']), 'ARBITRUM_ORIGINAL_RPC_ORIGIN')
        return 'http://127.0.0.1:' + value[0]['HostPort']

    def healthy(self):
        require(not self.closed and not self.failed, 'ARBITRUM_ORIGINAL_RUNTIME_UNAVAILABLE')
        for previous in self.containers.values():
            if previous['service'] not in LIVE_SERVICES or not previous['running']:
                continue
            current = self.inspect(previous['id'])
            require(previous.get('process') and current['running']
                    and process_identity(current['pid']) == previous['process']
                    and all(previous[key] == current[key] for key in ('id', 'service', 'image', 'created', 'pid')),
                    'ARBITRUM_ORIGINAL_NATIVE_CHANGED')

    def head(self):
        self.healthy()
        require(header(rpc(self.l1, 'eth_getBlockByNumber', ['0x0', False])) == self.l1_genesis
                and header(rpc(self.l2, 'eth_getBlockByNumber', ['0x0', False])) == self.l2_genesis,
                'ARBITRUM_ORIGINAL_GENESIS_CHANGED')
        value = finalized_pair(self.l1, self.l2)
        self.healthy()
        return value

    def read_original(self, raw):
        require(NATIVE_VALUE, 'ARBITRUM_ORIGINAL_ECONOMIC_PROFILE_REQUIRED')
        require(type(raw) is dict and set(raw) == {'method', 'params'}
                and type(raw['params']) is list and len(data_bytes(raw)) <= 16384,
                'ARBITRUM_ORIGINAL_READ_REQUEST')
        method, params = raw['method'], raw['params']
        require(method in ('eth_chainId', 'eth_getBlockByNumber', 'eth_getBlockByHash',
                'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBalance',
                'eth_getCode', 'debug_traceTransaction', 'eth_getTransactionCount',
                'eth_gasPrice', 'eth_estimateGas'), 'ARBITRUM_ORIGINAL_READ_METHOD')
        require((method in ('eth_chainId', 'eth_gasPrice') and params == [])
                or (method == 'eth_getTransactionCount' and len(params) == 2
                    and type(params[0]) is str and re.fullmatch(r'0x[0-9a-f]{40}', params[0])
                    and params[1] in ('latest', 'pending'))
                or (method == 'eth_estimateGas' and len(params) == 2
                    and type(params[0]) is dict and set(params[0]) == {'from','to','value','data','gas','gasPrice','nonce','chainId','type'}
                    and all(type(params[0][key]) is str and re.fullmatch(r'0x[0-9a-f]{40}',params[0][key]) for key in ('from','to'))
                    and type(params[0]['data']) is str and re.fullmatch(r'0x(?:[0-9a-f]{2}){70}',params[0]['data'])
                    and all(type(params[0][key]) is str and re.fullmatch(r'0x(?:0|[1-9a-f][0-9a-f]{0,63})',params[0][key]) for key in ('value','gas','gasPrice','nonce'))
                    and params[0]['chainId'] == hex(CHAIN_ID) and params[0]['type'] == '0x0'
                    and type(params[1]) is str and (params[1] == 'latest' or re.fullmatch(r'0x(?:0|[1-9a-f][0-9a-f]{0,63})',params[1])))
                or (method in ('eth_getTransactionByHash', 'eth_getTransactionReceipt') and len(params) == 1
                    and type(params[0]) is str and re.fullmatch(r'0x[0-9a-f]{64}', params[0]))
                or (method in ('eth_getBlockByNumber', 'eth_getBlockByHash') and len(params) == 2
                    and params[1] is False and type(params[0]) is str
                    and (params[0] in ('latest', 'safe', 'finalized', '0x0')
                         or re.fullmatch(r'0x[0-9a-f]{1,64}', params[0])))
                or (method in ('eth_getBalance', 'eth_getCode') and len(params) == 2
                    and type(params[0]) is str and re.fullmatch(r'0x[0-9a-f]{40}', params[0])
                    and ((type(params[1]) is str and (params[1] in ('latest', 'safe', 'finalized', '0x0')
                          or re.fullmatch(r'0x[0-9a-f]{1,64}', params[1])))
                         or (type(params[1]) is dict and set(params[1]) == {'blockHash', 'requireCanonical'}
                             and params[1]['requireCanonical'] is True
                             and type(params[1]['blockHash']) is str
                             and re.fullmatch(r'0x[0-9a-f]{64}', params[1]['blockHash']))))
                or (method == 'debug_traceTransaction' and len(params) == 2
                    and type(params[0]) is str and re.fullmatch(r'0x[0-9a-f]{64}', params[0])
                    and params[1] in [{'tracer':'callTracer','timeout':'5s','reexec':128,
                                      'tracerConfig':{'onlyTopCall':True,'withLog':False}},
                                     {'tracer':'prestateTracer','timeout':'5s','reexec':128,
                                      'tracerConfig':{'diffMode':False,'disableCode':False,'disableStorage':True}}]),
                'ARBITRUM_ORIGINAL_READ_PARAMS')
        self.healthy()
        require(rpc(self.l2, 'eth_chainId', []) == hex(CHAIN_ID)
                and header(rpc(self.l2, 'eth_getBlockByNumber', ['0x0', False])) == self.l2_genesis,
                'ARBITRUM_ORIGINAL_READ_NETWORK_CHANGED')
        value = rpc(self.l2, method, params)
        self.healthy()
        require(header(rpc(self.l2, 'eth_getBlockByNumber', ['0x0', False])) == self.l2_genesis,
                'ARBITRUM_ORIGINAL_READ_NETWORK_CHANGED')
        return value

    def source_identity(self):
        require(NATIVE_VALUE, 'ARBITRUM_ORIGINAL_ECONOMIC_PROFILE_REQUIRED')
        self.healthy()
        value = {'profile':PROFILE,'chainId':str(CHAIN_ID),'genesis':self.l2_genesis['hash'][2:],
                 'parentGenesis':self.l1_genesis['hash'][2:],'sourceCommit':COMMIT,
                 'publicNetwork':False,'independentInfrastructureEstablished':False,
                 'rollupChallengeFinalityEstablished':False}
        self.healthy()
        return value

    def send_once(self, wire):
        self.healthy()
        require(not getattr(self, 'dispatch_uncertain', False), 'ARBITRUM_ORIGINAL_UNKNOWN_NO_FRESH_SEND')
        require(isinstance(wire, str) and re.fullmatch(r'0x(?:[0-9a-f]{2}){1,65536}', wire),
                'ARBITRUM_ORIGINAL_SIGNED_WIRE')
        key = digest(wire.encode())
        require(key not in self.admitted, 'ARBITRUM_ORIGINAL_ALREADY_ADMITTED')
        self.admitted.add(key)  # Burn admission before any native RPC; never retry.
        try:
            expected = rpc(self.l2, 'web3_sha3', [wire])
            require(re.fullmatch(r'0x[0-9a-f]{64}', expected), 'ARBITRUM_ORIGINAL_WIRE_HASH')
            returned = rpc(self.l2, 'eth_sendRawTransaction', [wire])
            require(returned == expected, 'ARBITRUM_ORIGINAL_WIRE_HASH')
            self.healthy()
            return {'profile': PROFILE, 'transactionHash': returned, 'admittedOnce': True,
                    'privateCreditEstablished': False}
        except BaseException:
            if NATIVE_VALUE:
                # Original reads remain available, but no wire can be admitted
                # again after an unknown native RPC result. No automatic retry.
                self.dispatch_uncertain = True
            else:
                self.failed = True
            raise ClosedError('ARBITRUM_ORIGINAL_OPERATION_UNCERTAIN') from None

    def close(self):
        if self.closed:
            return
        self.closed = True
        error = None
        if hasattr(self, 'launch') and self.launch.poll() is None:
            require(process_identity(self.launch.pid) == self.launch_identity,
                    'ARBITRUM_ORIGINAL_LAUNCHER_CHANGED')
            require(self.launch_identity['pgrp'] == self.launch.pid
                    and self.launch_identity['session'] == self.launch.pid,
                    'ARBITRUM_ORIGINAL_LAUNCHER_GROUP')
            os.killpg(self.launch.pid, signal.SIGTERM)
            try:
                self.launch.wait(timeout=5)
            except subprocess.TimeoutExpired:
                require(process_identity(self.launch.pid) == self.launch_identity,
                        'ARBITRUM_ORIGINAL_LAUNCHER_CHANGED')
                os.killpg(self.launch.pid, signal.SIGKILL)
                self.launch.wait(timeout=5)
        try:
            current_ids = self.ids()
            endings = []
            for identifier in current_ids:
                try:
                    current = self.inspect(identifier)
                    previous = self.containers.get(current['id'])
                    require(previous is not None, 'ARBITRUM_ORIGINAL_UNRETAINED_CONTAINER')
                    require(all(previous[key] == current[key] for key in ('id', 'service', 'image', 'created')),
                            'ARBITRUM_ORIGINAL_CONTAINER_CHANGED')
                    if current['running'] and previous.get('process'):
                        require(process_identity(current['pid']) == previous['process'],
                                'ARBITRUM_ORIGINAL_NATIVE_CHANGED')
                    elif current['running']:
                        # This ID was retained while Docker was creating it;
                        # enroll its first real process before the first stop.
                        previous['process'] = process_identity(current['pid'])
                    endings.append(current)
                except BaseException as caught:
                    error = error or caught
            running = [item['id'] for item in endings if item['running']]
            if running:
                run(['/usr/bin/docker', 'container', 'stop', '--time', '10', *running],
                    self.realm, self.log, 25)
            for previous in endings:
                try:
                    current = self.inspect(previous['id'])
                    require(all(previous[key] == current[key] for key in ('id', 'service', 'image', 'created'))
                            and not current['running'], 'ARBITRUM_ORIGINAL_CLOSE_UNCONFIRMED')
                except BaseException as caught:
                    error = error or caught
            if error:
                raise error
        finally:
            self.log.close()


def serve(root):
    runtime = OriginalCluster(root)
    print(json.dumps({'ready': True, 'profile': PROFILE, 'finality': runtime.finalized,
                      'originalParent': process_identity(os.getppid()),
                      'originalBackend': process_identity(os.getpid()),
                      'containerCount': len(runtime.containers), 'project': runtime.project}), flush=True)
    try:
        for line in sys.stdin:
            require(len(line) <= 262144, 'ARBITRUM_ORIGINAL_REQUEST_BOUND')
            value = json.loads(line)
            require(set(value) == {'id', 'operation', 'input'} and type(value['id']) is int
                    and value['id'] > 0, 'ARBITRUM_ORIGINAL_REQUEST')
            operation = value['operation']
            try:
                if operation == 'head':
                    require(value['input'] is None, 'ARBITRUM_NO_OPTIONS')
                    result = runtime.head()
                elif operation == 'read':
                    result = runtime.read_original(value['input'])
                elif operation == 'identity':
                    require(value['input'] is None, 'ARBITRUM_NO_OPTIONS')
                    result = runtime.source_identity()
                elif operation == 'broadcast':
                    result = runtime.send_once(value['input'])
                else:
                    raise ClosedError('ARBITRUM_ORIGINAL_OPERATION')
                print(json.dumps({'id': value['id'], 'result': result}), flush=True)
            except ClosedError as error:
                print(json.dumps({'id': value['id'], 'error': str(error)}), flush=True)
    finally:
        runtime.close()


def main():
    def interrupted(_signal, _frame):
        raise ClosedError('ARBITRUM_ORIGINAL_CONTROLLED_SHUTDOWN')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    global PROFILE, NATIVE_VALUE, CHAIN_ID
    if sys.argv[1:] in (['--native-value'], ['--prepare-native-value']):
        PROFILE, NATIVE_VALUE, CHAIN_ID = NATIVE_VALUE_PROFILE, True, 42161
        if sys.argv[1:] == ['--native-value']:
            serve(repository())
        else:
            print(json.dumps(prepare(repository())))
        return
    root = repository()
    if sys.argv[1:] == ['--fetch']:
        fetch(root)
        print(json.dumps({'profile': PROFILE, 'publicMaterialVerified': True}))
    elif sys.argv[1:] == ['--prepare']:
        print(json.dumps(prepare(root)))
    elif not sys.argv[1:]:
        serve(root)
    else:
        raise ClosedError('ARBITRUM_NO_OPTIONS')


if __name__ == '__main__':
    try:
        main()
    except ClosedError as error:
        print(json.dumps({'error': str(error)}), flush=True)
        sys.exit(1)
    except BaseException:
        print(json.dumps({'error': 'ARBITRUM_ORIGINAL_OPERATION_FAILED'}), flush=True)
        sys.exit(1)
