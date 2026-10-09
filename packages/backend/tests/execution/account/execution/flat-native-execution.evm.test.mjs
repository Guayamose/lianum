/** Synthetic host orchestration only. Private module mocks replace capability
 * origins, source state, Vault and proof builders/runners. Real envelope leaves,
 * SHA rule membership, statement joins, terminal calldata and F witnesses remain
 * checked. Nothing here starts a node, compiler, proof backend or funded flow.
 * Run: node --experimental-test-module-mocks --test flat-native-execution.evm.test.mjs */
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
import * as actualReadiness from '../../../../src/execution/account/preparation/readiness-inputs.mjs';
import * as actualEvmRuntime from '../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import * as actualEvmOwnership from '../../../../src/chains/evm/runtime/local-evm-ownership.mjs';
import * as actualDeploySystem from '../../../../src/operations/deployments/system/deploy-system.mjs';
import * as actualOperators from '../../../../src/operations/operators/claims/native-operators.mjs';
import * as actualNativeProvider from '../../../../src/providers/native-provider.mjs';
import * as actualEvmProvider from '../../../../src/providers/evm-vault-provider.mjs';
import * as actualSystemState from '../../../../src/execution/account/reconciliation/flat-system-state.mjs';
import * as actualTerminalObserver from '../../../../src/execution/account/reconciliation/flat-terminal-observer.mjs';

const h = value => createHash('sha256').update('flat execution host: ' + value).digest('hex');
const field = value => '00' + h(value).slice(2), p = value => '0x' + value;
const copy = value => structuredClone(value);
const testHash = async values => (BigInt('0x' + h(values.map(String).join(','))) % FIELD_MODULUS).toString(16).padStart(64, '0');
const brands = { runtimes: new WeakSet(), systems: new WeakMap(), quorums: new WeakMap(),
  nativeProviders: new WeakMap(), evmProviders: new WeakMap() };
const stores = new Map(), fixtures = new Map();
const runtimeFixtures = new WeakMap();
const fFor = domain => fixtures.get(domain);
const checkedSystem = (runtime, system) => assert.ok(brands.runtimes.has(runtime)
  && brands.systems.get(system) === runtime, 'TEST_OWNED_SYSTEM');
