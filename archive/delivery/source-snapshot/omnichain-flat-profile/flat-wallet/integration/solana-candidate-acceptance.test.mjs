/** Focused host-only acceptance orchestration tests. Every process, socket and
 * RPC transport is mocked. The unmodified owned factory, Ed25519 signing,
 * codecs, original journals and acceptance checks run. Fake candidate metadata
 * is explicitly substituted; these tests establish NO native acceptance.
 * node --experimental-test-module-mocks --test integration/solana-candidate-acceptance.test.mjs */
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
import { MEMO_PROGRAM } from '../wallet-platform/modules/chain-adapters/native-receipt-binding.mjs';
const memoBytes = fs.readFileSync(new URL('../../../solana-candidate-20261005-0720/.local/agave-linux-bounded-build/derived/'
  + 'agave-2.3.13-loopback-memtable-128m/program-test/src/programs/spl_memo-3.0.0.so', import.meta.url));
const copy = value => structuredClone(value), h = value => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(h(memoBytes), MEMO_PROGRAM.codeSHA256);
const system = '11111111111111111111111111111111', executableFixture = Buffer.from('HOST_ONLY_PINNED_EXECUTABLE_STUB');
const adapterSource = fs.readFileSync(new URL('../wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs', import.meta.url), 'utf8');
const selectedPinName = /const selectedValidatorPin = boundedLedger \? ([A-Za-z0-9_]+) :/.exec(adapterSource)[1];
const pin = new RegExp("export const " + selectedPinName + " = Object.freeze\\(\\['[^']+', '([0-9a-f]{64})'").exec(adapterSource)[1];
const genesisBytes = Buffer.from('HOST_ONLY_FRESH_GENESIS'), identity = Buffer.from(h('host identity'), 'hex');
const named = module => Object.fromEntries(Object.entries(module).filter(([key]) => key !== 'default' && key !== 'module.exports'));
let control;
const testRoot = await fsp.mkdtemp(join(tmpdir(), 'solana-candidate-host-only-'));
const actualLocal = new URL('../.local/solana-candidate-acceptance', import.meta.url).pathname;
const mapped = path => typeof path === 'string' && path.startsWith(actualLocal) ? testRoot + path.slice(actualLocal.length) : path;
mock.module('node:crypto', { exports: { ...named(crypto),
  randomBytes(size) { const result = crypto.randomBytes(size); if (size === 32) control.seeds.push(result); return result; },
  createHash(algorithm) {
    const hash = crypto.createHash(algorithm); let isExecutable = false;
    return { update(bytes) { isExecutable = Buffer.isBuffer(bytes) && bytes.equals(executableFixture); hash.update(bytes); return this; },
      digest(encoding) { return isExecutable ? (encoding === 'hex' ? pin : Buffer.from(pin, 'hex')) : hash.digest(encoding); } };
  },
} });
mock.module('node:fs', { exports: { ...named(fs),
  mkdirSync(path, ...args) { return fs.mkdirSync(mapped(path), ...args); },
  lstatSync(path, ...args) { return fs.lstatSync(mapped(path), ...args); },
  realpathSync(path, ...args) { return path === actualLocal ? path : fs.realpathSync(path, ...args); },
  openSync(path, ...args) { return fs.openSync(mapped(path), ...args); },
  unlinkSync(path, ...args) { return fs.unlinkSync(mapped(path), ...args); },
  mkdtempSync(path, ...args) { return fs.mkdtempSync(mapped(path), ...args); },
  createReadStream(path) {
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
    if (name === '/proc/987654/net/tcp') return 'header\n' + ports().map((port, i) =>
      `0: 0100007F:${port.toString(16).padStart(4, '0')} 00000000:0000 0A 0 0 0 0 0 ${100 + i}`).join('\n');
    if (/^\/proc\/987654\/net\/(tcp6|udp|udp6)$/.test(name)) return 'header\n';
    return fsp.readFile(path, ...args);
  },
  async readdir(path, ...args) { return String(path) === '/proc/987654/fd' ? ['0', '1', '2'] : fsp.readdir(path, ...args); },
  async readlink(path) { assert.match(String(path), /^\/proc\/987654\/fd\/[012]$/); return `socket:[${100 + Number(String(path).at(-1))}]`; },
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
mock.module(new URL('../../../omnichain-product/src/chains/runtime-harness.mjs', import.meta.url).href, { exports: {
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
      case 'getFeeForMessage': if (c.bootstrapPrepareReject && c.sends === 0) throw Error('SOLANA_CANDIDATE_HOST_BOOTSTRAP_REJECTED');
        return contextual(Buffer.from(params[0], 'base64')[0] * 5000);
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
mock.module(new URL('../wallet-platform/modules/chain-adapters/owned-solana-send.mjs', import.meta.url).href, { exports: {
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
    if (control.refuseSend === control.sends) throw Error('HOST_ONLY_UNOBSERVED_SEND');
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
    if (control.uncertainSend === control.sends) throw Error('HOST_ONLY_LOST_SEND_REPLY');
    return signature;
  },
} });
const originalPolicy = await import('./solana-candidate-acceptance-policy.mjs');
const evidence = await import('./solana-candidate-acceptance-evidence.mjs');
const originalGuard = await import('./solana-candidate-acceptance-guard.mjs');
mock.module(new URL('./solana-candidate-acceptance-policy.mjs', import.meta.url).href, { exports: {
  ...originalPolicy, assertSolanaCandidateAcceptanceGate(argv) {
    assert.deepEqual(argv, [originalPolicy.SOLANA_CANDIDATE_ACCEPTANCE_OPT_IN]);
  },
} });
mock.module(new URL('./solana-candidate-acceptance-evidence.mjs', import.meta.url).href, { exports: {
  ...evidence, checkCandidateMetadata(metadata) {
    const fixture = copy(metadata); fixture.runtimePins.validator = [evidence.SOLANA_CANDIDATE_ACCEPTANCE_PATH, h('HOST_ONLY_CANDIDATE')];
    fixture.periodicSocketAudit.completedChecks = 1; evidence.checkCandidateMetadata(fixture);
  },
} });
mock.module(new URL('./solana-candidate-acceptance-guard.mjs', import.meta.url).href, { exports: {
  ...originalGuard, assertCandidateNoParallelHeavyWork() { control.preflightChecks++; },
  createCandidateResourceGuard() { return { check() {
    if (control.stopAfterSend && control.sends >= control.stopAfterSend) throw Error('SOLANA_CANDIDATE_HOST_TEST_STOP');
  }, verifyRuntimePID(pid) { assert.equal(pid, 987654); },
    bindOwnedRuntime(runtime) { assert.equal(runtime.metadata.processId, 987654); }, finish() {
    assert.equal(control.stops, 1); assert.equal(control.removes, 1);
    return { sampledResourceFloorsHeld: true, ownedChildGone: true, forced: false };
  } }; },
} });
const { base58Encode } = await import('../wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs');
const { runSolanaCandidateAcceptance } = await import('./solana-candidate-acceptance.mjs');
const oldArgv = process.argv;
async function runFixture(options = {}) {
  control = { seeds: [], reads: [], accounts: new Map(), observations: new Map(), spawns: 0, stops: 0,
    removes: 0, sends: 0, slot: 100, preflightChecks: 0, ...options };
  process.argv = ['node', 'HOST_ONLY', originalPolicy.SOLANA_CANDIDATE_ACCEPTANCE_OPT_IN];
  try { return await runSolanaCandidateAcceptance(); }
  finally { process.argv = oldArgv; }
}

test('source review activation is false and argv cannot select any runtime input', () => {
  assert.equal(originalPolicy.SOLANA_CANDIDATE_ACCEPTANCE_ENABLED, false);
  for (const argv of [[], ['--binary', '/tmp/validator'], [originalPolicy.SOLANA_CANDIDATE_ACCEPTANCE_OPT_IN, '--hash', h('caller')]])
    assert.throws(() => originalPolicy.assertSolanaCandidateAcceptanceGate(argv), /EXACT_OPT_IN_REQUIRED/);
  assert.throws(() => originalPolicy.assertSolanaCandidateAcceptanceGate([originalPolicy.SOLANA_CANDIDATE_ACCEPTANCE_OPT_IN]), /SOURCE_REVIEW_REQUIRED/);
});

test('candidate metadata allows an identical historical digest only at the fixed candidate path', () => {
  const historicalHash = 'a5da595fa47557c6952aa786b279219edd99e15247c87f0bf5fe9b93d1e02596';
  const metadata = { officialSourceVersion: '2.3.13', sourceCommit: '5466f4592b1983adb13ba0a5d53f41ea2de69fba',
    slotTiming: { effectiveTicksPerSlot: 64 }, ledgerRetention: { effectiveShreds: 1000000 },
    resourceProfile: { aggregateMemtableFlushThresholdBytes: 134217728, strictProcessMemoryCap: false, processResourceFloorsChanged: false },
    freshSyntheticKeys: true, hostSecurityChanged: false, binding: '127.0.0.1', publicEntrypoints: [],
    faucetGenesisLamports: '0', faucetUsed: false, clusterNodes: [{ pubkey: 'HOST_ONLY_IDENTITY' }],
    publicKeys: { identity: 'HOST_ONLY_IDENTITY' }, receiptBinding: { memoProgram: MEMO_PROGRAM },
    payoutReceiptBinding: { memoProgram: MEMO_PROGRAM }, periodicSocketAudit: { failure: null, completedChecks: 1 },
    ownedSockets: [{ hostOnly: true }], runtimePins: { validator: [evidence.SOLANA_CANDIDATE_ACCEPTANCE_PATH, historicalHash] } };
  assert.doesNotThrow(() => evidence.checkCandidateMetadata(metadata));
  for (const path of ['agave-v2.3.13-loopback-memtable128m-rebuilt-20261003/solana-test-validator',
    'caller-chosen/solana-test-validator']) {
    assert.throws(() => evidence.checkCandidateMetadata({ ...metadata, runtimePins: { validator: [path, historicalHash] } }),
      /SOLANA_CANDIDATE_REVIEWED_PATH_REQUIRED/);
  }
});

test('fixed guard keeps the existing RAM/disk/main-worker floors', () => {
  const sample = { availableRAM: 2684354560, freeDisk: 5368709120, mainRSS: 3221225472 };
  assert.equal(originalGuard.candidateHostResourceFailure(sample), null);
  assert.match(originalGuard.candidateHostResourceFailure({ ...sample, availableRAM: sample.availableRAM - 1 }), /MEMAVAILABLE_FLOOR/);
  assert.match(originalGuard.candidateHostResourceFailure({ ...sample, freeDisk: sample.freeDisk - 1 }), /DISK_FLOOR/);
  assert.match(originalGuard.candidateHostResourceFailure({ ...sample, mainRSS: sample.mainRSS + 1 }), /MAIN_RSS_LIMIT/);
});

test('host-only fixed path bootstraps, deposits, redeems full principal, rejects resend, and isolates solver funds', async () => {
  const result = await runFixture();
  assert.equal(result.report.success, true, JSON.stringify(result.report));
  assert.equal(result.report.scope, 'runtime-functional-only');
  assert.equal(control.spawns, 1); assert.equal(control.sends, 4);
  assert.equal(control.preflightChecks, 1); assert.equal(control.stops, 1); assert.equal(control.removes, 1);
  assert.equal(result.report.sourceUnchanged, true);
  assert.deepEqual(result.report.fixedLamports, { deposit: '1000000', redeem: '1000000', solver: '250000' });
  assert.ok(Object.values(result.report.checks).every(value => value === true));
  assert.deepEqual(result.report.observedFees, { bootstrap: '10000', deposit: '5000', redeem: '5000', solver: '5000' });
  assert.ok(control.seeds.every(seed => seed.every(byte => byte === 0)));
  const run = result.reportPath.slice(0, -'/report.json'.length), audit = join(run, 'private-audit');
  const signed = JSON.parse(await fsp.readFile(join(audit, 'redeem-signed-before-broadcast.json')));
  const record = JSON.parse(await fsp.readFile(join(audit, 'redeem-finalized.json')));
  assert.equal(record.nativeWire, signed.nativeWire); assert.equal(record.nativeId, signed.nativeId);
  assert.equal(record.broadcastAttempts, 1); assert.equal(record.intent.lamports, '1000000');
  const serialized = JSON.stringify(result.report);
  for (const prohibited of ['nativeWire', 'payerPublicKey', 'nonceAccountPublicKey', 'sourcePublicKey', 'privateKey', 'seed', 'ledgerPath'])
    assert.equal(serialized.includes(prohibited), false);
  assert.equal(serialized.includes(record.nativeWire), false); assert.equal(serialized.includes(record.nativeId), false);
  assert.equal((await fsp.stat(audit)).mode & 0o077, 0);
  assert.equal(await fsp.readFile(join(run, '.gitignore'), 'utf8'), '*\n');
  await assert.rejects(fsp.access(join(testRoot, 'active.lock')), { code: 'ENOENT' });
});

test('lost original transfer reply is observed by exact identity without a second send', async () => {
  const result = await runFixture({ uncertainSend: 3 });
  assert.equal(result.report.success, true, JSON.stringify(result.report));
  assert.equal(control.sends, 4); assert.equal(control.stops, 1); assert.equal(control.removes, 1);
});

test('stopped attempt preserves signed evidence, closes owned runtime, and does not start solver delivery', async () => {
  const result = await runFixture({ stopAfterSend: 3 });
  assert.equal(result.report.success, false); assert.equal(result.report.phase, 'stopped');
  assert.equal(result.report.errorCode, 'SOLANA_CANDIDATE_HOST_TEST_STOP');
  assert.equal(control.sends, 3); assert.equal(control.stops, 1); assert.equal(control.removes, 1);
  assert.equal(result.report.cleanup.ownedProcessStopped, true);
  const audit = join(result.reportPath.slice(0, -'/report.json'.length), 'private-audit');
  const last = JSON.parse(await fsp.readFile(join(audit, 'last-retained-records.json')));
  assert.equal(last.custody.length, 2); assert.equal(last.solver.length, 0);
  assert.equal(last.custody[1].broadcastAttempts, 1);
  assert.ok(control.seeds.every(seed => seed.every(byte => byte === 0)));
});

test('constructor bootstrap rejection retains only available diagnostics and closes before any deposit', async () => {
  const result = await runFixture({ bootstrapPrepareReject: true });
  assert.equal(result.report.success, false); assert.equal(result.report.phase, 'stopped');
  assert.equal(result.report.errorCode, 'SOLANA_CANDIDATE_HOST_BOOTSTRAP_REJECTED');
  assert.equal(control.spawns, 1); assert.equal(control.sends, 0);
  assert.equal(control.stops, 1); assert.equal(control.removes, 1);
  assert.equal(result.report.cleanup.ownedProcessStopped, true);
  assert.equal(result.report.cleanup.syntheticKeysAndLedgerRemoved, true);
  assert.equal(result.report.checks.ownedChildGone, true);
  const audit = join(result.reportPath.slice(0, -'/report.json'.length), 'private-audit');
  const stopped = JSON.parse(await fsp.readFile(join(audit, 'stopped.json')));
  assert.equal(stopped.nonceBootstrapPreparation.signed, false);
  assert.equal(stopped.nonceBootstrap, undefined);
  await assert.rejects(fsp.access(join(audit, 'last-retained-records.json')), { code: 'ENOENT' });
  assert.ok(control.seeds.every(seed => seed.every(byte => byte === 0)));
});

test.after(async () => { process.argv = oldArgv; await fsp.rm(testRoot, { recursive: true, force: true }); });
