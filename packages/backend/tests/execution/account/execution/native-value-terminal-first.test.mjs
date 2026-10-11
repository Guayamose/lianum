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
import { PrivateNoteTree } from '@lianum/engine/notes/private-note-tree';
import { nativeAdmissionRulesTree, nativeAdmissionRuleCommitment }
  from '@lianum/engine/execution/native/dispatch/native-admission';
import { createCommitmentCodec, SCHEMAS, ZERO } from '@lianum/components/encoding/commitments';
import { FIELD_MODULUS, encodeStatement, RELATIONS } from '@lianum/components/encoding/statements';
import { FLAT_TRANSACTION_METHODS } from '../../../../src/execution/encoding/transaction-codec.mjs';
import { validateFlatExecutionPreparation } from '../../../../src/execution/account/execution/flat-native-execution.mjs';
import * as actualReadiness from '../../../../src/execution/account/preparation/readiness-inputs.mjs';
import { assertOwnedNativeDurableSourceReceiverV1, isOwnedOriginalNativeFReorgReceiverV1 } from '../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { readOriginalNativeRecoveryCheckpointV1 as readActualNativeRecoveryCheckpointV1 } from '../../../../src/execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs';
const h = value => createHash('sha256').update('terminal-first host: ' + value).digest('hex');
const field = value => '00' + h(value).slice(2), p = value => '0x' + value;
const copy = value => structuredClone(value);
const testHash = async values => (BigInt('0x' + h(values.map(String).join(','))) % FIELD_MODULUS).toString(16).padStart(64, '0');
const states = new WeakMap(), stores = new Map(), fixtures = new Map();
const hostTerminalResults = new WeakMap();
const fFor = domain => fixtures.get(domain);
// Mock the same canonical module objects imported by the keeper.
const mockModule = (url, exports) => mock.module(url, { exports });
const checkedSystem = (runtime, system) => assert.equal(states.get(runtime)?.system, system, 'TEST_ORIGINAL_SYSTEM');
const checkedQuorum = (quorum, {runtime, system}) => {
  checkedSystem(runtime, system); assert.equal(quorum, states.get(runtime).quorum, 'TEST_ORIGINAL_QUORUM');
};
mockModule(new URL('../../../../src/operations/releases/wrapped/wrapped-wallet-release-v1.mjs', import.meta.url), { assertWrappedWalletAccountReleasedV1() {} });
const unusedWrapped = () => { throw new Error('TEST_UNUSED_WRAPPED_BRANCH'); };
mockModule(new URL('../../../../src/operations/deployments/wrapped/wrapped-claim-wallet-binding-v1.mjs', import.meta.url), { assertOwnedWrappedClaimWalletSystemV1: unusedWrapped });
mockModule(new URL('../../../../src/operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs', import.meta.url), { assertOwnedNativeValueQuorum: unusedWrapped });
mockModule(new URL('../../../../src/chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs', import.meta.url), {
  assertOwnedNativeValueProviderCustody: unusedWrapped, ownedNativeValueProviderCustodyReview: unusedWrapped,
});
mockModule(new URL('../../../../src/chains/shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs', import.meta.url), { createOwnedNativeValueProvider: unusedWrapped });
mockModule(new URL('../../../../src/execution/wrapped/preparation/wrapped-wallet-graph-admission-v1.mjs', import.meta.url), { createOwnedWrappedWalletGraphAdmissionV1: unusedWrapped });
mockModule(new URL('../../../../src/execution/wrapped/reconciliation/wrapped-wallet-state-v1.mjs', import.meta.url), { createWrappedWalletStateReaderV1: unusedWrapped });
mockModule(new URL('../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs', import.meta.url), { assertOwnedNativeDurableSourceReceiverV1, isOwnedOriginalNativeFReorgReceiverV1, async refreshNativeValueReceiverClock(runtime) {
  assert.ok(states.has(runtime));
} });
mockModule(new URL('../../../../src/chains/evm/runtime/local-evm-ownership.mjs', import.meta.url), { async assertLocalEvm(runtime) { assert.ok(states.has(runtime)); } });
mockModule(new URL('../../../../src/operations/deployments/native-value/native-value-system-v2.mjs', import.meta.url), { assertOwnedNativeValueSystem: checkedSystem,
  nativeValueOriginalRecoverySourceV1(runtime, system) { checkedSystem(runtime, system); return h('economic source'); } });
