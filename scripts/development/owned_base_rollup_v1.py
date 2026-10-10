#!/usr/bin/env python3
"""Original Base unified client over its own Reth/Lighthouse PoS parent."""
import hashlib
import ipaddress
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

PROFILE = 'OWNED_BASE_NATIVE_ROLLUP_POS_V1'
PREPARED_PROFILE = PROFILE
NATIVE_VALUE_PROFILE = 'OWNED_BASE_NATIVE_VALUE_ROLLUP_POS_V1'
NATIVE_VALUE = False
CHAIN_ID = 84538453
COMMIT = '5034ef80bc90261ff6c4841fdf4baed34283abad'
ARCHIVE_SHA = '354a94ce7c2d8e0293288b39cfe0de867b538a638441f2eb5715ab16d15a595c'
SLOT_SECONDS = 2  # Official generator override fixed before this new birth.
IMAGES = {'l1-el': 'ghcr.io/paradigmxyz/reth:v2.5.2',
          'l1-cl': 'sigp/lighthouse:v8.2.2', 'base': 'ghcr.io/base/node:v1.4.2'}
SERVICES = ('setup-devnet', 'l1-el', 'l1-cl', 'l1-vc', 'base-bootnode',
            'base-builder', 'base-client', 'base-rpc', 'op-batcher')
LIVE_SERVICES = frozenset(SERVICES[1:])
INIT_MS = 600_000
FINALITY_MS = 240_000


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
    raise ClosedError('BASE_ORIGINAL_REPOSITORY_REQUIRED')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def private_read(path, maximum=8 * 1024 * 1024):
    path = Path(path)
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
            and 0 <= info.st_size <= maximum,
            'BASE_ORIGINAL_PRIVATE_FILE')
    # Reading may update atime; identity and content metadata must stay exact.
    def identity(value):
        return (value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
                value.st_uid, value.st_gid, value.st_size,
                value.st_mtime_ns, value.st_ctime_ns)
    expected = identity(info)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        require(identity(os.fstat(fd)) == expected, 'BASE_ORIGINAL_PRIVATE_FILE_CHANGED')
        with os.fdopen(fd, 'rb', closefd=False) as handle:
            data = handle.read(maximum + 1)
        require(len(data) == info.st_size and len(data) <= maximum
                and identity(os.fstat(fd)) == expected
                and identity(path.lstat()) == expected,
                'BASE_ORIGINAL_PRIVATE_FILE_CHANGED')
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
    require(private_read(path, max(len(data), 1)) == data, 'BASE_ORIGINAL_WRITE_READBACK')


def data_bytes(value):
    return json.dumps(value, separators=(',', ':'), sort_keys=True).encode()


def directory(path):
    path = Path(path)
    # mkdir(parents=True) applies mode only to the leaf. Retain each new
    # intermediate directory privately; never chmod/adopt an existing parent.
    missing, parent = [], path
    while not parent.exists():
        require(not parent.is_symlink(), 'BASE_ORIGINAL_DIRECTORY')
        missing.append(parent)
        parent = parent.parent
    ancestor = parent.lstat()
    require(stat.S_ISDIR(ancestor.st_mode) and ancestor.st_uid == os.getuid()
            and parent.resolve() == parent.absolute(), 'BASE_ORIGINAL_DIRECTORY')
    for child in reversed(missing):
        child.mkdir(mode=0o700, exist_ok=True)
        created = child.lstat()
        require(stat.S_ISDIR(created.st_mode) and created.st_uid == os.getuid()
                and stat.S_IMODE(created.st_mode) == 0o700
                and child.resolve() == child.absolute(), 'BASE_ORIGINAL_DIRECTORY')
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o700 and path.resolve() == path.absolute(),
            'BASE_ORIGINAL_DIRECTORY')
    return path


def official_files(archive):
    data = private_read(archive, 16 * 1024 * 1024)
    require(digest(data) == ARCHIVE_SHA, 'BASE_ORIGINAL_ARCHIVE_CHANGED')
    result = {}
    selected = {'etc/docker/docker-compose.yml', 'etc/docker/devnet-env',
                'etc/docker/Dockerfile.devnet', 'etc/docker/Dockerfile.op-batcher'}
    with tarfile.open(archive) as package:
        members = package.getmembers()
        require(len(members) <= 30_000, 'BASE_ORIGINAL_ARCHIVE_BOUND')
        for member in members:
            parts = Path(member.name).parts
            require(parts and parts[0] == f'base-{COMMIT}' and '..' not in parts,
                    'BASE_ORIGINAL_ARCHIVE_PATH')
            name = '/'.join(parts[1:])
            if name in selected or name.startswith('etc/scripts/devnet/'):
                require(not member.issym() and not member.islnk(), 'BASE_ORIGINAL_ARCHIVE_PATH')
                if member.isfile():
                    require(member.size <= 2 * 1024 * 1024, 'BASE_ORIGINAL_ARCHIVE_BOUND')
                    result[name] = package.extractfile(member).read()
    require(selected.issubset(result), 'BASE_ORIGINAL_SOURCE_REQUIRED')
    return result


