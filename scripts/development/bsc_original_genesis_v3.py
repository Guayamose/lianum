#!/usr/bin/env python3
"""Produce private local BSC genesis state with its pinned native EVM.

This preparer never mines, broadcasts to a native node, or establishes finality.
Only the public original three validator fixtures are used. The registrar's
signed requests are captured before transmission and executed as native traces.
The twelve initializers and first daily update are checked by that SAME EVM.
"""
import copy
import hashlib
import http.server
import json
import os
import pathlib
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request

from eth_account import Account
from eth_account._utils.legacy_transactions import Transaction
from hexbytes import HexBytes
from web3 import Web3

import owned_bsc_posa_v1 as bsc

SCHEMA = 'BSC_ORIGINAL_NATIVE_EVM_GENESIS_SEED_V3'
STAKE_HUB = '0x' + '0' * 36 + '2002'
STAKE_CREDIT = '0x' + '0' * 36 + '2003'
DEAD = '0x' + '0' * 36 + 'dead'
FEYNMAN = (('StakeHub', 0x2002), ('BSCGovernor', 0x2004),
           ('GovToken', 0x2005), ('BSCTimelock', 0x2006),
           ('TokenRecoverPortal', 0x3000))
LEGACY = (('BSCValidatorSet', 0x1000), ('SlashIndicator', 0x1001),
          ('TendermintLightClient', 0x1003), ('RelayerHub', 0x1006),
          ('TokenHub', 0x1004), ('RelayerIncentivize', 0x1005),
          ('CrossChain', 0x2000))
MAX_REPLY = 64 * 1024 * 1024
HEX = re.compile('0x(?:[0-9a-f]{2})*')
ADDRESS = re.compile('0x[0-9a-f]{40}')


def need(value, code):
    bsc.require(value, 'BSC_GENESIS_' + code)


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def normalize_allocation(allocation):
    # Geth accepts both JSON address forms in its original genesis allocator.
    # Prefix/case normalization does not change any account state, and two
    # input keys may never alias the same native account.
    need(type(allocation) is dict and 0 < len(allocation) <= 128, 'ORIGINAL_ALLOCATION')
    normalized = {}
    for key, row in allocation.items():
        need(type(key) is str and re.fullmatch(r'(?:0x)?[0-9a-fA-F]{40}', key)
             and type(row) is dict, 'ORIGINAL_ALLOCATION')
        native_address = '0x' + key.removeprefix('0x').lower()
        need(native_address not in normalized, 'ORIGINAL_ALLOCATION_ALIAS')
        normalized[native_address] = copy.deepcopy(row)
    return normalized


def address(number):
    return '0x' + format(number, '040x')


def selector(signature):
    return '0x' + Web3.keccak(text=signature)[:4].hex().removeprefix('0x')


def rpc(url, method, params):
    body = encoded({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params})
    request = urllib.request.Request(url, body, {'content-type': 'application/json'})
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read(MAX_REPLY + 1)
    need(len(body) <= MAX_REPLY, 'RPC_BOUND')
    value = json.loads(body)
    need(type(value) is dict and value.get('jsonrpc') == '2.0'
         and value.get('id') == 1 and 'error' not in value and 'result' in value,
         'NATIVE_TRACE_REJECTED')
    return value['result']


