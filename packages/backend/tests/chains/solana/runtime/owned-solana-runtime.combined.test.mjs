/** Synthetic host-only facade tests. Mocked process, filesystem provenance,
 * sockets and RPC exercise the actual factory, key handling, codecs, journals
 * and brands. No validator, network, proof backend or compiler is started.
 * Run: node --experimental-test-module-mocks --test <this file> */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MEMO_PROGRAM } from '@lianum/engine/native/native-receipt-binding';
const memoBytes = fs.readFileSync(new URL('../../../../../solana-candidate-20261005-0720/.local/agave-linux-bounded-build/derived/'
  + 'agave-2.3.13-loopback-memtable-128m/program-test/src/programs/spl_memo-3.0.0.so', import.meta.url));
const copy = value => structuredClone(value), h = value => crypto.createHash('sha256').update(value).digest('hex');
const system = '11111111111111111111111111111111', executableFixture = Buffer.from('HOST_ONLY_PINNED_EXECUTABLE_STUB');
const adapterSource = fs.readFileSync(new URL('./owned-solana-runtime.mjs', import.meta.url), 'utf8');
const selectedPinName = /const selectedValidatorPin = boundedLedger \? ([A-Za-z0-9_]+) :/.exec(adapterSource)[1];
const pin = new RegExp("export const " + selectedPinName + " = Object.freeze\\(\\['[^']+', '([0-9a-f]{64})'").exec(adapterSource)[1];
const genesisBytes = Buffer.from('HOST_ONLY_FRESH_GENESIS'), identity = Buffer.from(h('host identity'), 'hex');
const named = module => Object.fromEntries(Object.entries(module).filter(([key]) => key !== 'default' && key !== 'module.exports'));
let control;
mock.module('node:crypto', { exports: { ...named(crypto),
  randomBytes(size) { const result = crypto.randomBytes(size); if (size === 32) control.seeds.push(result); return result; },
  createHash(algorithm) {
    const hash = crypto.createHash(algorithm); let isExecutable = false;
    return { update(bytes) { isExecutable = Buffer.isBuffer(bytes) && bytes.equals(executableFixture); hash.update(bytes); return this; },
      digest(encoding) { return isExecutable ? (encoding === 'hex' ? pin : Buffer.from(pin, 'hex')) : hash.digest(encoding); } };
  },
} });
mock.module('node:fs', { exports: { ...named(fs), createReadStream(path) {
  assert.match(path, /solana-test-validator$/); return Readable.from([executableFixture]);
} } });
const ports = () => [control.rpcPort, control.rpcPort + 1, control.faucetPort];
mock.module('node:fs/promises', { exports: { ...named(fsp),
  async realpath(path) { return String(path).startsWith('/host-only-project/') ? path : fsp.realpath(path); },
  async readFile(path, ...args) {
    const name = String(path);
    if (name.endsWith('/ledger/genesis.bin')) return Buffer.from(genesisBytes);
    if (name.endsWith('/ledger/validator-keypair.json')) return JSON.stringify([...Buffer.alloc(32), ...identity]);
    if (name === '/proc/987654/maps') return '';
    const table = /^\/proc\/987654\/net\/(tcp|tcp6|udp|udp6)$/.exec(name)?.[1];
    if (table) {
      control.socketTables.push(table);
      if (control.socketFixture?.table) return control.socketFixture.table(table);
    }
    if (name === '/proc/987654/net/tcp') return 'header\n' + ports().map((port, i) =>
      `0: 0100007F:${port.toString(16).padStart(4, '0')} 00000000:0000 0A 0 0 0 0 0 ${100 + i}`).join('\n');
    if (/^\/proc\/987654\/net\/(tcp6|udp|udp6)$/.test(name)) return 'header\n';
    return fsp.readFile(path, ...args);
  },
  async readdir(path, ...args) {
    if (String(path) !== '/proc/987654/fd') return fsp.readdir(path, ...args);
    control.fdEnumerations++; return control.socketFixture?.names ?? ['0', '1', '2'];
  },
  async readlink(path) {
    assert.match(String(path), /^\/proc\/987654\/fd\/[0-9]+$/);
    const name = String(path).split('/').at(-1); control.fdReads.push(name);
    return control.socketFixture?.target ? control.socketFixture.target(name) : `socket:[${100 + Number(name)}]`;
  },
} });
function socket() { const result = new EventEmitter(); result.unref = () => {}; result.close = callback => callback?.(); return result; }
mock.module('node:net', { exports: { createServer() { const result = socket(); result.listen = (_port, host, callback) => { assert.equal(host, '127.0.0.1'); callback(); }; return result; } } });
mock.module('node:dgram', { exports: { createSocket() { const result = socket(); result.bind = (_port, host, callback) => { assert.equal(host, '127.0.0.1'); callback(); }; return result; } } });
mock.module('node:child_process', { exports: { ...named(childProcess),
  execFile() { throw new Error('HOST_FIXTURE_FORBIDDEN_EXEC'); }, spawn(binary, args, options) {
  assert.match(binary, /solana-test-validator$/); control.spawns++; control.args = [...args];
  control.rpcPort = Number(args[args.indexOf('--rpc-port') + 1]); control.faucetPort = Number(args[args.indexOf('--faucet-port') + 1]);
  for (let i = 0; i < args.length; i++) if (args[i] === '--account') {
    const fixture = JSON.parse(fs.readFileSync(args[i + 2], 'utf8')); assert.equal(fixture.pubkey, args[i + 1]);
    control.accounts.set(fixture.pubkey, fixture.account);
  }
  assert.equal(options.cwd, control.directory);
  const child = new EventEmitter(); Object.assign(child, { pid: 987654, exitCode: null, signalCode: null,
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill(signal) { this.signalCode = signal; } });
  return child;
} } });
const contextual = value => ({ context: { slot: control.slot }, value: copy(value) });
const account = lamports => ({ owner: system, executable: false, lamports, data: ['', 'base64'] });
mock.module(new URL('../../../../../omnichain-product/src/chains/runtime-harness.mjs', import.meta.url).href, { exports: {
  projectRoot: '/host-only-project',
  async scratchDirectory() { control.directory = await fsp.mkdtemp(join(tmpdir(), 'combined-sol-host-')); return control.directory; },
  async removeOwnScratch(path) { assert.equal(path, control.directory); control.removes++; await fsp.rm(path, { recursive: true }); },
  async stopOwnProcess(handle) { control.stops++; handle.child.exitCode = 0; return { stopped: true, forced: false }; },
  async sleep() { throw new Error('HOST_FIXTURE_UNEXPECTED_POLL'); },
  async ownedRuntimeRpc(endpoint, method, params = []) {
    assert.equal(endpoint, `http://127.0.0.1:${control.rpcPort}`); control.reads.push({ method, params: copy(params) });
    const c = control;
    switch (method) {
      case 'getHealth': return 'ok';
      case 'getGenesisHash': return base58Encode(Buffer.from(h(genesisBytes), 'hex'));
      case 'getVersion': return { 'solana-core': 'HOST_ONLY_2.3.13' };
      case 'getClusterNodes': return [{ pubkey: base58Encode(identity), rpc: `127.0.0.1:${c.rpcPort}` }];
      case 'getBalance': return contextual(c.accounts.get(params[0])?.lamports ?? 0);
      case 'getAccountInfo': return contextual(params[0] === MEMO_PROGRAM.address
        ? { owner: MEMO_PROGRAM.owner, executable: true, lamports: 1000000, data: [memoBytes.toString('base64'), 'base64'] }
        : c.accounts.get(params[0]) ?? null);
      case 'getMultipleAccounts': return contextual(params[0].map(address => address === MEMO_PROGRAM.address
        ? { owner: MEMO_PROGRAM.owner, executable: true, lamports: 1000000, data: [memoBytes.toString('base64'), 'base64'] }
        : c.accounts.get(address) ?? null));
      case 'getMinimumBalanceForRentExemption': return params[0] === 80 ? 1447680 : 890880;
      case 'getLatestBlockhash': return contextual({ blockhash: base58Encode(Buffer.from(h('bank-' + c.slot), 'hex')), lastValidBlockHeight: c.slot + 150 });
      case 'getFeeForMessage': return contextual(Buffer.from(params[0], 'base64')[0] * 5000);
      case 'getBlockHeight': return c.slot;
      case 'isBlockhashValid': return contextual(true);
      case 'getSlot': return c.slot;
      case 'getSignatureStatuses': return contextual(params[0].map(signature => c.observations.has(signature)
        ? { slot: c.observations.get(signature).slot, err: null, confirmationStatus: 'finalized', confirmations: null } : null));
      case 'getTransaction': return copy(c.observations.get(params[0]) ?? null);
      case 'getBlock': return { blockhash: base58Encode(Buffer.from(h('block-' + params[0]), 'hex')),
        previousBlockhash: base58Encode(Buffer.from(h('block-' + (params[0] - 1)), 'hex')),
        parentSlot: params[0] - 1, blockHeight: params[0], signatures: [...c.observations.entries()].filter(([, tx]) => tx.slot === params[0]).map(([signature]) => signature) };
      default: throw new Error('HOST_FIXTURE_FORBIDDEN_RPC_' + method);
    }
  },
} });
mock.module(new URL('./owned-solana-send.mjs', import.meta.url).href, { exports: {
  async sendOwnedSolanaTransaction(endpoint, wire) {
    assert.equal(endpoint, `http://127.0.0.1:${control.rpcPort}`); control.sends++;
    const bytes = Buffer.from(wire, 'base64'), nativeId = bytes.subarray(1, 65).toString('hex');
    let record;
    for (const name of ['nonce-bootstrap', 'signed-native', 'signed-graph']) {
      try { record = JSON.parse(await fsp.readFile(join(control.directory, name, nativeId + '.json'), 'utf8')); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    assert.ok(record, 'HOST_FIXTURE_ORIGINAL_JOURNAL_REQUIRED'); assert.equal(record.nativeWire, wire);
    assert.equal(record.phase, 'BROADCAST_UNKNOWN'); assert.equal(record.broadcastAttempts, 1);
    const bootstrap = Object.hasOwn(record.intent, 'payerPublicKey'), nonce = Object.hasOwn(record.intent, 'durableNonce');
    const source = base58Encode(Buffer.from(record.intent[bootstrap ? 'payerPublicKey' : 'sourcePublicKey'], 'hex'));
    const destination = base58Encode(Buffer.from(record.intent[bootstrap ? 'nonceAccountPublicKey' : 'recipientPublicKey'], 'hex'));
    const amount = Number(record.intent[bootstrap ? 'rentLamports' : 'lamports']), fee = bytes[0] * 5000;
    const from = control.accounts.get(source), to = control.accounts.get(destination) ?? account(0);
    const preBalances = [from.lamports, to.lamports, ...(bootstrap ? [1, 1, 1] : nonce ? [1447680, 1, 1, 1000000] : [1, 1000000])];
    from.lamports -= amount + fee; to.lamports += amount;
    if (bootstrap || nonce) {
      const nonceAddress = bootstrap ? destination : base58Encode(Buffer.from(record.intent.nonceAccountPublicKey, 'hex'));
      const nonceAccount = bootstrap ? to : control.accounts.get(nonceAddress), data = Buffer.alloc(80);
      data.writeUInt32LE(1, 0); data.writeUInt32LE(1, 4);
      Buffer.from(record.intent[bootstrap ? 'authorityPublicKey' : 'sourcePublicKey'], 'hex').copy(data, 8);
      Buffer.from(h('nonce-' + nativeId), 'hex').copy(data, 40); data.writeBigUInt64LE(5000n, 72);
      nonceAccount.data = [data.toString('base64'), 'base64'];
    }
    control.accounts.set(destination, to);
    const signature = base58Encode(bytes.subarray(1, 65)), slot = ++control.slot;
    control.observations.set(signature, { slot, blockTime: 1234, transaction: [wire, 'base64'], meta: {
      err: null, fee, preBalances, postBalances: [from.lamports, to.lamports, ...preBalances.slice(2)],
      innerInstructions: [], preTokenBalances: [], postTokenBalances: [], loadedAddresses: { writable: [], readonly: [] } } });
    return signature;
  },
} });
const { createOwnedCombinedSolanaRuntime, createOwnedSolanaCustodyRuntime, createOwnedSolanaCohortRuntime,
  assertOwnedSolanaRuntime, base58Encode, SOLANA_CUSTODY_PROFILE } = await import('../../../../src/chains/solana/runtime/owned-solana-runtime.mjs');
const asset = h('native SOL'), request = label => ({ amount: '1000000', wireKeyCommitment: h(label) });
async function fixture(factory = createOwnedCombinedSolanaRuntime, socketFixture = null) {
  control = { seeds: [], reads: [], accounts: new Map(), observations: new Map(), spawns: 0, stops: 0, removes: 0, sends: 0, slot: 100,
    socketFixture, socketTables: [], fdEnumerations: 0, fdReads: [] };
  return factory();
}
function callbacks(adapter) {
  let original, originalBytes, wire, finalReady = false, consumed = false;
  const assertOriginal = prepared => {
    assert.equal(prepared, original); assert.equal(JSON.stringify(prepared), originalBytes);
    assert.equal(Buffer.from(wire, 'base64').subarray(65).toString('hex'), prepared.unsignedWire);
  };
  return { async beforeSign(prepared) {
    await adapter.assertPrepared(prepared); original = prepared; originalBytes = JSON.stringify(prepared);
  }, async onSigned(payload) { wire = payload.nativeWire; },
  ...(typeof adapter.resumeReservedIngress === 'function' ? {
    async beforeBroadcast(prepared) { assertOriginal(prepared); await adapter.assertPrepared(prepared); },
    async beforeSend(prepared) { assert.equal(finalReady, false); assertOriginal(prepared); finalReady = true; },
    assertBeforeSend(prepared) { assert.ok(finalReady && !consumed); consumed = true; assertOriginal(prepared); },
  } : {}) };
}

const socketTableNames = ['tcp', 'tcp6', 'udp', 'udp6'];
function socketRow(table, inode, port = 40000, changes = {}) {
  const ipv6 = table.endsWith('6');
  const row = { local: ipv6 ? '00000000000000000000000001000000' : '0100007F',
    remote: ipv6 ? '0'.repeat(32) : '00000000', remotePort: 0, state: table.startsWith('tcp') ? '0A' : '07', ...changes };
  return `0: ${row.local}:${port.toString(16).padStart(4, '0')} ${row.remote}:${row.remotePort.toString(16).padStart(4, '0')} ${row.state} 0 0 0 0 0 ${inode}`;
}
function socketFixture() {
  const value = {
    names: Array.from({ length: 67 }, (_, i) => String(i)),
    target: name => `socket:[${Number(name) < 3 ? 100 + Number(name) : 200 + Number(name) % 4}]`,
    rows: () => ({ tcp: ports().map((port, i) => socketRow('tcp', 100 + i, port)),
      tcp6: [socketRow('tcp6', 201)], udp: [socketRow('udp', 202)], udp6: [socketRow('udp6', 203)] }),
    table: table => 'header\n' + value.rows()[table].join('\n'),
  };
  return value;
}

test('socket inspection retains all four tables, complete inode ownership and fresh validation after bootstrap', async () => {
  const sockets = socketFixture(), originalRows = sockets.rows;
  sockets.rows = () => {
    const rows = originalRows();
    // Valid connected IPv6 loopback socket and an unrelated nonloopback socket.
    rows.tcp6[0] = socketRow('tcp6', 201, 40000, { remote: '00000000000000000000000001000000', remotePort: 40001, state: '01' });
    rows.udp.push(socketRow('udp', 999999, 40000, { local: '00000000' }));
    return rows;
  };
  const graph = await fixture(createOwnedSolanaCohortRuntime, sockets);
  try {
    assert.deepEqual(control.socketTables, socketTableNames); assert.equal(control.fdEnumerations, 1);
    assert.deepEqual(control.fdReads, sockets.names);
    const rows = graph.metadata.ownedSockets;
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.map(row => `${row.protocol}/${row.family}`), ['tcp/ipv4', 'tcp/ipv4', 'tcp/ipv4', 'tcp/ipv6', 'udp/ipv4', 'udp/ipv6']);
    // Change a later owned inode after the successful bootstrap. A new health
    // inspection must reject it before the native preparation/signing callback.
    sockets.rows = () => { const rows = originalRows(); rows.udp6[0] = socketRow('udp6', 203, 40000, { remote: '00000000000000000000000002000000' }); return rows; };
    const adapter = graph.adapter({ asset, recipientIndex: 0 });
    await assert.rejects(adapter.transfer(request('fresh socket rejection'), {
      async beforeSign() { assert.fail('isolation must fail before signing callback'); }, async onSigned() {},
    }), /SOLANA_NON_LOOPBACK_OWNED_SOCKET/);
    assert.deepEqual(control.socketTables, [...socketTableNames, ...socketTableNames]);
    assert.equal(control.fdEnumerations, 2); assert.deepEqual(control.fdReads, [...sockets.names, ...sockets.names]);
    assert.equal(control.sends, 0); assert.equal(graph.transfers.length, 0);
  } finally { await graph.close(); }
});

test('every owned TCP/TCP6/UDP/UDP6 wildcard bind or nonloopback remote still rejects', async () => {
  for (const table of socketTableNames) for (const field of ['local', 'remote']) {
    const sockets = socketFixture(), originalRows = sockets.rows;
    sockets.rows = () => {
      const rows = originalRows(), value = field === 'local' ? (table.endsWith('6') ? '0'.repeat(32) : '00000000')
        : (table.endsWith('6') ? '00000000000000000000000002000000' : '08080808');
      rows[table].push(socketRow(table, 200, 40002, { [field]: value })); return rows;
    };
    await assert.rejects(fixture(createOwnedSolanaCohortRuntime, sockets), actual => {
      assert.equal(actual.message, 'SOLANA_NON_LOOPBACK_OWNED_SOCKET');
      assert.equal(actual.offendingSocket.protocol, table.startsWith('tcp') ? 'tcp' : 'udp');
      assert.equal(actual.offendingSocket.family, table.endsWith('6') ? 'ipv6' : 'ipv4'); return true;
    });
    assert.deepEqual(control.socketTables, socketTableNames); assert.equal(control.stops, 1); assert.equal(control.removes, 1);
    assert.equal(control.sends, 0);
  }
});

test('every required RPC, PubSub and faucet listener remains mandatory after inode deduplication', async () => {
  for (const missing of [0, 1, 2]) {
    const sockets = socketFixture(), originalRows = sockets.rows;
    sockets.rows = () => { const rows = originalRows(); rows.tcp.splice(missing, 1); return rows; };
    await assert.rejects(fixture(createOwnedSolanaCohortRuntime, sockets), /SOLANA_MISSING_OWNED_LOOPBACK_LISTENER/);
    assert.deepEqual(control.socketTables, socketTableNames); assert.equal(control.sends, 0);
  }
  const sockets = socketFixture(); sockets.target = () => '/owned/ordinary-file';
  await assert.rejects(fixture(createOwnedSolanaCohortRuntime, sockets), /SOLANA_NO_OWNED_SOCKET_EVIDENCE/);
  assert.deepEqual(control.socketTables, socketTableNames);
});

test('table read failures remain fatal and all fresh descriptor reads precede the first table', async () => {
  for (const deniedTable of socketTableNames) {
    const sockets = socketFixture(), readTable = sockets.table, failure = Object.assign(Error('HOST_TABLE_DENIED'), { code: 'EACCES' });
    sockets.table = table => {
      assert.deepEqual(control.fdReads, sockets.names);
      if (table === deniedTable) throw failure;
      return readTable(table);
    };
    await assert.rejects(fixture(createOwnedSolanaCohortRuntime, sockets), actual => actual === failure);
    assert.deepEqual(control.socketTables, socketTableNames.slice(0, socketTableNames.indexOf(deniedTable) + 1));
    assert.equal(control.sends, 0); assert.equal(control.stops, 1); assert.equal(control.removes, 1);
  }
});

test('a denied owned descriptor rejects before any table is read or runtime capability is minted', async () => {
  const sockets = socketFixture(), target = sockets.target, failure = Object.assign(Error('HOST_FD_DENIED'), { code: 'EPERM' });
  sockets.target = name => { if (name === '1') throw failure; return target(name); };
  await assert.rejects(fixture(createOwnedSolanaCohortRuntime, sockets), actual => actual === failure);
  assert.deepEqual(control.fdReads, sockets.names); assert.deepEqual(control.socketTables, []);
  assert.equal(control.sends, 0); assert.equal(control.stops, 1); assert.equal(control.removes, 1);
});

// Every facade here is minted by the unmodified public factory. No test marker,
// injection constructor, external key or caller-selected endpoint is exposed.
test('fixed combined factory creates separate genuine facades on one node and closes both without leaking keys', async () => {
  await assert.rejects(createOwnedCombinedSolanaRuntime({ endpoint: 'caller' }), /FIXED_CONSTRUCTOR/);
  await assert.rejects(createOwnedCombinedSolanaRuntime(async () => {}, {}), /FIXED_CONSTRUCTOR/);
  const pair = await fixture(), { custody, graph } = pair;
  try {
    assert.deepEqual(Object.keys(pair), ['custody', 'graph']); assert.ok(Object.isFrozen(pair));
    for (const view of [custody, graph]) { assertOwnedSolanaRuntime(view); assert.ok(Object.isFrozen(view)); }
    assert.throws(() => assertOwnedSolanaRuntime({ ...graph }), /OWNED_RUNTIME_CAPABILITY/);
    assert.throws(() => assertOwnedSolanaRuntime(pair), /OWNED_RUNTIME_CAPABILITY/);
    assert.equal(control.spawns, 1); assert.equal(control.sends, 1); assert.equal(custody.genesis, graph.genesis);
    assert.equal(custody.close, graph.close); assert.equal(custody.metadata.processId, graph.metadata.processId);
    assert.equal(custody.metadata.classification, SOLANA_CUSTODY_PROFILE);
    assert.equal(graph.metadata.classification, 'OWNED_FLAT_SOLANA_RECEIPT_BINDING_RUNTIME_V1');
    assert.equal(graph.metadata.publicKeys.solver, graph.solver);
    assert.equal(control.args[control.args.indexOf('--ticks-per-slot') + 1], '64');
    assert.equal(control.args[control.args.indexOf('--limit-ledger-size') + 1], '1000000');
    assert.equal(custody.readPublic, undefined); assert.equal(graph.inventory, undefined); assert.equal(graph.roles, undefined);
    assert.equal(graph.nonceInfrastructure, undefined); assert.equal(graph.nonceBootstrap, undefined);
    assert.equal(new Set([...Object.values(custody.roles).map(role => role.address), graph.solver, ...graph.recipients]).size, 6);
    assert.equal(await graph.balance(graph.solver), '10000000000'); assert.equal(await graph.balance(), '2000000');
    await assert.rejects(graph.balance(custody.roles.escrow.address), /OWNED_ADDRESS/);
    await assert.rejects(custody.balance(graph.solver), /OWNED_ADDRESS/);
    const serialized = JSON.stringify(pair);
    for (const seed of control.seeds.filter(seed => seed.some(byte => byte !== 0))) {
      assert.equal(serialized.includes(seed.toString('hex')), false); assert.equal(serialized.includes(seed.toString('base64')), false);
    }
    assert.equal(/privateKey|keypair|seed/.test(JSON.stringify(Object.keys(graph))), false);
    assert.equal(custody.transfers.length, 0); assert.equal(graph.transfers.length, 0);
    const first = graph.close(), second = custody.close(); assert.equal(first, second);
    assert.deepEqual(await first, { ownedProcessStopped: true, forced: false, syntheticKeysAndLedgerRemoved: true });
    assert.equal(control.stops, 1); assert.equal(control.removes, 1);
    assert.ok(control.seeds.every(seed => seed.every(byte => byte === 0)));
    await assert.rejects(custody.inventory(), /RUNTIME_CLOSED/); await assert.rejects(graph.balance(), /RUNTIME_CLOSED/);
    await assert.rejects(graph.readPublic('getSlot'), /RUNTIME_CLOSED/);
  } finally { await custody.close(); }
});

test('routes, sources, facts and inventory cannot cross facade namespaces', async () => {
  const { custody, graph } = await fixture();
  try {
    const deposit = custody.adapter({ asset, route: 'deposit' }), refund = custody.adapter({ asset, route: 'refund' });
    const graph0 = graph.adapter({ asset, recipientIndex: 0 }), graph1 = graph.adapter({ asset, recipientIndex: 1 });
    assert.deepEqual(Object.keys(graph0), ['binding', 'transfer', 'assertPrepared', 'observe']);
    assert.equal(deposit.binding.sourceEndpoint, custody.roles.depositor.endpoint);
    assert.equal(refund.binding.sourceEndpoint, custody.roles.escrow.endpoint);
    assert.equal(graph0.binding.sourceEndpoint, graph.solverHex.slice(2));
    assert.equal(graph0.binding.sourceEndpoint, graph1.binding.sourceEndpoint);
    assert.notEqual(graph0.binding.sourceEndpoint, deposit.binding.sourceEndpoint);
    assert.notEqual(graph0.binding.destinationEndpoint, deposit.binding.destinationEndpoint);
    assert.equal(refund.resumeReservedPayout instanceof Function, true); assert.equal(graph0.resumeReservedPayout, undefined);
    for (const work of [() => custody.adapter({ asset, recipientIndex: 0 }), () => graph.adapter({ asset, route: 'deposit' }),
      () => custody.factReader({ asset }), () => graph.factReader({ asset, route: 'deposit' }),
      () => graph.adapter({ asset, recipientIndex: 0, sourceEndpoint: custody.roles.escrow.endpoint }),
      () => graph.adapter({ asset: h('relabeled'), recipientIndex: 0 })]) assert.throws(work);
    const start = await custody.inventory();
    assert.equal(start.accounts.length, 3); assert.equal(start.escrow.total, '10000000'); assert.equal(start.feeAudit.transfers.length, 0);
    const paid = await graph0.transfer(request('graph K'), { async beforeSign(prepared) {
      assert.equal(prepared.intent.sourcePublicKey, graph.solverHex.slice(2));
      await assert.rejects(deposit.assertPrepared(prepared), /OTHER_ROUTE/);
      await assert.rejects(graph1.assertPrepared(prepared), /OTHER_ROUTE/);
      await assert.rejects(graph0.assertPrepared({ ...prepared, intent: { ...prepared.intent, sourcePublicKey: custody.roles.escrow.endpoint } }), /PREPARED_IDENTITY/);
      await assert.rejects(deposit.transfer(request('concurrent'), callbacks(deposit)), /BUSY/);
      await graph0.assertPrepared(prepared);
    }, async onSigned() {} });
    assert.equal(custody.transfers.length, 0); assert.equal(graph.transfers.length, 1);
    await assert.rejects(deposit.transfer(request('unobserved graph'), callbacks(deposit)), /PRIOR_TRANSFER_UNRESOLVED/);
    for (const work of [() => custody.observe(paid.nativeId, { timeoutMs: 0 }), () => deposit.observe({ nativeId: paid.nativeId }),
      () => custody.factReader({ asset, route: 'deposit' }).observe({ family: '2', recipientIndex: '0', nativeId: paid.nativeId })])
      await assert.rejects(work, /UNKNOWN_SIGNED_IDENTITY/);
    assert.equal((await graph.factReader({ asset }).observe({ family: '2', recipientIndex: '0', nativeId: paid.nativeId })).status, 'observed');
    await assert.rejects(graph1.observe({ nativeId: paid.nativeId }), /OTHER_RECIPIENT/);
    const afterGraph = await custody.inventory();
    assert.deepEqual(afterGraph.accounts, start.accounts); assert.deepEqual(afterGraph.feeAudit, start.feeAudit);
    assert.deepEqual(afterGraph.syntheticPrefunding, start.syntheticPrefunding); assert.deepEqual(afterGraph.nonceInfrastructure, start.nonceInfrastructure);
    const ingress = await deposit.transfer(request('deposit K'), callbacks(deposit));
    for (const work of [() => graph.observe(ingress.nativeId, { timeoutMs: 0 }), () => graph0.observe({ nativeId: ingress.nativeId }),
      () => graph.factReader({ asset }).observe({ family: '2', recipientIndex: '0', nativeId: ingress.nativeId })])
      await assert.rejects(work, /UNKNOWN_SIGNED_IDENTITY/);
    await assert.rejects(refund.observe({ nativeId: ingress.nativeId }), /OTHER_ROUTE/);
    assert.equal((await custody.factReader({ asset, route: 'deposit' }).observe({ family: '2', recipientIndex: '0', nativeId: ingress.nativeId })).status, 'observed');
    const end = await custody.inventory(); assert.equal(end.escrow.total, '11000000'); assert.equal(end.feeAudit.transfers.length, 1);
    assert.equal(end.feeAudit.transfers[0].nativeId, ingress.nativeId); assert.equal(end.feeAudit.actualFees, '5000');
    assert.equal(end.feeAudit.escrowActualFees, '0'); assert.equal(graph.transfers[0].nativeId, paid.nativeId);
    const graphCopy = graph.transfers; graphCopy.push(custody.transfers[0]); assert.equal(graph.transfers.length, 1);
    assert.deepEqual(await fsp.readdir(join(control.directory, 'signed-native')), [ingress.nativeId + '.json']);
    assert.deepEqual(await fsp.readdir(join(control.directory, 'signed-graph')), [paid.nativeId + '.json']);
    await assert.rejects(custody.inventory({ includeGraph: true }), /CUSTODY_INVENTORY_ONLY/);
    await assert.rejects(graph.readPublic('sendTransaction', []), /READ_ONLY_METHOD_REQUIRED/);
  } finally { await custody.close(); }
});

test('standalone cohort and custody factories preserve their original accounts and public interfaces', async () => {
  const graph = await fixture(createOwnedSolanaCohortRuntime);
  try {
    assertOwnedSolanaRuntime(graph); assert.equal(graph.custody, undefined); assert.equal(graph.graph, undefined);
    assert.equal(control.seeds.length, 4); assert.equal(control.accounts.size, 1); assert.equal(control.sends, 0);
    assert.equal(await graph.balance(), '0'); assert.equal(graph.metadata.graphLiquidity, undefined);
    graph.adapter({ asset, recipientIndex: 0 }); assert.throws(() => graph.adapter({ asset, route: 'deposit' }));
  } finally { await graph.close(); }
  const custody = await fixture(createOwnedSolanaCustodyRuntime);
  try {
    assertOwnedSolanaRuntime(custody); assert.equal(custody.metadata.classification, SOLANA_CUSTODY_PROFILE);
    assert.equal(control.seeds.length, 6); assert.equal(control.accounts.size, 5); assert.equal(control.sends, 1);
    assert.equal(custody.metadata.graphLiquidity, undefined); assert.equal(custody.solver, undefined);
    custody.adapter({ asset, route: 'deposit' }); assert.throws(() => custody.adapter({ asset, recipientIndex: 0 }));
    assert.equal((await custody.inventory()).accounts.length, 3);
  } finally { await custody.close(); }
});

test('combined custody retains nonce v2 first-send gate and excludes concurrent graph signing', async () => {
  const { custody, graph } = await fixture();
  try {
    const refund = custody.adapter({ asset, route: 'refund' }), graph0 = graph.adapter({ asset, recipientIndex: 0 });
    await assert.rejects(refund.transfer(request('missing gate'), callbacks(refund)));
    assert.equal(custody.transfers.length, 0); assert.equal(control.sends, 1);
    const refused = Error('HOST_FIXTURE_RETAIN_RESERVATION');
    await assert.rejects(refund.transfer(request('nonce payout K'), {
      async beforeSign(prepared) {
        assert.equal(prepared.intent.sourcePublicKey, custody.roles.escrow.endpoint);
        assert.equal(prepared.intent.nonceAccountPublicKey, custody.nonceInfrastructure.nonceAccountPublicKey);
        assert.equal(Object.hasOwn(prepared.funds, 'lastValidBlockHeight'), false);
        await refund.assertPrepared(prepared);
      },
      async onSigned(payload) { assert.equal(Buffer.from(payload.nativeWire, 'base64').length, 395); },
      async beforeBroadcast(prepared) {
        await refund.assertPrepared(prepared); await custody.inventory(); throw refused;
      },
      async beforeSend() { assert.fail('reserved prebroadcast rejection must not reach final send'); },
      assertBeforeSend() { assert.fail('reserved prebroadcast rejection must not reach final send'); },
    }), error => error === refused);
    const retained = custody.transfers[0];
    assert.equal(retained.phase, 'SIGNED_NOT_BROADCAST'); assert.equal(retained.broadcastAttempts, 0);
    assert.equal(control.sends, 1); assert.equal(graph.transfers.length, 0);
    await assert.rejects(graph0.transfer(request('while reserved'), callbacks(graph0)), /PRIOR_TRANSFER_UNRESOLVED/);
    await assert.rejects(graph.factReader({ asset }).observe({ family: '2', recipientIndex: '0', nativeId: retained.nativeId }), /UNKNOWN_SIGNED_IDENTITY/);
    let original, finalReady = false, consumed = false;
    const assertOriginalFinalSend = prepared => {
      assert.equal(prepared, original); assert.deepEqual(prepared.intent, retained.intent);
      const current = custody.transfers.find(record => record.nativeId === retained.nativeId);
      assert.equal(current.route, 'refund'); assert.equal(current.phase, 'BROADCAST_UNKNOWN');
      assert.equal(current.broadcastAttempts, 1);
      for (const field of ['nativeWire', 'nativeId', 'transactionSHA256']) assert.equal(current[field], retained[field]);
      assert.equal(Buffer.from(current.nativeWire, 'base64').subarray(65).toString('hex'), prepared.unsignedWire);
    };
    await refund.resumeReservedPayout({ nativeId: retained.nativeId }, { async beforeBroadcast(prepared) {
      original = prepared;
      assert.deepEqual(prepared.intent, retained.intent); await refund.assertPrepared(prepared);
      await assert.rejects(graph0.transfer(request('while gate runs'), callbacks(graph0)), /BUSY/);
    }, async beforeSend(prepared) {
      assert.equal(finalReady, false); assertOriginalFinalSend(prepared); finalReady = true;
    }, assertBeforeSend(prepared) {
      assert.ok(finalReady && !consumed); consumed = true; assertOriginalFinalSend(prepared);
    } });
    assert.equal(control.sends, 2);
    const replayForbidden = () => assert.fail('consumed original must reject before every callback');
    await assert.rejects(refund.resumeReservedPayout({ nativeId: retained.nativeId }, {
      beforeBroadcast: replayForbidden, beforeSend: replayForbidden, assertBeforeSend: replayForbidden,
    }), /FIRST_SEND_ONLY/);
    assert.equal((await custody.observe(retained.nativeId, { timeoutMs: 0 })).status, 'observed');
    const inventory = await custody.inventory(); assert.equal(inventory.feeAudit.escrowActualFees, '5000');
    const payment = await graph0.transfer(request('after payout'), callbacks(graph0));
    assert.equal(Buffer.from(graph.transfers[0].nativeWire, 'base64').length, 321);
    assert.equal((await graph.observe(payment.nativeId, { timeoutMs: 0 })).status, 'observed');
    assert.deepEqual((await custody.inventory()).feeAudit, inventory.feeAudit);
  } finally { await custody.close(); }
});