def active_compose(source):
    lines = source.splitlines(keepends=True)
    services = lines.index('services:\n')
    networks = lines.index('networks:\n')
    starts = [(i, re.fullmatch(r'  ([a-zA-Z0-9_-]+):\n', line))
              for i, line in enumerate(lines[services + 1:networks], services + 1)]
    starts = [(i, match.group(1)) for i, match in starts if match]
    result, seen = ''.join(lines[:services + 1]), set()
    for offset, (i, name) in enumerate(starts):
        end = starts[offset + 1][0] if offset + 1 < len(starts) else networks
        if name in SERVICES:
            seen.add(name)
            result += ''.join(line.replace('    env_file: devnet-env', '    env_file: fixed-env')
                              for line in lines[i:end] if not line.startswith('    container_name:'))
    require(seen == set(SERVICES), 'BASE_ORIGINAL_COMPOSE_SERVICES')
    return result + ''.join(lines[networks:])


def infrastructure_env(source, subnet_octet):
    require(type(subnet_octet) is int and 16 <= subnet_octet <= 239,
            'BASE_ORIGINAL_SUBNET')
    # Only the official advertised Docker addresses change. No chain, key,
    # fork, batcher or native confirmation term is derived from this value.
    value = source.replace('172.30.0.', f'172.28.{subnet_octet}.')
    require('L1_SLOT_DURATION_OVERRIDE=' not in value, 'BASE_ORIGINAL_SLOT_SOURCE_CHANGED')
    if NATIVE_VALUE:
        require(value.count('L2_CHAIN_ID=84538453') == 1, 'BASE_ORIGINAL_CHAIN_SOURCE_CHANGED')
        value = value.replace('L2_CHAIN_ID=84538453', 'L2_CHAIN_ID=8453')
    return value + f'\nL1_SLOT_DURATION_OVERRIDE={SLOT_SECONDS}\n'


def fixed_runtime_compose(original, images, project, realm):
    value = json.loads(json.dumps(original))
    require(re.fullmatch(r'lianum-base-[0-9a-f]{32}', project), 'BASE_ORIGINAL_PROJECT')
    require(set(value['services']) == set(SERVICES), 'BASE_ORIGINAL_COMPOSE_SERVICES')
    value['name'] = project
    require(set(value.get('networks', {})) == {'default'}, 'BASE_ORIGINAL_PRIVATE_NETWORK_REQUIRED')
    network = value['networks']['default']
    require(network.get('driver') in (None, 'bridge') and not network.get('external', False),
            'BASE_ORIGINAL_PRIVATE_NETWORK_REQUIRED')
    # The official client adds public Base bootnodes for chain8453 even when
    # local bootnodes are supplied. Keep the SAME local peers inside their own
    # bridge before CREATE; host-only RPC ports and consensus checks stay exact.
    network['driver'], network['internal'] = 'bridge', True
    for category in ('volumes', 'networks'):
        for name, resource in value.get(category, {}).items():
            require(not resource.get('external', False), 'BASE_ORIGINAL_EXTERNAL_RESOURCE')
            resource['name'] = project + '_' + name
    for name, service in value['services'].items():
        require('network_mode' not in service and set(service.get('networks', {'default': {}})) == {'default'},
                'BASE_ORIGINAL_PRIVATE_NETWORK_REQUIRED')
        service.pop('build', None)
        service.pop('pid', None)
        service.pop('container_name', None)
        service['image'] = images[name]
        require(re.fullmatch(r'sha256:[0-9a-f]{64}', service['image']), 'BASE_ORIGINAL_IMAGE')
        service['restart'] = 'no'
        service['ports'] = []
        for mount in service.get('volumes', []):
            require(mount['type'] == 'bind' and Path(mount['source']).is_relative_to(realm)
                    and Path(mount['source']).resolve().is_relative_to(realm),
                    'BASE_ORIGINAL_FOREIGN_MOUNT')
            require(mount.get('target') != '/var/run/docker.sock', 'BASE_ORIGINAL_FOREIGN_MOUNT')
    for name, target in [('l1-el', 4545), ('l1-cl', 4052),
                         ('base-builder', 7545), ('base-rpc', 8645)]:
        value['services'][name]['ports'] = [{'target': target, 'published': '0',
                                           'host_ip': '127.0.0.1', 'protocol': 'tcp'}]
    return value


def original_private_network(item, project):
    require(isinstance(item, dict) and re.fullmatch(r'[0-9a-f]{64}', item.get('Id', ''))
            and item.get('Name') == project + '_default' and item.get('Driver') == 'bridge'
            and item.get('Internal') is True and item.get('Scope') == 'local'
            and item.get('Labels', {}).get('com.docker.compose.project') == project
            and item.get('Labels', {}).get('com.docker.compose.network') == 'default',
            'BASE_ORIGINAL_PRIVATE_NETWORK_CHANGED')
    return item['Id']