def fold_diff(state, result):
    """Fold only changes returned by the original prestate tracer.

    Diff mode omits unchanged fields and uses zero/missing post storage for
    deletions. Preserve every other original allocation field unchanged.
    """
    need(type(result) is dict and set(result) == {'pre', 'post'}, 'DIFF_SHAPE')
    pre, post = result['pre'], result['post']
    need(type(pre) is dict and type(post) is dict and len(pre) <= 256
         and len(post) <= 256, 'DIFF_BOUND')
    changed = copy.deepcopy(state)
    for key in set(pre) | set(post):
        need(type(key) is str and ADDRESS.fullmatch(key), 'DIFF_ADDRESS')
        old, new = pre.get(key), post.get(key)
        need(old is None or type(old) is dict, 'DIFF_PRE')
        need(new is None or type(new) is dict, 'DIFF_POST')
        if old is not None and new is None:
            # System contracts and fixture EOAs must never be destroyed.
            need(key not in state, 'ORIGINAL_ACCOUNT_DESTROYED')
            changed.pop(key, None)
            continue
        row = changed.setdefault(key, {})
        for values in (old, new):
            if values is not None:
                need(set(values) <= {'balance', 'nonce', 'code', 'codeHash', 'storage'}, 'DIFF_FIELDS')
                if 'codeHash' in values:
                    need(type(values['codeHash']) is str and re.fullmatch('0x[0-9a-f]{64}', values['codeHash']),
                         'DIFF_CODE_HASH')
        if old is not None:
            original = state.get(key, {})
            for field in ('balance', 'nonce', 'code'):
                if field in old:
                    value = old[field]
                    expected = original.get(field, 0 if field == 'nonce' else '0x0' if field == 'balance' else '0x')
                    need((int(value, 0) == int(expected, 0)) if field == 'balance' else value == expected,
                         'DIFF_PRESTATE_CHANGED')
            for slot, value in old.get('storage', {}).items():
                need(value == original.get('storage', {}).get(slot, '0x' + '00' * 32), 'DIFF_PRESTATE_CHANGED')
        for field in ('balance', 'nonce', 'code'):
            if field in new:
                value = new[field]
                if field == 'nonce':
                    need(type(value) is int and 0 <= value < 2 ** 64, 'DIFF_NONCE')
                elif field == 'balance':
                    need(type(value) is str and re.fullmatch('0x[0-9a-f]+', value)
                         and int(value, 16) < 2 ** 256, 'DIFF_BALANCE')
                else:
                    need(type(value) is str and HEX.fullmatch(value)
                         and len(value) <= 256 * 1024, 'DIFF_CODE')
                row[field] = value
        if 'codeHash' in new:
            code = row.get('code', '0x')
            expected = '0x' + Web3.keccak(bytes.fromhex(code[2:])).hex().removeprefix('0x') if code != '0x' else '0x' + '00' * 32
            need(new['codeHash'] == expected, 'DIFF_CODE_HASH_CHANGED')
        old_storage = old.get('storage', {}) if old else {}
        new_storage = new.get('storage', {})
        need(type(old_storage) is dict and type(new_storage) is dict
             and len(old_storage) <= 8192 and len(new_storage) <= 8192, 'DIFF_STORAGE_BOUND')
        if old_storage or new_storage:
            storage = row.setdefault('storage', {})
            for slot in set(old_storage) | set(new_storage):
                need(type(slot) is str and re.fullmatch('0x[0-9a-f]{64}', slot), 'DIFF_SLOT')
                value = new_storage.get(slot, '0x' + '00' * 32)
                need(type(value) is str and re.fullmatch('0x[0-9a-f]{64}', value), 'DIFF_WORD')
                if int(value, 16) == 0:
                    storage.pop(slot, None)
                else:
                    storage[slot] = value
    return changed


def overrides(state):
    return {key: {**({'balance': hex(int(row['balance'], 0))} if 'balance' in row else {}),
                  **({'code': row['code']} if 'code' in row else {}),
                  **({'nonce': hex(row['nonce'])} if 'nonce' in row else {}),
                  'state': row.get('storage', {})}
            for key, row in state.items()}