function checkedQuorum(quorum, { runtime, system }) {
  const binding = brands.quorums.get(quorum);
  assert.ok(binding && binding.runtime === runtime && binding.system === system, 'TEST_OWNED_QUORUM');
  checkedSystem(runtime, system); assert.equal(binding.closed, false, 'TEST_QUORUM_CLOSED'); return binding;
}
function checkedProvider(map, provider, expected) {
  const binding = map.get(provider); assert.ok(binding, 'TEST_OWNED_PROVIDER');
  for (const [key, value] of Object.entries(expected)) assert.equal(binding[key], value, 'TEST_PROVIDER_BINDING');
  checkedQuorum(binding.operatorQuorum, binding);
}
const mod = path => new URL(path, import.meta.url).href;
mock.module(mod('../chain-adapters/local-evm-ownership.mjs'), { exports: { ...actualEvmOwnership,
  async assertLocalEvm(runtime) { assert.ok(brands.runtimes.has(runtime), 'TEST_OWNED_RUNTIME'); },
} });
// Synthetic original receiver: no RPC, caller timestamp or new capability.
mock.module(mod('../chain-adapters/owned-evm-v2-runtime.mjs'), { exports: { ...actualEvmRuntime,
  isOwnedLocalEvmV2(runtime) {
    // Same explicit synthetic origin as assertLocalEvm above; only the new
    // observed fixture carries V2. Golden is authentic at its separate port.
    return brands.runtimes.has(runtime) && runtimeFixtures.get(runtime)?.observedClock === true;
  },
  async refreshNativeValueReceiverClock(runtime) {
    assert.equal(arguments.length, 1); assert.ok(brands.runtimes.has(runtime), 'TEST_OWNED_RUNTIME');
    const f = runtimeFixtures.get(runtime);
    assert.equal(f.observedClock, true, 'HOST_GOLDEN_IS_NOT_V2_RECEIVER');
    f.clockEvents.push('refresh');
    if (f.refreshError) throw f.refreshError;
    f.view.head.timestamp = String(f.wallSecond);
  },
} });
mock.module(mod('../ops/deploy-system.mjs'), { exports: { ...actualDeploySystem, assertOwnedFlatSystem: checkedSystem } });
mock.module(mod('../ops/native-operators.mjs'), { exports: { ...actualOperators,
  ownedFlatOperatorQuorumBindings(quorum, expected) {
    const b = checkedQuorum(quorum, expected);
    return Object.freeze({ families: Object.freeze([...b.families]), bitcoin: b.bitcoin, solana: b.solana, evmDelivery: b.evmDelivery });
  },
  assertOwnedFlatOperatorQuorum(quorum, input) {
    const b = checkedQuorum(quorum, input); assert.ok(b.families.includes(input.family), 'TEST_REGISTERED_FAMILY');
    assert.equal(input.nativeRuntime, b[{ '1': 'bitcoin', '2': 'solana', '3': 'evmDelivery' }[input.family]], 'TEST_NATIVE_BINDING');
    assert.ok(input.nativeRuntime, 'TEST_REGISTERED_CAPABILITY'); b.checks.push(input.family); return quorum;
  },
} });
mock.module(mod('../solvers/native-provider.mjs'), { exports: { ...actualNativeProvider,
  assertOwnedFlatNativeProvider: (provider, expected) => checkedProvider(brands.nativeProviders, provider, expected),
} });
mock.module(mod('../solvers/evm-vault-provider.mjs'), { exports: { ...actualEvmProvider,
  assertOwnedFlatEvmVaultProvider: (provider, expected) => checkedProvider(brands.evmProviders, provider, expected),
} });
mock.module(mod('../../../../../omnichain-product/src/vault.mjs'), { exports: { Vault: class {
  constructor(path) { this.path = path; }
  async create(data, password) { const entry = { password, record: { revision: 0, data: copy(data) } };
    assert.ok(!stores.has(this.path)); stores.set(this.path, entry); return copy(entry.record); }
  async read(password) { const entry = stores.get(this.path); assert.equal(entry.password, password); return copy(entry.record); }
  async update(password, revision, mutate) {
    const entry = stores.get(this.path); assert.equal(entry.password, password); assert.equal(entry.record.revision, revision);
    entry.record = { revision: revision + 1, data: copy(mutate(copy(entry.record.data))) };
    fFor(entry.record.data.domainCommitment.slice(2)).writes.push(copy(entry.record)); return copy(entry.record);
  }
} } });
mock.module(mod('./flat-system-state.mjs'), { exports: { ...actualSystemState,
  async createFlatSystemStateReader({ runtime, system, poolIndex }) {
    checkedSystem(runtime, system); const f = fFor(system.pools[poolIndex].domainCommitment.slice(2));
    return Object.freeze({ async read() { return f.view; }, async authorizationPath(view, envelope) {
      assert.ok(!f.authorizationUnavailable, 'TEST_AUTHORIZATION_UNAVAILABLE');
      assert.equal(view, f.view); assert.equal(envelope, f.prepared.rolePackets.reservation.envelope);
      return { root: f.authorization.root, ...f.authorization.opening(0) };
    } });
  },
} });
mock.module(mod('./flat-terminal-observer.mjs'), { exports: { ...actualTerminalObserver,
  async createFlatTerminalObserver({ runtime, system, poolIndex }) {
    checkedSystem(runtime, system); const f = fFor(system.pools[poolIndex].domainCommitment.slice(2));
    return Object.freeze({ async observe(query) {
      f.terminals.push(copy(query)); assert.equal(query.submission.target, system.pools[poolIndex].address);
      assert.ok(f.sent.some(item => item.receipt.transactionHash === p(query.submission.transactionHash)
        && item.request.data === query.submission.calldata));
      assert.equal(query.statement.reserveNullifier, f.prepared.rolePackets.recovery.recovery.value.reserveNullifier);
      return { outcome: query.kind === 'recovery' ? 'RECOVERED' : 'FULFILLED', original: true };
    } });
  },
} });
function statement(name, values = {}) {
  return Object.fromEntries(RELATIONS[name].fields.map(({ name: key, type }) => [key,
    values[key] ?? (type === 'u64' ? '1100' : type.endsWith('[4]') ? Array(4).fill(field(key)) : field(key))]));
}
function readyStatement(input, name) {
  return statement(name, { domainCommitment: input.packet.domainCommitment, authorizationRoot: input.authorization.root,
    checkpoint: h('checkpoint'), readyFrom: input.readyFrom, readyUntil: input.readyUntil });
}
mock.module(mod('./readiness-inputs.mjs'), { exports: { ...actualReadiness,
  async buildDependencyInputs(input) {
    fFor(input.packet.domainCommitment).jobs.push({ name: 'dependency', input: copy(input) });
    return { statement: readyStatement(input, 'dependency') };
  },
  async buildReadyInputs(input) {
    fFor(input.packet.domainCommitment).jobs.push({ name: 'ready', input: copy(input) });
    const local = input.packet.local.value;
    const descriptor = Object.fromEntries(['hubDomain', 'registryCommitment', 'scope', 'policy', 'localCommitment', 'dispatchId',
      'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'].map(key => [key, input.packet.domain[key] ?? local[key]]));
    return { statement: readyStatement(input, 'ready'), admissionOpening: { descriptor } };
  },
} });
mock.module(mod('./admission-inputs.mjs'), { exports: {
  async buildAdmissionInputs(input) {
    fFor(input.readyStatement.domainCommitment).jobs.push({ name: 'admission', input: copy(input) });
    return { statement: statement('admission', { ...input.readyStatement, receiptLeaf: field('admitted-receipt'),
      admissionFrom: input.admissionFrom, admissionUntil: input.admissionUntil }), receiptCommitment: h('receipt') };
  },
} });
mock.module(mod('./completion-inputs.mjs'), { exports: {
  async buildNodeInputs(input) {
    fFor(input.packet.domainCommitment).jobs.push({ name: 'node', input: copy(input) });
    return { statement: statement('node', { domainCommitment: input.packet.domainCommitment, authorizationRoot: input.authorization.root,
      completionCommitment: field('completion-' + input.packet.local.value.slot) }), completionOpening: { slot: input.packet.local.value.slot } };
  },
  async buildSettlementInputs(input) {
    fFor(input.packet.domainCommitment).jobs.push({ name: 'settlement', input: copy(input) });
    return { statement: statement('settlement', { domainCommitment: input.packet.domainCommitment, authorizationRoot: input.authorization.root,
      reserveNullifier: input.packet.core.value.reserveNullifier, outputs: input.packet.settlement.value.outputs,
      completionCommitments: [0, 1, 2, 3].map(slot => field('completion-' + slot)), validFrom: input.validFrom, validUntil: input.validUntil }) };
  },
} });
mock.module(mod('../../../proof-workers/scoped-proof-tools.mjs'), { exports: {
  withFlatHash: work => work(testHash), loadFlatABI: async name => ({ synthetic: name }),
  createFlatProofRunner() { return Object.freeze({ async prove(name, job) {
    const f = fFor(job.statement.domainCommitment); f.proofs.push(name);
    // Model CPU-only proof work while the owned receiver head stays unmoved.
    if (f.observedClock && (name === 'admission' || name === 'settlement')) {
      f.wallSecond += 45; f.clockEvents.push('proof:' + name);
    }
    return { proof: '11'.repeat(32), publicInputs: [...encodeStatement(name, job.statement)] };
  }, async abort() {}, async close() {} }); },
} });
const { createFlatNativeExecution } = await import('../../../../src/execution/account/execution/flat-native-execution.mjs');

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

