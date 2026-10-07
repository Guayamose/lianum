/** Operator/storage integration only. Test-owned brands replace native/observer
 * construction; actual V3 encryption, CAS, readback and peer state stores run.
 * No native node, proof, compiler, private transaction or timing measurement. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as storeModule from '../../../src/claims/storage/segmented-record-store.mjs';
import * as facts from '../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import { nativeAdmissionRulesTree } from '../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { nativeRuleCommitment } from '../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment } from '../../../src/claims/protocol/framing.mjs';
import { ownedCustodyRoute } from '../../../src/chains/shared/runtime/owned-native-custody.mjs';
const hash = value => createHash('sha256').update(value).digest('hex'), copy = value => structuredClone(value);
const observers = new WeakMap(), natives = new WeakSet(), controls = new Map(), capturedPeers = [];
const url = path => new URL(path, import.meta.url).href;
mock.module(url('./owned-state.mjs'), { exports: {
  assertOwnedClaimObserver(observer) { assert.ok(observers.has(observer), 'TEST_OWNED_CLAIM_OBSERVER'); },
  ownedClaimObserverBindings(observer) { assert.ok(observers.has(observer)); return observers.get(observer); },
} });
mock.module(url('../chain-adapters/owned-solana-runtime.mjs'), { exports: {
  SOLANA_NONCE_INGRESS_PROFILE: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',
  assertOwnedSolanaRuntime(native) { assert.ok(natives.has(native), 'TEST_OWNED_SOLANA'); },
} });
mock.module(url('../chain-adapters/native-facts-peer.mjs'), { exports: { ...facts,
  async createNativeClaimFactsPeer(input) { capturedPeers.push(input.store); return facts.createNativeClaimFactsPeer(input); },
} });
mock.module(url('./segmented-record-store.mjs'), { exports: { ...storeModule,
  async createClaimRecordStore(input, initial) {
    const control = controls.get(input.path); assert.ok(control, 'TEST_EXPECTED_FRESH_V3_PATH');
    control.identity = copy(input.identity); control.initial = copy(initial);
    const actual = await storeModule.createClaimRecordStore(input, initial); control.actual = actual;
    return Object.freeze({
      async read() { const value = await actual.read(); control.reads++;
        return control.changeCommitment ? { ...value, commitment: hash('substituted commitment') } : value; },
      async update(expectedRevision, transform) { control.revisions.push(expectedRevision);
        const value = await actual.update(expectedRevision, transform);
        if (control.loseWriteReply) throw Error('TEST_V3_COMMIT_ACK_LOST'); return value; },
      recovery: actual.recovery,
      close() { control.closes++; return actual.close(); },
    });
  },
} });
const { createLocalClaimOperator, CLAIM_OPERATOR_PROFILE } = await import('../../../src/claims/operations/operators.mjs');
async function fixture({ failCurrent = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'claim-operator-v3-'));
  const operators = [0, 1, 2, 3].map(signerIndex => createLocalClaimOperator({ signerIndex }));
  const operator = operators[1], path = join(directory, 'claim-operator-1.v3');
  const control = { reads: 0, revisions: [], closes: 0, changeCommitment: false, loseWriteReply: false };
  controls.set(path, control);
  const rules = [0, 1].map(index => ({ family: '2', genesis: hash('genesis' + index), asset: hash('asset' + index),
    finalityKind: '2', minimumConfirmations: '0', maximumEvidenceLifetime: '120', maximumClockSkew: '30' }));
  const tree = nativeAdmissionRulesTree(rules);
  const registry = { profile: facts.FACTS_QUORUM_PROFILE, hubDomain: hash('hub'), registryEpoch: '1',
    rulesRoot: tree.root, keys: operators.map(value => value.publicKey) };
  const registryCommitment = facts.nativeFactsRegistryCommitment(registry);
  const policies = rules.map(rule => ({ rule, ledgerNamespace: registry.hubDomain, hubDomain: registry.hubDomain, registryCommitment }));
  const configs = rules.map((rule, index) => ({ ...Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? hash(name + index).slice(0, 40) : type === 'field32' ? '01' + hash(name + index).slice(2)
      : type === 'u256' ? '31337' : type === 'u64' ? '5000' : type === 'u8' ? '2' : hash(name + index)])),
    hubDomain: registry.hubDomain, ledgerNamespace: registry.hubDomain, registryCommitment,
    nativeFamily: rule.family, nativeGenesis: rule.genesis, nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule) }));
  const nativeRuntimes = configs.map((config, index) => {
    const roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role, { endpoint: hash(role + index) }]));
    const native = { roles, close() {}, async inventory() { throw Error('TEST_NO_NATIVE_OBSERVATION'); },
      adapter({ route }) { const spec = ownedCustodyRoute(route); return { binding: {
        sourceEndpoint: roles[spec.sourceRole].endpoint, destinationEndpoint: roles[spec.destinationRole].endpoint } }; },
      factReader() { return { async observe() { throw Error('TEST_NO_FACT_CERTIFICATION'); } }; } };
    Object.freeze(native); natives.add(native); return native;
  });
  const view = { head: { hash: hash('head'), timestamp: '1000', number: '1' }, gateways: configs.map(config => ({ claimDomain: claimDomainCommitment(config) })) };
  const observer = { async read() { return copy(view); }, async assertCurrent(value) {
    assert.deepEqual(value, view); if (failCurrent) throw Error('TEST_BIND_CURRENT_FAILED'); } };
  observers.set(observer, { configs, policies, registry, nativeRuntimes, journalRoot: directory });
  const firstPeer = capturedPeers.length;
  return { directory, path, operator, observer, configs, policies, registry, control,
    peers: () => capturedPeers.slice(firstPeer),
    async close() { operators.forEach(value => value.close()); controls.delete(path); await rm(directory, { recursive: true, force: true }); } };
}
test('operator creates a separate V3 store with exact complete identity and synchronous close', async () => {
  const f = await fixture();
  try {
    const v2 = join(f.directory, 'claim-operator-1.vault'); await writeFile(v2, 'UNTOUCHED V2 EVIDENCE');
    await f.operator.bind(f.observer);
    assert.equal((await stat(f.path)).isDirectory(), true); assert.equal(await readFile(v2, 'utf8'), 'UNTOUCHED V2 EVIDENCE');
    assert.deepEqual(f.control.identity, { schema: 'NATIVE_CLAIM_OPERATOR_STORE_IDENTITY_V3', profile: CLAIM_OPERATOR_PROFILE,
      signerIndex: 1, publicKey: f.operator.publicKey, configurations: f.configs, registry: f.registry, policies: f.policies });
    assert.equal(f.control.initial.schema, 'NATIVE_CLAIM_OPERATOR_JOURNAL_V3');
    assert.deepEqual(Object.keys(f.control.initial).sort(), ['schema', 'signerIndex', 'publicKey', 'configurations', 'bindings', 'peers',
      'contexts', 'adverse', 'nativePreparations', 'inventorySnapshots', 'inventoryAudits', 'authorizations'].sort());
    assert.equal(f.control.actual.recovery().openedFromDisk, false);
    assert.equal(f.operator.close(), undefined); assert.equal(f.operator.status().closed, true);
    await assert.rejects(f.control.actual.read(), /CLOSED_OR_UNCERTAIN/);
  } finally { await f.close(); }
});
test('operator peer journal preserves a record above 1 MiB with exact revision CAS and full readback', async () => {
  const f = await fixture();
  try {
    await f.operator.bind(f.observer); const peer = f.peers()[0], previous = await peer.load();
    const history = Array.from({ length: 24 }, (_, i) => ({ operationId: hash('original' + i), retainedBytes: 'ab'.repeat(25000) }));
    const nextState = { ...previous.state, hostStorageFixture: history };
    await peer.commit({ expectedRevision: previous.revision, nextState });
    const retained = await peer.load(); assert.equal(retained.revision, '1'); assert.deepEqual(retained.state, nextState);
    assert.deepEqual(f.control.revisions, [0]); assert.ok(Buffer.byteLength(JSON.stringify((await f.control.actual.read()).data)) > 1024 * 1024);
    await assert.rejects(peer.commit({ expectedRevision: '0', nextState: previous.state }), /CLAIM_PEER_CAS/);
    assert.deepEqual(await peer.load(), retained); assert.equal(f.operator.status().poisoned, false);
  } finally { await f.close(); }
});
test('a changed V3 commitment poisons the operator even if plaintext data is identical', async () => {
  const f = await fixture();
  try {
    await f.operator.bind(f.observer); f.control.changeCommitment = true;
    await assert.rejects(f.peers()[0].load(), error => error.message === 'CLAIM_OPERATOR_JOURNAL_UNAVAILABLE'
      && /JOURNAL_CHANGED/.test(error.cause.message));
    assert.equal(f.operator.status().poisoned, true); assert.deepEqual(f.control.revisions, []);
  } finally { await f.close(); }
});
test('uncertain V3 update retains committed history and blocks further operator work', async () => {
  const f = await fixture();
  try {
    await f.operator.bind(f.observer); const peer = f.peers()[0], previous = await peer.load(); f.control.loseWriteReply = true;
    await assert.rejects(peer.commit({ expectedRevision: previous.revision, nextState: { ...previous.state, hostRetained: 'original effect' } }),
      error => error.message === 'CLAIM_OPERATOR_DURABLE_WRITE_UNCERTAIN' && error.cause.message === 'TEST_V3_COMMIT_ACK_LOST');
    assert.equal(f.operator.status().poisoned, true); assert.deepEqual(f.control.revisions, [0]);
    await assert.rejects(f.operator.audit(), /CLOSED_OR_POISONED/);
    assert.equal((await f.control.actual.read()).revision, 1);
  } finally { await f.close(); }
});
test('failed bind closes the new store before returning its original failure', async () => {
  const f = await fixture({ failCurrent: true });
  try {
    await assert.rejects(f.operator.bind(f.observer), error => error.message === 'CLAIM_OPERATOR_BIND_FAILED'
      && error.cause.message === 'TEST_BIND_CURRENT_FAILED');
    assert.equal(f.control.closes, 1); assert.equal(f.operator.status().poisoned, true);
    await assert.rejects(f.control.actual.read(), /CLOSED_OR_UNCERTAIN/);
  } finally { await f.close(); }
});