def trace_success(result):
    need(type(result) is dict and result.get('type') in ('CALL', 'STATICCALL'), 'CALL_TRACE_SHAPE')
    need('error' not in result and 'revertReason' not in result, 'CALL_FAILED')
    stack, creations, precompile = [result], {}, False
    count = 0
    while stack:
        row = stack.pop()
        count += 1
        need(type(row) is dict and count <= 1024 and 'error' not in row, 'INTERNAL_CALL_FAILED')
        kind = row.get('type')
        target = row.get('to', '').lower()
        if target == address(0x66):
            need(kind == 'STATICCALL' and row.get('output') == '0x01', 'ORIGINAL_BLS_PRECOMPILE_FAILED')
            precompile = True
        if kind in ('CREATE', 'CREATE2'):
            code = row.get('output')
            need(ADDRESS.fullmatch(target) and type(code) is str
                 and HEX.fullmatch(code) and code != '0x', 'ORIGINAL_CREDIT_CREATION')
            need(target not in creations, 'CREDIT_CREATION_DUPLICATED')
            creations[target] = code
        calls = row.get('calls', [])
        need(type(calls) is list and len(calls) <= 1024, 'CALL_TRACE_BOUND')
        stack.extend(calls)
    return creations, precompile


class NativeTraces:
    def __init__(self, url, child, birth, timestamp, coinbase, deadline):
        self.url, self.child, self.birth = url, child, birth
        self.timestamp, self.coinbase, self.frames = timestamp, coinbase, []
        self.number = 0
        self.deadline = deadline

    def check(self):
        need(bsc.same_process(self.child, self.birth), 'ORIGINAL_CLIENT_EXITED')
        need(time.monotonic() < self.deadline, 'PREPARATION_TIMEOUT')

    def call(self, state, sender, target, data, value=0, label='READ', write=False, gas=30000000):
        self.check()
        args = {'from': sender, 'to': target, 'data': data, 'gas': hex(gas),
                'gasPrice': '0x0', 'value': hex(value), 'nonce': hex(state.get(sender, {}).get('nonce', 0))}
        context = {'stateOverrides': overrides(state), 'blockOverrides': {
            'number': hex(self.number), 'time': hex(self.timestamp), 'feeRecipient': self.coinbase,
            'baseFeePerGas': '0x0'}}
        call = rpc(self.url, 'debug_traceCall', [args, '0x0', {
            **context, 'tracer': 'callTracer', 'timeout': '10s'}])
        creations, bls = trace_success(call)
        need(call.get('from', '').lower() == sender and call.get('to', '').lower() == target
             and call.get('input') == data and int(call.get('value', '0x0'), 16) == value,
             'ORIGINAL_CALL_BINDING')
        output = call.get('output', '0x')
        need(type(output) is str and HEX.fullmatch(output), 'CALL_OUTPUT')
        result = state
        diff = None
        if write:
            diff = rpc(self.url, 'debug_traceCall', [args, '0x0', {
                **context, 'tracer': 'prestateTracer', 'tracerConfig': {'diffMode': True},
                'timeout': '10s'}])
            result = fold_diff(state, diff)
            for key, code in creations.items():
                need(result.get(key, {}).get('code') == code, 'CREDIT_TRACE_DIFF_MISMATCH')
        self.check()
        self.frames.append({'label': label, 'requestSHA256': sha(encoded(args)),
                            'inputStateSHA256': sha(encoded(state)), 'callSHA256': sha(encoded(call)),
                            'diffSHA256': sha(encoded(diff)) if diff is not None else None,
                            'outputStateSHA256': sha(encoded(result)), 'originalBlsVerified': bls,
                            'originalCreatedContracts': sorted(creations)})
        return result, output, creations, bls


