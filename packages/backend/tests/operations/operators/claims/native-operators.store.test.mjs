/** Real encrypted V3 graph storage and real secp256k1 signatures; explicit
 * owned-state/native fixtures. No chain daemon, compiler, prover or funds. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { AssertionError } from 'node:assert';
import * as crypto from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
let facts;
import { nativeAdmissionRulesTree } from '@lianum/engine/execution/native/dispatch/native-admission';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { checkpointAuthorizationDigest } from '@lianum/engine/evidence/native-hub-messages';
import { recoverSecp256k1Sender } from '../../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import { flatNativeHealthDigest } from '../../../../src/chains/shared/health/native-health.mjs';
import { SOLANA_NONCE_INGRESS_PROFILE } from "../../../../src/chains/solana/runtime/solana-profiles.mjs";

const sha = value => crypto.createHash('sha256').update(value).digest('hex'), copy = value => structuredClone(value);
const prefix = value => '0x' + value, word = value => BigInt(value).toString(16).padStart(64, '0'), ZERO = word(0);
const url = path => new URL(path, import.meta.url).href;
const runtimes = new WeakMap(), systems = new WeakMap(), natives = new WeakSet(), controls = new Map(), peers = [];
let derivations = 0;
// These fixtures exercise the original flat graph/claim branch. DeFi observer
// factories are an unavailable HOST port; they must never mint a capability here.
mock.module(new URL('../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs', import.meta.url).href, { exports: {
  isOwnedMetaMorphoGraphDeliveryObserverV1() { return false; },
  isOwnedUniswapGraphDeliveryObserverV1() { return false; },
  isOwnedAaveStaticGraphDeliveryObserverV1() { return false; },
  isOwnedMorphoBluePositionGraphDeliveryObserverV1() { return false; },
  isOwnedOfficialGraphDeliveryObserverV1() { return false; },
  assertOwnedMetaMorphoGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedAaveStaticGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedAaveStaticGraphDeliveryFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMorphoBluePositionGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMorphoBluePositionGraphDeliveryFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedUniswapGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMetaMorphoGraphDeliveryFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedUniswapGraphDeliveryFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  readOriginalEvmGraphDeliveryEconomicFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMetaMorphoGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedAaveStaticGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMorphoBluePositionGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedUniswapGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  prepareOwnedMetaMorphoGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  prepareOwnedAaveStaticGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  prepareOwnedMorphoBluePositionGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  prepareOwnedUniswapGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedMetaMorphoGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedUniswapGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedAaveStaticGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedMorphoBluePositionGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  isOwnedMetaMorphoGraphDeliveryBatchV4() { return false; },
  readOriginalMetaMorphoGraphBatchRoutersV4() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  readOriginalMetaMorphoGraphBatchFactsBindingsV4() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedMetaMorphoGraphDeliveryBatchV4() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  reopenOwnedMetaMorphoGraphDeliveryBatchV4() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
} });
mock.module('node:crypto', { exports: { ...Object.fromEntries(Object.entries(crypto).filter(([name]) => name !== 'default')),
  scryptSync(...args) { derivations++; return crypto.scryptSync(...args); },
} });
const actualStore = await import('../../../../src/claims/storage/segmented-record-store.mjs');
mock.module('@lianum/engine/storage/records', { exports: { ...actualStore,
  async createClaimRecordStore(input, initial) {
    const control = controls.get(input.path); assert.ok(control, 'TEST_EXPECTED_GRAPH_V3_PATH');
    control.identity = copy(input.identity); control.initial = copy(initial);
    if (control.fullAuthorizations) initial = { ...initial, authorizations: Array.from({ length: 256 }, (_, i) => ({
      kind: 'health', digest: sha('retained-' + i), message: {}, signature: 'retained', abiSignature: {} })) };
    control.actual = await actualStore.createClaimRecordStore(input, initial);
    return Object.freeze({
      async read() { control.reads++; const row = await control.actual.read();
        return control.changeCommitment ? { ...row, commitment: sha('wrong-commitment') } : row; },
      async update(revision, transform) {
        control.revisions.push(revision); const row = await control.actual.update(revision, transform);
        if (control.loseReply) throw new Error('CLAIM_STORE_TEST_ACK_LOST');
        return row;
      },
      close() { control.closes++; control.actual.close(); },
    });
  },
} });
mock.module(url('../../../../src/chains/evm/runtime/local-evm-ownership.mjs'), { exports: {
  assertLocalEvmDeploymentProfile() { assert.fail('TEST_NO_DEPLOYMENT_PROFILE'); },
  async assertLocalEvm(runtime) { assert.ok(runtimes.has(runtime), 'TEST_OWNED_RUNTIME'); },
} });
mock.module(url('../../../../src/operations/deployments/system/deploy-system.mjs'), { exports: {
  deployFlatSystem() { assert.fail('TEST_NO_DEPLOYMENT'); },
  assertOwnedFlatSystem(runtime, system) { assert.equal(systems.get(system), runtime); },
} });
mock.module(url('../../../../src/claims/operations/owned-state.mjs'), { exports: {
  assertOwnedClaimObserver() { assert.fail('TEST_NO_CLAIM_BRANCH'); },
  ownedClaimObserverBindings() { assert.fail('TEST_NO_CLAIM_BRANCH'); },
} });
mock.module(url('../../../../src/chains/solana/runtime/owned-solana-runtime.mjs'), { exports: {
  assertOwnedSolanaRuntimeLive() { assert.fail('TEST_NO_SOLANA_EXTRA_CAPABILITY'); },
  readOwnedSolanaRuntimeAuditState() { assert.fail('TEST_NO_SOLANA_EXTRA_CAPABILITY'); },
  readOwnedSolanaSplOriginalGraphV3() { assert.fail('TEST_NO_SOLANA_EXTRA_CAPABILITY'); },
  assertOwnedSolanaSplOriginalGraphV3() { assert.fail('TEST_NO_SOLANA_EXTRA_CAPABILITY'); },
  consumeOwnedSolanaSplContextV1() { assert.fail('TEST_NO_SPL_CONTEXT'); },
  isOwnedSolanaSplCustodyV1() { return false; },
  assertOwnedSolanaSplGraphPairV1() { assert.fail('TEST_NO_SPL_GRAPH'); },
  assertOwnedSolanaSplCustodyV1() { assert.fail('TEST_NO_SPL_CUSTODY'); },
  SOLANA_NONCE_INGRESS_PROFILE,
  assertOwnedSolanaRuntime(native) { assert.ok(natives.has(native), 'TEST_OWNED_NATIVE'); },
} });
mock.module(url('../../../../src/chains/evm/vault/evm-vault-delivery-observer.mjs'), { exports: {
  assertOwnedEvmVaultDeliveryObserver() { assert.fail('TEST_NO_EVM_DELIVERY'); },
  assertOwnedEvmVaultDeliveryFacts() { assert.fail('TEST_NO_EVM_DELIVERY'); },
} });
mock.module(url('../../../../src/execution/account/reconciliation/flat-system-state.mjs'), { exports: {
  async createFlatSystemStateReader({ runtime, system, poolIndex }) {
    assert.equal(systems.get(system), runtime); const f = runtimes.get(runtime), issued = new WeakSet();
    return Object.freeze({ async read() { const view = copy(f.view(poolIndex)); issued.add(view); return view; },
      async assertCurrent(view) { assert.ok(issued.has(view)); assert.deepEqual(view, f.view(poolIndex));
        if (f.failCurrent) throw new Error('FLAT_STATE_TEST_CURRENT_FAILED'); } });
  },
} });
facts = await import('../../../../src/chains/shared/dispatch/native-facts-peer.mjs');
mock.module(url('../../../../src/chains/shared/dispatch/native-facts-peer.mjs'), { exports: { ...facts,
  async createNativeFactsPeer(input) { peers.push({ signerIndex: input.signerIndex, store: input.store }); return facts.createNativeFactsPeer(input); },
} });
const { createLocalFlatOperator, createFlatOperatorQuorum, LOCAL_FLAT_OPERATOR_PROFILE } = await import('../../../../src/operations/operators/claims/native-operators.mjs');

async function fixture(t, { count = 1, failCurrent = false, fullAuthorizations = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'graph-operator-v3-'));
  const operators = [0, 1, 2, 3].map(signerIndex => createLocalFlatOperator({ signerIndex })), startPeers = peers.length;
  const control = { reads: 0, revisions: [], closes: 0, changeCommitment: false, loseReply: false, fullAuthorizations };
  const allControls = [control, ...[1, 2, 3].map(() => ({ ...control, revisions: [] }))];
  for (let i = 0; i < 4; i++) controls.set(join(directory, 'flat-operator-' + i + '.v3'), allControls[i]);
  t.after(async () => { operators.forEach(operator => operator.close());
    for (let i = 0; i < 4; i++) controls.delete(join(directory, 'flat-operator-' + i + '.v3'));
    await rm(directory, { recursive: true, force: true }); });
  const rule = { family: '2', genesis: sha('genesis'), asset: sha('asset'), finalityKind: '2', minimumConfirmations: '0',
    maximumEvidenceLifetime: '120', maximumClockSkew: '30' }, tree = nativeAdmissionRulesTree([rule]);
  const registry = { profile: facts.FACTS_QUORUM_PROFILE, hubDomain: sha('hub'), registryEpoch: '1', rulesRoot: tree.root,
    keys: operators.map(operator => operator.publicKey) }, registryCommitment = facts.nativeFactsRegistryCommitment(registry);
  const head = { number: '60', timestamp: '1000', hash: sha('head') }, poolAddresses = [0, 1].map(i => prefix(sha('pool-' + i).slice(0, 40)));
  const native = Object.freeze({ genesisHex: prefix(rule.genesis), close() {},
    adapter({ asset, recipientIndex }) { assert.equal(asset, rule.asset); return { binding: { family: '2', genesis: rule.genesis,
      asset, sourceEndpoint: sha('source'), destinationEndpoint: sha('recipient-' + recipientIndex) } }; },
    factReader() { return { async observe() { assert.fail('TEST_EMPTY_NATIVE_INVENTORY'); } }; } });
  natives.add(native);
  const runtime = Object.freeze({ metadata: { scratchDirectory: directory, evmGenesis: prefix(sha('evm')) },
    async block() { return copy(view(0).header); },
    async call({ to, data }, at) {
      assert.equal(to, '0x0000000000000000000000000000000000000001'); assert.equal(at, '0x3c');
      if (control.recoveryError) throw control.recoveryError;
      const w = data.slice(2).match(/.{64}/g);
      return '0x' + '00'.repeat(12) + recoverSecp256k1Sender({ digest: w[0], r: w[2], s: w[3], parity: Number(BigInt('0x' + w[1]) - 27n) }).slice(2);
    } });
  function view(poolIndex) {
    return { poolIndex, poolAddress: poolAddresses[poolIndex], head: copy(head), header: { number: '0x3c', hash: prefix(head.hash), timestamp: '0x3e8' },
      snapshot: { poolStateSequence: '0', hubStateSequence: '0' }, checkpointCount: '0',
      healthState: { pool: poolAddresses[poolIndex].slice(2), domain: word(1), hubDomain: registry.hubDomain, registryCommitment,
        evidenceState: word(2), receiptRoot: word(3), receiptCount: '0', spentTagDigest: ZERO, spentTagCount: '0', spentTagSequence: '0',
        revokedDigest: word(4), revokedCount: '0', revocationSequence: '0', stateSequence: '0', revocationOverflowDigest: ZERO,
        revocationOverflowCount: '0', halted: '0', timestamp: head.timestamp } };
  }
  const system = Object.freeze({ registry, registryCommitment: prefix(registryCommitment), hubDomain: prefix(registry.hubDomain),
    ledgerNamespace: prefix(registry.hubDomain), hub: { address: prefix(sha('hub-address').slice(0, 40)), receipt: { transactionHash: prefix(sha('deploy')) },
      async call(method, args, at) {
        assert.equal(at, '0x3c');
        if (method === 'attester(uint8)') {
          const key = registry.keys[args[0]];
          return prefix(key.x + key.y + '00'.repeat(12) + publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex'));
        }
        if (method === 'finalityHealthDigest(address,uint64,uint64)') {
          const { timestamp, ...state } = view(poolAddresses.indexOf(args[0])).healthState;
          return prefix(flatNativeHealthDigest({ ...state, validFrom: args[1], validUntil: args[2] }));
        }
        if (method === 'checkpointAuthorizationDigest(address,uint64,uint64,bytes32,uint64)')
          return checkpointAuthorizationDigest({ hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
            pool: args[0], expectedPoolSequence: args[1], expectedHubStateSequence: args[2], requestId: args[3], validUntil: args[4] });
        assert.fail(method);
      } } });
  runtimes.set(runtime, { view, failCurrent }); systems.set(system, runtime);
  const binding = { runtime, system, bitcoin: null, solana: native, rules: [rule], rulePaths: tree.paths };
  return { directory, operators, control, allControls, registry, binding, startDerivations: derivations,
    async bind() { for (const operator of operators.slice(0, count)) await operator.bind(binding); },
    peer: () => peers[startPeers].store };
}

test('fresh graph V3 identity preserves original configuration and leaves the golden vault untouched', async t => {
  const f = await fixture(t), old = join(f.directory, 'flat-operator-0.vault'); await writeFile(old, 'ORIGINAL GOLDEN EVIDENCE');
  await f.bind(); const operator = f.operators[0], path = operator.status().inventoryPath;
  assert.equal(path, join(f.directory, 'flat-operator-0.v3')); assert.equal((await stat(path)).isDirectory(), true);
  assert.equal(await readFile(old, 'utf8'), 'ORIGINAL GOLDEN EVIDENCE');
  assert.deepEqual(f.control.identity, { schema: 'LOCAL_FLAT_OPERATOR_STORE_IDENTITY_V3', profile: LOCAL_FLAT_OPERATOR_PROFILE,
    signerIndex: 0, publicKey: operator.publicKey, binding: f.control.initial.binding, registry: f.registry });
  assert.equal(f.control.initial.schema, 'LOCAL_FLAT_OPERATOR_INVENTORY_V3');
  assert.equal(derivations - f.startDerivations, 1);
  assert.equal(operator.close(), undefined); assert.equal(operator.status().closed, true);
  await assert.rejects(f.control.actual.read(), /CLOSED_OR_UNCERTAIN/);
});

test('genuine graph checkpoint and health quorums use real storage with one KDF per operator session', async t => {
  const f = await fixture(t, { count: 3 }); await f.bind();
  const quorum = createFlatOperatorQuorum({ operators: f.operators.slice(0, 3) });
  const checkpoint = await quorum.checkpoint({ poolIndex: 0, requestId: sha('storage-preflight') });
  const health = await quorum.health({ poolIndex: 0 });
  assert.equal(checkpoint.signatures.length, 3); assert.equal(health.signatures.length, 3);
  assert.equal(derivations - f.startDerivations, 3, 'authenticated reads/updates must not rerun password derivation');
  for (const control of f.allControls.slice(0, 3)) {
    assert.ok(control.reads > 5); const row = await control.actual.read();
    assert.deepEqual(row.data.authorizations.map(auth => auth.kind), ['checkpoint', 'health']);
    assert.ok(row.data.authorizations.every(auth => auth.signature && auth.abiSignature));
  }
});

test('graph V3 peer storage retains CAS and the original one-MiB logical-record bound', async t => {
  const f = await fixture(t); await f.bind(); const peer = f.peer(), before = await peer.load();
  await peer.commit({ expectedRevision: before.revision, nextState: { ...before.state, storageFixture: 'retained' } });
  const next = await peer.load(); assert.equal(next.revision, '1'); assert.equal(next.state.storageFixture, 'retained');
  await assert.rejects(peer.commit({ expectedRevision: before.revision, nextState: before.state }), /FLAT_OPERATOR_CAS/);
  const revision = (await f.control.actual.read()).revision, calls = f.control.revisions.length;
  await assert.rejects(peer.commit({ expectedRevision: next.revision, nextState: { ...next.state, oversized: 'x'.repeat(1024 * 1024) } }),
    error => error.message === 'FLAT_OPERATOR_DURABLE_WRITE_UNCERTAIN' && /byte limit/.test(error.cause.message));
  assert.equal(f.control.revisions.length, calls); assert.equal((await f.control.actual.read()).revision, revision);
  assert.equal(f.operators[0].status().poisoned, true);
});

test('changed authenticated commitment or ciphertext poisons graph reads', async t => {
  for (const kind of ['commitment', 'ciphertext']) {
    const f = await fixture(t); await f.bind();
    if (kind === 'commitment') f.control.changeCommitment = true;
    else {
      const path = join(f.operators[0].status().inventoryPath, 'objects'), file = join(path, (await readdir(path))[0]);
      const envelope = JSON.parse(await readFile(file, 'utf8')); envelope.tag = '0'.repeat(32); await writeFile(file, JSON.stringify(envelope));
    }
    await assert.rejects(f.operators[0].audit(), /FLAT_OPERATOR_INVENTORY_UNAVAILABLE_OR_CHANGED/);
    assert.equal(f.operators[0].status().poisoned, true);
  }
});

test('uncertain graph V3 commit retains data and failed bind closes the original storage session', async t => {
  const f = await fixture(t); await f.bind(); const peer = f.peer(), before = await peer.load(); f.control.loseReply = true;
  await assert.rejects(peer.commit({ expectedRevision: before.revision, nextState: { ...before.state, retainedAfterLostReply: true } }),
    /FLAT_OPERATOR_DURABLE_WRITE_UNCERTAIN/);
  assert.equal((await f.control.actual.read()).data.inventories['2'].state.retainedAfterLostReply, true);
  assert.equal(f.operators[0].status().poisoned, true);
  const failed = await fixture(t, { failCurrent: true }); await assert.rejects(failed.bind(), /FLAT_OPERATOR_BIND_FAILED/);
  assert.equal(failed.control.closes, 1); await assert.rejects(failed.control.actual.read(), /CLOSED_OR_UNCERTAIN/);
});

test('graph V3 does not relax the 256-authorization history cap', async t => {
  const f = await fixture(t, { fullAuthorizations: true }); await f.bind();
  await assert.rejects(f.operators[0].health({ poolIndex: 0 }), /FLAT_OPERATOR_AUTHORIZATION_CAPACITY/);
  assert.equal((await f.control.actual.read()).data.authorizations.length, 256);
});

test('graph signing uncertainty reports only bounded exact protocol codes, preserving its original cause', async t => {
  const f = await fixture(t); await f.bind();
  const inner = new AssertionError({ message: 'CLAIM_OPERATOR_AUDIT_TOO_OLD', actual: 'private actual data', expected: 'private expected data', operator: 'strictEqual' });
  const original = new Error('CLAIM_OPERATOR_JOURNAL_UNAVAILABLE', { cause: inner }); f.control.recoveryError = original;
  await assert.rejects(f.operators[0].health({ poolIndex: 0 }), error => {
    assert.equal(error.code, 'FLAT_OPERATOR_SIGNING_UNCERTAIN'); assert.equal(error.cause, original);
    assert.equal(error.causeCode, 'CLAIM_OPERATOR_AUDIT_TOO_OLD');
    assert.deepEqual(error.causeCodes, ['CLAIM_OPERATOR_JOURNAL_UNAVAILABLE', 'CLAIM_OPERATOR_AUDIT_TOO_OLD']);
    assert.ok(Object.isFrozen(error.causeCodes));
    assert.ok(!JSON.stringify({ causeCode: error.causeCode, causeCodes: error.causeCodes }).includes('private'));
    return true;
  });
  assert.equal(f.operators[0].status().poisoned, true);
});

test('ordinary multiline, accessor and generated assertion diagnostics stay opaque', async t => {
  for (const kind of ['multiline', 'accessor', 'generated']) {
    const f = await fixture(t); await f.bind(); let accessed = false;
    const original = kind === 'generated' ? new AssertionError({ actual: 'secret', expected: 'other', operator: 'strictEqual' })
      : new Error(kind === 'multiline' ? 'FLAT_OPERATOR_AUDIT_TOO_OLD\nsecret payload' : 'private error detail');
    if (kind === 'accessor') Object.defineProperty(original, 'code', { get() { accessed = true; throw new Error('UNEXPECTED'); } });
    f.control.recoveryError = original;
    await assert.rejects(f.operators[0].health({ poolIndex: 0 }), error => {
      assert.equal(error.cause, original); assert.equal(error.causeCode, null); assert.deepEqual(error.causeCodes, []); return true;
    });
    assert.equal(accessed, false);
  }
});

test('graph signing diagnostics cap cause depth and terminate cycles', async t => {
  for (const cycle of [false, true]) {
    const f = await fixture(t); await f.bind();
    let original;
    if (cycle) { original = new Error('FLAT_OPERATOR_AUDIT_TOO_OLD'); original.cause = original; }
    else for (let i = 0; i < 12; i++) original = new Error('FLAT_OPERATOR_TEST_LAYER_' + i, original ? { cause: original } : undefined);
    f.control.recoveryError = original;
    await assert.rejects(f.operators[0].health({ poolIndex: 0 }), error => {
      assert.equal(error.cause, original); assert.equal(error.causeCodes.length, cycle ? 1 : 6);
      assert.ok(error.causeCodes.every(value => /^[A-Z0-9_]{1,128}$/.test(value)));
      return true;
    });
  }
});