async function fixture(t, families = ['3']) {
  const base = await preparedFixture(families), directory = await mkdtemp(join(tmpdir(), 'flat-keeper-host-'));
  const f = { ...base, writes: [], jobs: [], proofs: [], sent: [], terminals: [], facts: [], executions: [], reconciliations: 0, finality: [], clockEvents: [], healthCalls: 0, wallSecond: 1100 };
  fixtures.set(base.d, f);
  t.after(async () => { await f.keeper?.close(); fixtures.delete(base.d); await rm(directory, { recursive: true, force: true }); });
  const packets = base.prepared.rolePackets, commitments = [p(packets.reservation.funding.value.inputCommitment),
    p(packets.reservation.core.value.reserveCommitment), p(packets.reservation.funding.value.changeCommitment)];
  const noteTree = new PrivateNoteTree(commitments), notePath = index => ({ root: noteTree.root, ...noteTree.path(index) });
  f.view = { ledger: { commitments, nullifiers: [p(packets.reservation.funding.value.inputNullifier)], tree: { root: noteTree.root, path: notePath } },
    head: { timestamp: '1100' }, checkpoints: [{ digest: h('checkpoint'), snapshot: { timestamp: '1100' } }],
    checkpointTree: { path: () => ({ root: field('checkpoint-root'), index: 0, siblings: Array(6).fill(ZERO) }) },
    authorizationTree: { path: index => ({ root: base.authorization.root, ...base.authorization.opening(index) }) },
    receiptLeaves: [], receiptTree: { path: index => ({ root: field('receipt-root'), index, siblings: Array(6).fill(ZERO) }) },
    revokedEntries: Array(64).fill(ZERO), state: { revokedDigest: ZERO, revokedCount: '0', revocationSequence: '0' },
    stateOpening: {}, evidenceState: {} };
  f.runtime = Object.freeze({ metadata: { scratchDirectory: directory }, async send(label, request) {
    if (f.observedClock && (request.data.startsWith(p(FLAT_TRANSACTION_METHODS.admit.selector))
      || request.data.startsWith(p(FLAT_TRANSACTION_METHODS.fulfillGeneric.selector)))) {
      f.clockEvents.push(request.data.startsWith(p(FLAT_TRANSACTION_METHODS.admit.selector)) ? 'send:admission' : 'send:settlement');
      const includedSecond = BigInt(f.wallSecond + 1), message = f.lastHealth;
      assert.ok(BigInt(message.validFrom) <= includedSecond && includedSecond < BigInt(message.validUntil), 'HOST_ORIGINAL_OUTSIDE_WINDOW');
      f.view.head.timestamp = String(includedSecond);
    }
    const receipt = { transactionHash: p(h('send-' + f.sent.length)) }; f.sent.push({ label, request: copy(request), receipt });
    if (request.data.startsWith(p(FLAT_TRANSACTION_METHODS.admit.selector))) f.view.receiptLeaves.push(field('admitted-receipt'));
    return receipt;
  } });
  brands.runtimes.add(f.runtime); runtimeFixtures.set(f.runtime, f);
  f.system = Object.freeze({ pools: [0, 1].map(index => ({ address: p(h('pool-' + index).slice(0, 40)),
    domain: base.domain, domainCommitment: p(base.d) })), registry: { rulesRoot: base.ruleTree.root }, hub: { address: p(h('hub').slice(0, 40)) } });
  brands.systems.set(f.system, f.runtime);
  f.bitcoin = families.includes('1') ? Object.freeze({ async confirm(id) { f.finality.push(['1', id]); } }) : null;
  f.solana = families.includes('2') ? Object.freeze({ async observe(id) { f.finality.push(['2', id]); return { status: 'observed' }; } }) : null;
  f.evmDelivery = families.includes('3') ? Object.freeze({ binding: { poolIndex: 1 } }) : null;
  const abiSignatures = [0, 1, 2].map(index => ({ signerIndex: String(index), v: '27', r: p('0'.repeat(63) + '1'), s: p('0'.repeat(63) + '1') }));
  f.quorum = Object.freeze({
    async checkpoint({ requestId }) {
      if (f.checkpointError) throw f.checkpointError;
      return { message: { expectedPoolSequence: '0', expectedHubStateSequence: '0', requestId: p(requestId), validUntil: '1900' }, abiSignatures };
    },
    async health() {
      f.healthCalls++;
      if (!f.observedClock) return { message: { validFrom: '1100', validUntil: '1900' }, abiSignatures };
      f.clockEvents.push('health');
      const from = f.view.head.timestamp;
      f.lastHealth = { validFrom: from, validUntil: String(BigInt(from) + 30n) };
      return { message: f.lastHealth, abiSignatures };
    },
    async facts(request) { f.facts.push(copy(request)); return { certificates: [{ facts: { nativeGid: h('gid'),
      observation: { evidenceFrom: '1100', evidenceUntil: '1800' } } }] }; },
  });
  f.quorumBinding = { runtime: f.runtime, system: f.system, bitcoin: f.bitcoin, solana: f.solana,
    evmDelivery: f.evmDelivery, families, checks: [], closed: false };
  brands.quorums.set(f.quorum, f.quorumBinding);
  f.input = { runtime: f.runtime, system: f.system, poolIndex: 0, bitcoin: f.bitcoin, solana: f.solana, quorum: f.quorum,
    ...(f.evmDelivery ? { evmDelivery: f.evmDelivery } : {}) };
  f.offer = { actionTemplate: copy(packets.local[0].action), evidencePolicy: nativeAdmissionRuleCommitment(base.rules[0]) };
  f.provider = Object.freeze({ offer: () => copy(f.offer), report: () => ({ quoteBound: true }), async execute(request) {
    const latest = f.writes.at(-1).data.operations[0]; assert.equal(latest.executionStarted, true);
    assert.deepEqual(latest.exposures, [{ slot: 0, family: families[0], status: 'POSSIBLE', nativeId: null }]);
    f.executions.push(copy(request)); if (f.executionError) throw new Error(f.executionError);
    return { nativeId: h('native-id') };
  }, async reconcile() { f.reconciliations++; if (f.reconcileError) throw new Error(f.reconcileError);
    return { phase: 'OBSERVED', nativeId: h('native-id'), providerKey: { x: h('x'), y: h('y') },
      dispatchStatement: { original: true }, dispatchSignature: h('signature') };
  } });
  f.providerBinding = { runtime: f.runtime, system: f.system, poolIndex: 0, operatorQuorum: f.quorum,
    family: families[0], recipientIndex: 1, ...(families[0] === '3' ? { observer: f.evmDelivery }
      : { nativeRuntime: families[0] === '1' ? f.bitcoin : f.solana }) };
  (families[0] === '3' ? brands.evmProviders : brands.nativeProviders).set(f.provider, f.providerBinding);
  f.providers = [{ slot: 0, family: families[0], recipientIndex: 1, rule: copy(base.rules[0]), rulePath: copy(base.ruleTree.paths[0]),
    deliveryRiskSalt: h('risk-salt'), provider: f.provider }];
  f.ref = h('reference'); return f;
}