def decode_registration(wire, fixture):
    need(type(wire) is str and HEX.fullmatch(wire) and 0 < len(wire) <= 64 * 1024,
         'REGISTRAR_WIRE_BOUND')
    raw = HexBytes(wire)
    tx = Transaction.from_bytes(raw).as_dict()
    need(Account.recover_transaction(raw).lower() == fixture['address'], 'REGISTRAR_ORIGINAL_SIGNER')
    need(bytes(tx['to']).hex() == STAKE_HUB[2:] and tx['gas'] == 2000000
         and tx['gasPrice'] == 0 and tx['value'] == 20001 * 10 ** 18
         and tx['nonce'] == fixture['nonce'] and (tx['v'] - 35) // 2 == 714, 'REGISTRAR_ORIGINAL_TUPLE')
    data = bytes(tx['data'])
    need(data[:4].hex() == selector('createValidator(address,bytes,bytes,(uint64,uint64,uint64),(string,string,string,string))')[2:],
         'REGISTRAR_ORIGINAL_METHOD')
    consensus, vote, proof, commission, description = Web3().codec.decode(
        ['address', 'bytes', 'bytes', '(uint64,uint64,uint64)', '(string,string,string,string)'], data[4:])
    need(consensus.lower() == fixture['address'] and vote.hex() == fixture['blsPublicKey']
         and len(proof) == 96, 'REGISTRAR_ORIGINAL_VOTE')
    need(commission == (100, 1000, 100),
         'REGISTRAR_ORIGINAL_COMMISSION')
    need(description == (fixture['description'],) * 4, 'REGISTRAR_ORIGINAL_DESCRIPTION')
    return '0x' + data.hex(), tx['value']


def capture_registration(work, fixture, index, prepared, deadline):
    held, failure = [], []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            try:
                length = int(self.headers.get('content-length', '-1'))
                need(0 <= length <= 128 * 1024, 'REGISTRAR_RPC_BOUND')
                request = json.loads(self.rfile.read(length))
                need(type(request) is dict and request.get('jsonrpc') == '2.0'
                     and type(request.get('id')) is int and type(request.get('params')) is list,
                     'REGISTRAR_RPC_SHAPE')
                method, params = request['method'], request['params']
                if method == 'eth_chainId' and params == []:
                    result = hex(714)
                elif method == 'eth_getTransactionCount' and len(params) == 2 and type(params[0]) is str \
                        and params[0].lower() == fixture['address'] and params[1] == 'pending':
                    result = hex(fixture['nonce'])
                elif method == 'eth_gasPrice' and params == []:
                    # Genesis state transitions carry no native gas payment.
                    # The ORIGINAL registrar signs this exact zero-fee request.
                    result = '0x0'
                elif method == 'eth_sendRawTransaction' and len(params) == 1 and not held:
                    data, value = decode_registration(params[0], fixture)
                    held.append((data, value, sha(HexBytes(params[0]))))
                    # A capture receipt is not a native transaction receipt. No
                    # request is forwarded to the native diagnostic client.
                    result = '0x' + Web3.keccak(HexBytes(params[0])).hex().removeprefix('0x')
                else:
                    raise RuntimeError('BSC_GENESIS_REGISTRAR_RPC_DENIED')
                body = encoded({'jsonrpc': '2.0', 'id': request['id'], 'result': result})
                self.send_response(200)
            except Exception as error:
                failure.append(error)
                body = encoded({'jsonrpc': '2.0', 'id': None,
                                'error': {'code': -32600, 'message': 'BSC_GENESIS_REGISTRAR_RPC_DENIED'}})
                self.send_response(400)
            self.send_header('content-type', 'application/json')
            self.send_header('content-length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        bsc.native_command([str(prepared / 'create-validator'), '--consensus-key-dir',
                            str(work / 'keys' / f'validator{index}'), '--vote-key-dir',
                            str(work / 'keys' / f'bls{index}'), '--password-path',
                            str(work / 'keys/password.txt'), '--amount', '20001',
                            '--validator-desc', fixture['description'], '--rpc-url',
                            'http://127.0.0.1:' + str(server.server_port)],
                           work, work / f'registrar{index}.private.log', deadline)
        need(not failure and len(held) == 1, 'ORIGINAL_REGISTRATION_NOT_CAPTURED')
        return held[0]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
        need(not thread.is_alive(), 'REGISTRAR_CAPTURE_NOT_CLOSED')