mockModule(new URL('../../../../src/operations/operators/native-value/native-value-operators-v4.mjs', import.meta.url), { assertOwnedNativeValueQuorum: checkedQuorum });
mockModule(new URL('../../../../src/operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs', import.meta.url), { assertNativeValueBootstrapNativeRuntime(bootstrap, value) {
  assert.deepEqual(Object.keys(value).sort(), ['nativeRuntime', 'profileCommitment', 'runtime', 'system']);
  checkedSystem(value.runtime, value.system); const f = states.get(value.runtime);
  assert.equal(bootstrap, f.bootstrap); assert.equal(value.nativeRuntime, f.nativeRuntime);
  assert.equal(value.profileCommitment, f.custody.offer().evidencePolicy);
} });
mockModule(new URL('../../../../src/chains/shared/dispatch/native-value-dispatch-owner-v2.mjs', import.meta.url), {
  assertOwnedNativeValueProviderCustody(custody, {runtime, system}) {
    checkedSystem(runtime, system); assert.equal(custody, states.get(runtime).custody);
  },
  ownedNativeValueProviderCustodyReview(custody, {runtime}) {
    assert.equal(custody, states.get(runtime).custody); return copy(states.get(runtime).review);
  },
});
mockModule(new URL('../../../../src/chains/evm/dispatch/native-value-evm-dispatch-gate.mjs', import.meta.url), {
  async createOwnedNativeValueProvider({runtime, dispatchLease}) {
    const f = states.get(runtime); assert.equal(dispatchLease, f.lease); f.providerCreates++; return f.provider;
  },
});
mockModule(new URL('../../../../src/execution/native-value/preparation/native-value-graph-admission-v2.mjs', import.meta.url), {
  async createOwnedNativeValueGraphAdmission({runtime, provider}) {
    const f = states.get(runtime); assert.equal(provider, f.provider); return f.adapter;
  },
});
mockModule(new URL('../../../../src/execution/native-value/reconciliation/native-value-system-state-v2.mjs', import.meta.url), { async createNativeValueSystemStateReader({runtime, system}) {
  checkedSystem(runtime, system); const f = states.get(runtime);
  return { async read() { return f.view; }, async assertCurrent(view) { assert.equal(view, f.view); },
    async authorizationPath(view, envelope) {
      assert.equal(view, f.view); assert.equal(envelope, f.prepared.rolePackets.reservation.envelope);
      return {root: f.authorization.root, ...f.authorization.opening(0)};
    },
  };
} });
mockModule(new URL('../../../../src/execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs', import.meta.url), {
  readOriginalNativeRecoveryCheckpointV1(observer, result) {
    const saved = hostTerminalResults.get(result);
    assert.equal(saved?.observer, observer, 'HOST_TERMINAL_RESULT_REQUIRED');
    return copy(saved.checkpoint);
  },
  async createNativeValueTerminalObserver({runtime, system}) {
    checkedSystem(runtime, system); const f = states.get(runtime);
    const observer = { async observe(query) {
      f.terminalReads.push(query.kind);
      if (f.terminalUnavailable) throw new Error('TEST_TERMINAL_UNAVAILABLE');
      if (f.terminalError) throw f.terminalError;
      const sent = f.sent.find(value => value.request.to === query.submission.target
        && value.request.data === query.submission.calldata);
      assert.ok(sent, 'TEST_ORIGINAL_TERMINAL_REQUIRED');
      assert.equal(query.statement.reserveNullifier, f.prepared.rolePackets.recovery.recovery.value.reserveNullifier);
      if (query.submission.transactionHash !== null) assert.equal(query.submission.transactionHash, sent.receipt.transactionHash.slice(2));
      const result = {outcome: query.kind === 'recovery' ? 'RECOVERED' : 'FULFILLED', original: true};
      // The real getter must reject our synthetic observer/result. Only this
      // test port retains a HOST checkpoint, never a reorg-capable original.
      assert.throws(() => readActualNativeRecoveryCheckpointV1(observer, result), /F_REORG_ORIGINAL_OBSERVATION_REQUIRED/);
      hostTerminalResults.set(result, {observer, checkpoint: {schema: 'HOST_ONLY_RECOVERY_CHECKPOINT', query: copy(query)}});
      return result;
    }};
    return observer;
  },
  createWrappedWalletTerminalObserverV1() { throw new Error('TEST_UNUSED_WRAPPED_BRANCH'); },
});
mockModule(new URL('../../../../src/proving/native-value/metadata/native-value-live-v2-artifacts.mjs', import.meta.url), { async loadNativeValueLiveArtifacts() {} });
mockModule(new URL('../../../../src/execution/account/execution/flat-native-execution.mjs', import.meta.url), { validateFlatExecutionPreparation });
mockModule(new URL('../../../../../engine/src/crypto/vault.mjs', import.meta.url), { Vault: class {
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
mockModule(new URL('../../../../src/execution/account/preparation/readiness-inputs.mjs', import.meta.url), {...actualReadiness,
  async buildDependencyInputs(input) { return {statement: readyStatement(input, 'dependency')}; },
  async buildReadyInputs(input) { return {statement: readyStatement(input, 'ready'), admissionOpening: {fixture: true}}; },
});
mockModule(new URL('../../../../../proofs/src/tooling/scoped-proof-tools.mjs', import.meta.url), {
  withFlatHash: work => work(testHash), loadFlatABI: async name => ({synthetic: name}),
  createFlatProofRunner() { return {async prove(name, job) {
    fFor(job.statement.domainCommitment).proofs.push(name);
    return {proof: '11'.repeat(32), publicInputs: [...encodeStatement(name, job.statement)]};
  }, async abort() {}, async close() {}}; },
});
// Recovery issuer is a private inert HOST port. Its token brands are not a
// chain/new-process grant. Actual keeper state, codecs and terminal-first
// reconciliation below remain production code, over the explicit mocks above.
const actualRecovery = await import('../../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
const hostAuthorities = new WeakSet(), hostTokens = new WeakMap();
const hostIdentity = Object.freeze({ profile: 'NATIVE_VALUE_ECONOMIC_RECOVERY_V1', directory: '/HOST_ONLY',
  runId: '00000000-0000-4000-8000-000000000002', sourceSHA256: h('economic source'), deadlineMs: 1234567890000 });
mockModule(new URL('../../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs', import.meta.url), { ...actualRecovery,
  assertNativeEconomicRecoveryCaptureV1(authority) { assert.ok(hostAuthorities.has(authority), 'HOST_ORIGINAL_ISSUER_REQUIRED'); return hostIdentity; },
  nativeEconomicRecoverySectionIdentityV1(token, section) { assert.equal(hostTokens.get(token)?.section, section, 'HOST_ORIGINAL_SECTION_REQUIRED'); return hostIdentity; },
  consumeNativeEconomicRecoverySectionV1(token, section) { const row = hostTokens.get(token); assert.equal(row?.section, section, 'HOST_ORIGINAL_SECTION_REQUIRED');
    assert.equal(row.consumed, false, 'HOST_SECTION_CONSUMED'); assert.ok(row.record); row.consumed = true; return copy(row.record); },
});
const executionAPI = await import('../../../../src/execution/native-value/execution/native-value-execution-v2.mjs');
const {createNativeValueExecution} = executionAPI;
function recoveryIssuer() {
  const authority = Object.freeze({}); hostAuthorities.add(authority);
  const token = Object.freeze({}); const row = { section: 'executor', consumed: false, record: null }; hostTokens.set(token, row);
  return { authority, token, retain(record) { assert.equal(row.record, null); row.record = copy(record); } };
}

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
    adapterReconciles: 0, providerCreates: 0, providerCloses: 0, custodyBinds: 0};
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
  // Explicit synthetic legacy deployment provenance selects the original V2
  // artifact mock; terminal tests do not claim artifact/brand acceptance.
  f.system = Object.freeze({claimsEnabled: false, quorum: f.quorum,
    provenance: Object.freeze({schema: 'LIANUM_NATIVE_VALUE_GRAPH_ONLY_RELEASE_V2'}),
    pools: [0,1].map(index => ({address: p(h('pool-' + index).slice(0,40)), domain: base.domain, domainCommitment: p(base.d)})),
    hub: {address: p(h('hub').slice(0,40))}});
  f.lease = Object.freeze({});
  f.review = {family: '3', payoutCommitment: packets.local[0].local.value.payoutCommitment,
    deliveryRiskCommitment: packets.local[0].action.deliveryRiskCommitment, settleBefore: '2000'};
  f.custody = Object.freeze({report: () => ({quoteBound: true}), offer: () => ({
    evidencePolicy: packets.local[0].local.value.evidencePolicy, actionTemplate: copy(packets.local[0].action)}),
    async bindDispatch() {f.custodyBinds++; return f.lease;}});
  f.provider = Object.freeze({async close() {f.providerCloses++;}});
  f.adapter = Object.freeze({async admit() {f.admissionCalls++; throw new Error('TEST_NATIVE_ADMISSION_UNKNOWN');},
    async reconcile() {f.adapterReconciles++; throw new Error('TEST_NATIVE_ADAPTER_OFFLINE');}, stop() {}, close() {}});
  states.set(f.runtime, f); f.ref = h('reference'); f.bootstrap = Object.freeze({ HOST_ONLY: true }); f.nativeRuntime = Object.freeze({ HOST_ONLY: true });
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

test('native retained terminal acknowledgement reopens before adapters and never reissues proof, wire or exposure', async t => {
  const f = await fixture(t); f.view.head.timestamp = '2000'; f.loseRecoveryReply = true;
  await assert.rejects(f.keeper.recover(f.ref), /TEST_RECOVERY_ACK_LOST/);
  const counts = { sends: f.sent.length, proofs: f.proofs.length, providers: f.providerCreates, binds: f.custodyBinds, admits: f.admissionCalls };
  const retainedBefore = f.keeper.snapshot(f.ref), issuer = recoveryIssuer();
  assert.throws(() => executionAPI.fenceOriginalNativeExecutionEconomicRecoveryV1({ ...f.keeper }, issuer.authority), /ORIGINAL_REQUIRED/);
  executionAPI.fenceOriginalNativeExecutionEconomicRecoveryV1(f.keeper, issuer.authority);
  await assert.rejects(f.keeper.reconcile(f.ref), /UNAVAILABLE/);
  issuer.retain(await executionAPI.captureOriginalNativeExecutionEconomicRecoveryV1(f.keeper, issuer.token));
  assert.deepEqual(await executionAPI.stopCapturedNativeExecutionEconomicRecoveryV1(f.keeper, issuer.token), { closed: true, originalResourcesStopped: true });
  assert.equal(f.providerCloses, 0);
  const contexts = { runtime: f.runtime, system: f.system, nativeRuntime: f.nativeRuntime, bootstrap: f.bootstrap,
    providerCustody: f.custody, dispatchLease: f.lease };
  f.keeper = await executionAPI.reopenOriginalNativeExecutionEconomicRecoveryV1(issuer.token, contexts);
  assert.deepEqual(f.keeper.snapshot(f.ref), retainedBefore);
  // No new adapter/provider is built for the already retained F wire.
  assert.deepEqual(await f.keeper.reconcile(f.ref), { outcome: 'RECOVERED', original: true });
  assert.equal(f.adapterReconciles, 0);
  assert.deepEqual({ sends: f.sent.length, proofs: f.proofs.length, providers: f.providerCreates, binds: f.custodyBinds, admits: f.admissionCalls }, counts);
  assert.deepEqual(f.keeper.snapshot(f.ref).nativeExposure, [{ slot: 0, family: '3', status: 'POSSIBLE' }]);
  await assert.rejects(executionAPI.reopenOriginalNativeExecutionEconomicRecoveryV1(issuer.token, contexts), /SECTION_CONSUMED/);
  await assert.rejects(executionAPI.reopenOriginalNativeExecutionEconomicRecoveryV1({ ...issuer.token }, contexts), /ORIGINAL_SECTION_REQUIRED/);
});

test('native checkpoint mutation rejects retention and cleanup retains original provider ownership', async t => {
  const f = await fixture(t), issuer = recoveryIssuer();
  const before = { sends: f.sent.length, proofs: f.proofs.length, providers: f.providerCreates, closes: f.providerCloses, admissions: f.admissionCalls };
  executionAPI.fenceOriginalNativeExecutionEconomicRecoveryV1(f.keeper, issuer.authority);
  // Each fixture uses the same synthetic domain; identify THIS original
  // encrypted Vault by its causal fixture scratch path, never a previous test.
  const originalStores = [...stores].filter(([path]) => path.startsWith(f.runtime.metadata.scratchDirectory + '/')
    && path.endsWith('/operations.vault'));
  assert.equal(originalStores.length, 1); const [, stored] = originalStores[0];
  assert.equal(stored.record.data.domainCommitment, '0x' + f.d); stored.record.revision++;
  await assert.rejects(executionAPI.captureOriginalNativeExecutionEconomicRecoveryV1(f.keeper, issuer.token), /STORAGE_CHANGED/);
  assert.deepEqual(await executionAPI.abortNativeExecutionEconomicRecoveryV1(f.keeper, issuer.token), { closed: true, originalResourcesStopped: true });
  // fixture already published original readiness and attempted admission.
  // The rejected capture/cleanup must add no wire/proof/admission or provider close.
  assert.deepEqual({ sends: f.sent.length, proofs: f.proofs.length, providers: f.providerCreates, closes: f.providerCloses, admissions: f.admissionCalls }, before);
});