test('EVM-only keeper uses the same P/R/I/four-N/T path with distinct source asset and delivered q', async t => {
  const f = await fixture(t); f.keeper = await createFlatNativeExecution(f.input);
  assert.deepEqual(f.quorumBinding.checks, ['3']);
  const binding = await f.keeper.prepare(f.ref, f.prepared, f.providers);
  assert.equal(binding.inputNullifier, f.prepared.rolePackets.reservation.funding.value.inputNullifier);
  assert.notEqual(f.domain.asset, f.rules[0].asset);
  assert.deepEqual(await f.keeper.execute(f.ref), { outcome: 'FULFILLED', original: true });
  assert.deepEqual(f.proofs, ['dependency', 'ready', 'admission', 'node', 'node', 'node', 'node', 'settlement']);
  assert.equal(f.executions.length, 1); assert.equal(f.reconciliations, 1); assert.deepEqual(f.finality, []);
  assert.equal(f.executions[0].action.amount, '50000');
  assert.deepEqual(f.facts, [{ family: '3', recipientIndex: '1', nativeId: h('native-id'),
    wireKeyCommitment: f.prepared.rolePackets.local[0].action.receiptKeyCommitment }]);
  const admission = f.jobs.find(value => value.name === 'admission').input;
  assert.equal(admission.action.amount, '50000'); assert.equal(admission.receiptOpening.receiptKeyCommitment, f.facts[0].wireKeyCommitment);
  assert.equal(admission.receiptOpening.payoutCommitment, f.prepared.rolePackets.local[0].local.value.payoutCommitment);
  assert.deepEqual(f.keeper.snapshot(f.ref).nativeExposure, [{ slot: 0, family: '3', status: 'DELIVERED' }]);
  const sends = f.sent.length; await f.keeper.execute(f.ref); await f.keeper.reconcile(f.ref);
  assert.equal(f.executions.length, 1); assert.equal(f.sent.length, sends);
});

