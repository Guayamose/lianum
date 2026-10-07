/** Synthetic host regression for the real native-value keeper. Runtime,
 * native adapters, ownership origins and proof execution are explicit mocks.
 * Envelope commitments, reservation/recovery witnesses and terminal calldata
 * use production codecs. This is not proof or native-chain acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrivateNoteTree } from '../../../../../engine/src/notes/private-note-tree.mjs';
import { nativeAdmissionRulesTree, nativeAdmissionRuleCommitment }
  from '../../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { createCommitmentCodec, SCHEMAS, ZERO } from '../../../../src/execution/encoding/commitments.mjs';
import { FIELD_MODULUS, encodeStatement, RELATIONS } from '../../../../src/execution/encoding/statements.mjs';
import { FLAT_TRANSACTION_METHODS } from '../../../../src/execution/encoding/transaction-codec.mjs';
import { validateFlatExecutionPreparation } from '../../../../src/execution/account/execution/flat-native-execution.mjs';
import * as actualReadiness from '../../../../src/execution/account/preparation/readiness-inputs.mjs';
const h = value => createHash('sha256').update('terminal-first host: ' + value).digest('hex');
const field = value => '00' + h(value).slice(2), p = value => '0x' + value;
const copy = value => structuredClone(value);
const testHash = async values => (BigInt('0x' + h(values.map(String).join(','))) % FIELD_MODULUS).toString(16).padStart(64, '0');
const states = new WeakMap(), stores = new Map(), fixtures = new Map();
const fFor = domain => fixtures.get(domain);
// Module mock targets are relative to the generated compatibility runtime.
const mod = path => new URL(path, import.meta.url).href;
const mockModule = (path, exports) => mock.module(mod(path), { exports });
const checkedSystem = (runtime, system) => assert.equal(states.get(runtime)?.system, system, 'TEST_ORIGINAL_SYSTEM');
const checkedQuorum = (quorum, {runtime, system}) => {
  checkedSystem(runtime, system); assert.equal(quorum, states.get(runtime).quorum, 'TEST_ORIGINAL_QUORUM');
};
mockModule('../ops/wrapped-wallet-release-v1.mjs', { assertWrappedWalletAccountReleasedV1() {} });
const unusedWrapped = () => { throw new Error('TEST_UNUSED_WRAPPED_BRANCH'); };
mockModule('../ops/wrapped-claim-wallet-binding-v1.mjs', { assertOwnedWrappedClaimWalletSystemV1: unusedWrapped });
mockModule('../ops/wrapped-claim-graph-operators-v1.mjs', { assertOwnedNativeValueQuorum: unusedWrapped });
mockModule('../chain-adapters/wrapped-claim-dispatch-owner-v1.mjs', {
  assertOwnedNativeValueProviderCustody: unusedWrapped, ownedNativeValueProviderCustodyReview: unusedWrapped,
});
mockModule('../chain-adapters/wrapped-claim-graph-dispatch-gate-v1.mjs', { createOwnedNativeValueProvider: unusedWrapped });
mockModule('./wrapped-wallet-graph-admission-v1.mjs', { createOwnedWrappedWalletGraphAdmissionV1: unusedWrapped });
mockModule('./wrapped-wallet-state-v1.mjs', { createWrappedWalletStateReaderV1: unusedWrapped });
mockModule('../chain-adapters/owned-evm-v2-runtime.mjs', { async refreshNativeValueReceiverClock(runtime) {
  assert.ok(states.has(runtime));
} });
mockModule('../chain-adapters/local-evm-ownership.mjs', { async assertLocalEvm(runtime) { assert.ok(states.has(runtime)); } });
mockModule('../ops/native-value-system-v2.mjs', { assertOwnedNativeValueSystem: checkedSystem });
mockModule('../ops/native-value-operators-v4.mjs', { assertOwnedNativeValueQuorum: checkedQuorum });
mockModule('../chain-adapters/native-value-dispatch-owner-v2.mjs', {
  assertOwnedNativeValueProviderCustody(custody, {runtime, system}) {
    checkedSystem(runtime, system); assert.equal(custody, states.get(runtime).custody);
  },
  ownedNativeValueProviderCustodyReview(custody, {runtime}) {
    assert.equal(custody, states.get(runtime).custody); return copy(states.get(runtime).review);
  },
});
mockModule('../chain-adapters/native-value-evm-dispatch-gate.mjs', {
  async createOwnedNativeValueProvider({runtime, dispatchLease}) {
    const f = states.get(runtime); assert.equal(dispatchLease, f.lease); f.providerCreates++; return f.provider;
  },
});
mockModule('./native-value-graph-admission-v2.mjs', {
  async createOwnedNativeValueGraphAdmission({runtime, provider}) {
    const f = states.get(runtime); assert.equal(provider, f.provider); return f.adapter;
  },
});
mockModule('./native-value-system-state-v2.mjs', { async createNativeValueSystemStateReader({runtime, system}) {
  checkedSystem(runtime, system); const f = states.get(runtime);
  return { async read() { return f.view; }, async assertCurrent(view) { assert.equal(view, f.view); },
    async authorizationPath(view, envelope) {
      assert.equal(view, f.view); assert.equal(envelope, f.prepared.rolePackets.reservation.envelope);
      return {root: f.authorization.root, ...f.authorization.opening(0)};
    },
  };
} });
mockModule('./native-value-terminal-observer-v2.mjs', {
  async createNativeValueTerminalObserver({runtime, system}) {
    checkedSystem(runtime, system); const f = states.get(runtime);
    return { async observe(query) {
      f.terminalReads.push(query.kind);
      if (f.terminalUnavailable) throw new Error('TEST_TERMINAL_UNAVAILABLE');
      if (f.terminalError) throw f.terminalError;
      const sent = f.sent.find(value => value.request.to === query.submission.target
        && value.request.data === query.submission.calldata);
      assert.ok(sent, 'TEST_ORIGINAL_TERMINAL_REQUIRED');
      assert.equal(query.statement.reserveNullifier, f.prepared.rolePackets.recovery.recovery.value.reserveNullifier);
      if (query.submission.transactionHash !== null) assert.equal(query.submission.transactionHash, sent.receipt.transactionHash.slice(2));
      return {outcome: query.kind === 'recovery' ? 'RECOVERED' : 'FULFILLED', original: true};
    }};
  },
  createWrappedWalletTerminalObserverV1() { throw new Error('TEST_UNUSED_WRAPPED_BRANCH'); },
});
mockModule('../../../proof-workers/native-value-live-v2-artifacts.mjs', { async loadNativeValueLiveArtifacts() {} });
mockModule('./flat-native-execution.mjs', { validateFlatExecutionPreparation });
mockModule('../../../../../omnichain-product/src/vault.mjs', { Vault: class {
  constructor(path) { this.path = path; }
  async create(data, password) { const entry = {password, record: {revision: 0, data: copy(data)}};
    assert.ok(!stores.has(this.path)); stores.set(this.path, entry); return copy(entry.record); }
  async read(password) { const entry = stores.get(this.path); assert.equal(entry.password, password); return copy(entry.record); }
  async update(password, revision, mutate) {
    const entry = stores.get(this.path); assert.equal(entry.password, password); assert.equal(entry.record.revision, revision);
    entry.record = {revision: revision + 1, data: copy(mutate(copy(entry.record.data)))};
    fFor(entry.record.data.domainCommitment.slice(2)).writes.push(copy(entry.record)); return copy(entry.record);
  }
} });
function statement(name, values = {}) {
  return Object.fromEntries(RELATIONS[name].fields.map(({name: key, type}) => [key,
    values[key] ?? (type === 'u64' ? '1100' : type.endsWith('[4]') ? Array(4).fill(field(key)) : field(key))]));
}
const readyStatement = (input, name) => statement(name, {domainCommitment: input.packet.domainCommitment,
  authorizationRoot: input.authorization.root, checkpoint: h('checkpoint'), readyFrom: input.readyFrom, readyUntil: input.readyUntil});
mockModule('./readiness-inputs.mjs', {...actualReadiness,
  async buildDependencyInputs(input) { return {statement: readyStatement(input, 'dependency')}; },
  async buildReadyInputs(input) { return {statement: readyStatement(input, 'ready'), admissionOpening: {fixture: true}}; },
});
mockModule('../../../proof-workers/scoped-proof-tools.mjs', {
  withFlatHash: work => work(testHash), loadFlatABI: async name => ({synthetic: name}),
  createFlatProofRunner() { return {async prove(name, job) {
    fFor(job.statement.domainCommitment).proofs.push(name);
    return {proof: '11'.repeat(32), publicInputs: [...encodeStatement(name, job.statement)]};
  }, async abort() {}, async close() {}}; },
});
const {createNativeValueExecution} = await import('../../../../src/execution/native-value/execution/native-value-execution-v2.mjs');
async function preparedFixture(families) {
  const rules = families.map(family => ({ family, genesis: h('genesis-' + family), asset: h(family === '3' ? 'BLTV' : 'asset-' + family),
    finalityKind: family, minimumConfirmations: family === '2' ? '0' : '6', maximumEvidenceLifetime: '300', maximumClockSkew: '30' }));
  const ruleTree = nativeAdmissionRulesTree(rules), codec = createCommitmentCodec({ hashFields: testHash });
  const domain = Object.fromEntries(SCHEMAS.domain.map(([name]) => [name, h(name === 'asset' ? 'PALT' : name)]));
  const d = await codec.domainCommitment(domain), core = { context: h('context'), reserveCommitment: h('reserve'), reserveNullifier: h('reserve-nf'), settleBefore: '2000' };
  const funding = { inputCommitment: h('input'), inputNullifier: h('input-nf'), reserveCommitment: core.reserveCommitment,
    changeCommitment: h('change'), operationId: h('operation'), fundingNotBefore: '1000', fundingValidUntil: '1100' };
  const outputs = [0, 1, 2, 3].map(slot => h('payout-' + slot));
  const local = [0, 1, 2, 3].map(slot => Object.fromEntries(SCHEMAS.local.map(([name, type]) => [name,
    name === 'slot' ? String(slot) : type === 'bool' ? slot === 0 : name === 'evidencePolicy' ? nativeAdmissionRuleCommitment(rules[0])
      : name === 'payoutCommitment' ? outputs[slot] : h(name + '-' + slot)])));
  const dependency = [0, 1, 2, 3].map(slot => ({ targetSlot: String(slot), targetContext: local[slot].targetContext, dependencyCount: '0',
    predecessors: Array.from({ length: 3 }, () => Object.fromEntries(SCHEMAS.predecessor.map(([name]) => [name, name === 'sourceSlot' ? '0' : ZERO]))),
    capsuleSalt: h('dependency-' + slot), targetJoinBlind: local[slot].targetJoinBlind }));
  const values = [['core', core], ['funding', funding], ['recovery', { reserveCommitment: core.reserveCommitment,
    reserveNullifier: core.reserveNullifier, recoveryCommitment: h('recovery'), settleBefore: core.settleBefore }],
    ['settlement', { ...core, outputs, context: core.context }], ...local.map(value => ['local', value]),
    ...dependency.map(value => ['dependency', value]), ...outputs.map((commitment, slot) => ['payout', { slot: String(slot), commitment }])];
  const openings = await Promise.all(values.map(async ([name, value], index) => ({ value, blind: h('blind-' + index),
    leaf: await codec[name + 'Leaf'](d, value, h('blind-' + index)) })));
  const tree = await codec.buildTree(d, 1, openings.map(value => value.leaf));
  openings.forEach((value, index) => Object.assign(value, tree.opening(index)));
  const common = { domain, domainCommitment: d, envelope: tree.root, core: openings[0] };
  const action = { chainDomain: local[0].chainDomain, signerIdentity: h('provider'), sourceCommitment: h('source'),
    destinationCommitment: h('private-vault-descriptor'), amount: '50000', custodyKind: 1, custodyCommitment: h('custody'),
    executionFrom: '1100', executionUntil: '1900', settleBefore: '2000', receiptKeyCommitment: local[0].receiptKeyCommitment,
    receiptRho: local[0].receiptRho, deliveryRiskCommitment: h('risk'), actionSalt: h('action-salt') };
  const prepared = { authorization: { proof: '11'.repeat(32), publicInputs: [...encodeStatement('authorization', { domainCommitment: d, envelope: tree.root })] },
    rolePackets: { reservation: { ...common, funding: openings[1] }, recovery: { ...common, recovery: openings[2] },
      assembler: { ...common, settlement: openings[3], payouts: openings.slice(12) },
      local: local.map((value, slot) => ({ ...common, local: openings[4 + slot], action: slot === 0 ? action : null, receiptSpendSecret: h('receipt-secret-' + slot) })),
      dependency: dependency.map((value, slot) => ({ ...common, dependency: openings[8 + slot] })) } };
  const authorization = await codec.buildTree(d, 0, [await codec.authorizationLeaf(d, tree.root)]);
  return { prepared, rules, ruleTree, domain, d, authorization };
}

async function fixture(t) {
  const base = await preparedFixture(['3']), directory = await mkdtemp(join(tmpdir(), 'terminal-first-host-'));
  const f = {...base, writes: [], sent: [], terminalReads: [], proofs: [], admissionCalls: 0,
    adapterReconciles: 0, providerCreates: 0, custodyBinds: 0};
  fixtures.set(base.d, f);
  t.after(async () => { await f.keeper?.close(); fixtures.delete(base.d); await rm(directory, {recursive: true, force: true}); });
  const packets = base.prepared.rolePackets, commitments = [p(packets.reservation.funding.value.inputCommitment),
    p(packets.reservation.core.value.reserveCommitment), p(packets.reservation.funding.value.changeCommitment)];
  const noteTree = new PrivateNoteTree(commitments);
  f.view = {ledger: {commitments, nullifiers: [p(packets.reservation.funding.value.inputNullifier)],
    tree: {root: noteTree.root, path: index => ({root: noteTree.root, ...noteTree.path(index)})}},
    head: {timestamp: '1100'}, checkpoints: [{digest: h('checkpoint'), snapshot: {timestamp: '1100'}}],
    authorizationTree: {path: index => ({root: base.authorization.root, ...base.authorization.opening(index)})},
    receiptLeaves: [], receiptTree: {path() {throw Error('TEST_NO_RECEIPT_EXPECTED');}}, revokedEntries: Array(64).fill(ZERO)};
  f.runtime = Object.freeze({metadata: {scratchDirectory: directory}, async send(label, request) {
    const receipt = {transactionHash: p(h('send-' + f.sent.length))}; f.sent.push({label, request: copy(request), receipt});
    if (request.data.startsWith(p(FLAT_TRANSACTION_METHODS.recoverGeneric.selector))) {
      f.view.ledger.nullifiers.push(p(packets.recovery.recovery.value.reserveNullifier));
      if (f.loseRecoveryReply) {f.loseRecoveryReply = false; throw new Error('TEST_RECOVERY_ACK_LOST');}
    }
    return receipt;
  }});
  f.quorum = Object.freeze({async checkpoint({requestId}) { return {message: {
    expectedPoolSequence: '0', expectedHubStateSequence: '0', requestId: p(requestId), validUntil: '1900'},
    abiSignatures: [0,1,2].map(index => ({signerIndex: String(index), v: '27', r: p('0'.repeat(63)+'1'), s: p('0'.repeat(63)+'1')}))}; }});
  f.system = Object.freeze({claimsEnabled: false, quorum: f.quorum,
    pools: [0,1].map(index => ({address: p(h('pool-' + index).slice(0,40)), domain: base.domain, domainCommitment: p(base.d)})),
    hub: {address: p(h('hub').slice(0,40))}});
  f.lease = Object.freeze({});
  f.review = {family: '3', payoutCommitment: packets.local[0].local.value.payoutCommitment,
    deliveryRiskCommitment: packets.local[0].action.deliveryRiskCommitment, settleBefore: '2000'};
  f.custody = Object.freeze({report: () => ({quoteBound: true}), offer: () => ({
    evidencePolicy: packets.local[0].local.value.evidencePolicy, actionTemplate: copy(packets.local[0].action)}),
    async bindDispatch() {f.custodyBinds++; return f.lease;}});
  f.provider = Object.freeze({async close() {}});
  f.adapter = Object.freeze({async admit() {f.admissionCalls++; throw new Error('TEST_NATIVE_ADMISSION_UNKNOWN');},
    async reconcile() {f.adapterReconciles++; throw new Error('TEST_NATIVE_ADAPTER_OFFLINE');}, stop() {}, close() {}});
  states.set(f.runtime, f); f.ref = h('reference');
  f.keeper = await createNativeValueExecution({runtime: f.runtime, system: f.system, poolIndex: 0, quorum: f.quorum});
  await f.keeper.prepare(f.ref, base.prepared, [{slot: 0, custody: f.custody, deliveryRiskSalt: h('risk-salt')}]);
  await assert.rejects(f.keeper.execute(f.ref), /TEST_NATIVE_ADMISSION_UNKNOWN/);
  assert.deepEqual(f.keeper.snapshot(f.ref).nativeExposure, [{slot: 0, family: '3', status: 'POSSIBLE'}]);
  return f;
}

test('successful source recovery reconciles with its native adapter offline and retains unknown exposure', async t => {
  const f = await fixture(t); f.view.head.timestamp = '2000';
  assert.deepEqual(await f.keeper.recover(f.ref), {outcome: 'RECOVERED', original: true});
  const counts = {sends: f.sent.length, proofs: f.proofs.length, binds: f.custodyBinds, admissions: f.admissionCalls};
  assert.deepEqual(await f.keeper.reconcile(f.ref), {outcome: 'RECOVERED', original: true});
  assert.equal(f.adapterReconciles, 0);
  assert.equal(f.keeper.snapshot(f.ref).outcome, 'RECOVERED');
  assert.deepEqual(f.keeper.snapshot(f.ref).nativeExposure, [{slot: 0, family: '3', status: 'POSSIBLE'}]);
  assert.equal(f.keeper.snapshot(f.ref).admittedReceipts, 0);
  assert.deepEqual({sends: f.sent.length, proofs: f.proofs.length, binds: f.custodyBinds, admissions: f.admissionCalls}, counts);
});

test('lost recovery acknowledgement reconciles original terminal before any unresolved native admission', async t => {
  const f = await fixture(t); f.view.head.timestamp = '2000'; f.loseRecoveryReply = true;
  await assert.rejects(f.keeper.recover(f.ref), /TEST_RECOVERY_ACK_LOST/);
  assert.equal(f.keeper.snapshot(f.ref).outcome, null);
  const sends = f.sent.length;
  assert.deepEqual(await f.keeper.reconcile(f.ref), {outcome: 'RECOVERED', original: true});
  assert.equal(f.adapterReconciles, 0); assert.equal(f.sent.length, sends);
  assert.equal(f.keeper.snapshot(f.ref).outcome, 'RECOVERED');
  assert.deepEqual(f.keeper.snapshot(f.ref).nativeExposure, [{slot: 0, family: '3', status: 'POSSIBLE'}]);
  await f.keeper.reconcile(f.ref); assert.equal(f.sent.length, sends); assert.equal(f.admissionCalls, 1);
});

test('unknown terminal remains unknown without falling back to native work or resubmitting', async t => {
  const f = await fixture(t); f.view.head.timestamp = '2000'; f.loseRecoveryReply = true;
  await assert.rejects(f.keeper.recover(f.ref), /TEST_RECOVERY_ACK_LOST/);
  f.terminalUnavailable = true; const sends = f.sent.length;
  await assert.rejects(f.keeper.reconcile(f.ref), /TEST_TERMINAL_UNAVAILABLE/);
  assert.equal(f.keeper.snapshot(f.ref).outcome, null);
  assert.equal(f.adapterReconciles, 0); assert.equal(f.sent.length, sends);
});

test('before any terminal submission original admission reconciliation still runs and never resends', async t => {
  const f = await fixture(t), sends = f.sent.length;
  await assert.rejects(f.keeper.reconcile(f.ref), /TEST_NATIVE_ADAPTER_OFFLINE/);
  assert.equal(f.adapterReconciles, 1); assert.equal(f.sent.length, sends);
  await assert.rejects(f.keeper.execute(f.ref), /RECONCILE_OR_RECOVER_ORIGINAL/);
  assert.equal(f.admissionCalls, 1); assert.equal(f.custodyBinds, 1);
});

test('terminal verification failures propagate without admitting native work or fabricating recovery', async t => {
  // The observer remains the verification boundary. These are explicit boundary
  // errors, not fabricated canonical receipts or cryptographic acceptance.
  for (const code of ['FLAT_TERMINAL_BACKING_CHANGED', 'FLAT_TERMINAL_RECEIPT_BLOCK',
    'FLAT_TERMINAL_STATEMENT_SUBSTITUTION', 'FLAT_TERMINAL_ORIGINAL_TRANSACTION_REVERTED']) {
    await t.test(code, async t => {
      const f = await fixture(t); f.view.head.timestamp = '2000'; f.loseRecoveryReply = true;
      await assert.rejects(f.keeper.recover(f.ref), /TEST_RECOVERY_ACK_LOST/);
      f.terminalError = new Error(code);
      const counts = { sends: f.sent.length, proofs: f.proofs.length, admissions: f.admissionCalls };
      await assert.rejects(f.keeper.reconcile(f.ref), error => error === f.terminalError);
      assert.deepEqual(f.terminalReads, ['recovery']);
      assert.equal(f.keeper.snapshot(f.ref).outcome, null);
      assert.equal(f.adapterReconciles, 0);
      assert.deepEqual({ sends: f.sent.length, proofs: f.proofs.length, admissions: f.admissionCalls }, counts);
    });
  }
});

test('a previously confirmed recovery still requires a fresh original terminal observation', async t => {
  const f = await fixture(t); f.view.head.timestamp = '2000';
  await f.keeper.recover(f.ref);
  const reads = f.terminalReads.length, sends = f.sent.length;
  f.terminalUnavailable = true;
  await assert.rejects(f.keeper.reconcile(f.ref), /TEST_TERMINAL_UNAVAILABLE/);
  assert.equal(f.terminalReads.length, reads + 1);
  assert.equal(f.adapterReconciles, 0); assert.equal(f.sent.length, sends);
  f.terminalUnavailable = false;
  await f.keeper.reconcile(f.ref);
  assert.equal(f.terminalReads.length, reads + 2); assert.equal(f.sent.length, sends);
});
