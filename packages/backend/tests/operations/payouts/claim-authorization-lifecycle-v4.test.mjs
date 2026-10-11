/** V4 lifecycle tests; V3 scheduling-count tests remain unchanged in baseline.
 * Focused source-only composition tests. Explicit mocked ownership/current
 * views and in-memory durable stores replace deployments. Constructors, brands,
 * full claim accounting/inventory audits, codecs, signatures, ECDSA recovery and
 * quorum verification are real. No node, contracts, proof, network or funds. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { nativeAdmissionRulesTree } from '@lianum/engine/execution/native/dispatch/native-admission';
import { checkpointAuthorizationDigest, checkpointAuthorizationFrame, revocationMessage }
  from '@lianum/engine/evidence/native-hub-messages';
import { createNativeQuorumHostVerifier } from '@lianum/engine/evidence/native-quorum';
import { FACTS_QUORUM_PROFILE, nativeFactsRegistryCommitment } from '../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import { nativeRuleCommitment, encodeSolanaBindingMessage, receiptKeyCommitment } from '@lianum/engine/native/native-receipt-binding';
import { recoverSecp256k1Sender } from '../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import { encodeFlatNativeHealth, flatNativeHealthDigest } from '../../../src/chains/shared/health/native-health.mjs';
import { ownedCustodyRoute, ownedCustodyFeeAudit } from '../../../src/chains/shared/runtime/owned-native-custody.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, claimTicketId, claimTicketSecret, nativeClaimEndpointCommitment,
  claimDestinationCommitment } from '@lianum/engine/claims/framing';
import { CLAIM_ACTIONS, claimHash, claimBackingFrame, claimFrame, claimRouteCommitment } from '@lianum/engine/claims/permits';
import { createClaimReservationBinding } from '../../../src/claims/authorization/reservation-facts-gate.mjs';
import * as originalFactsPeer from '../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import * as originalNativeBinding from '@lianum/engine/native/native-receipt-binding';
import * as originalPermits from '@lianum/engine/claims/permits';
import * as originalNoteEncoding from '@lianum/engine/notes/private-note-encoding';
import * as originalAuditMetrics from '../../../src/claims/operations/operator-audit-metrics.mjs';

import { encodeSolanaNonceBindingMessage } from '../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';

const sha = value => createHash('sha256').update(value).digest('hex'), copy = value => structuredClone(value);
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const prefix = value => '0x' + value, word = value => BigInt(value).toString(16).padStart(64, '0'), ZERO = word(0);
const url = path => new URL(path, import.meta.url).href;
const owned = { runtimes: new WeakMap(), systems: new WeakMap(), natives: new WeakSet(), observers: new WeakMap() };
const auditStates = new WeakMap();
const records = new Map(), closedNatives = new WeakSet(); let serial = 0;
let metricsFaultMode = null;
let metricsOverhead = null;
mock.module(url('../native-claims/operator-audit-metrics.mjs'), { exports: Object.fromEntries(
  Object.entries(originalAuditMetrics).map(([name, original]) => [name, (...args) => {
    if (metricsFaultMode === name) throw new Error('TEST_PRIVATE_COLLECTOR_FAULT');
    if (name === 'checkpointClaimOperatorMetrics') metricsOverhead?.();
    return original(...args);
  }])) });

let attesterKeyUses = 0, factsKeyUses = 0, onKeyUse = null, onBackingFrame = null, onClaimFactsFrame = null;
const observedFactsSigner = create => input => {
  const signer = create(input);
  return Object.freeze({ publicKey: signer.publicKey, signFacts(facts) {
    factsKeyUses++; onKeyUse?.('facts', facts); return signer.signFacts(facts);
  } });
};
mock.module(url('../chain-adapters/native-receipt-binding.mjs'), { exports: { ...originalNativeBinding,
  encodeNativeClaimFacts(...args) { const frame = originalNativeBinding.encodeNativeClaimFacts(...args); onClaimFactsFrame?.(); return frame; },
} });
mock.module(url('../native-claims/permits.mjs'), { exports: { ...originalPermits,
  claimBackingFrame(...args) { const frame = originalPermits.claimBackingFrame(...args); onBackingFrame?.(); return frame; },
} });
mock.module(url('../chain-adapters/native-facts-peer.mjs'), { exports: { ...originalFactsPeer,
  createNativeFactsSigner: observedFactsSigner(originalFactsPeer.createNativeFactsSigner),
  createNativeClaimFactsSigner: observedFactsSigner(originalFactsPeer.createNativeClaimFactsSigner),
} });
mock.module(url('../../../../../omnichain-product/src/private-note-encoding.mjs'), { exports: { ...originalNoteEncoding,
  signature(...args) {
    if (new Error().stack.includes('Object.signFacts')) { factsKeyUses++; onKeyUse?.('facts', args[1]); }
    else { attesterKeyUses++; onKeyUse?.('authorization', args[1]); }
    return originalNoteEncoding.signature(...args); },
} });
mock.module(url('../chain-adapters/local-evm-ownership.mjs'), { exports: {
  async assertLocalEvm(runtime) { assert.ok(owned.runtimes.has(runtime), 'TEST_OWNED_RUNTIME'); },
} });
mock.module(url('./deploy-system.mjs'), { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(owned.systems.get(system), runtime, 'TEST_OWNED_SYSTEM'); },
} });
mock.module(url('../chain-adapters/owned-solana-runtime.mjs'), { exports: {
  SOLANA_NONCE_INGRESS_PROFILE: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',
  assertOwnedSolanaRuntime(native) { assert.ok(owned.natives.has(native), 'TEST_OWNED_NATIVE'); },
  assertOwnedSolanaRuntimeLive(native) { assert.ok(owned.natives.has(native) && !closedNatives.has(native), 'TEST_NATIVE_CLOSED'); },
  readOwnedSolanaRuntimeAuditState(native) { assert.ok(auditStates.has(native), 'TEST_NATIVE_STATE_REQUIRED'); return frozen(copy(auditStates.get(native)())); },
} });
mock.module(url('../chain-adapters/owned-bitcoin-runtime.mjs'), { exports: {
  assertOwnedBitcoinRuntime(native) { assert.ok(owned.natives.has(native), 'TEST_OWNED_NATIVE'); },
  assertOwnedBitcoinRuntimeLive(native) { assert.ok(owned.natives.has(native) && !closedNatives.has(native), 'TEST_NATIVE_CLOSED'); },
  readOwnedBitcoinRuntimeAuditState(native) { assert.ok(auditStates.has(native), 'TEST_NATIVE_STATE_REQUIRED'); return frozen(copy(auditStates.get(native)())); },
} });
mock.module(url('../native-claims/owned-state.mjs'), { exports: {
  assertOwnedClaimObserver(observer) { assert.ok(owned.observers.has(observer), 'TEST_OWNED_CLAIM_OBSERVER'); },
  ownedClaimObserverBindings(observer) { assert.ok(owned.observers.has(observer)); return owned.observers.get(observer); },
} });
mock.module(url('../chain-adapters/evm-vault-delivery-observer.mjs'), { exports: {
  assertOwnedEvmVaultDeliveryObserver() { assert.fail('TEST_NO_EVM_DELIVERY'); },
  assertOwnedEvmVaultDeliveryFacts() { assert.fail('TEST_NO_EVM_DELIVERY'); },
} });
mock.module(url('../paeg/flat-system-state.mjs'), { exports: {
  async createFlatSystemStateReader({ runtime, system, poolIndex }) {
    assert.equal(owned.systems.get(system), runtime); const f = owned.runtimes.get(runtime);
    const issued = new WeakSet(), stats = { poolIndex, reads: 0, currentChecks: 0 };
    f.controls.readerStats.push(stats);
    return Object.freeze({ async read() {
      stats.reads++; const value = frozen(copy(f.view(poolIndex))); issued.add(value); return value;
    }, async assertCurrent(view) {
      stats.currentChecks++; assert.ok(issued.has(view), 'TEST_ORIGINAL_READER_VIEW_REQUIRED');
      await f.controls.beforeCurrent?.(stats, view);
      assert.ok(!f.controls.currentFailure, 'TEST_CURRENT_VALIDATION_FAILED');
      assert.deepEqual(view, f.view(poolIndex), 'TEST_GRAPH_HEAD_CHANGED');
    } });
  },
} });
mock.module(url('../native-claims/segmented-record-store.mjs'), { exports: {
  openClaimRecordStore() { throw new Error('TEST_UNEXPECTED_STORE_REOPEN'); },
  async createClaimRecordStore({ path }, data) {
    assert.ok(!records.has(path)); const row = { data: copy(data), revision: 0, closed: false, corrupt: false, updates: [], writes: 0 };
    records.set(path, row);
    const read = async () => { await row.beforeRead?.(); assert.ok(!row.closed, 'TEST_CLAIM_STORE_CLOSED');
      return { data: copy(row.data), revision: row.revision, commitment: row.corrupt ? sha('corrupt') : sha(String(row.revision)) }; };
    return { read, async update(revision, transform) {
      assert.equal(row.revision, revision); row.data = copy(transform(copy(row.data)));
      row.updates.push(copy(row.data));
      row.revision = revision + 1; row.writes++; await row.beforeUpdate?.(copy(row.data)); return read();
    }, close() { row.closed = true; } };
  },
} });
const bridge = await import('../../../src/operations/operators/claims/combined-native-operators.mjs');
const { createCombinedLocalNativeOperator } = bridge;
const { createFlatOperatorQuorum, assertOwnedFlatOperatorQuorum, createScopedFlatOperator, createLocalFlatOperator, graphOperatorPrivateAuditActivity } = await import('../../../src/operations/operators/claims/native-operators.mjs');
const { createClaimOperatorQuorum, openClaimOriginalAuthorizationLeaseV4, consumeClaimOperatorKeyLeaseV4, assertOwnedClaimOperatorQuorum, createScopedClaimOperator, createLocalClaimOperator, claimOperatorPrivateAuditMetrics, claimOperatorPrivateAuditActivity } = await import('../../../src/claims/operations/operators.mjs');

function fixture(t, { family = '2', sameNode = true, standalone = false } = {}) {
  const id = ++serial, pairs = [0, 1, 2, 3].map(signerIndex => standalone
    ? { claim: createLocalClaimOperator({ signerIndex }), graph: createLocalFlatOperator({ signerIndex }) }
    : createCombinedLocalNativeOperator({ signerIndex }));
  t.after(() => { pairs.forEach(pair => { pair.claim.close(); pair.graph.close(); });
    for (const path of records.keys()) if (path.startsWith('/combined-test-' + id + '/')) records.delete(path); });
  const rule = { family, genesis: family === '1' ? '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206' : sha('genesis'),
    asset: sha('asset'), finalityKind: family, minimumConfirmations: family === '1' ? '6' : '0',
    maximumEvidenceLifetime: '120', maximumClockSkew: '30' }, tree = nativeAdmissionRulesTree([rule]);
  const registry = { profile: FACTS_QUORUM_PROFILE, hubDomain: sha('hub-' + id), registryEpoch: '1', rulesRoot: tree.root,
    keys: pairs.map(pair => copy(pair.claim.publicKey)) }, registryCommitment = nativeFactsRegistryCommitment(registry);
  const head = { number: '60', timestamp: '1000', hash: sha('head') };
  const controls = { liability: '0', unresolved: false, claimHead: null, beforeInventory: null, recoveries: 0,
    inventoryReads: 0, claimReads: [], graphReads: [], graphSource: null, principal: '0',
    graphUnavailable: false, graphAdverse: false, beforeGraphRead: null, beforeRecovery: null,
    intents: [], tickets: [], activePayout: ZERO, originalPrepared: null, preparedRoute: null, preparedCalls: [], revoked: false, reservations: new Map(), readerStats: [], beforeCurrent: null, currentFailure: false,
    headerReads: 0, blockFailure: false, exclusiveNativeReads: false, nativeReadBusy: false,
    nativeReadCollisions: 0, nativeReadEvents: [], beforeNativeRead: null,
    claimViews: [], claimCurrentViews: [], beforeClaimRead: null, beforeClaimCurrent: null, claimCurrentFailure: false };
  const advanceState = () => { head.number = String(BigInt(head.number) + 1n); head.hash = sha('state-head-' + head.number); };
  let liability = controls.liability;
  Object.defineProperty(controls, 'liability', { enumerable: true, get: () => liability,
    set(value) { if (value !== liability) advanceState(); liability = value; } });
  async function nativeRead(kind, work) {
    controls.nativeReadGeneration = (controls.nativeReadGeneration ?? 0) + 1;
    if (!controls.exclusiveNativeReads) return work();
    if (controls.nativeReadBusy) { controls.nativeReadCollisions++; throw new Error('TEST_SHARED_NATIVE_READ_BUSY'); }
    controls.nativeReadBusy = true; controls.nativeReadEvents.push({ kind, phase: 'start' });
    const oldGraphSnapshot = controls.graphSnapshotOverride;
    if (controls.transientPhysicalReadState) controls.graphSnapshotOverride = [{ nativeId: sha('in-flight-graph-read'), phase: 'OBSERVATION_UNAVAILABLE' }];
    try {
      await controls.beforeNativeRead?.(kind);
      await new Promise(resolve => setImmediate(resolve));
      return await work();
    } finally {
      if (controls.transientPhysicalReadState) controls.graphSnapshotOverride = oldGraphSnapshot;
      controls.nativeReadEvents.push({ kind, phase: 'end' }); controls.nativeReadBusy = false;
    }
  }
  const pools = [0, 1].map(i => prefix(sha('pool-' + id + '-' + i).slice(0, 40)));
  function view(poolIndex) {
    return { poolIndex, poolAddress: pools[poolIndex], head: copy(head),
      header: { number: '0x' + BigInt(head.number).toString(16), hash: prefix(head.hash),
        timestamp: '0x' + BigInt(head.timestamp).toString(16) },
      snapshot: { poolStateSequence: '0', hubStateSequence: '0' }, checkpointCount: '0',
      healthState: { pool: pools[poolIndex].slice(2), domain: word(1), hubDomain: registry.hubDomain, registryCommitment,
        evidenceState: word(2), receiptRoot: word(3), receiptCount: '0', spentTagDigest: ZERO, spentTagCount: '0', spentTagSequence: '0',
        revokedDigest: word(4), revokedCount: '0', revocationSequence: '0', stateSequence: '0', revocationOverflowDigest: ZERO,
        revocationOverflowCount: '0', halted: '0', timestamp: head.timestamp } };
  }
  const runtime = Object.freeze({ get ingressSendState() { return { epoch: String(controls.evmEpoch ?? 0), busy: false, uncertain: false }; }, metadata: { scratchDirectory: '/combined-test-' + id, evmGenesis: prefix(sha('evm')) },
    async block() { controls.headerReads++; assert.ok(!controls.blockFailure, 'TEST_CURRENT_HEADER_UNAVAILABLE'); return copy(view(0).header); },
    async call({ to, data }, at) {
      assert.equal(to, '0x0000000000000000000000000000000000000001');
      assert.equal(at, '0x' + BigInt(head.number).toString(16)); const w = data.slice(2).match(/.{64}/g);
      controls.recoveries++; await controls.beforeRecovery?.();
      const recovered = recoverSecp256k1Sender({ digest: w[0], r: w[2], s: w[3], parity: Number(BigInt('0x' + w[1]) - 27n) });
      return '0x' + '00'.repeat(12) + recovered.slice(2);
    } });
  const system = Object.freeze({ registry, registryCommitment: prefix(registryCommitment), hubDomain: prefix(registry.hubDomain),
    ledgerNamespace: prefix(registry.hubDomain), hub: { address: prefix(sha('hub-address').slice(0, 40)), receipt: { transactionHash: prefix(sha('deploy')) },
      async call(method, args, at) {
        assert.equal(at, '0x' + BigInt(head.number).toString(16));
        if (method === 'attester(uint8)') {
          const key = registry.keys[args[0]], account = publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex');
          return prefix(key.x + key.y + '00'.repeat(12) + account);
        }
        if (method === 'finalityHealthDigest(address,uint64,uint64)') {
          const { timestamp, ...state } = view(pools.indexOf(args[0])).healthState;
          return prefix(flatNativeHealthDigest({ ...state, validFrom: args[1], validUntil: args[2] }));
        }
        if (method === 'checkpointAuthorizationDigest(address,uint64,uint64,bytes32,uint64)')
          return checkpointAuthorizationDigest({ hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
            pool: args[0], expectedPoolSequence: args[1], expectedHubStateSequence: args[2], requestId: args[3], validUntil: args[4] });
        if (method === 'revoked(bytes32)') return prefix(ZERO);
        if (method === 'revocationMessage(bytes32,uint64,bytes32,uint64)')
          return revocationMessage({ hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
            gid: args[0], expectedSequence: args[1], reasonCommitment: args[2], authorizationExpiry: args[3] });
        assert.fail(method);
      } } });
  owned.runtimes.set(runtime, { view, controls }); owned.systems.set(system, runtime);
  const endpoint = name => family === '1' ? '0014' + sha(name).slice(0, 40) : sha(name);
  const payoutSigner = generateKeyPairSync('ed25519');
  const payoutSource = Buffer.from(payoutSigner.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const claimSigner = generateKeyPairSync('ed25519');
  const claimSource = Buffer.from(claimSigner.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role,
    { endpoint: family === '2' && role === 'depositor' ? claimSource : family === '2' && role === 'escrow' ? payoutSource : endpoint(role), address: 'owned-' + role }]));
  const config = { ...Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? sha(name).slice(0, 40) : type === 'field32' ? '01' + sha(name).slice(2)
      : type === 'u256' ? '31337' : type === 'u64' ? '5000' : type === 'u8' ? '2' : sha(name)])),
    hubDomain: registry.hubDomain, ledgerNamespace: registry.hubDomain, registryCommitment, nativeFamily: family, nativeGenesis: rule.genesis,
    nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule),
    escrowEndpointCommitment: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset, endpoint: roles.escrow.endpoint }) };
  const domain = claimDomainCommitment(config), prefund = { amount: '10000000', classification: 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING', fee: '0' };
  const close = () => {};
  const claimTransfers = [], claimObservations = new Map();
  const custody = Object.freeze({ roles, get transfers() { return copy(claimTransfers); }, syntheticPrefunding: prefund, close,
    adapter({ route }) { const spec = ownedCustodyRoute(route); return { binding: { sourceEndpoint: roles[spec.sourceRole].endpoint,
      destinationEndpoint: roles[spec.destinationRole].endpoint },
      assertPrepared: prepared => nativeRead('payout-preparation', async () => {
        assert.equal(route, controls.preparedRoute, 'TEST_ORIGINAL_PAYOUT_ROUTE');
        assert.deepEqual(prepared, controls.originalPrepared, 'TEST_ORIGINAL_PAYOUT_PREPARED');
        controls.preparedCalls.push(prepared); await controls.beforePrepared?.();
      }) }; },
    factReader({ route }) { return { observe: request => nativeRead('claim-observation', async () => {
      assert.equal(route, claimTransfers.find(row => row.nativeId === request.nativeId)?.route); assert.ok(claimObservations.has(request.nativeId), 'TEST_NO_CLAIM_TRANSFER');
      if (controls.claimAdverse) return { status: 'adverse', reason: 'TEST_RETAINED_CLAIM_ADVERSE' };
      return copy(claimObservations.get(request.nativeId));
    }) }; },
    inventory: () => nativeRead('claim-inventory', async () => {
      controls.inventoryReads++; await controls.beforeInventory?.();
      const paidFees = claimTransfers.filter(row => row.route !== 'deposit').reduce((sum, row) => sum + BigInt(row.actualFee ?? 0), 0n);
      const accounts = Object.entries(roles).map(([role, account]) => ({ role, ...account, exists: true,
        total: String(10000000n + (role === 'escrow' ? BigInt(controls.principal) - paidFees : 0n)),
        spendable: String(10000000n + (role === 'escrow' ? BigInt(controls.principal) - paidFees : 0n)), rentExemptMinimum: '890880' }));
      return { family: '2', genesis: rule.genesis, asset: rule.asset, nativeHead: { id: sha('native-head'), height: '10', slot: '11' },
        accounts, escrow: copy(accounts[1]), feeAudit: ownedCustodyFeeAudit(claimTransfers.map(row => ({ nativeId: row.nativeId,
          route: row.route, phase: row.phase, amount: row.intent.lamports, preparedFee: '5000',
          actualFee: row.actualFee, broadcastAttempts: row.broadcastAttempts }))),
        signingUnresolved: controls.unresolved,
        syntheticPrefunding: copy(prefund), finality: 'finalized' };
    }) });
  const solver = generateKeyPairSync('ed25519'), graphSource = Buffer.from(solver.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const observations = new Map();
  const graph = Object.freeze({ genesis: rule.genesis, genesisHex: prefix(rule.genesis), close: sameNode ? close : () => {},
    adapter({ asset, recipientIndex }) { assert.equal(asset, rule.asset); assert.ok([0, 1].includes(recipientIndex));
      return { binding: { family, genesis: rule.genesis, asset, sourceEndpoint: controls.graphSource ?? (family === '1' ? endpoint('graph-source') : graphSource),
        destinationEndpoint: endpoint('graph-recipient-' + recipientIndex) } }; },
    factReader({ asset }) { assert.equal(asset, rule.asset); return { observe: request => nativeRead('graph-observation', async () => {
      controls.graphReads.push(copy(request)); await controls.beforeGraphRead?.();
      if (controls.graphAdverse) return { status: 'adverse', reason: 'TEST_GRAPH_ADVERSE' };
      if (controls.graphUnavailable) return { status: 'unknown', reason: 'TEST_GRAPH_UNAVAILABLE' };
      return copy(observations.get(request.nativeId) ?? { status: 'unknown', reason: 'GRAPH_OWNED_EFFECT_REQUIRED' });
    }) }; } });
  owned.natives.add(custody); owned.natives.add(graph);
  function claimView() {
    const { timestamp, ...healthState } = view(0).healthState;
    return { head: copy(controls.claimHead ?? head), hubStateSequence: '0', gateways: [{ claimDomain: domain,
      claimSequence: '0', intentCount: String(controls.intents.length), ticketCount: String(controls.tickets.length), reservedRefundTickets: String(controls.intents.filter(row => row.state === '1').length),
      nextTicketNonce: String(controls.tickets.length), wrapperSupply: controls.liability,
      pendingRedemptions: controls.tickets.filter(row => row.state !== '4' && row.ticket.kind === '1').reduce((n,row) => n + BigInt(row.ticket.amount),0n).toString(),
      pendingRefunds: controls.tickets.filter(row => row.state !== '4' && row.ticket.kind === '2').reduce((n,row) => n + BigInt(row.ticket.amount),0n).toString(),
      heldUnissued: controls.intents.filter(row => row.state === '1').reduce((sum, row) => sum + BigInt(row.amount), 0n).toString(),
      reservedFees: String(BigInt(config.refundMaxFee) * BigInt(controls.intents.filter(row => row.state === '1').length + controls.tickets.filter(row => row.state !== '4').length)), activePayout: controls.activePayout,
      intents: copy(controls.intents), tickets: copy(controls.tickets), revocationState: sha('revocation'), healthState, poolHeadroom: true }] };
  }
  const claimIssued = new WeakSet();
  const observer = Object.freeze({ async read() {
      await controls.beforeClaimRead?.(); const value = frozen(claimView()); claimIssued.add(value);
      controls.claimViews.push(value); controls.claimReads.push(copy(value.head)); return value;
    },
    async assertCurrent(value) {
      assert.ok(claimIssued.has(value), 'TEST_ORIGINAL_CLAIM_VIEW_REQUIRED'); controls.claimCurrentViews.push(value);
      await controls.beforeClaimCurrent?.(value); assert.ok(!controls.claimCurrentFailure, 'TEST_CLAIM_CURRENT_VALIDATION_FAILED');
      assert.deepEqual(value, claimView(), 'TEST_CLAIM_HEAD_CHANGED');
    },
    async readReservation(request, view) { assert.deepEqual(view, claimView()); assert.equal(request.claimDomain, domain);
      return copy(controls.reservations.get(request.admissionN) ?? null); },
    async assertUnrevoked(request, value) { assert.deepEqual(value, claimView()); assert.equal(controls.revoked, false, 'TEST_PAYOUT_REVOKED'); } });
  const snapshot = facade => {
    const graphTransfers = controls.graphSnapshotOverride ?? [...observations].map(([nativeId, observation]) => ({ nativeId,
      phase: family === '1' ? 'OBSERVED_CONFIRMED' : 'OBSERVED_FINALIZED', observation: copy(observation) }));
    const custodyTransfers = controls.custodySnapshotOverride ?? copy(claimTransfers);
    return { profile: 'OWNED_NATIVE_RUNTIME_AUDIT_STATE_V1', family, lifetimeId: sha('physical-' + id),
      facade, genesis: rule.genesis, readGeneration: String(controls.nativeReadGeneration ?? 0),
      mutationGeneration: String(controls.nativeMutationGeneration ?? 0),
      activeReads: controls.nativeReadBusy ? 1 : 0, activeMutations: controls.activeMutation ? 1 : 0,
      readsIdle: !controls.nativeReadBusy, operationBusy: false, observationBusy: controls.nativeReadBusy,
      inventoryBusy: false, signingUnresolved: controls.unresolved, persistenceFailed: Boolean(controls.nativePersistenceFailed),
      isolationFailed: false, adverseHistory: Boolean(controls.nativeAdverse), activeRoute: controls.preparedRoute,
      activePrepared: controls.originalPrepared, transfers: facade === 'custody' ? custodyTransfers : graphTransfers,
      custodyTransfers, graphTransfers };
  };
  auditStates.set(custody, () => snapshot('custody')); auditStates.set(graph, () => snapshot('graph'));
  owned.observers.set(observer, { runtime, system: { flatSystem: system }, registry, configs: [config],
    policies: [{ ledgerNamespace: registry.hubDomain, hubDomain: registry.hubDomain, registryCommitment, rule }],
    nativeRuntimes: [custody], journalRoot: runtime.metadata.scratchDirectory });
  const binding = { runtime, system, bitcoin: family === '1' ? graph : null, solana: family === '2' ? graph : null,
    rules: [rule], rulePaths: tree.paths };
  return { pairs, controls, runtime, system, registry, observer, binding, graph, custody, domain, head, view,
    async bind(count = 3) {
      for (const pair of pairs.slice(0, count)) { await pair.claim.bind(observer); if (!standalone) await pair.graph.bind(binding); }
      return { claim: createClaimOperatorQuorum({ operators: pairs.slice(0, 3).map(pair => pair.claim) }),
        graph: standalone ? null : createFlatOperatorQuorum({ operators: pairs.slice(0, 3).map(pair => pair.graph) }) };
    },
    addGraphFact() {
      const wireKeyCommitment = sha('K'), intent = { sourcePublicKey: graphSource, recipientPublicKey: sha('graph-recipient-0'),
        recentBlockhash: sha('blockhash'), lamports: '12345', wireKeyCommitment };
      const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex'), signature = sign(null, message, solver.privateKey);
      const nativeId = signature.toString('hex'), nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
      observations.set(nativeId, { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire, intent,
        blockId: sha('block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
        nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } });
      return { family: '2', recipientIndex: '0', nativeId, wireKeyCommitment };
    },
    async addClaimFact({ staged = false } = {}) {
      assert.equal(family, '2');
      const seq = controls.intents.length, receiptSecret = sha('claim-secret-' + seq), wireSalt = sha('claim-salt-' + seq), amount = '12345', output = sha('claim-Q-' + seq);
      const operationId = claimIntentId({ claimDomain: domain, outputQ: output, amount });
      const wireKeyCommitment = receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret: receiptSecret });
      const intent = { sourcePublicKey: claimSource, recipientPublicKey: roles.escrow.endpoint,
        recentBlockhash: sha('claim-blockhash'), lamports: amount, wireKeyCommitment };
      const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex'), signature = sign(null, message, claimSigner.privateKey);
      const nativeId = signature.toString('hex'), nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
      const request = { family, recipientIndex: '0', nativeId, wireKeyCommitment };
      const binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway,
        ledgerNamespace: config.ledgerNamespace, genesis: config.nativeGenesis, asset: config.nativeAsset,
        operationId, revision: '1', ingress: true, receiptSecret, wireSalt, nativeWire, intent, request });
      controls.intents.push({ id: operationId, state: '1', output, amount, validFrom: '990', validUntil: '1030', revision: '1',
        proofHash: sha('claim-proof'), nullifier: staged ? ZERO : binding.admissionN, refundDestination: staged ? ZERO : sha('claim-refund') });
      controls.principal = String(BigInt(controls.principal) + (staged ? 0n : BigInt(amount)));
      claimTransfers.push({ nativeId, nativeWire, intent, route: 'deposit', recipientIndex: 0,
        phase: staged ? 'SIGNED_NOT_BROADCAST' : 'OBSERVED_FINALIZED', broadcastAttempts: staged ? 0 : 1, actualFee: staged ? null : '5000' });
      claimObservations.set(nativeId, { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire, intent,
        blockId: sha('claim-block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
        nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } });
      if (!staged) controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId, revision: '1',
        wireBindingCommitment: binding.wireBindingCommitment, ingress: true, consumed: false });
      advanceState();
      for (const pair of pairs.slice(0, 3)) await pair.claim.retainSignedEffect({ claimDomain: domain, operationId, receiptSecret, wireSalt, nativeId });
      return request;
    },
    preparePayout(kind = '1') {
      const old = controls.intents[0]; assert.ok(old); old.state = kind === '1' ? '2' : '3';
      const ticketId = claimTicketId({ claimDomain: domain, kind, nonce: '0' });
      const secret = claimTicketSecret({ claimDomain: domain, ticketId });
      const routeName = kind === '2' ? 'refund' : 'redeem';
      const route = { endpoint: roles[kind === '2' ? 'depositor' : 'recipient'].endpoint, salt: sha('payout-route'),
        quotedFee: '5000', selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
      const nativeChainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'), Buffer.from(rule.genesis, 'hex'), Buffer.from(rule.asset, 'hex')]));
      const ticket = { kind, id: ticketId, claimDomain: domain, amount: old.amount, maxFee: '5000',
        destinationCommitment: claimDestinationCommitment({ claimDomain: domain, nativeChainDomain,
          endpoint: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset, endpoint: route.endpoint }),
          amount: old.amount, maxFee: '5000', salt: route.salt }),
        referenceIngressN: kind === '2' ? old.nullifier : ZERO, referenceQ: kind === '2' ? old.output : ZERO };
      const row = { ticket, state: '1', payoutRouteCommitment: ZERO }; controls.tickets.push(row); advanceState();
      const intent = { sourcePublicKey: payoutSource, recipientPublicKey: route.endpoint, nonceAccountPublicKey: sha('escrow-nonce-account'),
        durableNonce: sha('escrow-nonce-value'), lamports: ticket.amount,
        wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret }) };
      const prepared = frozen({ genesis: rule.genesis, intent, unsignedWire: encodeSolanaNonceBindingMessage(intent), funds: { feeLamports: '5000' } });
      controls.originalPrepared = prepared; controls.preparedRoute = routeName;
      const request = { claimDomain: domain, ticketId, prepared, route, wireSalt: sha('payout-wire-salt') };
      const terms = action => ({ action, operationId: ticketId, revision: '1', amount: ticket.amount,
        destinationCommitment: ticket.destinationCommitment, maxFee: '5000', routeCommitment: claimRouteCommitment(route),
        nullifier: ZERO, wireBindingCommitment: ZERO, claimSequence: '0', hubSequence: '0' });
      let binding, nativeId;
      return { request, prepared, ticket, routeName,
        begin: { claimDomain: domain, terms: terms(CLAIM_ACTIONS.BEGIN_PAYOUT), route, ownerAuthorization: null, prepared },
        beginIncluded() { row.state = '2'; row.payoutRouteCommitment = claimRouteCommitment(route); controls.activePayout = ticketId; advanceState(); },
        async retain() {
          const message = Buffer.from(prepared.unsignedWire, 'hex'), signature = sign(null, message, payoutSigner.privateKey);
          nativeId = signature.toString('hex'); const nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
          const spec = ownedCustodyRoute(routeName);
          claimTransfers.push({ nativeId, nativeWire, intent: copy(intent), route: routeName, recipientIndex: spec.recipientIndex,
            phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, actualFee: null });
          binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway, ledgerNamespace: config.ledgerNamespace,
            genesis: rule.genesis, asset: rule.asset, operationId: ticketId, revision: '1', ingress: false, receiptSecret: secret,
            wireSalt: request.wireSalt, nativeWire, intent,
            request: { family, recipientIndex: String(spec.recipientIndex), nativeId, wireKeyCommitment: intent.wireKeyCommitment } });
          const results = [];
          for (const pair of pairs) results.push(await pair.claim.retainSignedEffect({ claimDomain: domain, operationId: ticketId,
            receiptSecret: secret, wireSalt: request.wireSalt, nativeId }));
          results.forEach(value => assert.deepEqual(value, results[0]));
          return { claimDomain: domain, terms: { ...terms(CLAIM_ACTIONS.RESERVE_PAYOUT), nullifier: binding.admissionN,
            wireBindingCommitment: binding.wireBindingCommitment }, route, ownerAuthorization: null };
        },
        reserved() { controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId: ticketId, revision: '1',
          wireBindingCommitment: binding.wireBindingCommitment, ingress: false, consumed: false }); advanceState(); return { ...request, nativeId }; },
        observed() {
          const transfer = claimTransfers.find(row => row.nativeId === nativeId); transfer.phase = 'OBSERVED_FINALIZED';
          transfer.broadcastAttempts = 1; transfer.actualFee = '5000'; controls.principal = String(BigInt(controls.principal) - BigInt(ticket.amount));
          claimObservations.set(nativeId, { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire: transfer.nativeWire, intent: copy(intent),
            blockId: sha('payout-block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
            nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '61', parentSlot: '60', observedSlot: '64' } });
          row.state = '3'; advanceState(); return binding.request;
        },
        discharge() { row.state = '4'; controls.activePayout = ZERO; advanceState(); },
      };
    },
    issue() {
      const binding = records.get(runtime.metadata.scratchDirectory + '/claim-operator-0.v3').data.bindings[0], intent = controls.intents[0];
      return { claimDomain: domain, terms: { action: CLAIM_ACTIONS.ISSUE, operationId: intent.id,
        revision: intent.revision, amount: intent.amount, destinationCommitment: intent.refundDestination,
        maxFee: config.refundMaxFee, nullifier: binding.admissionN, wireBindingCommitment: binding.wireBindingCommitment,
        routeCommitment: sha('ingress-leaf'), claimSequence: '0', hubSequence: '0' }, route: null, ownerAuthorization: null };
    },
    reservation() {
      const binding = records.get(runtime.metadata.scratchDirectory + '/claim-operator-0.v3').data.bindings[0], intent = controls.intents[0];
      const route = { endpoint: roles.depositor.endpoint, salt: sha('refund-route-salt'), quotedFee: '5000',
        selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
      const chainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'),
        Buffer.from(config.nativeGenesis, 'hex'), Buffer.from(config.nativeAsset, 'hex')]));
      const destinationCommitment = claimDestinationCommitment({ claimDomain: domain, nativeChainDomain: chainDomain,
        endpoint: nativeClaimEndpointCommitment({ family, genesis: config.nativeGenesis, asset: config.nativeAsset, endpoint: route.endpoint }),
        amount: intent.amount, maxFee: config.refundMaxFee, salt: route.salt });
      return { claimDomain: domain, terms: { action: CLAIM_ACTIONS.RESERVE_INGRESS, operationId: intent.id,
        revision: intent.revision, amount: intent.amount, destinationCommitment, maxFee: config.refundMaxFee,
        nullifier: binding.admissionN, wireBindingCommitment: binding.wireBindingCommitment, routeCommitment: ZERO,
        claimSequence: '0', hubSequence: '0' }, route, ownerAuthorization: null };
    },
    claimStore(index = 0) { return records.get(runtime.metadata.scratchDirectory + '/claim-operator-' + index + '.v3'); },
    graphStore(index = 0) { return records.get(runtime.metadata.scratchDirectory + '/flat-operator-' + index + '.v3'); },
    preposition(output = sha('owner-output')) {
      const statement = { scope: config.scope, policy: config.policy, validFrom: '990', validUntil: '1030', amount: '10', output };
      const ownerAuthorization = { statement, proof: 'aabb' }, s = statement;
      const routeCommitment = claimHash(Buffer.concat([Buffer.from(s.scope, 'hex'), Buffer.from(s.policy, 'hex'),
        ...[s.validFrom, s.validUntil, s.amount].map(value => Buffer.from(word(value), 'hex')),
        Buffer.from(s.output, 'hex'), Buffer.from(claimHash(Buffer.from(ownerAuthorization.proof, 'hex')), 'hex')]));
      return { claimDomain: domain, terms: { action: CLAIM_ACTIONS.PREPOSITION,
        operationId: claimIntentId({ claimDomain: domain, outputQ: s.output, amount: s.amount }), revision: '1', amount: s.amount,
        destinationCommitment: config.escrowEndpointCommitment, maxFee: config.refundMaxFee, nullifier: ZERO,
        wireBindingCommitment: ZERO, routeCommitment, claimSequence: '0', hubSequence: '0' }, route: null, ownerAuthorization };
    },
  };
}
const causedBy = regex => error => { for (let e = error; e; e = e.cause) if (regex.test(e.message)) return true; return false; };

async function loadedPayout(t, kind = '1') {
  const f = fixture(t), q = await f.bind(4);
  for (let i = 0; i < 3; i++) await f.addClaimFact();
  await q.graph.facts(f.addGraphFact());
  f.controls.exclusiveNativeReads = true;
  return { f, q, p: f.preparePayout(kind) };
}
function readMark(f) { return { preparations: f.controls.preparedCalls.length, reads: f.controls.nativeReadEvents.length,
  graph: f.controls.graphReads.length, inventory: f.controls.inventoryReads }; }
function assertOwnReads(f, before, { prepared = 0, claimHistory = 3, graph = 12 } = {}) {
  const starts = f.controls.nativeReadEvents.slice(before.reads).filter(row => row.phase === 'start');
  assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
  const rounds = (f.controls.inventoryReads - before.inventory) / 3;
  assert.ok(Number.isSafeInteger(rounds) && rounds >= 1, 'each signer independently reads full inventory each round');
  assert.equal(f.controls.preparedCalls.length - before.preparations, prepared * rounds);
  assert.equal(starts.filter(row => row.kind === 'claim-observation').length, claimHistory * 3 * rounds);
  assert.equal(f.controls.graphReads.length - before.graph, 6 * rounds);
  assert.equal(starts.length * 2, f.controls.nativeReadEvents.length - before.reads);
}

test('loaded redeem and refund traverse prepared backing, original-only validation, presign, all-four binding, reservation, original-only validation, broadcast/reuse, facts and discharge health', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const kind of ['1', '2']) {
    const { f, q, p } = await loadedPayout(t, kind);
    assert.equal(q.claim.collectionProfile, 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3');
    const preparedBytes = JSON.stringify(p.prepared);
    let mark = readMark(f), permit = await q.claim.backing(p.begin);
    assertOwnReads(f, mark, { prepared: 9 });
    let keys = attesterKeyUses; mark = readMark(f);
    assert.equal(await q.claim.assertOriginalAuthorizationCurrent(permit), undefined);
    assert.equal(attesterKeyUses, keys); assertOwnReads(f, mark, { prepared: 9, graph: 6 });
    p.beginIncluded(); mark = readMark(f);
    const presign = await q.claim.authorizePayout(p.request); assertOwnReads(f, mark, { prepared: 9 });
    assert.equal(presign.message.validUntil, '1030');
    const reservationRequest = await p.retain(); mark = readMark(f);
    permit = await q.claim.reservation(reservationRequest); assertOwnReads(f, mark);
    keys = attesterKeyUses; mark = readMark(f);
    await q.claim.assertOriginalAuthorizationCurrent(permit); assert.equal(attesterKeyUses, keys);
    assertOwnReads(f, mark, { graph: 6 });
    const broadcast = p.reserved(); mark = readMark(f);
    const authorized = await q.claim.authorizeBroadcast(broadcast); assertOwnReads(f, mark, { prepared: 6 });
    keys = attesterKeyUses; mark = readMark(f);
    const reused = await q.claim.authorizeBroadcast(broadcast);
    assert.deepEqual(reused, authorized); assert.equal(attesterKeyUses, keys);
    assertOwnReads(f, mark, { prepared: 6, graph: 6 });
    assert.equal(JSON.stringify(p.prepared), preparedBytes);
    assert.ok(f.controls.preparedCalls.every(value => value !== p.prepared && Object.isFrozen(value)));
    for (const pair of f.pairs) assert.equal(f.claimStore(pair.claim.signerIndex).data.bindings.filter(row => !row.ingress).length, 1);
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 0);
    const factsRequest = p.observed(); mark = readMark(f); const facts = await q.claim.facts(factsRequest);
    assert.equal(facts.certificates.length, 3);
    assert.equal(f.controls.inventoryReads - mark.inventory, 18);
    assert.equal(f.controls.graphReads.length - mark.graph, 36);
    assert.ok(f.controls.nativeReadEvents.slice(mark.reads).filter(row => row.kind === 'claim-observation' && row.phase === 'start').length >= 12,
      'each of three facts signers scans every one of four retained custody identities plus its own facts observations');
    mark = readMark(f);
    const health = await q.claim.health({ claimDomain: f.domain, mode: 'debt' });
    assertOwnReads(f, mark, { claimHistory: 4, graph: 6 });
    mark = readMark(f); await q.claim.assertOriginalAuthorizationCurrent(health);
    assertOwnReads(f, mark, { claimHistory: 4, graph: 6 });
    p.discharge(); await q.claim.health({ claimDomain: f.domain, mode: 'debt' });
    assert.equal(f.custody.transfers.length, 4); assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 1);
    await assert.rejects(q.claim.authorizeBroadcast(broadcast), /ORIGINAL_PHASE/);
  }
});

test('loaded prepared payout rejects changed immutable preparation, route, original head, deficit and adverse graph before any key use', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const stage of ['backing', 'presign']) for (const fault of ['preparation', 'route', 'head', 'deficit', 'adverse']) {
    const { f, q, p } = await loadedPayout(t);
    if (stage === 'presign') p.beginIncluded();
    const request = copy(stage === 'backing' ? p.begin : p.request);
    if (fault === 'preparation') request.prepared.intent.durableNonce = sha('forged-nonce');
    if (fault === 'route') request.route.endpoint = sha('other-destination');
    if (fault === 'head') f.controls.claimHead = { ...f.head, hash: sha('fork') };
    if (fault === 'deficit') f.controls.principal = '0';
    if (fault === 'adverse') f.controls.graphAdverse = true;
    const keys = attesterKeyUses;
    await assert.rejects(stage === 'backing' ? q.claim.backing(request) : q.claim.authorizePayout(request));
    assert.equal(attesterKeyUses, keys); assert.equal(f.controls.nativeReadBusy, false);
    assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.custody.transfers.length, 3);
  }
});

test('loaded prepared final validation rejects changed source and expired original certificate without replacing authority', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const fault of ['prepared', 'head', 'certificate']) {
    const { f, q, p } = await loadedPayout(t); const original = await q.claim.backing(p.begin), keys = attesterKeyUses;
    const originalRows = f.claimStore().data.authorizations.length;
    if (fault === 'prepared') f.controls.originalPrepared = { ...p.prepared, unsignedWire: '00' };
    if (fault === 'head') f.head.hash = sha('later-head');
    if (fault === 'certificate') {
      // Same original certificate at an invalid exclusive-next-block boundary.
      f.head.timestamp = '1029';
    }
    await assert.rejects(q.claim.assertOriginalAuthorizationCurrent(original));
    assert.equal(attesterKeyUses, keys); assert.equal(f.claimStore().data.authorizations.length, originalRows);
  }
});

test('every loaded payout collection drains a durable late sibling after another signer completion fails', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const stage of ['backing','presign','reservation','broadcast']) {
    const { f, q, p } = await loadedPayout(t);
    let invoke, kind;
    if (stage === 'backing') { invoke=()=>q.claim.backing(p.begin); kind='backing'; }
    else {
      await q.claim.backing(p.begin); p.beginIncluded();
      if (stage === 'presign') { invoke=()=>q.claim.authorizePayout(p.request); kind='presign-payout'; }
      else {
        await q.claim.authorizePayout(p.request); const request=await p.retain();
        if (stage === 'reservation') { invoke=()=>q.claim.reservation(request); kind='reservation'; }
        else { await q.claim.reservation(request); const broadcastRequest=p.reserved(); invoke=()=>q.claim.authorizeBroadcast(broadcastRequest); kind='broadcast-payout-v2'; }
      }
    }
    let release, entered, blocked=false, settled=false;
    const gate=new Promise(resolve=>{release=resolve;}), reached=new Promise(resolve=>{entered=resolve;});
    f.claimStore(1).beforeUpdate=async data=>{if(data.authorizations.some(row=>row.kind===kind&&row.signature))throw Error('TEST_COMPLETION_FAILURE');};
    f.claimStore(2).beforeUpdate=async data=>{if(!blocked&&data.authorizations.some(row=>row.kind===kind&&row.signature)){blocked=true;entered();await gate;}};
    const operation=invoke();operation.then(()=>{settled=true;},()=>{settled=true;});
    const rejected=assert.rejects(operation,causedBy(/TEST_COMPLETION_FAILURE/));
    await reached; assert.equal(settled,false);
    await assert.rejects(q.claim.health({claimDomain:f.domain,mode:'debt'}),/CLOSED_OR_POISONED|QUORUM_BUSY/);
    assert.throws(()=>f.pairs[2].claim.close(),/OPERATOR_BUSY/);
    release();await rejected;
    assert.ok(f.claimStore(2).data.authorizations.some(row=>row.kind===kind&&row.signature&&row.abiSignature));
    assert.equal(f.pairs[1].claim.status().poisoned,true);
    assert.equal(f.controls.nativeReadBusy,false);assert.equal(f.controls.nativeReadCollisions,0);
    assert.ok(f.custody.transfers.every(row=>row.route==='deposit'||row.broadcastAttempts===0));
  }
});

test('loaded prepared final read failure or exact operator deadline after persistence withholds quorum and poisons every affected key', async t => {
  for (const stage of ['backing','presign','broadcast']) for (const fault of ['native','deadline']) {
    let now=0; const clock=t.mock.method(performance,'now',()=>now);
    try {
      const {f,q,p}=await loadedPayout(t);let invoke,kind;
      if(stage==='backing'){invoke=()=>q.claim.backing(p.begin);kind='backing';}
      else {
        await q.claim.backing(p.begin);p.beginIncluded();
        if(stage==='presign'){invoke=()=>q.claim.authorizePayout(p.request);kind='presign-payout';}
        else {await q.claim.authorizePayout(p.request);const request=await p.retain();await q.claim.reservation(request);
          const broadcast=p.reserved();invoke=()=>q.claim.authorizeBroadcast(broadcast);kind='broadcast-payout-v2';}
      }
      const keys=attesterKeyUses;
      f.controls.beforePrepared=()=>{
        if([0,1,2].some(index=>f.claimStore(index).data.authorizations.some(row=>row.kind===kind&&row.signature))) {
          if(fault==='deadline')now=30000;else throw Error('TEST_LATE_PREPARED_FAILED');
        }
      };
      await assert.rejects(invoke(),causedBy(fault==='deadline'?/AUDIT_TOO_OLD|COMPLETE_AUDIT_UNAVAILABLE/:/TEST_LATE_PREPARED_FAILED/));
      assert.ok(attesterKeyUses>keys);
      const affected=[0,1,2].filter(index=>f.claimStore(index).data.authorizations.some(row=>row.kind===kind&&row.signature));
      assert.ok(affected.length>0);for(const index of affected)assert.equal(f.pairs[index].claim.status().poisoned,true);
      assert.equal(f.controls.nativeReadBusy,false);assert.equal(f.controls.nativeReadCollisions,0);
      assert.ok(f.custody.transfers.every(row=>row.route==='deposit'||row.broadcastAttempts===0));
    } finally {clock.mock.restore();}
  }
});

test('observed-but-undischarged payout facts and debt health still refuse fresh reciprocal graph failure and retain adverse history', async t => {
  t.mock.method(performance,'now',()=>0);
  for(const method of ['facts','health','original-health'])for(const failure of ['unknown','adverse']){
    const {f,q,p}=await loadedPayout(t);await q.claim.backing(p.begin);p.beginIncluded();
    await q.claim.authorizePayout(p.request);const reservation=await p.retain();await q.claim.reservation(reservation);p.reserved();
    const facts=p.observed(),healthRequest={claimDomain:f.domain,mode:'debt'};
    const original=method==='original-health'?await q.claim.health(healthRequest):null;
    if(failure==='unknown')f.controls.graphUnavailable=true;else f.controls.graphAdverse=true;
    const keys=attesterKeyUses,factsKeys=factsKeyUses;
    await assert.rejects(method==='facts'?q.claim.facts(facts):method==='health'?q.claim.health(healthRequest):q.claim.assertOriginalAuthorizationCurrent(original),/INVENTORY_BLOCKED/);
    assert.equal(attesterKeyUses,keys);assert.equal(factsKeyUses,factsKeys);
    assert.equal(f.controls.nativeReadCollisions,0);assert.equal(f.controls.nativeReadBusy,false);
    if(failure==='adverse')assert.ok(Object.keys(f.graphStore(0).data.adverse).length>0);
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts,1);
    assert.equal(f.controls.activePayout,p.ticket.id);
  }
});

test('V4 can exceed old lifecycle time only by complete fresh rounds, never by renewed certificates or keys', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, p } = await loadedPayout(t);
  let complete = 0, release; const barrier = new Promise(resolve => { release = resolve; });
  for (const index of [0, 1, 2]) {
    let held = false;
    f.claimStore(index).beforeUpdate = async data => {
      if (!held && data.authorizations.some(row => row.kind === 'backing' && row.signature)) {
        held = true; complete++;
        if (complete === 3) { now = 45_000; release(); }
        await barrier;
      }
    };
  }
  const before = readMark(f), keys = attesterKeyUses;
  const original = await q.claim.backing(p.begin);
  assert.equal(now, 45_000); assert.equal(attesterKeyUses - keys, 6);
  assert.equal(original.message.validFrom, '1000'); assert.equal(original.message.validUntil, '1030');
  assert.equal(f.controls.inventoryReads - before.inventory, 12);
  assert.equal(f.controls.graphReads.length - before.graph, 24);
  const persisted = [0, 1, 2].map(i => copy(f.claimStore(i).data.authorizations));
  const token = await q.claim.validateOriginalAuthorizationV4(original);
  const lease = openClaimOriginalAuthorizationLeaseV4(token, q.claim, original);
  assert.equal(lease.auditStarted, 45_000); assert.equal(lease.method, 'backing');
  assert.equal(lease.profile, 'CLAIM_ORIGINAL_AUTHORIZATION_LEASE_V4');
  lease.assertBeforeKey();
  assert.equal(attesterKeyUses - keys, 6);
  for (const i of [0, 1, 2]) assert.deepEqual(f.claimStore(i).data.authorizations, persisted[i]);
});

test('V4 rejects stale earliest full observation and graph-phase expiry before any key', async t => {
  for (const fault of ['first-native', 'graph-after-own-inventory']) {
    let now = 0; const clock = t.mock.method(performance, 'now', () => now);
    try {
      const { f, q, p } = await loadedPayout(t), keys = attesterKeyUses;
      if (fault === 'first-native') f.controls.beforeNativeRead = () => { now = 30_000; };
      else f.controls.beforeGraphRead = () => { now = 30_000; };
      await assert.rejects(q.claim.backing(p.begin));
      assert.equal(attesterKeyUses, keys); assert.equal(f.controls.nativeReadBusy, false);
    } finally { clock.mock.restore(); }
  }
});

test('V4 original lease rejects copies, wrong triple, replay and exact expiry; refusal burns rights', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin), keys = attesterKeyUses;
  for (const altered of [copy(original), { ...original, signatures: ['bad'] }, { ...original, head: { ...original.head, hash: sha('wrong') } }])
    assert.throws(() => q.claim.validateOriginalAuthorizationV4(altered), /ORIGINAL_AUTHORIZATION_REQUIRED/);
  assert.throws(() => openClaimOriginalAuthorizationLeaseV4({}, q.claim, original), /PRIVATE_ORIGINAL_LEASE_REQUIRED/);
  const wrong = await q.claim.validateOriginalAuthorizationV4(original);
  assert.throws(() => openClaimOriginalAuthorizationLeaseV4(wrong, {}, original), /LEASE_QUORUM/);
  assert.throws(() => openClaimOriginalAuthorizationLeaseV4(wrong, q.claim, original), /PRIVATE_ORIGINAL_LEASE_REQUIRED/);
  const copiedResult = await q.claim.validateOriginalAuthorizationV4(original);
  assert.throws(() => openClaimOriginalAuthorizationLeaseV4(copiedResult, q.claim, copy(original)), /LEASE_ORIGINAL_RESULT/);
  assert.throws(() => openClaimOriginalAuthorizationLeaseV4(copiedResult, q.claim, original), /PRIVATE_ORIGINAL_LEASE_REQUIRED/);
  for (const elapsed of [29_999, 30_000, 30_001, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    now = 0; const token = await q.claim.validateOriginalAuthorizationV4(original);
    const lease = openClaimOriginalAuthorizationLeaseV4(token, q.claim, original); now = elapsed;
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000) lease.assertBeforeKey(); else assert.throws(() => lease.assertBeforeKey(), /AUDIT_TOO_OLD/);
    assert.throws(() => lease.assertBeforeKey(), /ALREADY_CONSUMED/);
    assert.throws(() => openClaimOriginalAuthorizationLeaseV4(token, q.claim, original), /PRIVATE_ORIGINAL_LEASE_REQUIRED/);
  }
  now = 0; const withOptions = await q.claim.validateOriginalAuthorizationV4(original);
  const noOptionsLease = openClaimOriginalAuthorizationLeaseV4(withOptions, q.claim, original);
  assert.throws(() => noOptionsLease.assertBeforeKey({}), /NO_OPTIONS/);
  assert.throws(() => noOptionsLease.assertBeforeKey(), /ALREADY_CONSUMED/);
  assert.equal(attesterKeyUses, keys);
  assert.throws(() => consumeClaimOperatorKeyLeaseV4({}, {}, 'health', {}, Buffer.alloc(0)), /PRIVATE_KEY_LEASE_REQUIRED/);
});

test('V4 final all-signer await and expensive synchronous frame work remain inside final lease', async t => {
  for (const fault of ['final-await', 'final-sync']) {
    let now = 0; const clock = t.mock.method(performance, 'now', () => now);
    try {
      const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin), keys = attesterKeyUses;
      if (fault === 'final-await') {
        const mark = f.controls.inventoryReads;
        f.controls.beforeClaimCurrent = async () => {
          if (f.controls.inventoryReads === mark + 3 && !f.controls.nativeReadBusy) now = 30_000;
        };
        await assert.rejects(q.claim.validateOriginalAuthorizationV4(original));
      } else {
        const token = await q.claim.validateOriginalAuthorizationV4(original);
        const lease = openClaimOriginalAuthorizationLeaseV4(token, q.claim, original);
        // A terminal clock sample sees expiry after synchronous validation;
        // no mocked codec or externally supplied timestamp can renew it.
        let reads = 0; clock.mock.mockImplementation(() => ++reads === 1 ? 30_000 : 30_000);
        assert.throws(() => lease.assertBeforeKey(), /AUDIT_TOO_OLD/);
      }
      assert.equal(attesterKeyUses, keys); assert.equal(f.controls.nativeReadBusy, false);
    } finally { clock.mock.restore(); }
  }
});

test('V4 atomic fixed pair retains exact signature history and refuses changed journal rather than reissuing', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, p } = await loadedPayout(t), keys = attesterKeyUses;
  const original = await q.claim.backing(p.begin);
  assert.equal(attesterKeyUses - keys, 6);
  for (const index of [0, 1, 2]) {
    const store = f.claimStore(index);
    const related = store.updates.map(data => data.authorizations.filter(row => ['backing', 'health'].includes(row.kind)));
    for (const rows of related) {
      const target = rows.find(row => row.kind === 'backing');
      if (!target) continue;
      const health = rows.find(row => row.kind === 'health' && row.message.validFrom === target.message.validFrom);
      assert.ok(health); assert.equal(Boolean(target.signature), Boolean(health.signature));
    }
  }
  f.claimStore(1).data.authorizations.find(row => row.kind === 'backing').signature = '00'.repeat(64);
  await assert.rejects(q.claim.validateOriginalAuthorizationV4(original), causedBy(/JOURNAL_CHANGED|JOURNAL_UNAVAILABLE/));
  assert.equal(attesterKeyUses - keys, 6); assert.equal(f.pairs[1].claim.status().poisoned, true);
});


test('V4 lease refuses real-runtime liveness loss after complete fresh audit', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin);
  const keys = attesterKeyUses, token = await q.claim.validateOriginalAuthorizationV4(original);
  const lease = openClaimOriginalAuthorizationLeaseV4(token, q.claim, original);
  closedNatives.add(f.custody);
  assert.throws(() => lease.assertBeforeKey(), /TEST_NATIVE_CLOSED/);
  assert.throws(() => lease.assertBeforeKey(), /ALREADY_CONSUMED/);
  assert.equal(attesterKeyUses, keys);
});


test('V4 attester codec expiry refuses before the key and leaves atomic unsigned pair', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, p } = await loadedPayout(t), keys = attesterKeyUses;
  let triggered = false;
  onBackingFrame = () => {
    if (new Error().stack.includes('signCombinedClaimAuthorizationV4')) { triggered = true; now = 30_000; }
  };
  try {
    await assert.rejects(q.claim.backing(p.begin));
    assert.equal(triggered, true); assert.equal(attesterKeyUses, keys);
    for (const i of [0, 1, 2]) {
      const rows = f.claimStore(i).data.authorizations;
      assert.ok(rows.filter(row => row.kind === 'backing').every(row => row.signature === null));
    }
  } finally { onBackingFrame = null; }
});

test('V4 terminal original lease catches expiry caused by expensive synchronous frame validation', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin);
  const token = await q.claim.validateOriginalAuthorizationV4(original), keys = attesterKeyUses;
  const lease = openClaimOriginalAuthorizationLeaseV4(token, q.claim, original);
  onBackingFrame = () => { now = 30_000; };
  try {
    assert.throws(() => lease.assertBeforeKey(), /AUDIT_TOO_OLD/);
    assert.throws(() => lease.assertBeforeKey(), /ALREADY_CONSUMED/);
    assert.equal(attesterKeyUses, keys);
  } finally { onBackingFrame = null; }
});

async function observedPayout(t, kind = '1') {
  const { f, q, p } = await loadedPayout(t, kind);
  await q.claim.backing(p.begin); p.beginIncluded(); await q.claim.authorizePayout(p.request);
  const reservation = await p.retain(); await q.claim.reservation(reservation); p.reserved();
  return { f, q, p, request: p.observed() };
}
const payoutFactEntries = (f, request, index) => Object.values(f.claimStore(index).data.peers)
  .flatMap(peer => peer.state.entries).filter(row => row.request.nativeId === request.nativeId);

test('V4 payout facts fresh rounds survive slow persistence without changing original certificates or reissuing facts keys', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, request } = await observedPayout(t), mark = readMark(f), beforeFacts = factsKeyUses, beforeKeys = attesterKeyUses;
  let delayed = false;
  f.claimStore(0).beforeUpdate = async data => {
    if (!delayed && Object.values(data.peers).some(peer => peer.state.entries.some(row => row.request.nativeId === request.nativeId && row.signature))) {
      delayed = true; now = 45_000;
    }
  };
  const original = await q.claim.facts(request);
  assert.equal(delayed, true); assert.equal(now, 45_000);
  assert.equal(original.authorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4');
  assert.equal(f.controls.inventoryReads - mark.inventory, 18);
  assert.equal(f.controls.graphReads.length - mark.graph, 36);
  assert.equal(factsKeyUses - beforeFacts, 3); assert.equal(attesterKeyUses, beforeKeys);
  for (const certificate of original.certificates) assert.equal(certificate.facts.observation.observedAt, '1000');
  const rows = [0, 1, 2].map(i => copy(payoutFactEntries(f, request, i)));
  const reused = await q.claim.facts(request); assert.deepEqual(reused, original);
  assert.equal(factsKeyUses - beforeFacts, 3); assert.equal(attesterKeyUses, beforeKeys);
  for (const i of [0, 1, 2]) assert.deepEqual(payoutFactEntries(f, request, i), rows[i]);
  f.head.hash = sha('new-canonical-head');
  await assert.rejects(q.claim.facts(request), /ORIGINAL_FACTS_HEAD/);
  assert.equal(factsKeyUses - beforeFacts, 3);
});

test('V4 payout facts preserve post-key native and graph failures and poison the issuer without hiding paid liability', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const failure of ['unknown', 'adverse']) {
    const { f, q, p, request } = await observedPayout(t, '2'), beforeFacts = factsKeyUses;
    f.claimStore(0).beforeUpdate = async data => {
      if (Object.values(data.peers).some(peer => peer.state.entries.some(row => row.request.nativeId === request.nativeId && row.signature))) {
        if (failure === 'unknown') f.controls.graphUnavailable = true; else f.controls.graphAdverse = true;
      }
    };
    await assert.rejects(q.claim.facts(request));
    assert.equal(factsKeyUses - beforeFacts, 1); assert.equal(f.pairs[0].claim.status().poisoned, true);
    assert.equal(payoutFactEntries(f, request, 0).length, 1);
    assert.ok(payoutFactEntries(f, request, 0)[0].signature);
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 1);
    assert.equal(f.controls.activePayout, p.ticket.id);
    if (failure === 'adverse') assert.ok(Object.keys(f.graphStore(0).data.adverse).length > 0);
  }
});

test('V4 payout facts final common-view await cannot outlive its original all-signer full observation round', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, request } = await observedPayout(t); let finalViewIndex = null, tripped = false;
  f.controls.beforeClaimRead = () => {
    if (finalViewIndex === null && [0, 1, 2].every(i => payoutFactEntries(f, request, i).some(row => row.signature)))
      finalViewIndex = f.controls.claimViews.length;
  };
  f.controls.beforeClaimCurrent = view => {
    if (finalViewIndex !== null && view === f.controls.claimViews[finalViewIndex]) { tripped = true; now = 30_000; }
  };
  await assert.rejects(q.claim.facts(request), causedBy(/TOO_OLD/));
  assert.equal(tripped, true);
  for (const i of [0, 1, 2]) assert.equal(f.pairs[i].claim.status().poisoned, true);
  assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 1);
  assert.equal(f.controls.nativeReadBusy, false);
});

test('V4 exact original economic inventory and local EVM mutation remain bound through final validation and consumption', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q } = await observedPayout(t);
  const original = await q.claim.health({ claimDomain: f.domain, mode: 'debt' }), keys = attesterKeyUses;
  const token = await q.claim.validateOriginalAuthorizationV4(original);
  const lease = openClaimOriginalAuthorizationLeaseV4(token, q.claim, original);
  f.controls.evmEpoch = 1;
  assert.throws(() => lease.assertBeforeKey(), /EVM_MUTATION_CHANGED/);
  f.controls.evmEpoch = 0; f.controls.principal = String(BigInt(f.controls.principal) + 1n);
  await assert.rejects(q.claim.validateOriginalAuthorizationV4(original), /ECONOMIC_INVENTORY_CHANGED/);
  assert.equal(attesterKeyUses, keys);
});


test('V4 payout facts codec expires before actual facts key and leaves the original unsigned entry', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, request } = await observedPayout(t), factsKeys = factsKeyUses, keys = attesterKeyUses;
  let triggered = false;
  onClaimFactsFrame = () => {
    if (new Error().stack.includes('Object.signFacts')) { triggered = true; now = 30_000; }
  };
  try {
    await assert.rejects(q.claim.facts(request));
    assert.equal(triggered, true); assert.equal(factsKeyUses, factsKeys); assert.equal(attesterKeyUses, keys);
    assert.equal(payoutFactEntries(f, request, 0)[0].signature, null);
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 1);
  } finally { onClaimFactsFrame = null; }
});


test('V4 old lease refuses adverse history learned by a later no-key audit without clearing or poisoning the read', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin);
  const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  const keys = attesterKeyUses; f.controls.claimAdverse = true;
  await assert.rejects(f.pairs[0].claim.audit());
  assert.ok(Object.keys(f.claimStore(0).data.adverse).length > 0);
  assert.equal(f.pairs[0].claim.status().poisoned, false); assert.equal(attesterKeyUses, keys);
  assert.throws(() => lease.assertBeforeKey(), /GENERATION_CHANGED|CURRENT_ADVERSE_HISTORY/);
  f.controls.claimAdverse = false;
  await assert.rejects(q.claim.validateOriginalAuthorizationV4(original), causedBy(/PERMANENT_ADVERSE_HISTORY|CURRENT_ADVERSE_HISTORY/));
  assert.equal(attesterKeyUses, keys);
});

test('V4 old lease refuses a later in-flight signer and remains stale after its no-key audit drains', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin);
  const first = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  const second = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  assert.throws(() => first.assertBeforeKey(), /GENERATION_CHANGED/);
  let release, entered; const gate = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { entered = resolve; });
  f.controls.beforeInventory = async () => { entered(); await gate; };
  const pending = f.pairs[0].claim.audit(); await reached;
  assert.throws(() => second.assertBeforeKey(), /OPERATION_IN_FLIGHT/);
  release(); await pending; f.controls.beforeInventory = null;
  assert.throws(() => second.assertBeforeKey(), /ALREADY_CONSUMED/);
  const fresh = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  fresh.assertBeforeKey();
});

test('V4 exact physical snapshot rejects later custody or graph history, read, mutation and pre-wire signing changes', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const fault of ['custody-wire', 'graph-wire', 'read-generation', 'mutation-generation', 'signing-unresolved', 'active-mutation']) {
    const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin);
    const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
    const keys = attesterKeyUses;
    if (fault === 'custody-wire') {
      f.controls.custodySnapshotOverride = copy(f.custody.transfers);
      f.controls.custodySnapshotOverride[0].nativeWire += 'AA';
    }
    if (fault === 'graph-wire') {
      f.controls.graphSnapshotOverride = [{ nativeId: sha('other-graph-wire'), phase: 'OBSERVED_FINALIZED', observation: {} }];
    }
    if (fault === 'read-generation') f.controls.nativeReadGeneration++;
    if (fault === 'mutation-generation') f.controls.nativeMutationGeneration = 1;
    if (fault === 'signing-unresolved') f.controls.unresolved = true;
    if (fault === 'active-mutation') f.controls.activeMutation = true;
    assert.throws(() => lease.assertBeforeKey(), /NATIVE_STATE_|NATIVE_HISTORY_CHANGED|NATIVE_MUTATION_IN_FLIGHT/, fault);
    assert.throws(() => lease.assertBeforeKey(), /ALREADY_CONSUMED/);
    assert.equal(attesterKeyUses, keys);
  }
});

test('V4 later unselected owned read invalidates old queue authority even when selected signer generations and economic records agree', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin);
  const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  const keys = attesterKeyUses;
  const { createOwnedOperatorNativeReads } = await import('../../../src/operations/operators/claims/owned-native-operator-reads.mjs');
  await createOwnedOperatorNativeReads({ native: f.custody, family: '2' }).inventory();
  assert.throws(() => lease.assertBeforeKey(), /NATIVE_READ_GENERATION_CHANGED|NATIVE_STATE_CHANGED/);
  assert.equal(attesterKeyUses, keys);
});

test('V4 source-only continuation is one-use after successful original consumption and never grants another key right', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, p } = await loadedPayout(t);
  await q.claim.backing(p.begin); p.beginIncluded(); await q.claim.authorizePayout(p.request);
  await q.claim.reservation(await p.retain());
  const original = await q.claim.authorizeBroadcast(p.reserved());
  let lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  assert.throws(() => lease.assertContinuationSourceCurrent(), /REQUIRES_CONSUMED_AUTHORITY/);
  lease.assertBeforeKey();
  assert.throws(() => lease.assertContinuationSourceCurrent(), /ALREADY_CONSUMED/);
  lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  lease.assertBeforeKey(); lease.assertContinuationSourceCurrent();
  assert.throws(() => lease.assertBeforeKey(), /ALREADY_CONSUMED/);
  assert.throws(() => lease.assertContinuationSourceCurrent(), /ALREADY_CONSUMED/);
  lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  lease.assertBeforeKey(); now = 30_000;
  assert.throws(() => lease.assertContinuationSourceCurrent(), /AUDIT_TOO_OLD/);
  assert.throws(() => lease.assertContinuationSourceCurrent(), /ALREADY_CONSUMED/);
});


test('V4 concurrent actor rounds capture only committed histories after transient owned-native read state drains', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, p } = await loadedPayout(t); f.controls.transientPhysicalReadState = true;
  const original = await q.claim.backing(p.begin);
  const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  lease.assertBeforeKey();
  assert.equal(f.controls.nativeReadBusy, false); assert.equal(f.controls.nativeReadCollisions, 0);
  assert.equal(f.controls.graphSnapshotOverride, undefined);
  for (const pair of f.pairs) assert.equal(pair.claim.status().poisoned, false);
});


test('V4 old lease refuses an in-flight reciprocal GRAPH signer before that operation starts a native read', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin);
  const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  let release, entered; const gate = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { entered = resolve; });
  f.graphStore(0).beforeRead = async () => { entered(); await gate; };
  const pending = f.pairs[0].graph.audit(); await reached;
  assert.throws(() => lease.assertBeforeKey(), /COMBINED_OPERATOR_OPERATION_IN_FLIGHT/);
  release(); await pending; f.graphStore(0).beforeRead = null;
  assert.throws(() => lease.assertBeforeKey(), /ALREADY_CONSUMED/);
});


test('V4 residual source continuation refuses consumed non-broadcast authority and burns that residual right', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { q, p } = await loadedPayout(t), original = await q.claim.backing(p.begin);
  const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  lease.assertBeforeKey();
  assert.throws(() => lease.assertContinuationSourceCurrent(), /BROADCAST_ONLY/);
  assert.throws(() => lease.assertContinuationSourceCurrent(), /ALREADY_CONSUMED/);
});

test('V4 original lease rejects a completed reciprocal GRAPH operation with no native read or claim operation', async t => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(t), q = await f.bind(4);
  for (let i = 0; i < 3; i++) await f.addClaimFact();
  f.controls.exclusiveNativeReads = true;
  const p = f.preparePayout(), original = await q.claim.backing(p.begin);
  const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  const nativeGeneration = f.controls.nativeReadGeneration, keys = attesterKeyUses;
  await f.pairs[0].graph.audit();
  assert.equal(f.controls.nativeReadGeneration, nativeGeneration, 'empty GRAPH audit performs no BTC/SOL read');
  assert.equal(attesterKeyUses, keys);
  assert.throws(() => lease.assertBeforeKey(), /GRAPH_.*CHANGED|COMBINED_.*CHANGED/);
});

test('V4 GRAPH operation failure before first native read permanently invalidates an older original lease without a key', async t => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(t), q = await f.bind(4);
  for (let i = 0; i < 3; i++) await f.addClaimFact();
  f.controls.exclusiveNativeReads = true;
  const p = f.preparePayout(), original = await q.claim.backing(p.begin);
  const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  const generation = f.controls.nativeReadGeneration, keys = attesterKeyUses;
  f.controls.beforeCurrent = () => { throw Error('TEST_GRAPH_BEFORE_FIRST_NATIVE'); };
  await assert.rejects(f.pairs[0].graph.audit(), /TEST_GRAPH_BEFORE_FIRST_NATIVE/);
  f.controls.beforeCurrent = null;
  assert.equal(f.controls.nativeReadGeneration, generation); assert.equal(attesterKeyUses, keys);
  assert.equal(f.pairs[0].claim.status().poisoned, false);
  assert.throws(() => lease.assertBeforeKey(), /COMBINED_GRAPH_SOURCE_CHANGED/);
});

test('V4 broadcast residual source continuation refuses a later completed no-native GRAPH audit', async t => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(t), q = await f.bind(4);
  for (let i = 0; i < 3; i++) await f.addClaimFact();
  f.controls.exclusiveNativeReads = true;
  const p = f.preparePayout(); await q.claim.backing(p.begin); p.beginIncluded();
  await q.claim.authorizePayout(p.request); await q.claim.reservation(await p.retain());
  const original = await q.claim.authorizeBroadcast(p.reserved());
  const lease = openClaimOriginalAuthorizationLeaseV4(await q.claim.validateOriginalAuthorizationV4(original), q.claim, original);
  lease.assertBeforeKey(); const generation = f.controls.nativeReadGeneration, keys = attesterKeyUses;
  await f.pairs[0].graph.audit();
  assert.equal(f.controls.nativeReadGeneration, generation); assert.equal(attesterKeyUses, keys);
  assert.throws(() => lease.assertContinuationSourceCurrent(), /COMBINED_GRAPH_SOURCE_CHANGED/);
  assert.throws(() => lease.assertContinuationSourceCurrent(), /ALREADY_CONSUMED/);
});


test('V4 BEGIN_PAYOUT initial full-round expiry reports the exact method and round before any key', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, p } = await loadedPayout(t), keys = attesterKeyUses;
  let graphRead = false;
  f.controls.beforeGraphRead = () => { graphRead = true; };
  // Expire at the claim observer currentness fence after full GRAPH reads,
  // matching the actual retained stack without using a native runtime or timer.
  f.controls.beforeClaimCurrent = () => { if (graphRead) now = 30_000; };
  await assert.rejects(q.claim.backing(p.begin), error => {
    assert.equal(error.message, 'CLAIM_OPERATOR_AUDIT_TOO_OLD');
    assert.deepEqual(error.auditBudget, { phase: 'after-graph-coverage', method: 'begin-payout',
      round: 'initial-preparation', elapsedMilliseconds: 30000, limitMilliseconds: 30000 });
    return true;
  });
  assert.equal(attesterKeyUses, keys);
  for (const i of [0, 1, 2]) assert.equal(f.claimStore(i).data.authorizations.length, 0);
  assert.equal(f.controls.nativeReadBusy, false); assert.equal(f.controls.nativeReadCollisions, 0);
});


// Original constructors/brands/quorum/journal/codecs and fixed keys remain the
// same as this file's explicit host fixture. No native benchmark or proof.
test('private collector faults preserve original authorization work and clear busy after success', async t => {
  t.mock.method(performance, 'now', () => 0);
  const failures = ['beginClaimOperatorMetrics', 'enterClaimOperatorMetricsPhase',
    'leaveClaimOperatorMetricsPhase', 'checkpointClaimOperatorMetrics', 'finishClaimOperatorMetrics'];
  for (const failure of failures) {
    const { f, q, p } = await loadedPayout(t);
    const mark = readMark(f), keys = attesterKeyUses;
    metricsFaultMode = failure;
    let permit;
    try { permit = await q.claim.backing(p.begin); }
    finally { metricsFaultMode = null; }
    assert.equal(permit.authorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4');
    assert.equal(attesterKeyUses - keys, 6, 'all fixed backing/health signatures still occur once');
    assertOwnReads(f, mark, { prepared: 9 });
    for (const pair of f.pairs.slice(0, 3)) {
      assert.equal(claimOperatorPrivateAuditMetrics(pair.claim).collectionIncomplete, true);
    }
    const beforeValidationKeys = attesterKeyUses;
    await q.claim.assertOriginalAuthorizationCurrent(permit);
    assert.equal(attesterKeyUses, beforeValidationKeys);
  }
});

test('collector finally failure cannot replace an original cause or poison a pre-key rejection', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, p } = await loadedPayout(t), keys = attesterKeyUses;
  const originalError = new Error('TEST_ORIGINAL_CURRENT_FAILURE');
  let graphRead = false;
  f.controls.beforeGraphRead = () => { graphRead = true; };
  // Inject after the complete CLAIM audit, at the original GRAPH-coverage
  // currentness fence. Earlier observer failures are deliberately aggregated
  // by the audit and would exercise a different error boundary.
  f.controls.beforeClaimCurrent = () => { if (graphRead) throw originalError; };
  metricsFaultMode = 'finishClaimOperatorMetrics';
  try { await assert.rejects(q.claim.backing(p.begin), error => error === originalError); }
  finally {
    metricsFaultMode = null;
    f.controls.beforeClaimCurrent = null;
    f.controls.beforeGraphRead = null;
  }
  assert.equal(attesterKeyUses, keys);
  assert.equal(f.controls.nativeReadBusy, false);
  for (const pair of f.pairs.slice(0, 3)) assert.equal(pair.claim.status().poisoned, false);
  // A successful later original operation proves all busy/queue state drained.
  const permit = await q.claim.backing(p.begin);
  assert.equal(permit.authorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4');
  assert.throws(() => claimOperatorPrivateAuditMetrics(Object.freeze({ ...f.pairs[0].claim })), /CLAIM_OWNED_OPERATOR_REQUIRED/);
  assert.throws(() => claimOperatorPrivateAuditMetrics(new Proxy(f.pairs[0].claim, {})), /CLAIM_OWNED_OPERATOR_REQUIRED/);
});

test('diagnostic sampling overhead stays inside the unchanged original audit guard before any new key', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const { f, q, p } = await loadedPayout(t), keys = attesterKeyUses;
  let graphRead = false;
  f.controls.beforeGraphRead = () => { graphRead = true; };
  // Sampling overhead expires the same existing post-GRAPH guard exercised
  // by the original BEGIN_PAYOUT regression, after custody audit completed.
  metricsOverhead = () => { if (graphRead) now = 30_000; };
  try {
    await assert.rejects(q.claim.backing(p.begin), error => {
      assert.equal(error.message, 'CLAIM_OPERATOR_AUDIT_TOO_OLD');
      assert.equal(error.auditBudget.limitMilliseconds, 30_000);
      assert.equal(error.auditBudget.elapsedMilliseconds, 30_000);
      return true;
    });
  } finally {
    metricsOverhead = null;
    f.controls.beforeGraphRead = null;
  }
  assert.equal(attesterKeyUses, keys);
  assert.equal(f.controls.nativeReadBusy, false);
  for (const index of [0, 1, 2]) assert.equal(f.claimStore(index).data.authorizations.length, 0);
});


test('private activity getter retains original brands and rejects copied/proxy/extra-argument capabilities', async t => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(t);
  await f.bind();
  for (const [getter, capability, prefix] of [
    [claimOperatorPrivateAuditActivity, f.pairs[0].claim, 'CLAIM'],
    [graphOperatorPrivateAuditActivity, f.pairs[0].graph, 'GRAPH'],
  ]) {
    const row = getter(capability);
    assert.equal(Object.isFrozen(row), true);
    assert.equal(row.totalKeyInvocationsMeasured, false);
    assert.equal(row.authorizationCount, 0);
    assert.equal(row.factCount, 0);
    assert.throws(() => getter({ ...capability }), new RegExp(prefix + '_PRIVATE_AUDIT_ACTIVITY_ORIGINAL_OPERATOR_REQUIRED'));
    let traps = 0;
    const proxy = new Proxy(capability, { get() { traps++; throw new Error('caller trap'); } });
    assert.throws(() => getter(proxy), new RegExp(prefix + '_PRIVATE_AUDIT_ACTIVITY_ORIGINAL_OPERATOR_REQUIRED'));
    assert.equal(traps, 0);
    assert.throws(() => getter(capability, {}), new RegExp(prefix + '_PRIVATE_AUDIT_ACTIVITY_NO_OPTIONS'));
    assert.equal(JSON.stringify(row).includes(capability.publicKey.x), false);
    assert.equal(JSON.stringify(row).includes(capability.publicKey.y), false);
  }
});

test('private post-close activity keeps branch and custody flags separate without retaining authority', async t => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(t);
  await f.bind();
  const pair = f.pairs[0];
  const beforeClaim = claimOperatorPrivateAuditActivity(pair.claim);
  const beforeGraph = graphOperatorPrivateAuditActivity(pair.graph);
  pair.claim.close();
  for (const [getter, capability, before] of [
    [claimOperatorPrivateAuditActivity, pair.claim, beforeClaim],
    [graphOperatorPrivateAuditActivity, pair.graph, beforeGraph],
  ]) {
    const after = getter(capability);
    assert.equal(after.branchClosed, true);
    assert.equal(after.custodyClosed, true);
    assert.equal(after.branchPoisoned, false);
    assert.equal(after.custodyPoisoned, false);
    assert.equal(Object.hasOwn(after, 'closed'), false);
    assert.equal(Object.hasOwn(after, 'poisoned'), false);
    assert.equal(after.keyUseEpoch, before.keyUseEpoch);
    assert.equal(after.authorizationCount, before.authorizationCount);
    assert.equal(after.factCount, before.factCount);
  }
  await assert.rejects(pair.claim.audit(), /CLOSED_OR_POISONED/);
  await assert.rejects(pair.graph.audit(), /CLOSED_OR_POISONED/);
});


test('six original empty audit facades preserve scope-specific epochs and original persisted histories', async t => {
  t.mock.method(performance, 'now', () => 0);
  const f = fixture(t);
  await f.bind(4);
  const capture = () => ({
    claim: f.pairs.map(pair => claimOperatorPrivateAuditActivity(pair.claim)),
    graph: f.pairs.map(pair => graphOperatorPrivateAuditActivity(pair.graph)),
  });
  const before = capture(), keys = attesterKeyUses;
  for (const pair of f.pairs.slice(0, 3)) await pair.claim.audit();
  for (const pair of f.pairs.slice(0, 3)) await pair.graph.audit();
  const after = capture();
  assert.deepEqual(after, before);
  assert.equal(attesterKeyUses, keys, 'host fixture observes genuine fixed signer invocations only');
  for (const branch of ['claim', 'graph']) for (const row of after[branch]) {
    assert.equal(row.keyUseEpoch, 0);
    assert.equal(row.authorizationCount, 0);
    assert.equal(row.signedAuthorizationCount, 0);
    assert.equal(row.factCount, 0);
    assert.equal(row.signedFactCount, 0);
    assert.equal(row.busy, false);
    assert.equal(row.totalKeyInvocationsMeasured, false);
  }
});