test('complete quorum inventory controls null capabilities and rejects caller family/runtime selectors', async t => {
  const f = await fixture(t, ['3', '1', '2']);
  for (const changed of [{ bitcoin: null }, { solana: null }, { evmDelivery: null }, { evmDelivery: {} }, { quorum: {} },
    { families: ['3'] }, { nativeRuntime: f.evmDelivery }, { runtime: {} }])
    await assert.rejects(createFlatNativeExecution({ ...f.input, ...changed }));
  const { evmDelivery, ...omitted } = f.input; await assert.rejects(createFlatNativeExecution(omitted));
  await assert.rejects(createFlatNativeExecution(f.input, { authorize: () => true }), /FLAT_EXECUTION_CALLBACKS/);
  let accessed = false;
  await assert.rejects(createFlatNativeExecution({ ...f.input, get evmDelivery() { accessed = true; return evmDelivery; } }), /DATA_FIELDS/);
  assert.equal(accessed, false);
  f.quorumBinding.checks.length = 0;
  f.keeper = await createFlatNativeExecution(f.input); assert.deepEqual(f.quorumBinding.checks, ['3', '1', '2']);
});

test('legacy BTC/SOL keepers still accept omitted EVM observer and their own finality branch', async t => {
  for (const families of [['1', '2'], ['2']]) {
    await t.test(families.join('/'), async t => {
      const f = await fixture(t, families); f.keeper = await createFlatNativeExecution(f.input);
      assert.deepEqual(f.quorumBinding.checks, families);
      await assert.rejects(createFlatNativeExecution({ ...f.input, evmDelivery: {} }), /QUORUM_CAPABILITY/);
      await f.keeper.prepare(f.ref, f.prepared, f.providers); await f.keeper.execute(f.ref);
      assert.deepEqual(f.finality, [[families[0], h('native-id')]]);
    });
  }
});