def original_network_subnets(item):
    require(isinstance(item, dict) and isinstance(item.get('IPAM'), dict),
            'BASE_ORIGINAL_NETWORK_INSPECTION')
    rows = item['IPAM'].get('Config')
    if rows is None:
        require(item.get('Driver') in ('host', 'null'),
                'BASE_ORIGINAL_NETWORK_INSPECTION')
        return []
    require(isinstance(rows, list) and len(rows) <= 64
            and all(isinstance(row, dict) for row in rows),
            'BASE_ORIGINAL_NETWORK_INSPECTION')
    try:
        return [ipaddress.ip_network(row['Subnet'], strict=False)
                for row in rows if row.get('Subnet')]
    except (ValueError, TypeError):
        raise ClosedError('BASE_ORIGINAL_NETWORK_INSPECTION') from None


def run(command, cwd, log, seconds=30, env=None):
    try:
        result = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE,
                                stderr=log, timeout=seconds, env=env, check=False)
    except subprocess.TimeoutExpired:
        raise ClosedError('BASE_ORIGINAL_COMMAND_TIMEOUT') from None
    require(result.returncode == 0, 'BASE_ORIGINAL_COMMAND_FAILED')
    require(len(result.stdout) <= 8 * 1024 * 1024, 'BASE_ORIGINAL_COMMAND_BOUND')
    return result.stdout


def docker_json(arguments, cwd, log):
    return json.loads(run(['/usr/bin/docker', *arguments], cwd, log))


def fetch(root):
    public = directory(root / '.local/dependencies/base-original-v1/public')
    path = public / f'base-{COMMIT}.tar.gz'
    if not path.exists():
        with urllib.request.urlopen(f'https://codeload.github.com/base/base/tar.gz/{COMMIT}', timeout=30) as response:
            data = response.read(16 * 1024 * 1024 + 1)
        require(len(data) <= 16 * 1024 * 1024 and digest(data) == ARCHIVE_SHA,
                'BASE_ORIGINAL_ARCHIVE_CHANGED')
        private_write(path, data)
    official_files(path)
    return path


def materialize(target, files, subnet_octet):
    for name, content in files.items():
        path = target / name
        directory(path.parent)
        private_write(path, content)
    compose = target / 'etc/docker/fixed-source.yml'
    private_write(compose, active_compose(files['etc/docker/docker-compose.yml'].decode()).encode())
    env = target / 'etc/docker/fixed-env'
    private_write(env, infrastructure_env(files['etc/docker/devnet-env'].decode(), subnet_octet).encode())
    return compose, env