def validate_seed(original, seeded, original_codes, credits):
    need({key: value for key, value in seeded.items() if key != 'alloc'} ==
         {key: value for key, value in original.items() if key != 'alloc'}, 'GENESIS_TERMS_CHANGED')
    actual_codes = {key: sha(bytes.fromhex(row['code'].removeprefix('0x')))
                    for key, row in seeded['alloc'].items() if row.get('code')}
    need(all(actual_codes.get(key) == value for key, value in original_codes.items())
         and len(original_codes) == 17, 'ORIGINAL_SYSTEM_CODE_CHANGED')
    need(set(actual_codes) - set(original_codes) == set(credits) and len(credits) == 3,
         'ORIGINAL_CREDIT_COUNT')
    need(len(set(credits.values())) == 1 and all(seeded['alloc'][key]['code'] == code
                                               for key, code in credits.items()), 'CREDIT_CODE_CHANGED')
    old_total = sum(int(row.get('balance', '0x0'), 0) for row in original['alloc'].values())
    new_total = sum(int(row.get('balance', '0x0'), 0) for row in seeded['alloc'].values())
    need(old_total == new_total, 'GENESIS_NATIVE_VALUE_CREATED')


def produce(work):
    bsc.private_directory(work)
    need(work.parent == bsc.DEPENDENCIES and re.fullmatch(r'\.native-v3-build-[0-9a-f-]{36}', work.name),
         'ORIGINAL_PREPARATION_DIRECTORY')
    prepared = bsc.PREPARED_V2
    receipt = json.loads(bsc.private_file(prepared / 'receipt.json', 32768))
    body = bsc.private_file(prepared / 'genesis.json', 1024 * 1024)
    need(receipt['profile'] == bsc.PROFILE_V2 and receipt['material'] == bsc.PINS
         and sha(body) == receipt['genesisSHA256'], 'ORIGINAL_PARENT_GENERATION')
    need(sha(bsc.private_file(prepared / 'geth', 128 * 1024 * 1024)) == receipt['clientSHA256']
         and sha(bsc.private_file(prepared / 'create-validator', 128 * 1024 * 1024)) ==
         receipt['stakeHubRegistrarSHA256'], 'ORIGINAL_BINARY_CHANGED')
    original = json.loads(body)
    original['alloc'] = normalize_allocation(original['alloc'])
    original_codes = {key: sha(bytes.fromhex(row['code'].removeprefix('0x')))
                      for key, row in original['alloc'].items() if row.get('code')}
    need(len(original_codes) == 17 and not original['alloc'][STAKE_HUB].get('storage'),
         'ORIGINAL_EMPTY_STAKE_HUB')
    artifact = json.loads(bsc.private_file(pathlib.Path.cwd() / 'out/StakeHub.sol/StakeHub.json', 4 * 1024 * 1024))
    need(sha(bytes.fromhex(artifact['deployedBytecode']['object'].removeprefix('0x'))) ==
         original_codes[STAKE_HUB], 'ORIGINAL_STAKE_HUB_ARTIFACT')
    fixtures = [{**row, 'description': f'Val{i}'} for i, row in enumerate(receipt['validators'])]
    need(len(fixtures) == 3 and len({row['address'] for row in fixtures}) == 3, 'ORIGINAL_FIXTURES')
    # The retained root is not yielded by rglob; a file may be yielded first.
    bsc.private_directory(prepared / 'keys')
    bsc.directory(work / 'keys')
    for path in (prepared / 'keys').rglob('*'):
        target = work / path.relative_to(prepared)
        if path.is_dir():
            bsc.private_directory(path)
            target.mkdir(mode=0o700, parents=True, exist_ok=True)
        else:
            bsc.write(target, bsc.private_file(path, 65536))
    native_log = open(work / 'native.private.log', 'xb')
    os.chmod(work / 'native.private.log', 0o600)
    node = work / 'node'
    bsc.directory(node)
    deadline = time.monotonic() + 240
    child = None
    birth = None
    seed_body = evidence = None
    def interrupted(signum, frame):
        raise RuntimeError('BSC_GENESIS_CONTROLLED_SHUTDOWN')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        bsc.native_command([str(prepared / 'geth'), '--datadir', str(node), 'init',
                            '--state.scheme', 'path', '--db.engine', 'pebble',
                            str(prepared / 'genesis.json')], work, work / 'init.private.log', deadline)
        port = bsc.port()
        child = subprocess.Popen([str(prepared / 'geth'), '--datadir', str(node), '--networkid', '714',
                                  '--nodiscover', '--maxpeers', '0', '--nat', 'none', '--port', '0',
                                  '--ipcdisable', '--http', '--http.addr', '127.0.0.1', '--http.port', str(port),
                                  '--http.api', 'eth,debug,web3', '--http.vhosts', '127.0.0.1,localhost',
                                  '--syncmode', 'full'], stdin=subprocess.DEVNULL, stdout=native_log,
                                 stderr=native_log, start_new_session=True)
        birth = bsc.identity(child.pid)
        need(pathlib.Path(f'/proc/{child.pid}/exe').resolve() == prepared / 'geth', 'ORIGINAL_EXECUTABLE')
        url = 'http://127.0.0.1:' + str(port)
        ready = time.monotonic() + 20
        while True:
            need(bsc.same_process(child, birth), 'ORIGINAL_CLIENT_EXITED')
            try:
                header = rpc(url, 'eth_getBlockByNumber', ['0x0', False])
                need(header['number'] == '0x0', 'DIAGNOSTIC_HEAD_CHANGED')
                break
            except (OSError, urllib.error.URLError):
                need(time.monotonic() < ready, 'DIAGNOSTIC_CLIENT_TIMEOUT')
                time.sleep(.1)
        native = NativeTraces(url, child, birth, int(original['timestamp'], 0), fixtures[0]['address'], deadline)
        state = copy.deepcopy(original['alloc'])
        for label, number in FEYNMAN:
            state, _, _, _ = native.call(state, fixtures[0]['address'], address(number),
                                          selector('initialize()'), label=label + '_INITIALIZE', write=True)
        credits, registrations = {}, []
        for index, fixture in enumerate(fixtures):
            need(time.monotonic() < deadline, 'PREPARATION_TIMEOUT')
            fixture['nonce'] = state.get(fixture['address'], {}).get('nonce', 0)
            data, value, wire_sha = capture_registration(work, fixture, index, prepared, deadline)
            state, _, created, bls = native.call(state, fixture['address'], STAKE_HUB, data, value,
                                                label='ORIGINAL_CREATE_VALIDATOR_' + str(index), write=True,
                                                gas=2000000)
            need(bls and len(created) == 1 and not (set(credits) & set(created)), 'ORIGINAL_CREDIT_AND_BLS')
            credits.update(created)
            registrations.append({'fixtureIndex': index, 'signedRequestSHA256': wire_sha,
                                  'originalCallSHA256': sha(bytes.fromhex(data[2:]))})
        election_data = selector('getValidatorElectionInfo(uint256,uint256)') + '00' * 64
        _, election, _, _ = native.call(state, fixtures[0]['address'], STAKE_HUB, election_data,
                                       label='ORIGINAL_ELECTION_READBACK')
        consensus, powers, votes, count = Web3().codec.decode(['address[]', 'uint256[]', 'bytes[]', 'uint256'],
                                                              bytes.fromhex(election[2:]))
        need(count == 3 and list(consensus) == [row['address'] for row in fixtures]
             and [vote.hex() for vote in votes] == [row['blsPublicKey'] for row in fixtures]
             and all(power > 0 for power in powers), 'ORIGINAL_ELECTION_NOT_ESTABLISHED')
        _, maximum, _, _ = native.call(state, fixtures[0]['address'], STAKE_HUB,
                                        selector('maxElectedValidators()'), label='ORIGINAL_ELECTION_LIMIT')
        need(int(maximum, 16) == 45, 'ORIGINAL_ELECTION_LIMIT_CHANGED')
        for key in credits:
            _, impl, _, _ = native.call(state, DEAD, key, selector('implementation()'),
                                         label='ORIGINAL_PROXY_IMPLEMENTATION')
            need(int(impl, 16) == int(STAKE_CREDIT, 16), 'ORIGINAL_PROXY_IMPLEMENTATION_CHANGED')
        seeded = copy.deepcopy(original)
        seeded['alloc'] = state
        validate_seed(original, seeded, original_codes, credits)
        # The legacy init() rows belong to native block one, not genesis.
        # Execute all seven on a TEMPORARY state, then the original daily
        # update. Publishing these legacy writes would make head1 revert.
        check_state = copy.deepcopy(state)
        native.number = 1
        native.timestamp = int(original['timestamp'], 0) + 3
        for label, number in LEGACY:
            check_state, _, _, _ = native.call(check_state, fixtures[0]['address'], address(number),
                                                selector('init()'), label=label + '_FIRST_BLOCK_INIT', write=True)
        ordered = sorted(zip(consensus, powers, votes), key=lambda row: (-row[1], row[0]))
        update = selector('updateValidatorSetV2(address[],uint64[],bytes[])') + Web3().codec.encode(
            ['address[]', 'uint64[]', 'bytes[]'], [[row[0] for row in ordered],
                                                [row[1] // 10 ** 10 for row in ordered],
                                                [row[2] for row in ordered]]).hex()
        native.call(check_state, fixtures[0]['address'], address(0x1000), update,
                    label='ORIGINAL_FIRST_DAILY_UPDATE', write=True)
        need(rpc(url, 'eth_getBlockByNumber', ['latest', False])['hash'] == header['hash'],
             'DIAGNOSTIC_HEAD_CHANGED')
        seed_body = encoded(seeded)
        evidence = {'schema': SCHEMA, 'parentGenesisSHA256': sha(body),
                    'genesisSHA256': sha(seed_body), 'clientSHA256': receipt['clientSHA256'],
                    'registrarSHA256': receipt['stakeHubRegistrarSHA256'],
                    'originalSystemCodeSHA256': original_codes,
                    'originalCreditCodeSHA256': {key: sha(bytes.fromhex(code[2:])) for key, code in credits.items()},
                    'initialElectionCall': election_data, 'initialElectionResult': election,
                    'initialElectionCount': 3, 'originalMaxElectedValidators': 45,
                    'originalRegistrations': registrations, 'originalTraces': native.frames,
                    'legacyInitializersPersisted': False, 'nativeHeaderUnchanged': True,
                    'nativeBroadcasts': 0, 'nativeFinalityEstablished': False}
    finally:
        if child is not None and birth is not None:
            bsc.stop_original(child, birth)
            need(not pathlib.Path(f'/proc/{birth["pid"]}').exists(), 'ORIGINAL_CLIENT_NOT_CLOSED')
        native_log.close()
    evidence['originalDiagnosticProcess'] = birth
    evidence['ownedNativeProcessAbsent'] = True
    bsc.write(work / 'genesis.json', seed_body)
    bsc.write(work / 'native-seed.json', encoded(evidence))


if __name__ == '__main__':
    try:
        need(len(sys.argv) == 2, 'NO_OPTIONS')
        produce(pathlib.Path(sys.argv[1]))
        print(json.dumps({'nativeGenesisSeedPrepared': True, 'nativeFinalityEstablished': False}))
    except Exception as error:
        code = str(error) if isinstance(error, RuntimeError) and re.fullmatch('BSC_[A-Z_]+', str(error)) else 'BSC_GENESIS_PREPARATION_FAILED'
        print(json.dumps({'error': code}), flush=True)
        sys.exit(1)