test('EVM provider identity binds exact source pool, runtime, system, quorum, observer and recipient', async t => {
  const f = await fixture(t); f.keeper = await createFlatNativeExecution(f.input);
  await assert.rejects(f.keeper.prepare(f.ref, f.prepared, [{ ...f.providers[0], provider: { ...f.provider } }]), /OWNED_PROVIDER/);
  for (const key of ['runtime', 'system', 'poolIndex', 'operatorQuorum', 'observer', 'recipientIndex', 'family']) {
    const old = f.providerBinding[key]; f.providerBinding[key] = key === 'poolIndex' ? 1 : key === 'recipientIndex' ? 0 : {};
    await assert.rejects(f.keeper.prepare(f.ref, f.prepared, f.providers), /PROVIDER_BINDING/); f.providerBinding[key] = old;
  }
  for (const changed of [{ family: '1' }, { rule: { ...f.rules[0], family: '1' } },
    { rule: { ...f.rules[0], asset: h('other-asset') } }, { rulePath: { ...f.ruleTree.paths[0], index: '1' } }])
    await assert.rejects(f.keeper.prepare(f.ref, f.prepared, [{ ...f.providers[0], ...changed }]));
  const originalAmount = f.offer.actionTemplate.amount; f.offer.actionTemplate.amount = '70000';
  await assert.rejects(f.keeper.prepare(f.ref, f.prepared, f.providers), /PROVIDER_ACTION/); f.offer.actionTemplate.amount = originalAmount;
  const changed = copy(f.prepared); changed.rolePackets.recovery.recovery.value.reserveNullifier = h('other-reserve');
  await assert.rejects(f.keeper.prepare(f.ref, changed, f.providers));
  assert.equal(f.executions.length, 0); assert.equal(f.sent.length, 0);
  await f.keeper.prepare(f.ref, f.prepared, f.providers);
});

test('EVM execution still requires included source reserve, spent input and accepted original envelope', async t => {
  const f = await fixture(t); f.keeper = await createFlatNativeExecution(f.input);
  const binding = await f.keeper.prepare(f.ref, f.prepared, f.providers), ledger = f.view.ledger;
  const commitments = [...ledger.commitments], nullifiers = [...ledger.nullifiers];
  ledger.commitments = ledger.commitments.filter(value => value !== p(binding.reserveCommitment));
  await assert.rejects(f.keeper.execute(f.ref), /NOTE_NOT_INCLUDED/); ledger.commitments = commitments;
  ledger.nullifiers = [];
  await assert.rejects(f.keeper.execute(f.ref), /RESERVATION_REQUIRED/); ledger.nullifiers = nullifiers;
  ledger.nullifiers.push(p(binding.reserveNullifier));
  await assert.rejects(f.keeper.execute(f.ref), /RESERVE_SPENT/); ledger.nullifiers.pop();
  f.authorizationUnavailable = true;
  await assert.rejects(f.keeper.execute(f.ref), /AUTHORIZATION_UNAVAILABLE/);
  assert.equal(f.keeper.snapshot(f.ref).executionStarted, false);
  assert.equal(f.executions.length, 0); assert.equal(f.sent.length, 0); assert.deepEqual(f.proofs, []);
});