def prepare(root):
    archive = fetch(root)
    base = directory(root / '.local/dependencies/base-original-v1')
    prepared = base / 'prepared-v1'
    require(not prepared.exists(), 'BASE_ORIGINAL_PREPARATION_EXISTS')
    work = directory(base / ('.prepare-' + uuid.uuid4().hex))
    files = official_files(archive)
    materialize(work, files, 16)
    with open(os.open(work / 'prepare.private.log', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb') as log:
        images = {}
        for name, reference in IMAGES.items():
            run(['/usr/bin/docker', 'pull', reference], work, log, 600)
            image = docker_json(['image', 'inspect', reference], work, log)[0]
            require(re.fullmatch(r'sha256:[0-9a-f]{64}', image['Id']), 'BASE_ORIGINAL_IMAGE')
            if name == 'base':
                require(image['Config'].get('Labels', {}).get('org.opencontainers.image.revision') == COMMIT,
                        'BASE_ORIGINAL_RELEASE_REVISION_CHANGED')
            images[name] = image['Id']
        for role, dockerfile in [('setup-devnet', 'Dockerfile.devnet'), ('op-batcher', 'Dockerfile.op-batcher')]:
            tag = 'lianum-base-' + role + '-' + COMMIT
            run(['/usr/bin/docker', 'build', '-f', str(work / 'etc/docker' / dockerfile), '-t', tag, str(work)],
                work, log, 900)
            images[role] = docker_json(['image', 'inspect', tag], work, log)[0]['Id']
        fixed = {name: images[name] if name in images else images['l1-cl'] if name == 'l1-vc'
                 else images['base'] for name in SERVICES}
        receipt = {'schema': 'ORIGINAL_BASE_NATIVE_PREPARED_V1', 'profile': PROFILE,
                   'archiveSHA256': ARCHIVE_SHA, 'sourceCommit': COMMIT,
                   'slotSeconds': SLOT_SECONDS, 'images': fixed,
                   'nativeFinalityEstablished': False, 'privateCreditEstablished': False}
        private_write(work / 'receipt.json', data_bytes(receipt))
    os.rename(work, prepared)
    require(json.loads(private_read(prepared / 'receipt.json')) == receipt, 'BASE_ORIGINAL_PREPARATION_READBACK')
    return {'profile': PROFILE, 'prepared': True, 'imageCount': len(set(fixed.values())),
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
    require(len(data) <= 4 * 1024 * 1024, 'BASE_ORIGINAL_RPC_BOUND')
    value = json.loads(data)
    if (method == 'eth_getBlockByNumber' and parameters == ['finalized', False]
            and value.get('jsonrpc') == '2.0' and value.get('id') == 1
            and 'result' not in value and value.get('error') == {
                'code': -32000, 'message': 'finalized block not found'}):
        return None  # Actual Geth not-yet-finalized, never an accepted head.
    require(value.get('jsonrpc') == '2.0' and value.get('id') == 1
            and 'error' not in value and 'result' in value, 'BASE_ORIGINAL_RPC_REJECTED')
    return value['result']


def header(value):
    require(isinstance(value, dict) and re.fullmatch(r'0x[0-9a-fA-F]{64}', value.get('hash', ''))
            and re.fullmatch(r'0x[0-9a-f]+', value.get('number', '')),
            'BASE_ORIGINAL_HEADER_REQUIRED')
    return {'number': value['number'], 'hash': value['hash'].lower()}


def finalized_pair(l1, l2, builder, beacon):
    # The L2 derived finalized tag is not a rollup output/challenge finality claim.
    parent = header(rpc(l1, 'eth_getBlockByNumber', ['finalized', False]))
    child = header(rpc(l2, 'eth_getBlockByNumber', ['finalized', False]))
    require(int(parent['number'], 16) > 0 and int(child['number'], 16) > 0,
            'BASE_ORIGINAL_FINALITY_PENDING')
    require(header(rpc(l1, 'eth_getBlockByNumber', [parent['number'], False])) == parent
            and header(rpc(l2, 'eth_getBlockByNumber', [child['number'], False])) == child
            and header(rpc(builder, 'eth_getBlockByNumber', [child['number'], False])) == child,
            'BASE_ORIGINAL_CANONICAL_CHANGED')
    with urllib.request.urlopen(beacon + '/eth/v2/beacon/blocks/finalized', timeout=5) as response:
        raw = response.read(4 * 1024 * 1024 + 1)
    require(len(raw) <= 4 * 1024 * 1024, 'BASE_ORIGINAL_BEACON_BOUND')
    evidence = json.loads(raw)
    require(evidence.get('execution_optimistic') is False and evidence.get('finalized') is True,
            'BASE_ORIGINAL_BEACON_NOT_FINALIZED')
    payload = evidence['data']['message']['body']['execution_payload']
    require(payload['block_hash'].lower() == parent['hash']
            and int(payload['block_number']) == int(parent['number'], 16),
            'BASE_ORIGINAL_BEACON_EXECUTION_MISMATCH')
    return {'profile': PROFILE, 'parentFinalized': parent, 'childFinalized': child,
            'scope': 'owned-local-base-derived-parent-finality', 'rollupChallengeFinalityEstablished': False,
            'independentOperators': False, 'privateCreditEstablished': False}



def original_fee_oracle_call(params):
    if not (len(params)==2 and type(params[0]) is dict and set(params[0])=={'to','data'} and params[0]['to']=='0x420000000000000000000000000000000000000f' and type(params[0]['data']) is str and type(params[1]) is str and (params[1]=='latest' or re.fullmatch(r'0x(?:0|[1-9a-f][0-9a-f]*)',params[1]))):
        return False
    data=params[0]['data']
    if data in ('0x960e3a23','0x54fd4d50'):
        return True
    if re.fullmatch(r'0x(?:f1c7a58b|275aedd2)[0-9a-f]{64}',data):
        return int(data[10:],16)<=65536*2
    if not re.fullmatch(r'0x49948e0e[0-9a-f]{128,8192}',data):
        return False
    offset=int(data[10:74],16);size=int(data[74:138],16);body=data[138:]
    return offset==32 and 0<size<=2048 and len(body)==((size+31)//32)*64 and set(body[size*2:])<=set('0')

class OriginalCluster:
    def __init__(self, root):
        self.root, self.closed, self.failed = root, False, False
        self.admitted, self.containers, self.network_id = set(), {}, None
        self.project = 'lianum-base-' + uuid.uuid4().hex
        self.realm = directory(root / '.local/owned-base-original-v1' / self.project)
        self.log = open(os.open(self.realm / 'native.private.log', os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb')
        try:
            prepared = root / '.local/dependencies/base-original-v1/prepared-v1'
            self.receipt = json.loads(private_read(prepared / 'receipt.json'))
            require(self.receipt['schema'] == 'ORIGINAL_BASE_NATIVE_PREPARED_V1'
                    and self.receipt['profile'] == PREPARED_PROFILE and self.receipt['archiveSHA256'] == ARCHIVE_SHA
                    and self.receipt['sourceCommit'] == COMMIT and self.receipt['slotSeconds'] == SLOT_SECONDS,
                    'BASE_ORIGINAL_PREPARATION_CHANGED')
            for image in set(self.receipt['images'].values()):
                require(docker_json(['image', 'inspect', image], self.realm, self.log)[0]['Id'] == image,
                        'BASE_ORIGINAL_IMAGE_CHANGED')
            for name, reference in IMAGES.items():
                actual = docker_json(['image', 'inspect', reference], self.realm, self.log)[0]
                require(actual['Id'] == self.receipt['images']['base-rpc' if name == 'base' else name],
                        'BASE_ORIGINAL_IMAGE_CHANGED')
                if name == 'base':
                    require(actual['Config'].get('Labels', {}).get('org.opencontainers.image.revision') == COMMIT,
                            'BASE_ORIGINAL_RELEASE_REVISION_CHANGED')
            for name in ('setup-devnet', 'op-batcher'):
                require(docker_json(['image', 'inspect', 'lianum-base-' + name + '-' + COMMIT], self.realm, self.log)[0]['Id']
                        == self.receipt['images'][name], 'BASE_ORIGINAL_IMAGE_CHANGED')
            expected_images = {name: self.receipt['images'][name] if name in ('setup-devnet', 'op-batcher', 'l1-el', 'l1-cl')
                               else self.receipt['images']['l1-cl'] if name == 'l1-vc'
                               else self.receipt['images']['base-rpc'] for name in SERVICES}
            require(self.receipt['images'] == expected_images, 'BASE_ORIGINAL_IMAGE_MEMBERSHIP')
            # A new Docker network address is infrastructure, fixed before CREATE.
            occupied = []
            network_ids = run(['/usr/bin/docker', 'network', 'ls', '-q'], self.realm, self.log).decode().split()
            require(len(network_ids) <= 128, 'BASE_ORIGINAL_NETWORK_BOUND')
            if network_ids:
                for item in docker_json(['network', 'inspect', *network_ids], self.realm, self.log):
                    occupied.extend(original_network_subnets(item))
            octet = next((n for n in range(16, 240) if all(not ipaddress.ip_network(f'172.28.{n}.0/24').overlaps(x)
                          for x in occupied if x.version == 4)), None)
            require(octet is not None, 'BASE_ORIGINAL_SUBNET_UNAVAILABLE')
            compose, env = materialize(self.realm, official_files(fetch(root)), octet)
            self.env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}
            original = docker_json(['compose', '-p', self.project, '--env-file', str(env), '-f', str(compose),
                                    'config', '--format', 'json'], self.realm, self.log)
            fixed = fixed_runtime_compose(original, self.receipt['images'], self.project, self.realm)
            private_write(self.realm / 'fixed-compose.json', data_bytes(fixed))
            require(not self.ids(), 'BASE_ORIGINAL_NAMESPACE_NOT_EMPTY')
            # Retain container creation identities before start; a partial startup
            # can only stop those original IDs, never adopt a project lookalike.
            creation_error = None
            try:
                run(['/usr/bin/docker', 'compose', '-p', self.project, '-f', str(self.realm / 'fixed-compose.json'),
                     'create', *SERVICES], self.realm, self.log, 120, self.env)
            except BaseException as error:
                creation_error = error
            # The fixed original create may have succeeded partially. Retain its
            # IDs before propagating failure so close still checks each identity.
            self.enroll()
            if creation_error:
                raise creation_error
            networks = docker_json(['network', 'inspect', self.project + '_default'], self.realm, self.log)
            require(len(networks) == 1, 'BASE_ORIGINAL_PRIVATE_NETWORK_CHANGED')
            self.network_id = original_private_network(networks[0], self.project)
            self.launch = subprocess.Popen(['/usr/bin/docker', 'compose', '-p', self.project,
                '-f', str(self.realm / 'fixed-compose.json'), 'up', '--wait', '--wait-timeout', str(INIT_MS // 1000),
                *SERVICES], cwd=self.realm, env=self.env, stdout=self.log, stderr=self.log, start_new_session=True)
            self.launch_identity = process_identity(self.launch.pid)
            deadline = time.monotonic() + INIT_MS / 1000
            while self.launch.poll() is None:
                self.enroll()
                require(time.monotonic() < deadline, 'BASE_ORIGINAL_BIRTH_TIMEOUT')
                time.sleep(.2)
            require(self.launch.returncode == 0, 'BASE_ORIGINAL_INITIALIZATION_FAILED')
            self.enroll()
            require({item['service'] for item in self.containers.values() if item['running']} == LIVE_SERVICES,
                    'BASE_ORIGINAL_NATIVE_MEMBERSHIP')
            self.l1, self.l2 = self.endpoint('l1-el', '4545/tcp'), self.endpoint('base-rpc', '8645/tcp')
            self.builder, self.beacon = self.endpoint('base-builder', '7545/tcp'), self.endpoint('l1-cl', '4052/tcp')
            require(rpc(self.l1, 'eth_chainId', []) == hex(1337) and rpc(self.l2, 'eth_chainId', []) == hex(CHAIN_ID)
                    and rpc(self.builder, 'eth_chainId', []) == hex(CHAIN_ID), 'BASE_ORIGINAL_CHAIN_CHANGED')
            self.l1_genesis = header(rpc(self.l1, 'eth_getBlockByNumber', ['0x0', False]))
            self.l2_genesis = header(rpc(self.l2, 'eth_getBlockByNumber', ['0x0', False]))
            require(header(rpc(self.builder, 'eth_getBlockByNumber', ['0x0', False])) == self.l2_genesis,
                    'BASE_ORIGINAL_GENESIS_CHANGED')
            deadline = time.monotonic() + FINALITY_MS / 1000
            while True:
                self.healthy()
                try:
                    self.finalized = finalized_pair(self.l1, self.l2, self.builder, self.beacon)
                    official_files(fetch(root))
                    self.healthy()
                    break
                except (OSError, KeyError, ClosedError) as error:
                    if isinstance(error, ClosedError) and str(error) not in ('BASE_ORIGINAL_HEADER_REQUIRED',
                            'BASE_ORIGINAL_FINALITY_PENDING', 'BASE_ORIGINAL_BEACON_NOT_FINALIZED',
                            'BASE_ORIGINAL_BEACON_EXECUTION_MISMATCH'):
                        raise
                    require(time.monotonic() < deadline, 'BASE_ORIGINAL_FINALITY_STARTUP_TIMEOUT')
                    time.sleep(.5)
        except BaseException:
            self.close()
            raise

    def ids(self):
        result = run(['/usr/bin/docker', 'container', 'ls', '-aq', '--filter',
                      'label=com.docker.compose.project=' + self.project, '--filter',
                      'label=com.docker.compose.oneoff=False'], self.realm, self.log).decode().split()
        require(len(result) <= 32 and all(re.fullmatch(r'[0-9a-f]{12,64}', item) for item in result),
                'BASE_ORIGINAL_CONTAINER_BOUND')
        return result

    def inspect(self, identifier):
        item = docker_json(['container', 'inspect', identifier], self.realm, self.log)[0]
        labels = item['Config']['Labels']
        service = labels['com.docker.compose.service']
        require(labels['com.docker.compose.project'] == self.project and service in SERVICES
                and item['Image'] == self.receipt['images'][service], 'BASE_ORIGINAL_CONTAINER_CHANGED')
        return {'id': item['Id'], 'service': service, 'image': item['Image'],
                'created': item['Created'], 'running': item['State']['Running'],
                'pid': item['State']['Pid'], 'ports': item['NetworkSettings']['Ports'],
                'oneoff': labels.get('com.docker.compose.oneoff', '').lower() == 'true',
                'network_ids': {name: value['NetworkID']
                    for name, value in item['NetworkSettings']['Networks'].items()}}

    def enroll(self):
        changed = False
        for identifier in self.ids():
            item = self.inspect(identifier)
            if item['oneoff']:
                continue
            previous = self.containers.get(item['id'])
            if previous:
                require(all(previous[key] == item[key] for key in ('id', 'service', 'image', 'created')),
                        'BASE_ORIGINAL_CONTAINER_CHANGED')
                birth = previous.get('process')
                if birth and item['running']:
                    require(item['pid'] == birth['pid'] and process_identity(item['pid']) == birth,
                            'BASE_ORIGINAL_NATIVE_CHANGED')
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
                    for row in self.containers.values() if row.get('process') and row['service'] in LIVE_SERVICES]}), flush=True)

    def endpoint(self, service, port):
        rows = [item for item in self.containers.values() if item['service'] == service and item['running']]
        require(len(rows) == 1, 'BASE_ORIGINAL_NATIVE_MEMBERSHIP')
        value = rows[0]['ports'][port]
        require(len(value) == 1 and value[0]['HostIp'] == '127.0.0.1'
                and re.fullmatch(r'[1-9][0-9]{1,4}', value[0]['HostPort']), 'BASE_ORIGINAL_RPC_ORIGIN')
        return 'http://127.0.0.1:' + value[0]['HostPort']

    def healthy(self):
        require(not self.closed and not self.failed, 'BASE_ORIGINAL_RUNTIME_UNAVAILABLE')
        networks = docker_json(['network', 'inspect', self.network_id], self.realm, self.log)
        require(len(networks) == 1 and original_private_network(networks[0], self.project) == self.network_id,
                'BASE_ORIGINAL_PRIVATE_NETWORK_CHANGED')
        for previous in self.containers.values():
            if previous['service'] not in LIVE_SERVICES or not previous['running']:
                continue
            current = self.inspect(previous['id'])
            require(current['network_ids'] == {self.project + '_default': self.network_id},
                    'BASE_ORIGINAL_PRIVATE_NETWORK_CHANGED')
            require(previous.get('process') and current['running']
                    and process_identity(current['pid']) == previous['process']
                    and all(previous[key] == current[key] for key in ('id', 'service', 'image', 'created', 'pid')),
                    'BASE_ORIGINAL_NATIVE_CHANGED')

    def head(self):
        self.healthy()
        require(header(rpc(self.l1, 'eth_getBlockByNumber', ['0x0', False])) == self.l1_genesis
                and header(rpc(self.l2, 'eth_getBlockByNumber', ['0x0', False])) == self.l2_genesis,
                'BASE_ORIGINAL_GENESIS_CHANGED')
        value = finalized_pair(self.l1, self.l2, self.builder, self.beacon)
        self.healthy()
        return value

    def read_original(self, raw):
        require(NATIVE_VALUE, 'BASE_ORIGINAL_ECONOMIC_PROFILE_REQUIRED')
        require(type(raw) is dict and set(raw) == {'method', 'params'}
                and type(raw['params']) is list and len(data_bytes(raw)) <= 16384,
                'BASE_ORIGINAL_READ_REQUEST')
        method, params = raw['method'], raw['params']
        require(method in ('eth_chainId', 'eth_getBlockByNumber', 'eth_getBlockByHash',
                'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBalance',
                'eth_getCode', 'eth_getTransactionCount', 'eth_gasPrice', 'eth_estimateGas', 'eth_call', 'eth_getStorageAt', 'debug_traceTransaction'), 'BASE_ORIGINAL_READ_METHOD')
        require((method == 'eth_chainId' and params == [])
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
                or (method == 'eth_getTransactionCount' and len(params)==2 and type(params[0]) is str and re.fullmatch(r'0x[0-9a-f]{40}',params[0]) and params[1] in ('latest','pending'))
                or (method == 'eth_gasPrice' and params==[])
                or (method == 'eth_estimateGas' and len(params)==2 and type(params[0]) is dict and set(params[0])=={'from','to','value','data','gas','gasPrice','nonce','chainId','type'} and params[0]['chainId']=='0x2105' and params[0]['type']=='0x0' and all(type(params[0][k]) is str and re.fullmatch(r'0x[0-9a-f]{40}',params[0][k]) for k in ('from','to')) and re.fullmatch(r'0x[0-9a-f]{140}',params[0]['data']) and all(type(params[0][k]) is str and re.fullmatch(r'0x(?:0|[1-9a-f][0-9a-f]*)',params[0][k]) and len(params[0][k])<=66 for k in ('value','gas','gasPrice','nonce')) and type(params[1]) is str and (params[1]=='latest' or re.fullmatch(r'0x(?:0|[1-9a-f][0-9a-f]*)',params[1])))
                or (method == 'eth_getStorageAt' and len(params)==3 and params[0]=='0x420000000000000000000000000000000000000f' and params[1]=='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' and type(params[2]) is str and (params[2]=='latest' or re.fullmatch(r'0x(?:0|[1-9a-f][0-9a-f]*)',params[2])))
                or (method == 'eth_call' and original_fee_oracle_call(params))
                or (method == 'debug_traceTransaction' and len(params) == 2
                    and type(params[0]) is str and re.fullmatch(r'0x[0-9a-f]{64}', params[0])
                    and params[1] in [{'tracer':'callTracer','timeout':'5s','reexec':128,
                                      'tracerConfig':{'onlyTopCall':True,'withLog':False}},
                                     {'tracer':'prestateTracer','timeout':'5s','reexec':128,
                                      'tracerConfig':{'diffMode':False,'disableCode':False,'disableStorage':True}}]),
                'BASE_ORIGINAL_READ_PARAMS')
        self.healthy()
        require(rpc(self.l2, 'eth_chainId', []) == hex(CHAIN_ID)
                and header(rpc(self.l2, 'eth_getBlockByNumber', ['0x0', False])) == self.l2_genesis,
                'BASE_ORIGINAL_READ_NETWORK_CHANGED')
        value = rpc(self.l2, method, params)
        self.healthy()
        require(header(rpc(self.l2, 'eth_getBlockByNumber', ['0x0', False])) == self.l2_genesis,
                'BASE_ORIGINAL_READ_NETWORK_CHANGED')
        return value

    def source_identity(self):
        require(NATIVE_VALUE, 'BASE_ORIGINAL_ECONOMIC_PROFILE_REQUIRED')
        self.healthy()
        value = {'profile':PROFILE,'chainId':str(CHAIN_ID),'genesis':self.l2_genesis['hash'][2:],
                 'parentGenesis':self.l1_genesis['hash'][2:],'sourceCommit':COMMIT,
                 'publicNetwork':False,'independentInfrastructureEstablished':False,
                 'rollupChallengeFinalityEstablished':False}
        self.healthy()
        return value

    def send_once(self, wire):
        self.healthy()
        require(isinstance(wire, str) and re.fullmatch(r'0x(?:[0-9a-f]{2}){1,65536}', wire),
                'BASE_ORIGINAL_SIGNED_WIRE')
        require(not (NATIVE_VALUE and getattr(self,'dispatch_uncertain',False)), 'BASE_ORIGINAL_UNKNOWN_NO_FRESH_BROADCAST')
        key = digest(wire.encode())
        require(key not in self.admitted, 'BASE_ORIGINAL_ALREADY_ADMITTED')
        self.admitted.add(key)  # Burn admission before any native RPC; never retry.
        try:
            expected = rpc(self.l2, 'web3_sha3', [wire])
            require(re.fullmatch(r'0x[0-9a-f]{64}', expected), 'BASE_ORIGINAL_WIRE_HASH')
            returned = rpc(self.l2, 'eth_sendRawTransaction', [wire])
            require(returned == expected, 'BASE_ORIGINAL_WIRE_HASH')
            self.healthy()
            return {'profile': PROFILE, 'transactionHash': returned, 'admittedOnce': True,
                    'privateCreditEstablished': False}
        except BaseException:
            if NATIVE_VALUE:
                self.dispatch_uncertain=True
            else:
                self.failed=True
            raise ClosedError('BASE_ORIGINAL_OPERATION_UNCERTAIN') from None

    def close(self):
        if self.closed:
            return
        self.closed = True
        error = None
        if hasattr(self, 'launch') and self.launch.poll() is None:
            require(process_identity(self.launch.pid) == self.launch_identity,
                    'BASE_ORIGINAL_LAUNCHER_CHANGED')
            require(self.launch_identity['pgrp'] == self.launch.pid
                    and self.launch_identity['session'] == self.launch.pid,
                    'BASE_ORIGINAL_LAUNCHER_GROUP')
            os.killpg(self.launch.pid, signal.SIGTERM)
            try:
                self.launch.wait(timeout=5)
            except subprocess.TimeoutExpired:
                require(process_identity(self.launch.pid) == self.launch_identity,
                        'BASE_ORIGINAL_LAUNCHER_CHANGED')
                os.killpg(self.launch.pid, signal.SIGKILL)
                self.launch.wait(timeout=5)
        try:
            current_ids = self.ids()
            endings = []
            for identifier in current_ids:
                try:
                    current = self.inspect(identifier)
                    previous = self.containers.get(current['id'])
                    require(previous is not None, 'BASE_ORIGINAL_UNRETAINED_CONTAINER')
                    require(all(previous[key] == current[key] for key in ('id', 'service', 'image', 'created')),
                            'BASE_ORIGINAL_CONTAINER_CHANGED')
                    if current['running'] and previous.get('process'):
                        require(process_identity(current['pid']) == previous['process'],
                                'BASE_ORIGINAL_NATIVE_CHANGED')
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
                            and not current['running'], 'BASE_ORIGINAL_CLOSE_UNCONFIRMED')
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
            require(len(line) <= 262144, 'BASE_ORIGINAL_REQUEST_BOUND')
            value = json.loads(line)
            require(set(value) == {'id', 'operation', 'input'} and type(value['id']) is int
                    and value['id'] > 0, 'BASE_ORIGINAL_REQUEST')
            operation = value['operation']
            try:
                if operation == 'head':
                    require(value['input'] is None, 'BASE_NO_OPTIONS')
                    result = runtime.head()
                elif operation == 'read':
                    result = runtime.read_original(value['input'])
                elif operation == 'identity':
                    require(value['input'] is None, 'BASE_NO_OPTIONS')
                    result = runtime.source_identity()
                elif operation == 'broadcast':
                    result = runtime.send_once(value['input'])
                else:
                    raise ClosedError('BASE_ORIGINAL_OPERATION')
                print(json.dumps({'id': value['id'], 'result': result}), flush=True)
            except ClosedError as error:
                print(json.dumps({'id': value['id'], 'error': str(error)}), flush=True)
    finally:
        runtime.close()


def main():
    def interrupted(_signal, _frame):
        raise ClosedError('BASE_ORIGINAL_CONTROLLED_SHUTDOWN')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    global PROFILE, NATIVE_VALUE, CHAIN_ID
    if sys.argv[1:] == ['--native-value']:
        PROFILE, NATIVE_VALUE, CHAIN_ID = NATIVE_VALUE_PROFILE, True, 8453
        serve(repository())
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
        raise ClosedError('BASE_NO_OPTIONS')


if __name__ == '__main__':
    try:
        main()
    except ClosedError as error:
        print(json.dumps({'error': str(error)}), flush=True)
        sys.exit(1)
    except BaseException:
        print(json.dumps({'error': 'BASE_ORIGINAL_OPERATION_FAILED'}), flush=True)
        sys.exit(1)