test('uncertain EVM exposure cannot resend; original cutoff F works after quorum becomes unavailable', async t => {
  const f = await fixture(t); f.keeper = await createFlatNativeExecution(f.input);
  await f.keeper.prepare(f.ref, f.prepared, f.providers); f.executionError = 'TEST_ORIGINAL_SEND_UNCERTAIN';
  await assert.rejects(f.keeper.execute(f.ref), /ORIGINAL_SEND_UNCERTAIN/);
  assert.deepEqual(f.keeper.snapshot(f.ref).nativeExposure, [{ slot: 0, family: '3', status: 'POSSIBLE' }]);
  await assert.rejects(f.keeper.execute(f.ref), /RECONCILE_OR_RECOVER_ORIGINAL/);
  await assert.rejects(f.keeper.reconcile(f.ref), /PARTIAL_DELIVERY_REQUIRES_RECOVERY/);
  await assert.rejects(f.keeper.recover(f.ref), /RECOVERY_BEFORE_CUTOFF/);
  f.quorumBinding.closed = true; f.view.head.timestamp = '2000';
  assert.deepEqual(await f.keeper.recover(f.ref), { outcome: 'RECOVERED', original: true });
  assert.equal(f.executions.length, 1); assert.equal(f.facts.length, 0); assert.deepEqual(f.proofs, ['dependency', 'ready', 'recovery']);
  const recovery = f.terminals.at(-1); assert.equal(recovery.statement.recoveryCommitment, f.prepared.rolePackets.recovery.recovery.value.recoveryCommitment);
  const sends = f.sent.length; await f.keeper.recover(f.ref); await f.keeper.reconcile(f.ref);
  assert.equal(f.sent.length, sends); assert.equal(f.keeper.snapshot(f.ref).outcome, 'RECOVERED');
});

test('checkpoint failure retains bounded underlying protocol causes before any native exposure', async t => {
  const f = await fixture(t), audits = [];
  f.keeper = await createFlatNativeExecution(f.input, { onPrivateAudit: value => { audits.push(value); } });
  await f.keeper.prepare(f.ref, f.prepared, f.providers);
  f.checkpointError = Object.assign(new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN'), {
    causeCodes: ['FLAT_OPERATOR_AUDIT_TOO_OLD', 'raw private values are not labels'],
    auditBudget: { phase: 'after-claim-coverage', elapsedMilliseconds: 30001, limitMilliseconds: 30000 },
  });
  await assert.rejects(f.keeper.execute(f.ref), error => error === f.checkpointError);
  const snapshot = f.keeper.snapshot(f.ref);
  assert.equal(snapshot.errorCode, 'FLAT_OPERATOR_SIGNING_UNCERTAIN');
  assert.deepEqual(snapshot.errorCauseCodes, ['FLAT_OPERATOR_AUDIT_TOO_OLD']);
  assert.deepEqual(snapshot.errorAuditBudget, f.checkpointError.auditBudget);
  assert.deepEqual(snapshot.nativeExposure, []);
  assert.equal(f.executions.length, 0); assert.equal(f.sent.length, 0);
  assert.deepEqual(audits.at(-1).errorCauseCodes, ['FLAT_OPERATOR_AUDIT_TOO_OLD']);
  assert.deepEqual(audits.at(-1).auditBudget, f.checkpointError.auditBudget);
  assert.deepEqual(f.writes.at(-1).data.operations[0].errorAuditBudget, f.checkpointError.auditBudget);
  assert.deepEqual(f.writes.at(-1).data.operations[0].errorCauseCodes, ['FLAT_OPERATOR_AUDIT_TOO_OLD']);
});

test('EVM reconciliation failure preserves original broadcast and blocks facts and settlement', async t => {
  const f = await fixture(t); f.keeper = await createFlatNativeExecution(f.input);
  await f.keeper.prepare(f.ref, f.prepared, f.providers); f.reconcileError = 'TEST_EVM_FINALITY_UNAVAILABLE';
  await assert.rejects(f.keeper.execute(f.ref), /FINALITY_UNAVAILABLE/);
  assert.deepEqual(f.keeper.snapshot(f.ref).nativeExposure, [{ slot: 0, family: '3', status: 'BROADCAST' }]);
  assert.equal(f.facts.length, 0); assert.equal(f.terminals.length, 0);
  await assert.rejects(f.keeper.execute(f.ref), /RECONCILE_OR_RECOVER_ORIGINAL/); assert.equal(f.executions.length, 1);
});

// Actual keeper orchestration; proof/math/state/capability origins above remain
// explicitly synthetic. These cases establish ordering only, not acceptance.
test('observed receiver refresh precedes NEW health after I84 and N/T without renewing proof or permit windows', async t => {
  const f = await fixture(t, ['2']); f.observedClock = true;
  f.keeper = await createFlatNativeExecution(f.input);
  await f.keeper.prepare(f.ref, f.prepared, f.providers);
  assert.deepEqual(await f.keeper.execute(f.ref), { outcome: 'FULFILLED', original: true });
  assert.deepEqual(f.clockEvents, ['proof:admission', 'refresh', 'health', 'send:admission',
    'proof:settlement', 'refresh', 'health', 'send:settlement']);
  assert.equal(f.healthCalls, 2); assert.equal(f.executions.length, 1);
  const admission = f.jobs.find(value => value.name === 'admission').input;
  assert.equal(admission.admissionFrom, '1100'); assert.equal(admission.admissionUntil, '1800');
  assert.equal(f.prepared.rolePackets.local[0].action.executionUntil, '1900');
  assert.equal(f.prepared.rolePackets.reservation.core.value.settleBefore, '2000');
  assert.deepEqual(f.proofs, ['dependency', 'ready', 'admission', 'node', 'node', 'node', 'node', 'settlement']);
  const sends = f.sent.length; await f.keeper.execute(f.ref);
  assert.equal(f.sent.length, sends); assert.equal(f.executions.length, 1); assert.equal(f.healthCalls, 2);
});

test('failed original clock producer stops before health/admit and preserves delivered uncertainty without resend', async t => {
  const f = await fixture(t, ['2']); f.observedClock = true;
  f.refreshError = new Error('HOST_ORIGINAL_RECEIVER_REFRESH_FAILED');
  f.keeper = await createFlatNativeExecution(f.input); await f.keeper.prepare(f.ref, f.prepared, f.providers);
  await assert.rejects(f.keeper.execute(f.ref), error => error === f.refreshError);
  assert.deepEqual(f.clockEvents, ['proof:admission', 'refresh']); assert.equal(f.healthCalls, 0);
  assert.equal(f.sent.filter(row => row.request.data.startsWith(p(FLAT_TRANSACTION_METHODS.admit.selector))).length, 0);
  const snapshot = f.keeper.snapshot(f.ref);
  assert.equal(snapshot.outcome, null); assert.equal(snapshot.admittedReceipts, 0);
  assert.deepEqual(snapshot.nativeExposure, [{ slot: 0, family: '2', status: 'DELIVERED' }]);
  const sends = f.sent.length;
  await assert.rejects(f.keeper.execute(f.ref), /FLAT_EXECUTION_RECONCILE_OR_RECOVER_ORIGINAL/);
  assert.equal(f.sent.length, sends); assert.equal(f.executions.length, 1); assert.equal(f.healthCalls, 0);
});


test('owned Golden legacy keeper reaches health and original sends without invoking the V2 refresh producer', async t => {
  // Original local ownership is mocked explicitly, but its Golden identity is
  // separate from the V2 port. No real runtime, key or economic grant exists.
  const f = await fixture(t, ['2']);
  assert.equal(f.observedClock, undefined);
  f.keeper = await createFlatNativeExecution(f.input);
  await f.keeper.prepare(f.ref, f.prepared, f.providers);
  assert.deepEqual(await f.keeper.execute(f.ref), { outcome: 'FULFILLED', original: true });
  assert.equal(f.healthCalls, 2); assert.deepEqual(f.clockEvents, []);
  assert.equal(f.sent.filter(row => row.request.data.startsWith(p(FLAT_TRANSACTION_METHODS.admit.selector))).length, 1);
  assert.equal(f.sent.filter(row => row.request.data.startsWith(p(FLAT_TRANSACTION_METHODS.fulfillGeneric.selector))).length, 1);
  assert.equal(f.executions.length, 1);
  const sends = f.sent.length; await f.keeper.execute(f.ref);
  assert.equal(f.sent.length, sends); assert.equal(f.healthCalls, 2); assert.equal(f.executions.length, 1);
});
