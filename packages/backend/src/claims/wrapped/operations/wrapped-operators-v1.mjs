import {readOriginalReverseCoverageV4,finalizeOriginalReverseCoverageV4} from './reverse-coverage-finalization-v4.mjs';
import { validateWrappedClaimOperationalRegistration } from '../../ingress/operational-registration-v2.mjs';
import { registryCommitment as wrappedRegistryCommitment } from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { createWrappedClaimFactsCollector } from '../../protocol/facts-collector-registry-v2.mjs';
import { enterWrappedOperatorBranchV1, exitWrappedOperatorBranchV1, beginWrappedClaimAuditRoundV4, wrappedOperatorKeyUsesV1, reserveWrappedOperatorV1, releaseWrappedOperatorV1 } from '../../../operations/operators/wrapped/wrapped-claim-combined-operators-v1.mjs';
import { claimBitcoinPayoutBroadcastFrame, CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE } from '../../payouts/bitcoin-payout-broadcast.mjs';
import { auditIngressBroadcastOperator } from '../../ingress/ingress-v3-lifecycle.mjs';
import { nonceIngressBroadcastFrame, assertProspectiveIngressCoverage } from '../../ingress/ingress-v3-host.mjs';
import { assertNonceIngressDeployment } from '../ingress/wrapped-ingress-deployment-v1.mjs';
/** Four dedicated same-host synthetic attesters. Authenticity comes only from
 * owned construction and independently repeated reads, never supplied totals.
 * This is not independent infrastructure or a threshold native spending key. */
import assert from 'node:assert/strict';
import {createWrappedAuditCurrentnessV1,createWrappedJointCurrentnessV1,wrappedAuditMethodV1} from './wrapped-audit-currentness-v1.mjs';
import { createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createClaimRecordStore, openClaimRecordStore } from '@lianum/engine/storage/records';
import { signature as lowSignature } from '@lianum/engine/notes/private-note-encoding';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { nativeAdmissionRulesTree } from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeHubSignatureToAbi } from '@lianum/engine/evidence/native-hub-messages';
import { createNativeQuorumHostVerifier, nativeQuorumRegistryCommitment } from '@lianum/engine/evidence/native-quorum';
import { exactRecord, fixedArray, bytes32, ZERO } from '@lianum/components/encoding/commitments';
import { cloneInput as copy, frozenInput as freeze } from "@lianum/components/plain-input";
import { assertOwnedBitcoinRuntime } from '../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import * as bitcoinRuntimeLiveness from '../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime } from '../../../chains/solana/runtime/owned-solana-runtime.mjs';
import * as solanaRuntimeLiveness from '../../../chains/solana/runtime/owned-solana-runtime.mjs';
import { createNativeClaimFactsSigner as createNativeFactsSigner,
  createNativeClaimFactsPeer as createNativeFactsPeer,
  createNativeClaimFactsInventory as createNativeFactsInventory,
  createNativeClaimFactsCollector as createNativeFactsCollector,
  nativeFactsRegistryCommitment } from '../../../chains/shared/dispatch/native-facts-peer.mjs';
import { encodeFlatNativeHealth } from '../../../chains/shared/health/native-health.mjs';
import { assertStableClaimOperatorFact as assertStableOperatorFact } from '../../../operations/operators/claims/operator-fact-audit.mjs';
import { assertOwnedCustodyIntent, ownedCustodyRoute } from '../../../chains/shared/runtime/owned-native-custody.mjs';
import { FACTS_SCHEMA, encodeNativeClaimFacts, nativeRuleCommitment } from '@lianum/engine/native/native-receipt-binding';
import { assertOwnedWrappedClaimObserverV1, ownedWrappedClaimObserverBindingsV1 } from './wrapped-owned-state-v1.mjs';
import { claimUint, claimDomainCommitment, claimIntentId, claimTicketId } from '@lianum/engine/claims/framing';
import { CLAIM_ACTIONS as A, claimActionDigest, claimActionFrame, claimBackingFrame, claimHash,
  claimFrame, claimRouteCommitment, assertClaimBackingQuorum, claimIngressAuthorizationFrame,
  claimPayoutAuthorizationFrame, claimPayoutBroadcastFrame } from '@lianum/engine/claims/permits';
import { createClaimReservationBinding, validateClaimReservationBinding, claimFactsRequest,
  observeReservedClaimFact, assertCanonicalClaimReservation } from '../../authorization/reservation-facts-gate.mjs';
import { auditClaimGateway, auditClaimNativeInventory, assertClaimHealthState, assertClaimRoute,
  auditClaimIngressPreparation, auditClaimPayoutPreparation } from '../../operations/backing-audit.mjs';
import { appendClaimInventoryAudit } from '../../storage/inventory-journal.mjs';
import { createOwnedOperatorNativeReads, quiesceOwnedOperatorNativeReads,
  assertOwnedOperatorNativeReadsQuiescent, releaseOwnedOperatorNativeReadQuiescence } from '../../../operations/operators/claims/owned-native-operator-reads.mjs';
import { acquireCombinedOperatorCustody, assertCombinedOperatorLive, assertCombinedOperatorIdle, combinedOperatorStatus,
  registerCombinedOperatorBranch, poisonCombinedOperator, closeCombinedOperator, consumeCombinedBranchRecoveryV1,
  signCombinedClaimAuthorization, signCombinedClaimAuthorizationV4, createCombinedFactsSigner,
  captureCombinedGraphNativeStateV4, quiesceCombinedGraphNativeV4, assertCombinedGraphNativeQuiescenceV4, releaseCombinedGraphNativeQuiescenceV4,
  assertCombinedGraphCoverage, assertCombinedGraphCoverageV4, assertCombinedGraphSourceCurrentV4 } from '../../../operations/operators/wrapped/wrapped-claim-combined-operators-v1.mjs';

export const CLAIM_OPERATOR_PROFILE = 'OWNED_WRAPPED_CLAIM_SHARED_KEY_ATTESTER_V1';
// Scheduling version only. Signed certificate codecs, validity and every audit budget are unchanged.
export const CLAIM_QUORUM_COLLECTION_PROFILE = 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3';
export const CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE = 'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4';
export const CLAIM_ORIGINAL_AUTHORIZATION_LEASE_PROFILE = 'WRAPPED_CLAIM_ORIGINAL_AUTHORIZATION_LEASE_V4';
const originalValidationLeases = new WeakMap(), operatorKeyLeases = new WeakMap(), factsKeyLeases = new WeakMap();
const bitcoinBroadcastAuthorizations = new WeakMap();
export const CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_PROFILE = 'CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_V1';
const operators = new WeakMap(), quorums = new WeakMap(), factsAnchors = new WeakSet();
const equal = (a, b, message = 'CLAIM_CHANGED_DATA') => assert.deepEqual(a, b, message);
const u = value => claimUint(value, 256);
const canonical = value => JSON.stringify(sort(copy(value)));
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
const commitment = (tag, value) => claimHash(claimFrame(tag, [Buffer.from(canonical(value))]));
const index = n => { assert.ok(Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0 && n < 4, 'CLAIM_OPERATOR_INDEX'); return n; };
const nativeId = (row, family) => family === '1' ? row.txid : row.nativeId;
const nativeWire = (row, family) => family === '1' ? row.rawTransaction : row.nativeWire;
const peerKey = (domain, route) => domain + ':' + route;
function assertReconciledCoverage(report) {
  for (const funds of report.financials) {
    assert.ok(u(funds.nativePrincipalAvailable) + u(funds.dischargedCredit) >= u(funds.liabilities), 'CLAIM_CURRENT_PRINCIPAL_DEFICIT');
    assert.ok(u(funds.feeReserveAvailable) + u(funds.dischargedFeeCredit) >= u(funds.reservedFees), 'CLAIM_FEE_RESERVE_DEFICIT');
  }
}

function assertGraphNativeIdleV4(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 5, 'WRAPPED_GRAPH_NATIVE_REGISTRY_REQUIRED');
  const seen = new Set();
  for (const row of rows) {
    exactRecord(row, ['profileCommitment', 'state']); bytes32(row.profileCommitment, true);
    assert.ok(!seen.has(row.profileCommitment), 'WRAPPED_GRAPH_NATIVE_DUPLICATE_PROFILE'); seen.add(row.profileCommitment);
    const state = row.state;
    assert.equal(state.profile, 'OWNED_WRAPPED_GRAPH_NATIVE_AUDIT_STATE_V4', 'WRAPPED_GRAPH_NATIVE_STATE_PROFILE');
    assert.ok(['EVM', 'TRON'].includes(state.family), 'WRAPPED_GRAPH_NATIVE_STATE_FAMILY');
    exactRecord(state, ['profile', 'family', 'lifetimeId', 'genesis', 'readGeneration', 'activeReads', 'readsIdle',
      'mutationGeneration', 'activeMutations', 'busy', 'closed', 'uncertain', 'pending', 'adverseHistory',
      ...(state.family === 'EVM' ? ['transactions', 'receipts', 'lifecycle', 'lastTimestamp'] : ['entry', 'journal'])]);
    assert.ok(typeof state.lifetimeId === 'string' && state.lifetimeId.length > 0, 'WRAPPED_GRAPH_NATIVE_LIFETIME');
    claimUint(state.readGeneration); claimUint(state.mutationGeneration);
    assert.equal(state.readsIdle, true, 'WRAPPED_GRAPH_NATIVE_READ_IN_FLIGHT');
    assert.equal(state.activeReads, 0, 'WRAPPED_GRAPH_NATIVE_READ_IN_FLIGHT');
    assert.equal(state.activeMutations, 0, 'WRAPPED_GRAPH_NATIVE_MUTATION_IN_FLIGHT');
    for (const flag of ['busy', 'closed', 'uncertain', 'pending', 'adverseHistory'])
      assert.equal(state[flag], false, 'WRAPPED_GRAPH_NATIVE_STATE_' + flag);
  }
  return rows;
}

/** Per-signer independent observations may progress only the physical read
 * generation. Final all-signer authority pins the complete idle state exactly. */
function assertGraphNativeProjectionV4(before, after) {
  const identity = rows => rows.map(row => {
    const value = copy(row);
    delete value.state.readGeneration; delete value.state.activeReads; delete value.state.readsIdle;
    return value;
  });
  equal(identity(before), identity(after), 'WRAPPED_GRAPH_NATIVE_HISTORY_CHANGED');
  for (let i = 0; i < before.length; i++)
    assert.ok(claimUint(after[i].state.readGeneration) >= claimUint(before[i].state.readGeneration),
      'WRAPPED_GRAPH_NATIVE_READ_GENERATION_ROLLBACK');
}

// No standalone-key constructor exists in the wrapped combined profile.

/** Internal constructor: only the combined factory holds an original token. */
export function createScopedClaimOperator(input, custody) {
  assertCombinedOperatorLive(custody); return createClaimOperator(input, custody);
}
function createClaimOperator(input, custody) {
  exactRecord(input, ['signerIndex']); const signerIndex = index(input.signerIndex);
  const retainedRecovery=consumeCombinedBranchRecoveryV1(custody,'claim');
  if(retainedRecovery){exactRecord(retainedRecovery,['options','snapshot','keyUseEpoch','operationGeneration','originalPayoutFacts']);for(const n of [retainedRecovery.keyUseEpoch,retainedRecovery.operationGeneration])assert.ok(Number.isSafeInteger(n)&&n>=0);}
  let vaultOptions;
  let key = custody ? null : generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = key && createPublicKey(key.privateKey).export({ format: 'jwk' });
  const publicKey = custody ? acquireCombinedOperatorCustody(custody, 'claim', signerIndex)
    : freeze({ x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') });
  const address = publicKeccak256(Buffer.from(publicKey.x + publicKey.y, 'hex')).subarray(12).toString('hex');
  let observer, bound, vault, record, activeView, activeFactsAnchor, cachedView, started, busy = false, poisoned = false, closed = false;
  let activeKeyUsed = false, jointAuditOptions = {}, activeFactSigning = null, pendingAuthorizations = new Set();
  const completedCoverage = new WeakMap(), reverseCoverageTicketsV4 = new WeakSet(), reverseCoverageStatesV4 = new WeakMap();
  let quorumReservation = null, jointProjection = null;
  let activeV4 = null, activeV4Facts = null, keyUseEpoch = retainedRecovery?.keyUseEpoch??0;
  let auditMethod = 'operation', auditRound = 'whole-operation';
  const originalPayoutFacts = new Map(retainedRecovery?.originalPayoutFacts??[]), v4OperationResults = new WeakMap();
  let operationGeneration = retainedRecovery?.operationGeneration??0;
  const peers = new Map(), readers = new Map(), nativeReads = new Map();
  const live = () => {
    assert.ok(!closed && !poisoned, 'CLAIM_OPERATOR_CLOSED_OR_POISONED');
    if (custody) assertCombinedOperatorLive(custody);
  };
  const poison = () => { poisoned = true; cachedView = undefined; if (custody) poisonCombinedOperator(custody); };
  const cleanup = () => { closed = true; key = cachedView = undefined; vault?.close(); nativeReads.clear(); if (custody) { peers.clear(); readers.clear(); } };
  const ready = () => { live(); assert.ok(bound, 'CLAIM_OPERATOR_NOT_BOUND'); assertOwnedWrappedClaimObserverV1(observer); };
  async function readVault() {
    try { equal(await vault.read(), record, 'CLAIM_OPERATOR_JOURNAL_CHANGED'); }
    catch (cause) { poison(); throw new Error('CLAIM_OPERATOR_JOURNAL_UNAVAILABLE', { cause }); }
  }
  async function save(data) {
    try {
      live(); const next = await vault.update(record.revision, () => copy(data));
      equal(await vault.read(), next, 'CLAIM_OPERATOR_JOURNAL_READBACK'); record = next;
    } catch (cause) { poison(); throw new Error('CLAIM_OPERATOR_DURABLE_WRITE_UNCERTAIN', { cause }); }
  }
  const {current,assertTerminalBudget}=createWrappedAuditCurrentnessV1(Object.freeze({
    live,now:()=>performance.now(),started:()=>started,view:()=>activeView,
    assertCurrent:view=>observer.assertCurrent(view),clearCache:()=>{cachedView=undefined;},
    labels:()=>({method:auditMethod,round:auditRound}),
  }));
  async function readCurrentView() {
    // Reciprocal coverage repeatedly enters the combined key at one EVM head.
    // Retain one original immutable reconstruction per operator, never a
    // sibling's view or a native observation/inventory result.
    if (!custody) return observer.read();
    try {
      if (cachedView) {
        const header = await bound.runtime.block(), head = cachedView.head;
        if (header.number === '0x' + BigInt(head.number).toString(16)
          && header.hash === '0x' + head.hash && header.timestamp === '0x' + BigInt(head.timestamp).toString(16)) {
          // Re-prove original issued-view ownership, canonical current head,
          // deployment pins and both pool views. Never fall back on failure.
          await observer.assertCurrent(cachedView); return cachedView;
        }
      }
      cachedView = undefined;
      const view = await observer.read(); cachedView = view; return view;
    } catch (error) { cachedView = undefined; throw error; }
  }
  const jointCurrent=createWrappedJointCurrentnessV1(Object.freeze({
    current,custody,active:()=>activeV4,view:()=>activeView,options:()=>jointAuditOptions,
    auditOwn,projection:()=>jointProjection,assertReconciled:assertReconciledCoverage,
    assertCoverage:assertCombinedGraphCoverage,assertCoverageV4:assertCombinedGraphCoverageV4,
  }));
  const clock = Object.freeze({ async read() { await current(); return freeze({ timestamp: activeView.head.timestamp, head: activeView.head.hash }); },
    async assertCurrent(header) { equal(header, { timestamp: activeView.head.timestamp, head: activeView.head.hash }); await current(); } });
  function selected(domain) {
    bytes32(domain, true); const at = bound.configs.findIndex(config => claimDomainCommitment(config) === domain);
    assert.ok(at >= 0, 'CLAIM_OPERATOR_UNREGISTERED_DOMAIN');
    return { at, config: bound.configs[at], policy: bound.policies[at], native: bound.nativeRuntimes[at],
      gateway: activeView.gateways.find(g => g.claimDomain === domain) };
  }
  function original(binding) {
    const { native, config } = selected(binding.claimDomain);
    const rows = native.transfers.filter(row => nativeId(row, config.nativeFamily) === binding.request.nativeId);
    assert.equal(rows.length, 1, 'CLAIM_ORIGINAL_RUNTIME_RECORD');
    const row = rows[0]; assert.equal(nativeWire(row, config.nativeFamily), binding.nativeWire, 'CLAIM_ORIGINAL_SIGNED_BYTES');
    equal(row.intent, binding.intent, 'CLAIM_ORIGINAL_NATIVE_INTENT');
    assert.equal(row.recipientIndex, Number(binding.request.recipientIndex), 'CLAIM_ORIGINAL_RECIPIENT');
    assertOwnedCustodyIntent(row.route, native.roles, config.nativeFamily, row.intent);
    assert.equal(binding.ingress, row.route === 'deposit', 'CLAIM_ORIGINAL_OPERATION_KIND');
    return row;
  }
  function findBinding(request) {
    const matches = record.data.bindings.filter(b => canonical(b.request) === canonical(request));
    assert.equal(matches.length, 1, 'CLAIM_FACT_RESERVATION_HANDOFF_REQUIRED'); return validateClaimReservationBinding(matches[0]);
  }
  async function observed(binding, forSigning = false) {
    original(binding); const route = original(binding).route;
    const value = await observeReservedClaimFact({ binding, request: binding.request,
      readReservation: request => observer.readReservation(request, activeView),
      observe: request => readers.get(peerKey(binding.claimDomain, route)).observe(request), assertCurrent: current });
    if (!forSigning || !activeFactsAnchor || value.status !== 'observed'
      || canonical(binding.request) !== canonical(activeFactsAnchor.request)) return value;
    assert.ok(factsAnchors.has(activeFactsAnchor), 'CLAIM_PRIVATE_FACTS_ANCHOR');
    const certificate = activeFactsAnchor.certificate, facts = certificate.facts;
    equal(activeView.head, activeFactsAnchor.head, 'CLAIM_FACTS_ANCHOR_HEAD');
    // The first peer's real observation is the common signed reference. Every
    // later peer still observes the same original wire independently and checks
    // current finality/context against it before retaining that reference.
    assertStableOperatorFact({ request: binding.request, nativeWire: binding.nativeWire, intent: binding.intent,
      facts, maximumEvidenceUntil: facts.observation.evidenceUntil, status: 'live', reason: null,
      lastCheckedAt: facts.observation.observedAt, signature: certificate.signature }, value, selected(binding.claimDomain).policy);
    return freeze({ ...value, finalityKind: facts.observation.finalityKind, confirmations: facts.observation.confirmations,
      nativeContext: copy(facts.nativeContext) });
  }
  function store(id) { return Object.freeze({ async load() { await readVault(); return copy(record.data.peers[id]); },
    async commit(input) {
      exactRecord(input, ['expectedRevision', 'nextState']); await readVault();
      const prior = record.data.peers[id]; assert.equal(input.expectedRevision, prior.revision, 'CLAIM_PEER_CAS');
      const next = copy(record.data), result = { revision: (claimUint(prior.revision) + 1n).toString(), state: copy(input.nextState) };
      next.peers[id] = result; await save(next);
      if (activeV4Facts?.slot === id) await activeV4Facts.afterCommit();
      return copy(result);
    } }); }
  async function serial(work, expectedHead, quorumPermit = null) {
    ready(); assert.ok(!busy, 'CLAIM_OPERATOR_BUSY'); const operation = enterWrappedOperatorBranchV1(custody, 'claim', quorumPermit); busy = true; operationGeneration++; const generation = operationGeneration; let reverseQuietV4 = null; activeKeyUsed = false; jointAuditOptions = {}; auditMethod = 'operation'; auditRound = 'whole-operation'; started = performance.now();
    try {
      await readVault(); activeView = await readCurrentView();
      if (expectedHead) equal(activeView.head, expectedHead, 'CLAIM_QUORUM_HEAD_CHANGED');
      assert.equal(activeView.gateways.length, bound.configs.length, 'CLAIM_REGISTERED_GATEWAYS_OMITTED');
      const result = await work(); await current();
      if (result && typeof result === 'object') completedCoverage.set(result, {head:copy(activeView.head),options:copy(jointAuditOptions),projection:jointProjection});
      // Final serial awaits cannot return a capability after expiry or key failure.
      if (activeV4) {
        v4OperationResults.set(result, { generation, revision: record.revision, keyUseEpoch, nativeStates: activeV4.nativeStates(), graphNativeStates: activeV4.graphNativeStates(), graphSource: activeV4.graphSource() });
        activeV4.assertCurrent();
      }
      // The reverse capability is completed here, after every serial await.
      // Callback assertions and snapshots taken before the final journal/head
      // reads cannot mint this ticket's original claim-source authority.
      if (reverseCoverageTicketsV4.has(result)) {
        const finalization = {
          readVault, current,
          async quiesce() {
            reverseQuietV4 = await quiesceOwnedOperatorNativeReads([...nativeReads.values()]);
            return reverseQuietV4;
          },
          assertQuiescent: assertOwnedOperatorNativeReadsQuiescent,
          assertLive: assertReverseCoverageLiveV4, snapshot: reverseSourceStateV4,
          now: () => performance.now(), started,
          retain: snapshot => reverseCoverageStatesV4.set(result, snapshot),
        };
        const quiet = await readOriginalReverseCoverageV4(finalization);
        finalizeOriginalReverseCoverageV4(finalization, quiet);
      }
      return result;
    } catch (cause) {
      // Cover peer signing and the final serial current await, not just the
      // specialized authorization's persistence block. No key means no poison.
      if (custody && activeKeyUsed && !poisoned) { poison(); throw new Error('CLAIM_ATTESTATION_UNCERTAIN', { cause }); }
      throw cause;
    } finally { if (reverseQuietV4) releaseOwnedOperatorNativeReadQuiescence(reverseQuietV4); activeV4?.release(); activeV4 = null; activeV4Facts = null; activeView = undefined; activeFactsAnchor = undefined; activeKeyUsed = false; busy = false; jointAuditOptions = {}; jointProjection = null; activeFactSigning = null; pendingAuthorizations.clear(); exitWrappedOperatorBranchV1(custody, operation); }
  }
  async function audit(options = {}) { jointAuditOptions = options; return auditOwn(options); }
  async function auditOwn({ staged = null, allowObservedDebt = false } = {}) {
    const inventories = [], financials = [], failures = [];
    for (const row of record.data.authorizations) if (row.signature === null)
      assert.ok(pendingAuthorizations.has(row.kind + ':' + row.digest), 'WRAPPED_UNFINISHED_CLAIM_AUTHORIZATION');
    for (const peer of Object.values(record.data.peers)) for (const row of peer.state.entries) if (row.signature === null)
      assert.ok(activeFactSigning && canonical(row.request) === canonical(activeFactSigning.request), 'WRAPPED_UNFINISHED_CLAIM_FACTS');
    const next = copy(record.data);
    // No expiry filter. Continue after a failure to retain every learned adverse
    // result before refusing any signature. No record is pruned or recycled.
    for (const binding of record.data.bindings) {
      try {
        validateClaimReservationBinding(binding); const row = original(binding);
        if (staged && binding.operationId === staged.operationId && binding.claimDomain === staged.claimDomain) {
          equal(binding, staged); assert.equal(row.broadcastAttempts, 0, 'CLAIM_RESERVATION_ALREADY_BROADCAST');
          assert.equal(row.phase, 'SIGNED_NOT_BROADCAST', 'CLAIM_RESERVATION_ORIGINAL_PHASE'); continue;
        }
        const value = await observed(binding);
        if (value.status !== 'observed') {
          if (value.status === 'adverse') next.adverse[binding.admissionN] = 'NATIVE_ADVERSE';
          throw new Error('CLAIM_NATIVE_HISTORY_UNKNOWN');
        }
        let retainedFailure = null;
        for (const retained of record.data.wrappedFactsHistory.filter(item => item.claimDomain === binding.claimDomain && item.request.nativeId === binding.request.nativeId)) {
          try { equal(retained.request,binding.request,'WRAPPED_RETAINED_CERTIFICATE_REQUEST');
          assertStableOperatorFact({request:retained.request,nativeWire:binding.nativeWire,intent:binding.intent,
            facts:retained.certificate.facts,maximumEvidenceUntil:retained.certificate.facts.observation.evidenceUntil,
            status:'live',reason:null,lastCheckedAt:retained.certificate.facts.observation.observedAt,signature:retained.certificate.signature},value,selected(binding.claimDomain).policy);
          } catch (cause) { next.adverse[binding.admissionN] = 'RETAINED_CERTIFICATE_NATIVE_FACT_CHANGED'; retainedFailure ??= cause; }
        }
        if (retainedFailure) throw retainedFailure;
        const slot = peerKey(binding.claimDomain, row.route);
        const previous = record.data.peers[slot].state.entries.find(entry => entry.facts.nativeGid === binding.nativeGid);
        if (previous) {
          try { assertStableOperatorFact(previous, value, selected(binding.claimDomain).policy); }
          catch (error) { next.adverse[binding.admissionN] = 'ORIGINAL_NATIVE_FACT_CHANGED'; throw error; }
        }
        const old = next.contexts[binding.admissionN], context = value.nativeContext;
        if (old) {
          const height = binding.request.family === '1' ? 'observedTipHeight' : 'observedSlot';
          try {
            assert.ok(claimUint(context[height]) >= claimUint(old[height]), 'CLAIM_NATIVE_CONTEXT_ROLLBACK');
            if (height === 'observedTipHeight' && context[height] === old[height])
              assert.equal(context.observedTipId, old.observedTipId, 'CLAIM_NATIVE_TIP_CHANGED');
          } catch (cause) { next.adverse[binding.admissionN] = 'ORIGINAL_NATIVE_CONTEXT_ROLLBACK'; throw cause; }
        }
        next.contexts[binding.admissionN] = copy(context);
      } catch { failures.push('RETAINED_NATIVE_UNAVAILABLE'); }
    }
    for (const config of bound.configs) {
      const domain = claimDomainCommitment(config), { gateway, native } = selected(domain);
      try {
        assertClaimHealthState(gateway); const obligations = auditClaimGateway(gateway, config);
        const inventory = await nativeReads.get(domain).inventory(), funds = auditClaimNativeInventory(inventory, config, native.roles, native.nonceInfrastructureByAuthority);
        equal(inventory.syntheticPrefunding, native.syntheticPrefunding, 'CLAIM_SYNTHETIC_FUNDING_PIN');
        const relevant = record.data.bindings.filter(b => b.claimDomain === domain);
        assert.equal(inventory.feeAudit.transfers.length, relevant.length, 'CLAIM_UNREGISTERED_NATIVE_TRANSFER');
        for (const transfer of inventory.feeAudit.transfers) {
          const binding = relevant.find(b => b.request.nativeId === transfer.nativeId);
          assert.ok(binding, 'CLAIM_UNKNOWN_NATIVE_EXPOSURE'); const row = original(binding);
          assert.equal(transfer.route, row.route, 'CLAIM_NATIVE_ROUTE_CHANGED');
          assert.equal(transfer.amount, config.nativeFamily === '1' ? row.intent.amountSatoshi : row.intent.lamports, 'CLAIM_NATIVE_AMOUNT_CHANGED');
          const exactStaged = staged?.claimDomain === domain && staged?.request.nativeId === transfer.nativeId;
          assert.ok(exactStaged || ['OBSERVED_CONFIRMED', 'OBSERVED_FINALIZED'].includes(transfer.phase), 'CLAIM_UNRESOLVED_NATIVE_SEND');
        }
        let dischargedCredit = 0n, dischargedFeeCredit = 0n;
        if (allowObservedDebt && gateway.activePayout !== ZERO) {
          const b = relevant.find(row => row.operationId === gateway.activePayout && !row.ingress);
          const t = gateway.tickets.find(row => row.ticket.id === gateway.activePayout);
          assert.ok(b && t && inventory.feeAudit.transfers.find(row => row.nativeId === b.request.nativeId)?.actualFee !== null,
            'CLAIM_DEBT_RECONCILIATION_EXACT_OBSERVED_SEND');
          dischargedCredit = u(t.ticket.amount);
          dischargedFeeCredit = u(t.ticket.maxFee);
        }
        inventories.push({ claimDomain: domain, inventory });
        financials.push({ claimDomain: domain, ...funds, ...obligations, dischargedCredit: dischargedCredit.toString(), dischargedFeeCredit: dischargedFeeCredit.toString() });
      } catch { failures.push('COMPLETE_CUSTODY_AUDIT_FAILED'); }
    }
    if (canonical(next) !== canonical(record.data)) await save(next);
    assert.equal(Object.keys(record.data.adverse).length, 0, 'CLAIM_PERMANENT_ADVERSE_HISTORY');
    assert.equal(failures.length, 0, 'CLAIM_COMPLETE_AUDIT_UNAVAILABLE');
    await current(); return { inventories, financials };
  }
  function assertOriginalAuthorization(kind, message, frame, original, originalFrame) {
    assert.ok(original, 'CLAIM_ORIGINAL_AUTHORIZATION_REQUIRED');
    assert.equal(original.kind, kind, 'CLAIM_ORIGINAL_AUTHORIZATION_KIND');
    assert.equal(original.signerIndex, signerIndex, 'CLAIM_ORIGINAL_AUTHORIZATION_SIGNER');
    equal(original.head, activeView.head, 'CLAIM_ORIGINAL_AUTHORIZATION_HEAD');
    const now = claimUint(activeView.head.timestamp), from = claimUint(original.message.validFrom), until = claimUint(original.message.validUntil);
    // The owned EVM includes its original dispatch at head timestamp + 1.
    // Neither the certificate's canonical-time bounds nor its bytes are renewed.
    assert.ok(from <= now && now + 1n < until && until - from <= 30n, 'CLAIM_ORIGINAL_AUTHORIZATION_EXPIRED');
    equal(message, original.message, 'CLAIM_ORIGINAL_AUTHORIZATION_MESSAGE');
    assert.equal(frame.toString('hex'), originalFrame, 'CLAIM_ORIGINAL_AUTHORIZATION_FRAME');
    const digest = claimHash(frame);
    assert.equal(digest, original.digest, 'CLAIM_ORIGINAL_AUTHORIZATION_DIGEST');
    const matches = record.data.authorizations.filter(row => row.kind === kind && row.digest === digest);
    assert.equal(matches.length, 1, 'CLAIM_ORIGINAL_AUTHORIZATION_MISSING');
    const prior = matches[0];
    assert.ok(prior.signature && prior.abiSignature, 'CLAIM_ORIGINAL_AUTHORIZATION_UNFINISHED');
    for (const key of ['kind', 'message', 'digest', 'signature', 'abiSignature'])
      equal(prior[key], original[key], 'CLAIM_ORIGINAL_AUTHORIZATION_RECORD_CHANGED');
    return prior;
  }
  /** V4 is intentionally different from the V1 whole-operation deadline.
   * A round can replace observations only by rereading COMPLETE claim history,
   * all inventories/preparations, and reciprocal GRAPH at the original head.
   * Preparation, pre-key and persisted-return rounds have separate strict clocks.
   * This closure is installed only by the fixed payout/debt methods below. */
  function assertV4PeerHistory() {
    for (const peer of Object.values(record.data.peers)) for (const entry of peer.state.entries) {
      assert.ok(entry.status === 'live' && entry.reason === null, 'CLAIM_V4_RETAINED_FACT_FAILURE');
      assert.ok(entry.signature || activeV4Facts && canonical(entry.request) === canonical(activeV4Facts.request),
        'CLAIM_V4_UNFINISHED_FACT_SIGNATURE');
    }
  }
  function captureV4NativeState() {
    return freeze(bound.nativeRuntimes.map((native, i) => {
      const family = bound.configs[i].nativeFamily;
      const capture = family === '1' ? bitcoinRuntimeLiveness.readOwnedBitcoinRuntimeAuditState
        : solanaRuntimeLiveness.readOwnedSolanaRuntimeAuditState;
      assert.equal(typeof capture, 'function', 'CLAIM_V4_NATIVE_STATE_CAPABILITY_REQUIRED');
      const state = capture(native);
      exactRecord(state, ['profile', 'family', 'lifetimeId', 'facade', 'genesis', 'readGeneration', 'mutationGeneration',
        'activeReads', 'activeMutations', 'readsIdle', 'operationBusy', 'observationBusy', 'inventoryBusy',
        'signingUnresolved', 'persistenceFailed', 'isolationFailed', 'adverseHistory', 'activeRoute', 'activePrepared',
        'transfers', 'custodyTransfers', 'graphTransfers']);
      assert.equal(typeof state.lifetimeId, 'string', 'CLAIM_V4_NATIVE_LIFETIME_REQUIRED');
      assert.ok(state.lifetimeId.length > 0, 'CLAIM_V4_NATIVE_LIFETIME_REQUIRED');
      assert.equal(state.profile, 'OWNED_NATIVE_RUNTIME_AUDIT_STATE_V1', 'CLAIM_V4_NATIVE_STATE_PROFILE');
      assert.equal(state.family, family, 'CLAIM_V4_NATIVE_STATE_FAMILY');
      assert.equal(state.facade, 'custody', 'CLAIM_V4_NATIVE_STATE_CUSTODY');
      assert.equal(state.readsIdle, true, 'CLAIM_V4_NATIVE_READ_IN_FLIGHT');
      for (const flag of ['signingUnresolved', 'persistenceFailed', 'isolationFailed', 'adverseHistory'])
        assert.equal(state[flag], false, 'CLAIM_V4_NATIVE_STATE_' + flag);
      assert.equal(state.activeReads, 0, 'CLAIM_V4_NATIVE_READ_IN_FLIGHT');
      assert.equal(state.activeMutations, 0, 'CLAIM_V4_NATIVE_MUTATION_IN_FLIGHT');
      claimUint(state.readGeneration); claimUint(state.mutationGeneration);
      assert.ok(Array.isArray(state.transfers) && Array.isArray(state.custodyTransfers) && Array.isArray(state.graphTransfers), 'CLAIM_V4_COMPLETE_NATIVE_HISTORY');
      return state;
    }));
  }
  function observationIdentity(value) {
    if (!value) return value;
    const out = copy(value);
    // Only successful observation-progress metadata may differ between
    // independently read actors. Wire, block/slot membership, amounts, fees,
    // finality classification, failure data and every other field stay exact.
    for (const name of ['observedAt', 'observationAttempts', 'confirmations', 'observedTip', 'observedTipHeight', 'observedSlot']) delete out[name];
    if (out.nativeContext) for (const name of ['observedTipId', 'observedTipHeight', 'observedSlot']) delete out.nativeContext[name];
    return out;
  }
  function historyIdentity(rows) {
    return rows.map(row => {
      const result = copy(row);
      if (result.observation) result.observation = observationIdentity(result.observation);
      // BTC retains the previous successful observation as a duplicate after
      // each fresh read. Its current observed phase and latest immutable body
      // remain authoritative. Unknown/adverse phases are never normalized.
      if (result.observation && ['OBSERVED_CONFIRMED', 'OBSERVED_FINALIZED'].includes(result.phase)) delete result.lastObservation;
      else if (result.lastObservation) result.lastObservation = observationIdentity(result.lastObservation);
      return result;
    });
  }
  function nativeIdentity(states) {
    return states.map(state => {
      const result = copy(state); delete result.readGeneration;
      for (const field of ['transfers', 'custodyTransfers', 'graphTransfers']) result[field] = historyIdentity(result[field]);
      return result;
    });
  }
  function assertObservationProgress(before, after) {
    if (!before || !after) return;
    for (const key of ['confirmations', 'observedTipHeight', 'observedSlot']) if (Object.hasOwn(before, key)) {
      assert.ok(Object.hasOwn(after, key), 'CLAIM_V4_NATIVE_PROGRESS_REMOVED');
      const a = claimUint(String(before[key])), b = claimUint(String(after[key]));
      assert.ok(b >= a, 'CLAIM_V4_NATIVE_PROGRESS_ROLLBACK');
      if (key === 'observedTipHeight' && b === a) for (const id of ['observedTip', 'observedTipId'])
        if (Object.hasOwn(before, id)) equal(after[id], before[id], 'CLAIM_V4_NATIVE_SAME_HEIGHT_CHANGED');
    }
    if (before.nativeContext) assertObservationProgress(before.nativeContext, after.nativeContext);
  }
  function assertV4NativeProjection(prior, current = captureV4NativeState()) {
    equal(nativeIdentity(current), nativeIdentity(prior), 'CLAIM_V4_NATIVE_HISTORY_CHANGED');
    for (let i = 0; i < prior.length; i++) assert.ok(claimUint(current[i].readGeneration) >= claimUint(prior[i].readGeneration), 'CLAIM_V4_NATIVE_READ_GENERATION_ROLLBACK');
    for (const [i, state] of prior.entries()) for (const field of ['transfers', 'custodyTransfers', 'graphTransfers'])
      for (const [j, row] of state[field].entries()) assertObservationProgress(row.observation, current[i][field][j].observation);
  }
  function graphSourceFenceV4() {
    let source = null;
    return {
      setGraphSource(value) { source = value; },
      assertGraphSource() { assertCombinedGraphSourceCurrentV4(custody, source); },
      graphSource() { assertCombinedGraphSourceCurrentV4(custody, source); return source; },
    };
  }
  function roundQuiescence() {
    let fence = null, snapshot = null, graphFence = null, graphSnapshot = null;
    const release = () => {
      if (graphFence) releaseCombinedGraphNativeQuiescenceV4(custody, graphFence);
      if (fence) releaseOwnedOperatorNativeReadQuiescence(fence);
    };
    return {
      async acquire() {
        release(); fence = null; snapshot = null; graphFence = null; graphSnapshot = null;
        fence = await quiesceOwnedOperatorNativeReads([...nativeReads.values()]);
        graphFence = await quiesceCombinedGraphNativeV4(custody);
        snapshot = captureV4NativeState(); graphSnapshot = assertGraphNativeIdleV4(captureCombinedGraphNativeStateV4(custody));
      },
      assertCurrent() {
        assert.ok(fence && snapshot, 'CLAIM_V4_NATIVE_QUIESCENCE_REQUIRED');
        assertOwnedOperatorNativeReadsQuiescent(fence);
        equal(captureV4NativeState(), snapshot, 'CLAIM_V4_NATIVE_STATE_CHANGED');
        assertCombinedGraphNativeQuiescenceV4(custody, graphFence);
        equal(captureCombinedGraphNativeStateV4(custody), graphSnapshot, 'WRAPPED_GRAPH_NATIVE_STATE_CHANGED');
      },
      release,
      nativeStates() { assert.ok(snapshot, 'CLAIM_V4_NATIVE_SNAPSHOT_REQUIRED'); return snapshot; },
      graphNativeStates() { assert.ok(graphSnapshot, 'WRAPPED_GRAPH_NATIVE_SNAPSHOT_REQUIRED'); return graphSnapshot; },
    };
  }
  function captureV4EvmFence() {
    ready(); const state = bound.runtime.ingressSendState;
    exactRecord(state, ['epoch', 'busy', 'uncertain']); claimUint(state.epoch);
    assert.equal(typeof state.busy, 'boolean', 'CLAIM_V4_EVM_BUSY_STATE');
    assert.equal(state.uncertain, false, 'CLAIM_V4_EVM_UNCERTAIN');
    return freeze(copy(state));
  }
  function assertV4Live(evmFence) {
    ready(); assert.equal(Object.keys(record.data.adverse).length, 0, 'CLAIM_V4_CURRENT_ADVERSE_HISTORY');
    assertV4PeerHistory(); const currentEvmFence = captureV4EvmFence();
    if (evmFence) equal(currentEvmFence, evmFence, 'CLAIM_V4_EVM_MUTATION_CHANGED');
    for (const [i, native] of bound.nativeRuntimes.entries()) {
      const assertNativeLive = bound.configs[i].nativeFamily === '1'
        ? bitcoinRuntimeLiveness.assertOwnedBitcoinRuntimeLive : solanaRuntimeLiveness.assertOwnedSolanaRuntimeLive;
      assert.equal(typeof assertNativeLive, 'function', 'CLAIM_V4_PHYSICAL_RUNTIME_LIVENESS_REQUIRED');
      assertNativeLive(native);
    }
  }
  async function signedV4(prepare, original = null, request) {
    assert.ok(custody, 'CLAIM_V4_COMBINED_OPERATOR_REQUIRED');
    auditMethod = wrappedAuditMethodV1(request,A);
    auditRound = original ? 'original-validation' : 'initial-preparation';
    const head = freeze(copy(activeView.head)), evmFence = captureV4EvmFence(), quiet = roundQuiescence(), graphFence = graphSourceFenceV4();
    const candidate = freeze(copy(await prepare()));
    const fixedItems = value => {
      assert.ok(['backing', 'reservation', 'health', 'presign-payout', 'broadcast-payout-v2', 'broadcast-bitcoin-payout-v1'].includes(value.kind), 'CLAIM_V4_FIXED_KIND');
      const encode = value.kind === 'health' ? encodeFlatNativeHealth
        : ['backing', 'reservation'].includes(value.kind) ? claimBackingFrame
          : value.kind === 'presign-payout' ? claimPayoutAuthorizationFrame
            : value.kind === 'broadcast-bitcoin-payout-v1' ? claimBitcoinPayoutBroadcastFrame : claimPayoutBroadcastFrame;
      const items = [{ kind: value.kind, message: value.message, frame: encode(value.message) }];
      if (value.healthMessage) {
        assert.ok(['backing', 'reservation'].includes(value.kind), 'CLAIM_V4_FIXED_PAIR');
        items.push({ kind: 'health', message: value.healthMessage, frame: encodeFlatNativeHealth(value.healthMessage) });
      }
      return items.map(item => ({ ...item, digest: claimHash(item.frame) }));
    };
    const items = fixedItems(candidate);
    const economicInventoryCommitment = candidate.inventoryCommitment ?? candidate.message.inventoryCommitment;
    bytes32(economicInventoryCommitment, true);
    if (original) {
      assert.equal(original.result.authorizationLifecycleProfile, CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE, 'CLAIM_V4_ORIGINAL_LIFECYCLE_REQUIRED');
      assert.equal(original.result.economicInventoryCommitment, economicInventoryCommitment, 'CLAIM_V4_ORIGINAL_ECONOMIC_INVENTORY_CHANGED');
    }
    const assertCurrent = () => {
      equal(activeView.head, head, 'CLAIM_V4_ORIGINAL_HEAD_CHANGED');
      const now = claimUint(head.timestamp);
      for (const item of items) {
        const from = claimUint(item.message.validFrom), until = claimUint(item.message.validUntil);
        assert.ok(from <= now && now + 1n < until && until - from <= 30n, 'CLAIM_ORIGINAL_AUTHORIZATION_EXPIRED');
      }
      quiet.assertCurrent(); graphFence.assertGraphSource(); assertV4Live(evmFence);
      assertTerminalBudget();
    };
    activeV4 = { assertCurrent, release: quiet.release, nativeStates: quiet.nativeStates, graphNativeStates: quiet.graphNativeStates, ...graphFence };
    const assertPreparationHistory = () => {
      const seen = new Set(), salts = new Set();
      for (const row of record.data.nativePreparations) {
        const id = row.claimDomain + ':' + row.operationId;
        assert.ok(!seen.has(id) && !salts.has(row.wireSalt), 'CLAIM_V4_UNSIGNED_PREPARATION_DUPLICATE');
        seen.add(id); salts.add(row.wireSalt);
        const binding = record.data.bindings.find(value => value.claimDomain === row.claimDomain && value.operationId === row.operationId);
        if (binding) {
          assert.equal(binding.ingress, row.ingress, 'CLAIM_V4_PREPARATION_KIND_CHANGED');
          assert.equal(binding.wireSalt, row.wireSalt, 'CLAIM_V4_PREPARATION_SALT_CHANGED');
          assert.equal(binding.revision, row.revision, 'CLAIM_V4_PREPARATION_REVISION_CHANGED');
          equal(binding.intent, row.prepared.intent, 'CLAIM_V4_PREPARATION_INTENT_CHANGED');
          originalNativePreparation(row, binding);
        } else {
          // An unfinished unsigned preparation can belong only to this exact
          // current payout. A sibling abandoned preparation is never ignored.
          assert.equal(row.ingress, false, 'CLAIM_V4_UNRESOLVED_UNSIGNED_INGRESS');
          assert.equal(row.claimDomain, request.claimDomain, 'CLAIM_V4_UNRESOLVED_UNSIGNED_DOMAIN');
          assert.equal(row.operationId, request.ticketId ?? request.terms?.operationId, 'CLAIM_V4_UNRESOLVED_UNSIGNED_OPERATION');
          assert.ok(request.prepared, 'CLAIM_V4_ORIGINAL_UNSIGNED_PREPARATION_REQUIRED');
          equal(row.prepared, request.prepared, 'CLAIM_V4_UNSIGNED_PREPARATION_CHANGED');
          equal(row.route, request.route, 'CLAIM_V4_UNSIGNED_ROUTE_CHANGED');
          assert.equal(row.wireSalt, request.wireSalt, 'CLAIM_V4_UNSIGNED_SALT_CHANGED');
        }
      }
    };
    function originalNativePreparation(row, binding) {
      const native = selected(binding.claimDomain).native;
      const rows = native.transfers.filter(value => nativeId(value, binding.request.family) === binding.request.nativeId);
      assert.equal(rows.length, 1, 'CLAIM_V4_PREPARATION_ORIGINAL_NATIVE');
      equal(rows[0].intent, row.prepared.intent, 'CLAIM_V4_PREPARATION_ORIGINAL_INTENT');
    }
    const finishRound = async () => { assertPreparationHistory(); await jointCurrent(); assertPreparationHistory(); await quiet.acquire(); assertCurrent(); };
    const freshRound = async round => {
      auditRound = round;
      // Invalidate the previous round before the first read. No old observation
      // or graph-only refresh can justify this new start.
      quiet.release();
      started = beginWrappedClaimAuditRoundV4(custody); await readVault(); activeView = await readCurrentView();
      equal(activeView.head, head, 'CLAIM_V4_ORIGINAL_HEAD_CHANGED');
      const fresh = freeze(copy(await prepare()));
      equal(fresh, candidate, 'CLAIM_V4_ORIGINAL_ECONOMIC_AUTHORIZATION_CHANGED');
      await finishRound();
    };
    // The initial preparation itself is a complete bounded observation round.
    await finishRound();
    if (original) {
      for (const [i, item] of items.entries()) assertOriginalAuthorization(item.kind, item.message, item.frame,
        i === 0 ? original.result : original.result.healthCertificate,
        i === 0 ? original.frameHex : original.healthFrameHex);
      // Validation-only: no authorization reservation, recovery, append or key.
      assertCurrent();
    } else {
      quiet.release();
      for (const item of items) {
        item.position = record.data.authorizations.findIndex(row => row.kind === item.kind && row.digest === item.digest);
        if (item.position >= 0) {
          const prior = record.data.authorizations[item.position];
          assert.ok(prior.signature && prior.abiSignature, 'CLAIM_UNRESOLVED_ATTESTATION');
          equal(prior.message, item.message, 'CLAIM_AUTHORIZATION_MESSAGE_CHANGED');
        }
      }
      const missing = items.filter(item => item.position < 0);
      if (!missing.length) await freshRound('existing-authorization');
      if (missing.length) {
        assert.ok(record.data.authorizations.length + missing.length <= 2048, 'CLAIM_AUTHORIZATION_HISTORY_FULL');
        const reserved = copy(record.data);
        for (const item of missing) {
          item.position = reserved.authorizations.length;
          reserved.authorizations.push({ kind: item.kind, message: copy(item.message), digest: item.digest, signature: null, abiSignature: null });
        }
        // The fixed pair is reserved atomically, before either key is used.
        for (const item of missing) pendingAuthorizations.add(item.kind + ':' + item.digest);
        await save(reserved);
        await freshRound('pre-key');
        try {
          // Final clock/bounds check follows every await and expensive codec.
          // No await occurs between the at-most-two fixed signing operations.
          for (const item of missing) {
            const keyLease = Object.freeze(Object.create(null));
            operatorKeyLeases.set(keyLease, { custody, kind: item.kind, message: item.message, frame: item.frame.toString('hex'),
              assertCurrent, release: quiet.release, noteKeyUse() { activeKeyUsed = true; keyUseEpoch++; } });
            item.signature = signCombinedClaimAuthorizationV4(custody, item.kind, item.message, keyLease);
          }
          for (const item of missing) {
            const candidates = [];
            for (const v of ['27', '28']) {
              const returned = await bound.runtime.call({ to: '0x0000000000000000000000000000000000000001',
                data: '0x' + item.digest + BigInt(v).toString(16).padStart(64, '0') + item.signature },
                '0x' + BigInt(head.number).toString(16));
              if (returned === '0x' + '00'.repeat(12) + address) candidates.push(v);
            }
            assert.equal(candidates.length, 1, 'CLAIM_SIGNATURE_RECOVERY');
            item.abiSignature = nativeHubSignatureToAbi({ signerIndex: String(signerIndex), v: candidates[0], signature: item.signature });
          }
          const completed = copy(record.data);
          for (const item of missing) Object.assign(completed.authorizations[item.position], { signature: item.signature, abiSignature: item.abiSignature });
          // Exact signatures become durable together. Never re-sign a record.
          await save(completed);
          await freshRound('persisted-return');
        } catch (cause) {
          if (activeKeyUsed) { poison(); throw new Error('CLAIM_ATTESTATION_UNCERTAIN', { cause }); }
          throw cause;
        }
      }
    }
    const results = items.map(item => {
      const matches = record.data.authorizations.filter(row => row.kind === item.kind && row.digest === item.digest);
      assert.equal(matches.length, 1, 'CLAIM_ORIGINAL_AUTHORIZATION_MISSING');
      const row = matches[0]; assert.ok(row.signature && row.abiSignature, 'CLAIM_UNRESOLVED_ATTESTATION');
      equal(row.message, item.message, 'CLAIM_AUTHORIZATION_MESSAGE_CHANGED');
      return freeze({ ...copy(row), signerIndex, head: copy(head) });
    });
    if (original) {
      equal(results[0].signature, original.result.signature, 'CLAIM_V4_ORIGINAL_SIGNATURE_CHANGED');
      if (items.length === 2) equal(results[1], original.result.healthCertificate, 'CLAIM_V4_ORIGINAL_HEALTH_CHANGED');
    }
    const result = freeze({ ...results[0], ...(items.length === 2 ? { healthCertificate: results[1] } : {}),
      authorizationLifecycleProfile: CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE, economicInventoryCommitment });
    assertCurrent(); return result;
  }
  async function signed(kind, message, frame, original = null) {
    // V3 stages immutable candidates under cheap original-head/liveness checks.
    // Full reciprocal inventories remain at pre-key and post-persistence return.
    if (custody) { message = freeze(copy(message)); frame = Buffer.from(frame); await current(); }
    else await jointCurrent();
    const digest = claimHash(frame);
    if (original) {
      const prior = assertOriginalAuthorization(kind, message, frame, original.result, original.frameHex);
      if (custody) await jointCurrent();
      return freeze({ ...copy(prior), signerIndex, head: copy(activeView.head) });
    }
    const prior = record.data.authorizations.find(row => row.kind === kind && row.digest === digest);
    if (prior) {
      assert.ok(prior.signature && prior.abiSignature, 'CLAIM_UNRESOLVED_ATTESTATION');
      if (custody) await jointCurrent();
      return freeze({ ...copy(prior), signerIndex, head: copy(activeView.head) });
    }
    assert.ok(record.data.authorizations.length < 2048, 'CLAIM_AUTHORIZATION_HISTORY_FULL');
    const next = copy(record.data), position = next.authorizations.length;
    next.authorizations.push({ kind, message: copy(message), digest, signature: null, abiSignature: null });
    pendingAuthorizations.add(kind + ':' + digest); await save(next); await jointCurrent();
    try {
      if (custody) activeKeyUsed = true;
      const signature = custody ? signCombinedClaimAuthorization(custody, kind, message) : lowSignature(key, frame).toString('hex');
      const candidates = [];
      for (const v of ['27', '28']) {
        const returned = await bound.runtime.call({ to: '0x0000000000000000000000000000000000000001',
          data: '0x' + digest + BigInt(v).toString(16).padStart(64, '0') + signature }, '0x' + BigInt(activeView.head.number).toString(16));
        if (returned === '0x' + '00'.repeat(12) + address) candidates.push(v);
      }
      assert.equal(candidates.length, 1, 'CLAIM_SIGNATURE_RECOVERY');
      const abiSignature = nativeHubSignatureToAbi({ signerIndex: String(signerIndex), v: candidates[0], signature });
      const saved = copy(record.data); Object.assign(saved.authorizations[position], { signature, abiSignature });
      await save(saved); await jointCurrent(); return freeze({ kind, message: copy(message), digest, signature, abiSignature, signerIndex, head: copy(activeView.head) });
    } catch (cause) { poison(); throw new Error('CLAIM_ATTESTATION_UNCERTAIN', { cause }); }
  }
  // Only the fixed backing/reservation plus its health certificate may share
  // this bounded signing transaction. No caller can select frames or a signer.
  async function signedPair(kind, message, healthMessage, original = null) {
    assert.ok(kind === 'backing' || kind === 'reservation', 'CLAIM_PAIRED_AUTHORIZATION_KIND');
    const pair = [{ kind, message: freeze(copy(message)), frame: claimBackingFrame(message) },
      { kind: 'health', message: freeze(copy(healthMessage)), frame: encodeFlatNativeHealth(healthMessage) }];
    if (custody) await current(); else await jointCurrent();
    if (original) {
      // Validation-only mode cannot reach reservation, append, recovery or key
      // use, even when a journal row is missing or fresh reconstruction differs.
      const prior = assertOriginalAuthorization(kind, pair[0].message, pair[0].frame, original.result, original.frameHex);
      const health = assertOriginalAuthorization('health', pair[1].message, pair[1].frame,
        original.result.healthCertificate, original.healthFrameHex);
      if (custody) await jointCurrent();
      return [prior, health].map(row => freeze({ ...copy(row), signerIndex, head: copy(activeView.head) }));
    }
    for (const item of pair) {
      item.digest = claimHash(item.frame);
      item.position = record.data.authorizations.findIndex(row => row.kind === item.kind && row.digest === item.digest);
      if (item.position >= 0) {
        const prior = record.data.authorizations[item.position];
        assert.ok(prior.signature && prior.abiSignature, 'CLAIM_UNRESOLVED_ATTESTATION');
        equal(prior.message, item.message, 'CLAIM_AUTHORIZATION_MESSAGE_CHANGED');
      }
    }
    const missing = pair.filter(item => item.position < 0);
    const results = () => pair.map(item => freeze({ ...copy(record.data.authorizations[item.position]),
      signerIndex, head: copy(activeView.head) }));
    if (missing.length === 0) { if (custody) await jointCurrent(); return results(); }
    assert.ok(record.data.authorizations.length + missing.length <= 2048, 'CLAIM_AUTHORIZATION_HISTORY_FULL');
    const next = copy(record.data);
    for (const item of missing) {
      item.position = next.authorizations.length;
      next.authorizations.push({ kind: item.kind, message: item.message, digest: item.digest, signature: null, abiSignature: null });
    }
    // Every missing identity is durably reserved together before either key use.
    for (const item of missing) pendingAuthorizations.add(item.kind + ':' + item.digest);
    await save(next); await jointCurrent();
    try {
      // Deliberately no await between these at-most-two fixed-codec key uses.
      // Recovery, persistence and the return gate happen only after both exist.
      if (custody) activeKeyUsed = true;
      for (const item of missing)
        item.signature = custody ? signCombinedClaimAuthorization(custody, item.kind, item.message)
          : lowSignature(key, item.frame).toString('hex');
      for (const item of missing) {
        const candidates = [];
        for (const v of ['27', '28']) {
          const returned = await bound.runtime.call({ to: '0x0000000000000000000000000000000000000001',
            data: '0x' + item.digest + BigInt(v).toString(16).padStart(64, '0') + item.signature },
          '0x' + BigInt(activeView.head.number).toString(16));
          if (returned === '0x' + '00'.repeat(12) + address) candidates.push(v);
        }
        assert.equal(candidates.length, 1, 'CLAIM_SIGNATURE_RECOVERY');
        item.abiSignature = nativeHubSignatureToAbi({ signerIndex: String(signerIndex), v: candidates[0], signature: item.signature });
      }
      const completed = copy(record.data);
      for (const item of missing)
        Object.assign(completed.authorizations[item.position], { signature: item.signature, abiSignature: item.abiSignature });
      await save(completed); await jointCurrent(); return results();
    } catch (cause) { poison(); throw new Error('CLAIM_ATTESTATION_UNCERTAIN', { cause }); }
  }
  async function retainInventoryAudit(report) {
    const next = copy(record.data);
    const inventoryCommitment = appendClaimInventoryAudit(next, activeView.head, report.inventories);
    await save(next); await current(); return inventoryCommitment;
  }
  const operator = { profile: CLAIM_OPERATOR_PROFILE, signerIndex, publicKey };
  Object.defineProperties(operator, {
    toJSON: { value() { throw new Error('CLAIM_OPERATOR_NOT_SERIALIZABLE'); } },
    bind: { value: async capability => {
      live(); assert.ok(!bound && !busy, 'CLAIM_OPERATOR_ALREADY_BOUND'); busy = true; started = performance.now();
      try {
        assertOwnedWrappedClaimObserverV1(capability); observer = capability; bound = ownedWrappedClaimObserverBindingsV1(capability);
        if (bound.nativeRuntimes.some(native => native.nonceIngressProfile !== undefined || native.nonceInfrastructureByAuthority !== undefined))
          assertNonceIngressDeployment(bound.system);
        equal(bound.registry.quorum.keys[signerIndex], publicKey, 'CLAIM_ATTESTER_REGISTRY_PIN');
        const domains = bound.configs.map(claimDomainCommitment);
        assert.ok(domains.length >= 1 && domains.length <= 2 && new Set(domains).size === domains.length, 'CLAIM_REGISTERED_CONFIGURATION_SET');
        fixedArray(bound.policies, domains.length); fixedArray(bound.nativeRuntimes, domains.length);
        assert.equal(new Set(bound.nativeRuntimes).size, domains.length, 'CLAIM_SHARED_CUSTODY_UNSUPPORTED');
        assert.equal(new Set(bound.configs.map(c => c.custodyInventoryDomain)).size, domains.length, 'CLAIM_INVENTORY_ALIAS');
        assert.equal(new Set(bound.configs.map(c => c.nativeFamily + ':' + c.nativeGenesis)).size,
          domains.length, 'CLAIM_NATIVE_ASSET_RELABEL');
        const completeRegistration = validateWrappedClaimOperationalRegistration(bound.system.custodyRegistration);
        const peerStates = {}, recipients = new Map();
        for (const [i, config] of bound.configs.entries()) {
          const native = bound.nativeRuntimes[i], policy = bound.policies[i], domain = domains[i];
          (config.nativeFamily === '1' ? assertOwnedBitcoinRuntime : assertOwnedSolanaRuntime)(native);
          assert.equal(typeof native.inventory, 'function', 'CLAIM_OWNED_CUSTODY_REQUIRED');
          nativeReads.set(domain, createOwnedOperatorNativeReads({ native, family: config.nativeFamily }));
          equal({ ledgerNamespace: policy.ledgerNamespace, hubDomain: policy.hubDomain, registryCommitment: policy.registryCommitment },
            { ledgerNamespace: config.ledgerNamespace, hubDomain: config.hubDomain, registryCommitment: config.registryCommitment });
          equal({ family: policy.rule.family, genesis: policy.rule.genesis, asset: policy.rule.asset },
            { family: config.nativeFamily, genesis: config.nativeGenesis, asset: config.nativeAsset }, 'CLAIM_NATIVE_POLICY_PIN');
          assert.equal(nativeRuleCommitment(policy.rule), config.nativeRuleCommitment, 'CLAIM_NATIVE_RULE_PIN');
          assert.equal(wrappedRegistryCommitment(bound.registry), config.registryCommitment, 'WRAPPED_CLAIM_REGISTRY_COMMITMENT');
          const registration = completeRegistration.claims[i].registration;
          createWrappedClaimFactsCollector({ config, registry: bound.registry, rule: policy.rule, custodyProfile: registration.profile, profilePath: registration.profilePath, sources: registration.sources, clock });
          for (const route of ['deposit', 'refund', 'redeem']) {
            const spec = ownedCustodyRoute(route), id = peerKey(domain, route), binding = native.adapter({ asset: config.nativeAsset, route }).binding;
            const routes = [{ recipientIndex: String(spec.recipientIndex), sourceEndpoint: binding.sourceEndpoint, destinationEndpoint: binding.destinationEndpoint }];
            recipients.set(id, routes); readers.set(id, nativeReads.get(domain).factReader({ asset: config.nativeAsset, route }));
            peerStates[id] = { revision: '0', state: createNativeFactsInventory({ policy, signerIndex: String(signerIndex), publicKey, recipients: routes }) };
          }
        }
        const identity={schema:'WRAPPED_CLAIM_OPERATOR_STORE_IDENTITY_V1',profile:CLAIM_OPERATOR_PROFILE,signerIndex,publicKey,
          configurations:copy(bound.configs),registry:copy(bound.registry),policies:copy(bound.policies)};
        if(retainedRecovery){
          assert.deepEqual(retainedRecovery.options.identity,identity,'WRAPPED_RECOVERY_ORIGINAL_CLAIM_STORE');
          assert.equal(retainedRecovery.options.path,join(bound.journalRoot,'claim-operator-'+signerIndex+'.wrapped-v1'),'WRAPPED_RECOVERY_CLAIM_DIRECTORY');
          vaultOptions=copy(retainedRecovery.options);vault=await openClaimRecordStore(vaultOptions);
          record=await vault.read();assert.deepEqual(record,retainedRecovery.snapshot,'WRAPPED_RECOVERY_CLAIM_CHECKPOINT_CHANGED');
        }else{
          vaultOptions={path:join(bound.journalRoot,'claim-operator-'+signerIndex+'.wrapped-v1'),password:randomBytes(32).toString('hex'),identity};
          vault=await createClaimRecordStore(vaultOptions,{schema:'WRAPPED_CLAIM_OPERATOR_JOURNAL_V1',signerIndex,publicKey,
            configurations:copy(bound.configs),bindings:[],peers:peerStates,contexts:{},adverse:{},nativePreparations:[],inventorySnapshots:{},inventoryAudits:[],authorizations:[],wrappedFactsHistory:[]});
          record=await vault.read();
        }
        await readVault(); activeView = await observer.read();
        for (const [i, config] of bound.configs.entries()) for (const route of ['deposit', 'refund', 'redeem']) {
          const id = peerKey(domains[i], route), policy = bound.policies[i];
          peers.set(id, await createNativeFactsPeer({ policy, signerIndex: String(signerIndex), recipients: recipients.get(id),
            signer: custody ? createCombinedFactsSigner(custody, 'claim', policy) : createNativeFactsSigner({ privateKey: key.privateKey, policy }),
            clock, store: store(id),
            reader: { observe: async request => {
              const match = record.data.bindings.find(b => b.claimDomain === domains[i]
                && b.request.nativeId === request.nativeId && original(b).route === route);
              assert.ok(match, 'CLAIM_FACT_RESERVATION_HANDOFF_REQUIRED'); return observed(match, true);
            } } }));
        }
        await current(); if (custody) cachedView = activeView;
        return freeze({ profile: CLAIM_OPERATOR_PROFILE, signerIndex, publicKey, independentOperators: false });
      } catch (cause) { poison(); vault?.close(); throw new Error('CLAIM_OPERATOR_BIND_FAILED', { cause }); }
      finally { activeView = undefined; busy = false; }
    } },
    retainSignedEffect: { value: raw => {
      const input = copy(raw); exactRecord(input, ['claimDomain', 'operationId', 'receiptSecret', 'wireSalt', 'nativeId']);
      return serial(async () => {
        const { config, native, gateway } = selected(input.claimDomain);
        const rows = native.transfers.filter(row => nativeId(row, config.nativeFamily) === input.nativeId);
        assert.equal(rows.length, 1, 'CLAIM_OWNED_SIGNED_EFFECT_REQUIRED'); const row = rows[0];
        const ingress = row.route === 'deposit', operation = ingress ? gateway.intents.find(item => item.id === input.operationId)
          : gateway.tickets.find(item => item.ticket.id === input.operationId);
        assert.ok(operation, 'CLAIM_CANONICAL_OPERATION_REQUIRED');
        assert.equal(operation.state, ingress ? '1' : '2', 'CLAIM_OPERATION_STATE');
        if (!ingress) assert.equal(gateway.activePayout, input.operationId, 'CLAIM_ACTIVE_PAYOUT_REQUIRED');
        const amount = ingress ? operation.amount : operation.ticket.amount;
        assert.equal(config.nativeFamily === '1' ? row.intent.amountSatoshi : row.intent.lamports, amount, 'CLAIM_SIGNED_AMOUNT');
        const binding = createClaimReservationBinding({ claimDomain: input.claimDomain, gateway: config.gateway,
          ledgerNamespace: config.ledgerNamespace, genesis: config.nativeGenesis, asset: config.nativeAsset,
          operationId: input.operationId, revision: ingress ? operation.revision : '1', ingress,
          receiptSecret: input.receiptSecret, wireSalt: input.wireSalt, nativeWire: nativeWire(row, config.nativeFamily), intent: row.intent,
          request: { family: config.nativeFamily, recipientIndex: String(row.recipientIndex), nativeId: input.nativeId, wireKeyCommitment: row.intent.wireKeyCommitment } });
        const preparation = record.data.nativePreparations.find(p => p.claimDomain === input.claimDomain && p.operationId === input.operationId);
        if (preparation) {
          equal(preparation.prepared.intent, row.intent, 'CLAIM_ORIGINAL_PRESIGN_INTENT_CHANGED');
          assert.equal(preparation.wireSalt, input.wireSalt, 'CLAIM_ORIGINAL_PRESIGN_SALT_CHANGED');
        }
        original(binding); const previous = record.data.bindings.find(b => b.claimDomain === input.claimDomain && b.operationId === input.operationId);
        if (previous) equal(previous, binding, 'CLAIM_ORIGINAL_RESERVATION_REBOUND');
        else {
          assert.ok(!record.data.bindings.some(b => b.nativeGid === binding.nativeGid || b.admissionN === binding.admissionN), 'CLAIM_EFFECT_ALREADY_BOUND');
          assert.ok(!record.data.bindings.some(b => b.wireSalt === binding.wireSalt), 'CLAIM_WIRE_SALT_REUSE');
          const retained = record.data.bindings.filter(b => b.claimDomain === input.claimDomain);
          assert.ok(retained.filter(b => b.ingress === ingress).length < (ingress ? 16 : 32), 'CLAIM_RETAINED_LIFETIME_CAPACITY');
          const next = copy(record.data); next.bindings.push(binding); await save(next);
        }
        return freeze({ claimDomain: binding.claimDomain, operationId: binding.operationId, revision: binding.revision,
          admissionN: binding.admissionN, wireBindingCommitment: binding.wireBindingCommitment });
      });
    } },
    signFacts: { value: raw => certify(raw) },
    authorizeIngress: { value: raw => authorizeIngress(raw) },
    authorizePayout: { value: raw => authorizePayout(raw) },
    authorizeBroadcast: { value: raw => authorizeBroadcast(raw) },
    authorizeBitcoinBroadcast: { value: raw => authorizeBroadcast(raw, undefined, null, true) },
    authorizeIngressBroadcast: { value: raw => authorizeIngressBroadcast(raw) },
    signBacking: { value: raw => backing(raw) },
    signReservation: { value: raw => backing(raw, true) },
    signHealth: { value: raw => health(raw) },
    audit: { value: () => serial(async () => { const report = await audit({ allowObservedDebt: true });
      assertReconciledCoverage(report);
      return freeze({ ready: true, registeredInventories: String(report.inventories.length), retainedNativeIdentities: String(record.data.bindings.length), independentOperators: false }); }) },
    status: { value: () => freeze({ bound: Boolean(bound), poisoned, closed,
      ...(custody ? combinedOperatorStatus(custody) : {}), independentOperators: false }) },
    close: { value: () => { assert.ok(!busy, 'CLAIM_OPERATOR_BUSY'); if (custody) closeCombinedOperator(custody); else cleanup(); } },
  });

  function payoutFactsBinding(request) {
    const found = record?.data.bindings.find(value => canonical(value.request) === canonical(request));
    return found && !found.ingress ? found : null;
  }
  function assertOriginalPayoutFactsEntry(certificate, binding, original = null) {
    const row = originalNativeFactsEntry(binding), { config, policy } = selected(binding.claimDomain);
    assert.ok(row?.signature && row.status === 'live' && row.reason === null && !record.data.adverse[binding.admissionN],
      'CLAIM_V4_ORIGINAL_FACTS_NOT_LIVE');
    exactRecord(certificate, ['schema', 'signerIndex', 'facts', 'frameHex', 'digest', 'signature']);
    assert.equal(certificate.schema, FACTS_SCHEMA, 'CLAIM_V4_ORIGINAL_FACTS_SCHEMA');
    assert.equal(certificate.signerIndex, String(signerIndex), 'CLAIM_V4_ORIGINAL_FACTS_SIGNER');
    equal(row.request, binding.request, 'CLAIM_V4_ORIGINAL_FACTS_REQUEST');
    equal(row.facts, certificate.facts, 'CLAIM_V4_ORIGINAL_FACTS_CHANGED');
    assert.equal(row.signature, certificate.signature, 'CLAIM_V4_ORIGINAL_FACTS_SIGNATURE');
    const frame = encodeNativeClaimFacts(row.facts, policy);
    assert.equal(certificate.frameHex, frame.toString('hex'), 'CLAIM_V4_ORIGINAL_FACTS_FRAME');
    assert.equal(certificate.digest, claimHash(frame), 'CLAIM_V4_ORIGINAL_FACTS_DIGEST');
    const now = claimUint(activeView.head.timestamp), observation = row.facts.observation;
    assert.equal(observation.observedAt, activeView.head.timestamp, 'CLAIM_V4_ORIGINAL_FACTS_TIME');
    assert.ok(claimUint(observation.evidenceFrom) <= now && now + 1n < claimUint(observation.evidenceUntil)
      && claimUint(observation.evidenceUntil) <= claimUint(row.maximumEvidenceUntil), 'CLAIM_V4_ORIGINAL_FACTS_EXPIRED');
    if (original) {
      equal(certificate, original.certificate, 'CLAIM_V4_ORIGINAL_FACTS_CERTIFICATE');
      equal(activeView.head, original.head, 'CLAIM_V4_ORIGINAL_FACTS_HEAD');
      for (const key of ['request', 'nativeWire', 'intent', 'facts', 'maximumEvidenceUntil', 'signature'])
        equal(row[key], original.entry[key], 'CLAIM_V4_ORIGINAL_FACTS_ENTRY_CHANGED');
    }
    return row;
  }
  function originalNativeFactsEntry(binding) {
    const row = original(binding), slot = peerKey(binding.claimDomain, row.route);
    return record.data.peers[slot].state.entries.find(entry => canonical(entry.request) === canonical(binding.request));
  }
  async function payoutFactsV4(request, expectedHead, anchor, validationOriginal = null, quorumPermit = null) {
    const prior = originalPayoutFacts.get(canonical(request));
    if (prior && !validationOriginal) validationOriginal = prior;
    return serial(async () => {
      const binding = findBinding(request); assert.equal(binding.ingress, false, 'CLAIM_V4_PAYOUT_FACTS_ONLY');
      activeFactSigning = Object.freeze({ request: copy(request) });
      const head = freeze(copy(activeView.head)), evmFence = captureV4EvmFence(), quiet = roundQuiescence(), graphFence = graphSourceFenceV4();
      if (validationOriginal) equal(head, validationOriginal.head, 'CLAIM_V4_ORIGINAL_FACTS_HEAD');
      if (anchor) { assert.ok(factsAnchors.has(anchor), 'CLAIM_PRIVATE_FACTS_ANCHOR'); equal(head, anchor.head); activeFactsAnchor = anchor; }
      const row = original(binding), slot = peerKey(binding.claimDomain, row.route);
      let inventoryCommitment, unsignedEntry, certificate;
      const assertEntry = () => {
        const entry = originalNativeFactsEntry(binding);
        if (unsignedEntry) {
          assert.ok(entry, 'CLAIM_V4_PAYOUT_FACTS_ENTRY_REQUIRED');
          for (const key of ['request', 'nativeWire', 'intent', 'facts', 'maximumEvidenceUntil'])
            equal(entry[key], unsignedEntry[key], 'CLAIM_V4_PAYOUT_FACTS_ENTRY_CHANGED');
        }
        if (certificate) assertOriginalPayoutFactsEntry(certificate, binding, validationOriginal);
        if (validationOriginal) assertOriginalPayoutFactsEntry(validationOriginal.certificate, binding, validationOriginal);
      };
      const assertRound = () => {
        equal(activeView.head, head, 'CLAIM_V4_ORIGINAL_FACTS_HEAD'); assertEntry();
        if (unsignedEntry) {
          const observation = unsignedEntry.facts.observation, now = claimUint(head.timestamp);
          assert.equal(observation.observedAt, head.timestamp, 'CLAIM_V4_UNSIGNED_FACTS_TIME');
          assert.ok(claimUint(observation.evidenceFrom) <= now && now + 1n < claimUint(observation.evidenceUntil)
            && claimUint(observation.evidenceUntil) <= claimUint(unsignedEntry.maximumEvidenceUntil), 'CLAIM_V4_UNSIGNED_FACTS_EXPIRED');
        }
        quiet.assertCurrent(); graphFence.assertGraphSource(); assertV4Live(evmFence);
        const elapsed = performance.now() - started;
        assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'CLAIM_OPERATOR_AUDIT_TOO_OLD');
      };
      const auditRound = async (fresh = false) => {
        if (fresh) {
          quiet.release();
          started = beginWrappedClaimAuditRoundV4(custody); await readVault(); activeView = await readCurrentView();
          equal(activeView.head, head, 'CLAIM_V4_ORIGINAL_FACTS_HEAD');
        }
        const report = await audit({ allowObservedDebt: true }); assertReconciledCoverage(report);
        const economic = await retainInventoryAudit(report);
        if (inventoryCommitment === undefined) inventoryCommitment = economic;
        assert.equal(economic, inventoryCommitment, 'CLAIM_V4_PAYOUT_FACTS_ECONOMIC_CHANGED');
        if (validationOriginal) assert.equal(economic, validationOriginal.inventoryCommitment, 'CLAIM_V4_PAYOUT_FACTS_ORIGINAL_ECONOMIC_CHANGED');
        assertCanonicalClaimReservation(binding, await observer.readReservation({ claimDomain: binding.claimDomain, admissionN: binding.admissionN }, activeView));
        await jointCurrent(); await quiet.acquire(); assertRound();
      };
      activeV4 = { assertCurrent: assertRound, release: quiet.release, nativeStates: quiet.nativeStates, graphNativeStates: quiet.graphNativeStates, ...graphFence };
      activeV4Facts = { request, slot,
        async afterCommit() {
          const entry = originalNativeFactsEntry(binding);
          if (!entry) return;
          if (!unsignedEntry) unsignedEntry = freeze(copy(entry));
          assertEntry(); await auditRound(true);
        },
        async beforeKey(facts) {
          assert.ok(!validationOriginal, 'CLAIM_V4_FACTS_VALIDATION_CANNOT_SIGN');
          const entry = originalNativeFactsEntry(binding);
          assert.ok(entry && entry.signature === null, 'CLAIM_V4_UNSIGNED_FACTS_REQUIRED');
          if (!unsignedEntry) unsignedEntry = freeze(copy(entry));
          equal(entry.facts, facts, 'CLAIM_V4_UNSIGNED_FACTS_CHANGED');
          await auditRound(true);
          const lease = Object.freeze(Object.create(null)), frame = encodeNativeClaimFacts(facts, selected(binding.claimDomain).policy);
          factsKeyLeases.set(lease, { custody, facts: freeze(copy(facts)), frame: frame.toString('hex'),
            assertRound, release: quiet.release, noteKeyUse() { activeKeyUsed = true; keyUseEpoch++; } });
          assertRound(); return lease;
        } };
      await auditRound();
      if (validationOriginal) {
        certificate = validationOriginal.certificate;
        assertOriginalPayoutFactsEntry(certificate, binding, validationOriginal);
      } else {
        // Complete records must never enter the peer's refresh/reissue path.
        assert.ok(!originalNativeFactsEntry(binding)?.signature, 'CLAIM_V4_PAYOUT_FACTS_ALREADY_CERTIFIED');
        quiet.release(); certificate = await peers.get(slot).certify(request);
        if (!record.data.wrappedFactsHistory.some(item => item.claimDomain === binding.claimDomain && item.certificate.digest === certificate.digest)) {
          assert.ok(record.data.wrappedFactsHistory.length < 2048, 'WRAPPED_CLAIM_FACT_HISTORY_SATURATED');
          const next = copy(record.data); next.wrappedFactsHistory.push({ claimDomain: binding.claimDomain, request: copy(request), certificate: copy(certificate) });
          await save(next);
        }
        await auditRound(true);
      }
      const entry = assertOriginalPayoutFactsEntry(certificate, binding, validationOriginal);
      const originalFacts = validationOriginal ?? freeze({ request, certificate: copy(certificate), head,
        entry: copy(entry), inventoryCommitment });
      originalPayoutFacts.set(canonical(request), originalFacts);
      const result = freeze({ certificate: copy(certificate), head, inventoryCommitment });
      assertRound(); return result;
    }, expectedHead ?? validationOriginal?.head, quorumPermit);
  }
  async function certify(raw, expectedHead, anchor, quorumPermit = null) {
    const request = claimFactsRequest(raw);
    if (custody && payoutFactsBinding(request)) return payoutFactsV4(request, expectedHead, anchor, null, quorumPermit);
    return serial(async () => {
      if (anchor) { assert.ok(factsAnchors.has(anchor), 'CLAIM_PRIVATE_FACTS_ANCHOR'); activeFactsAnchor = anchor; }
      const binding = findBinding(request); assertReconciledCoverage(await audit({ allowObservedDebt: true }));
      // The facts key hook audits after durable unsigned peer staging; reuse
      // takes only the independent final return audit below.
      if (custody) await current(); else await jointCurrent();
      const row = original(binding), peer = peers.get(peerKey(binding.claimDomain, row.route));
      activeFactSigning = Object.freeze({request:copy(request)});
      const result = await peer.certify(request);
      const history = record.data.wrappedFactsHistory;
      if (!history.some(item => item.claimDomain === binding.claimDomain && item.certificate.digest === result.digest)) {
        assert.ok(history.length < 2048, 'WRAPPED_CLAIM_FACT_HISTORY_SATURATED');
        const next = copy(record.data); next.wrappedFactsHistory.push({claimDomain:binding.claimDomain,request:copy(request),certificate:copy(result)}); await save(next);
      }
      activeFactSigning = null;
      assertCanonicalClaimReservation(binding, await observer.readReservation({ claimDomain: binding.claimDomain, admissionN: binding.admissionN }, activeView));
      await jointCurrent();
      return { certificate: result, head: copy(activeView.head) };
    }, expectedHead, quorumPermit);
  }
  async function health(raw, expectedHead, original = null, quorumPermit = null) {
    const request = copy(raw); exactRecord(request, ['claimDomain', 'mode']);
    assert.ok(['ingress', 'debt'].includes(request.mode), 'CLAIM_HEALTH_MODE');
    return serial(async () => {
      const prepare = async () => {
        const { gateway } = selected(request.claimDomain), report = await audit({ allowObservedDebt: request.mode === 'debt' });
        assertReconciledCoverage(report);
        assertClaimHealthState(gateway, { allocateIngress: request.mode === 'ingress' });
        const message = { ...copy(gateway.healthState), validFrom: activeView.head.timestamp,
          validUntil: (claimUint(activeView.head.timestamp) + 30n).toString() };
        return { kind: 'health', message, inventoryCommitment: appendClaimInventoryAudit(copy(record.data), activeView.head, report.inventories) };
      };
      if (custody && request.mode === 'debt') return signedV4(prepare, original, request);
      const { message } = await prepare(); return signed('health', message, encodeFlatNativeHealth(message), original);
    }, expectedHead, quorumPermit);
  }
  const authorizeIngress = (raw, expectedHead, quorumPermit = null) => authorizePrepared(raw, true, expectedHead, null, quorumPermit);
  const authorizePayout = (raw, expectedHead, original = null, quorumPermit = null) => authorizePrepared(raw, false, expectedHead, original, quorumPermit);
  async function authorizeIngressBroadcast(raw, expectedHead, quorumPermit = null) {
    const request = copy(raw);
    exactRecord(request, ['claimDomain', 'intentId', 'prepared', 'wireSalt', 'nativeId']);
    return serial(async () => {
      const { config, native } = selected(request.claimDomain);
      assert.equal(native.nonceIngressProfile, 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3', 'CLAIM_OWNED_INGRESS_V3_RUNTIME');
      assertNonceIngressDeployment(bound.system);
      const binding = record.data.bindings.find(b => b.claimDomain === request.claimDomain && b.operationId === request.intentId && b.ingress);
      assert.ok(binding, 'CLAIM_INGRESS_BROADCAST_ORIGINAL_BINDING');
      validateClaimReservationBinding(binding);
      assert.equal(binding.request.nativeId, request.nativeId, 'CLAIM_INGRESS_BROADCAST_ID');
      assert.equal(binding.wireSalt, request.wireSalt, 'CLAIM_INGRESS_BROADCAST_SALT');
      const preparedReads = nativeReads.get(request.claimDomain);
      let ownInventory;
      jointProjection = async report => {
        assertProspectiveIngressCoverage({financials:report.financials,gateways:activeView.gateways,binding});
        await preparedReads.assertPreparedIngress({asset:config.nativeAsset,prepared:request.prepared});
        await observer.assertUnrevoked({claimDomain:binding.claimDomain,nativeGid:binding.nativeGid},activeView); await current();
      };
      const result = await auditIngressBroadcastOperator({ config, roles: native.roles,
        infrastructure: native.nonceInfrastructureByAuthority, signerIndex, now: () => performance.now(),
        async readCurrentView() { return activeView; },
        async readOriginalPreparation() {
          const retained = record.data.nativePreparations.find(p => p.claimDomain === request.claimDomain
            && p.operationId === request.intentId && p.ingress);
          assert.ok(retained, 'CLAIM_INGRESS_BROADCAST_ORIGINAL_PREPARATION');
          assert.equal(retained.wireSalt, binding.wireSalt, 'CLAIM_INGRESS_BROADCAST_RETAINED_SALT');
          assert.equal(retained.revision, binding.revision, 'CLAIM_INGRESS_BROADCAST_RETAINED_REVISION');
          return { prepared: retained.prepared, binding };
        },
        async readOriginalNative() {
          ownInventory = await nativeReads.get(request.claimDomain).inventory();
          const row = original(binding);
          return { original: row, signingUnresolved: ownInventory.signingUnresolved,
            externalSubmissionObserved: row.externalSubmissionObserved };
        },
        assertPrepared: prepared => preparedReads.assertPreparedIngress({ asset: config.nativeAsset, prepared }),
        readReservation: (b, view) => observer.readReservation({ claimDomain: b.claimDomain, admissionN: b.admissionN }, view),
        assertUnrevoked: (b, view) => observer.assertUnrevoked({ claimDomain: b.claimDomain, nativeGid: b.nativeGid }, view),
        readExactSignature: b => nativeReads.get(b.claimDomain).observeReservedIngress({ asset: config.nativeAsset, nativeId: b.request.nativeId }),
        async readCurrentNonce() { return ownInventory.nonceInfrastructureByAuthority.depositor.nonceAccount.durableNonce; },
        auditEntireSystem: options => audit(options),
        scope(domain) {
          const scope = selected(domain);
          return { config: scope.config, roles: scope.native.roles, bootstrapPins: scope.native.nonceInfrastructureByAuthority,
            auditUnchangedBitcoinInventory: inventory => auditClaimNativeInventory(inventory, scope.config, scope.native.roles) };
        },
        retainInventoryAudit, async assertCurrent(view) { equal(view, activeView); await jointCurrent(); },
        assertLive: live, signIngressBroadcast: (message, frame) => signed('broadcast-ingress-v3', message, frame),
      }, { binding, prepared: request.prepared }, expectedHead ?? activeView.head);
      return freeze({ ...result.signed, head: result.head });
    }, expectedHead, quorumPermit);
  }
  async function authorizeBroadcast(raw, expectedHead, originalAuthorization = null, bitcoin = false, quorumPermit = null) {
    const request = copy(raw);
    exactRecord(request, ['claimDomain', 'ticketId', 'prepared', 'route', 'wireSalt', 'nativeId']);
    return serial(async () => {
      if (bitcoin && !originalAuthorization) assert.ok(!record.data.authorizations.some(item => item.kind === 'broadcast-bitcoin-payout-v1'
        && item.message.claimDomain === request.claimDomain && item.message.ticketId === request.ticketId),
        'CLAIM_BITCOIN_BROADCAST_ALREADY_AUTHORIZED');
      if (custody) return signedV4(async () => {
      const { config, native, gateway } = selected(request.claimDomain);
      if (bitcoin) {
        assert.equal(config.nativeFamily, '1', 'CLAIM_BITCOIN_BROADCAST_BTC_ONLY');
        assert.ok(!Object.hasOwn(request.prepared.intent, 'nonceAccountPublicKey'), 'CLAIM_BITCOIN_BROADCAST_PROFILE');
      } else {
        assert.equal(config.nativeFamily, '2', 'CLAIM_NONCE_BROADCAST_SOL_ONLY');
        assert.ok(Object.hasOwn(request.prepared.intent, 'nonceAccountPublicKey'), 'CLAIM_NONCE_BROADCAST_PROFILE');
      }
      const binding = record.data.bindings.find(item => item.claimDomain === request.claimDomain
        && item.operationId === request.ticketId && !item.ingress);
      assert.ok(binding, 'CLAIM_BROADCAST_ORIGINAL_BINDING');
      validateClaimReservationBinding(binding);
      assert.equal(binding.request.nativeId, request.nativeId, 'CLAIM_BROADCAST_ORIGINAL_ID');
      assert.equal(binding.wireSalt, request.wireSalt, 'CLAIM_BROADCAST_ORIGINAL_SALT');
      equal(binding.intent, request.prepared.intent, 'CLAIM_BROADCAST_ORIGINAL_INTENT');
      const originalRecord = original(binding);
      assert.equal(originalRecord.phase, 'SIGNED_NOT_BROADCAST', 'CLAIM_BROADCAST_ORIGINAL_PHASE');
      assert.equal(originalRecord.broadcastAttempts, 0, 'CLAIM_BROADCAST_ALREADY_ATTEMPTED');
      const retained = record.data.nativePreparations.find(item => item.claimDomain === request.claimDomain
        && item.operationId === request.ticketId && !item.ingress);
      assert.ok(retained, 'CLAIM_BROADCAST_ORIGINAL_PREPARATION');
      equal(retained.prepared, request.prepared, 'CLAIM_BROADCAST_PREPARATION_CHANGED');
      equal(retained.route, request.route, 'CLAIM_BROADCAST_ROUTE_CHANGED');
      const ticket = gateway.tickets.find(item => item.ticket.id === request.ticketId)?.ticket;
      assert.ok(ticket, 'CLAIM_BROADCAST_CANONICAL_TICKET');
      const assertPrepared = () => nativeReads.get(request.claimDomain).assertPreparedPayout({
        asset: config.nativeAsset, route: ticket.kind === '2' ? 'refund' : 'redeem', prepared: request.prepared });
      await assertPrepared();
      assertClaimHealthState(gateway);
      const terms = auditClaimPayoutPreparation({ gateway, config, ticketId: request.ticketId,
        prepared: request.prepared, route: request.route, wireSalt: request.wireSalt, roles: native.roles });
      const reservation = assertCanonicalClaimReservation(binding, await observer.readReservation({
        claimDomain: binding.claimDomain, admissionN: binding.admissionN }, activeView));
      assert.equal(reservation.consumed, false, 'CLAIM_BROADCAST_RESERVATION_CONSUMED');
      await observer.assertUnrevoked({ claimDomain: binding.claimDomain, nativeGid: binding.nativeGid }, activeView);
      // Only this exact signed-but-unsent wire may bypass native observation.
      // Its full amount remains a liability and receives no delivered credit.
      const report = await audit({ staged: binding });
      assertReconciledCoverage(report);
      assert.ok(report.financials.every(item => item.dischargedCredit === '0'
        && item.dischargedFeeCredit === '0'), 'CLAIM_BROADCAST_NO_DELIVERY_CREDIT');
      assertClaimRoute({ config, claimDomain: gateway.claimDomain, amount: ticket.amount,
        destinationCommitment: ticket.destinationCommitment, maxFee: ticket.maxFee, route: request.route,
        inventory: report.inventories.find(item => item.claimDomain === request.claimDomain).inventory,
        roles: native.roles, prepared: request.prepared });
      const inventoryCommitment = await retainInventoryAudit(report);
      const message = { claimDomain: request.claimDomain, ticketId: request.ticketId, revision: '1',
        claimSequence: gateway.claimSequence, hubStateSequence: activeView.hubStateSequence,
        amount: terms.amount, wireKeyCommitment: terms.wireKeyCommitment,
        unsignedWireCommitment: terms.unsignedWireCommitment, maxFee: ticket.maxFee,
        revocationState: gateway.revocationState, inventoryCommitment,
        obligationsCommitment: commitment('LIANUM/PAEG/native-claim-obligations/1', activeView.gateways),
        validFrom: activeView.head.timestamp, validUntil: (claimUint(activeView.head.timestamp) + 30n).toString(),
        admissionN: binding.admissionN, nativeGid: binding.nativeGid, wireBindingCommitment: binding.wireBindingCommitment };
      await assertPrepared();
      await observer.assertUnrevoked({ claimDomain: binding.claimDomain, nativeGid: binding.nativeGid }, activeView);
      await current(); return { kind: bitcoin ? 'broadcast-bitcoin-payout-v1' : 'broadcast-payout-v2', message };
      }, originalAuthorization, request);
      const { config, native, gateway } = selected(request.claimDomain);
      if (bitcoin) {
        assert.equal(config.nativeFamily, '1', 'CLAIM_BITCOIN_BROADCAST_BTC_ONLY');
        assert.ok(!Object.hasOwn(request.prepared.intent, 'nonceAccountPublicKey'), 'CLAIM_BITCOIN_BROADCAST_PROFILE');
      } else {
        assert.equal(config.nativeFamily, '2', 'CLAIM_NONCE_BROADCAST_SOL_ONLY');
        assert.ok(Object.hasOwn(request.prepared.intent, 'nonceAccountPublicKey'), 'CLAIM_NONCE_BROADCAST_PROFILE');
      }
      const binding = record.data.bindings.find(item => item.claimDomain === request.claimDomain
        && item.operationId === request.ticketId && !item.ingress);
      assert.ok(binding, 'CLAIM_BROADCAST_ORIGINAL_BINDING');
      validateClaimReservationBinding(binding);
      assert.equal(binding.request.nativeId, request.nativeId, 'CLAIM_BROADCAST_ORIGINAL_ID');
      assert.equal(binding.wireSalt, request.wireSalt, 'CLAIM_BROADCAST_ORIGINAL_SALT');
      equal(binding.intent, request.prepared.intent, 'CLAIM_BROADCAST_ORIGINAL_INTENT');
      const originalRecord = original(binding);
      assert.equal(originalRecord.phase, 'SIGNED_NOT_BROADCAST', 'CLAIM_BROADCAST_ORIGINAL_PHASE');
      assert.equal(originalRecord.broadcastAttempts, 0, 'CLAIM_BROADCAST_ALREADY_ATTEMPTED');
      const retained = record.data.nativePreparations.find(item => item.claimDomain === request.claimDomain
        && item.operationId === request.ticketId && !item.ingress);
      assert.ok(retained, 'CLAIM_BROADCAST_ORIGINAL_PREPARATION');
      equal(retained.prepared, request.prepared, 'CLAIM_BROADCAST_PREPARATION_CHANGED');
      equal(retained.route, request.route, 'CLAIM_BROADCAST_ROUTE_CHANGED');
      const ticket = gateway.tickets.find(item => item.ticket.id === request.ticketId)?.ticket;
      assert.ok(ticket, 'CLAIM_BROADCAST_CANONICAL_TICKET');
      const assertPrepared = () => nativeReads.get(request.claimDomain).assertPreparedPayout({
        asset: config.nativeAsset, route: ticket.kind === '2' ? 'refund' : 'redeem', prepared: request.prepared });
      await assertPrepared();
      assertClaimHealthState(gateway);
      const terms = auditClaimPayoutPreparation({ gateway, config, ticketId: request.ticketId,
        prepared: request.prepared, route: request.route, wireSalt: request.wireSalt, roles: native.roles });
      const reservation = assertCanonicalClaimReservation(binding, await observer.readReservation({
        claimDomain: binding.claimDomain, admissionN: binding.admissionN }, activeView));
      assert.equal(reservation.consumed, false, 'CLAIM_BROADCAST_RESERVATION_CONSUMED');
      await observer.assertUnrevoked({ claimDomain: binding.claimDomain, nativeGid: binding.nativeGid }, activeView);
      // Only this exact signed-but-unsent wire may bypass native observation.
      // Its full amount remains a liability and receives no delivered credit.
      const report = await audit({ staged: binding });
      assertReconciledCoverage(report);
      assert.ok(report.financials.every(item => item.dischargedCredit === '0'
        && item.dischargedFeeCredit === '0'), 'CLAIM_BROADCAST_NO_DELIVERY_CREDIT');
      assertClaimRoute({ config, claimDomain: gateway.claimDomain, amount: ticket.amount,
        destinationCommitment: ticket.destinationCommitment, maxFee: ticket.maxFee, route: request.route,
        inventory: report.inventories.find(item => item.claimDomain === request.claimDomain).inventory,
        roles: native.roles, prepared: request.prepared });
      const inventoryCommitment = await retainInventoryAudit(report);
      const message = { claimDomain: request.claimDomain, ticketId: request.ticketId, revision: '1',
        claimSequence: gateway.claimSequence, hubStateSequence: activeView.hubStateSequence,
        amount: terms.amount, wireKeyCommitment: terms.wireKeyCommitment,
        unsignedWireCommitment: terms.unsignedWireCommitment, maxFee: ticket.maxFee,
        revocationState: gateway.revocationState, inventoryCommitment,
        obligationsCommitment: commitment('LIANUM/PAEG/native-claim-obligations/1', activeView.gateways),
        validFrom: activeView.head.timestamp, validUntil: (claimUint(activeView.head.timestamp) + 30n).toString(),
        admissionN: binding.admissionN, nativeGid: binding.nativeGid, wireBindingCommitment: binding.wireBindingCommitment };
      const result = await signed(bitcoin ? 'broadcast-bitcoin-payout-v1' : 'broadcast-payout-v2', message,
        (bitcoin ? claimBitcoinPayoutBroadcastFrame : claimPayoutBroadcastFrame)(message));
      await assertPrepared();
      await observer.assertUnrevoked({ claimDomain: binding.claimDomain, nativeGid: binding.nativeGid }, activeView);
      await current(); return result;
    }, expectedHead, quorumPermit);
  }
  async function authorizePrepared(raw, ingress, expectedHead, originalAuthorization = null, quorumPermit = null) {
    const request = copy(raw);
    exactRecord(request, ['claimDomain', ingress ? 'intentId' : 'ticketId', 'prepared', 'wireSalt', ...(!ingress ? ['route'] : [])]);
    return serial(async () => {
      if (custody && !ingress) return signedV4(async () => {
      const { config, native, gateway } = selected(request.claimDomain);
      const operationId = ingress ? request.intentId : request.ticketId;
      const ticket = !ingress ? gateway.tickets.find(row => row.ticket.id === operationId)?.ticket : null;
      assert.ok(ingress || ticket, 'CLAIM_PRESIGN_CANONICAL_TICKET');
      const adapter = native.adapter({ asset: config.nativeAsset, route: ingress ? 'deposit' : ticket.kind === '2' ? 'refund' : 'redeem' });
      // Every payout assertion joins the original-node FIFO with full native
      // inventory and reciprocal graph observations. Ingress behavior is fixed.
      const assertPrepared = !ingress
        ? () => nativeReads.get(request.claimDomain).assertPreparedPayout({ asset: config.nativeAsset,
          route: ticket.kind === '2' ? 'refund' : 'redeem', prepared: request.prepared })
        : native.nonceIngressProfile === 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3'
          ? () => nativeReads.get(request.claimDomain).assertPreparedIngress({ asset: config.nativeAsset, prepared: request.prepared })
          : () => adapter.assertPrepared(request.prepared);
      await assertPrepared();
      assertClaimHealthState(gateway, { allocateIngress: ingress });
      const terms = ingress ? auditClaimIngressPreparation({ gateway, config, intentId: operationId, prepared: request.prepared,
        wireSalt: request.wireSalt, roles: native.roles, timestamp: activeView.head.timestamp, infrastructure: native.nonceInfrastructureByAuthority })
        : auditClaimPayoutPreparation({ gateway, config, ticketId: operationId, prepared: request.prepared, route: request.route,
          wireSalt: request.wireSalt, roles: native.roles });
      assert.ok(!record.data.bindings.some(b => b.claimDomain === request.claimDomain && b.operationId === operationId), 'CLAIM_NATIVE_EFFECT_ALREADY_SIGNED');
      const previous = record.data.nativePreparations.find(p => p.claimDomain === request.claimDomain && p.operationId === operationId);
      const preparation = { claimDomain: request.claimDomain, operationId, ingress, prepared: request.prepared,
        route: request.route ?? null, wireSalt: request.wireSalt, revision: terms.revision, unsignedWireCommitment: terms.unsignedWireCommitment };
      if (previous) equal(previous, preparation, 'CLAIM_ORIGINAL_UNSIGNED_WIRE_CHANGED');
      else assert.ok(!record.data.nativePreparations.some(p => p.wireSalt === request.wireSalt)
        && !record.data.bindings.some(b => b.wireSalt === request.wireSalt), 'CLAIM_WIRE_SALT_REUSE');
      const report = await audit();
      if (!ingress) assertClaimRoute({ config, claimDomain: gateway.claimDomain, amount: ticket.amount,
        destinationCommitment: ticket.destinationCommitment, maxFee: ticket.maxFee, route: request.route,
        inventory: report.inventories.find(row => row.claimDomain === request.claimDomain).inventory, roles: native.roles, prepared: request.prepared });
      for (const funds of report.financials) {
        const g = activeView.gateways.find(row => row.claimDomain === funds.claimDomain);
        const selectedDomain = funds.claimDomain === request.claimDomain;
        assert.equal(g.activePayout, !ingress && selectedDomain ? operationId : ZERO, 'CLAIM_PRESIGN_OUTGOING_FENCE');
        const exactIncoming = ingress && selectedDomain ? claimUint(terms.amount) : 0n;
        assert.ok(u(funds.nativePrincipalAvailable) + exactIncoming >= u(funds.liabilities), 'CLAIM_PRESIGN_EXISTING_PRINCIPAL_DEFICIT');
        assert.ok(u(funds.feeReserveAvailable) >= u(funds.reservedFees), 'CLAIM_PRESIGN_FEE_RESERVE_DEFICIT');
        if (!ingress && selectedDomain) {
          assert.ok(u(funds.nativePrincipalAvailable) >= claimUint(terms.amount)
            && u(funds.nativePrincipalAvailable) - claimUint(terms.amount) >= u(funds.liabilities) - claimUint(terms.amount), 'CLAIM_PRESIGN_PROJECTED_PRINCIPAL');
          assert.ok(u(funds.feeReserveAvailable) >= claimUint(terms.actualPreparedFee)
            && u(funds.feeReserveAvailable) - claimUint(terms.actualPreparedFee) >= u(funds.reservedFees) - claimUint(terms.maxFee), 'CLAIM_PRESIGN_PROJECTED_FEES');
        }
      }
      await assertPrepared(); await current();
      if (!previous) {
        const next = copy(record.data); next.nativePreparations.push(preparation); await save(next);
      }
      const inventoryCommitment = await retainInventoryAudit(report);
      const message = { claimDomain: request.claimDomain, [ingress ? 'intentId' : 'ticketId']: operationId, revision: terms.revision,
        claimSequence: gateway.claimSequence, hubStateSequence: activeView.hubStateSequence, amount: terms.amount,
        wireKeyCommitment: terms.wireKeyCommitment, unsignedWireCommitment: terms.unsignedWireCommitment,
        maxFee: terms.maxFee, revocationState: gateway.revocationState, inventoryCommitment,
        obligationsCommitment: commitment('LIANUM/PAEG/native-claim-obligations/1', activeView.gateways),
        validFrom: activeView.head.timestamp, validUntil: (claimUint(activeView.head.timestamp) + 30n).toString() };
      await assertPrepared(); await current();
      return { kind: 'presign-payout', message };
      }, originalAuthorization, request);
      const { config, native, gateway } = selected(request.claimDomain);
      const operationId = ingress ? request.intentId : request.ticketId;
      const ticket = !ingress ? gateway.tickets.find(row => row.ticket.id === operationId)?.ticket : null;
      assert.ok(ingress || ticket, 'CLAIM_PRESIGN_CANONICAL_TICKET');
      const adapter = native.adapter({ asset: config.nativeAsset, route: ingress ? 'deposit' : ticket.kind === '2' ? 'refund' : 'redeem' });
      // Every payout assertion joins the original-node FIFO with full native
      // inventory and reciprocal graph observations. Ingress behavior is fixed.
      const assertPrepared = !ingress
        ? () => nativeReads.get(request.claimDomain).assertPreparedPayout({ asset: config.nativeAsset,
          route: ticket.kind === '2' ? 'refund' : 'redeem', prepared: request.prepared })
        : native.nonceIngressProfile === 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3'
          ? () => nativeReads.get(request.claimDomain).assertPreparedIngress({ asset: config.nativeAsset, prepared: request.prepared })
          : () => adapter.assertPrepared(request.prepared);
      await assertPrepared();
      assertClaimHealthState(gateway, { allocateIngress: ingress });
      const terms = ingress ? auditClaimIngressPreparation({ gateway, config, intentId: operationId, prepared: request.prepared,
        wireSalt: request.wireSalt, roles: native.roles, timestamp: activeView.head.timestamp, infrastructure: native.nonceInfrastructureByAuthority })
        : auditClaimPayoutPreparation({ gateway, config, ticketId: operationId, prepared: request.prepared, route: request.route,
          wireSalt: request.wireSalt, roles: native.roles });
      assert.ok(!record.data.bindings.some(b => b.claimDomain === request.claimDomain && b.operationId === operationId), 'CLAIM_NATIVE_EFFECT_ALREADY_SIGNED');
      const previous = record.data.nativePreparations.find(p => p.claimDomain === request.claimDomain && p.operationId === operationId);
      const preparation = { claimDomain: request.claimDomain, operationId, ingress, prepared: request.prepared,
        route: request.route ?? null, wireSalt: request.wireSalt, revision: terms.revision, unsignedWireCommitment: terms.unsignedWireCommitment };
      if (previous) equal(previous, preparation, 'CLAIM_ORIGINAL_UNSIGNED_WIRE_CHANGED');
      else assert.ok(!record.data.nativePreparations.some(p => p.wireSalt === request.wireSalt)
        && !record.data.bindings.some(b => b.wireSalt === request.wireSalt), 'CLAIM_WIRE_SALT_REUSE');
      const report = await audit();
      if (!ingress) assertClaimRoute({ config, claimDomain: gateway.claimDomain, amount: ticket.amount,
        destinationCommitment: ticket.destinationCommitment, maxFee: ticket.maxFee, route: request.route,
        inventory: report.inventories.find(row => row.claimDomain === request.claimDomain).inventory, roles: native.roles, prepared: request.prepared });
      jointProjection = async fresh => {
      for (const funds of fresh.financials) {
        const g = activeView.gateways.find(row => row.claimDomain === funds.claimDomain);
        const selectedDomain = funds.claimDomain === request.claimDomain;
        assert.equal(g.activePayout, !ingress && selectedDomain ? operationId : ZERO, 'CLAIM_PRESIGN_OUTGOING_FENCE');
        const exactIncoming = ingress && selectedDomain ? claimUint(terms.amount) : 0n;
        assert.ok(u(funds.nativePrincipalAvailable) + exactIncoming >= u(funds.liabilities), 'CLAIM_PRESIGN_EXISTING_PRINCIPAL_DEFICIT');
        assert.ok(u(funds.feeReserveAvailable) >= u(funds.reservedFees), 'CLAIM_PRESIGN_FEE_RESERVE_DEFICIT');
        if (!ingress && selectedDomain) {
          assert.ok(u(funds.nativePrincipalAvailable) >= claimUint(terms.amount)
            && u(funds.nativePrincipalAvailable) - claimUint(terms.amount) >= u(funds.liabilities) - claimUint(terms.amount), 'CLAIM_PRESIGN_PROJECTED_PRINCIPAL');
          assert.ok(u(funds.feeReserveAvailable) >= claimUint(terms.actualPreparedFee)
            && u(funds.feeReserveAvailable) - claimUint(terms.actualPreparedFee) >= u(funds.reservedFees) - claimUint(terms.maxFee), 'CLAIM_PRESIGN_PROJECTED_FEES');
        }
      }
        await assertPrepared(); await current();
      };
      await jointProjection(report);
      await assertPrepared(); await current();
      if (!previous) {
        const next = copy(record.data); next.nativePreparations.push(preparation); await save(next);
      }
      const inventoryCommitment = await retainInventoryAudit(report);
      const message = { claimDomain: request.claimDomain, [ingress ? 'intentId' : 'ticketId']: operationId, revision: terms.revision,
        claimSequence: gateway.claimSequence, hubStateSequence: activeView.hubStateSequence, amount: terms.amount,
        wireKeyCommitment: terms.wireKeyCommitment, unsignedWireCommitment: terms.unsignedWireCommitment,
        maxFee: terms.maxFee, revocationState: gateway.revocationState, inventoryCommitment,
        obligationsCommitment: commitment('LIANUM/PAEG/native-claim-obligations/1', activeView.gateways),
        validFrom: activeView.head.timestamp, validUntil: (claimUint(activeView.head.timestamp) + 30n).toString() };
      const result = await signed(ingress ? 'presign-ingress' : 'presign-payout', message,
        ingress ? claimIngressAuthorizationFrame(message) : claimPayoutAuthorizationFrame(message));
      await assertPrepared(); await current(); return result;
    }, expectedHead, quorumPermit);
  }
  async function backing(raw, reservationOnly = false, expectedHead, original = null, quorumPermit = null) {
    const request = copy(raw); exactRecord(request, ['claimDomain', 'terms', 'route', 'ownerAuthorization', ...(Object.hasOwn(request, 'prepared') ? ['prepared'] : [])]);
    claimActionFrame(request.claimDomain, request.terms);
    return serial(async () => {
      if (custody && [A.REDEEM, A.BEGIN_PAYOUT, A.RESERVE_PAYOUT].includes(request.terms.action)) return signedV4(async () => {
      const { config, native, gateway } = selected(request.claimDomain), terms = request.terms;
      let assertPrepared;
      if (Object.hasOwn(request, 'prepared')) {
        assert.equal(terms.action, A.BEGIN_PAYOUT, 'CLAIM_PREPARED_ONLY_FOR_BEGIN_PAYOUT');
        const ticket = gateway.tickets.find(row => row.ticket.id === terms.operationId)?.ticket;
        assert.ok(ticket, 'CLAIM_PREPARED_CANONICAL_TICKET');
        assertPrepared = () => nativeReads.get(request.claimDomain).assertPreparedPayout({
          asset: config.nativeAsset, route: ticket.kind === '2' ? 'refund' : 'redeem', prepared: request.prepared });
        await assertPrepared();
        auditClaimPayoutPreparation({ gateway, config, ticketId: terms.operationId, prepared: request.prepared,
          route: request.route, roles: native.roles, requireSigning: false });
      }
      const reservation = [A.RESERVE_INGRESS, A.RESERVE_PAYOUT].includes(terms.action);
      assert.equal(reservation, reservationOnly, 'CLAIM_SCOPED_SIGNING_METHOD');
      const staged = reservation ? record.data.bindings.find(b => b.claimDomain === request.claimDomain && b.operationId === terms.operationId) : null;
      assert.ok(!reservation || staged, 'CLAIM_RESERVATION_HANDOFF_REQUIRED');
      if (staged) assert.equal(await observer.readReservation({ claimDomain: staged.claimDomain, admissionN: staged.admissionN }, activeView),
        null, 'CLAIM_RESERVATION_ALREADY_INCLUDED_RECONCILE_ORIGINAL');
      const report = await audit({ staged });
      const inventory = report.inventories.find(row => row.claimDomain === request.claimDomain).inventory;
      const funds = report.financials.find(row => row.claimDomain === request.claimDomain);
      const expected = validateAction({ request, gateway, config, native, inventory, staged, view: activeView });
      if (assertPrepared) await assertPrepared();
      if (terms.action === A.ISSUE) {
        const binding = record.data.bindings.find(b => b.claimDomain === request.claimDomain && b.operationId === terms.operationId);
        assert.ok(binding?.ingress, 'CLAIM_ISSUE_ORIGINAL_BINDING');
        assert.equal(terms.nullifier, binding.admissionN, 'CLAIM_ISSUE_N');
        assert.equal(terms.wireBindingCommitment, binding.wireBindingCommitment, 'CLAIM_ISSUE_ORIGINAL_WIRE_COMMITMENT');
      }
      for (const item of report.financials) {
        const g = activeView.gateways.find(row => row.claimDomain === item.claimDomain);
        const credit = item.claimDomain === request.claimDomain ? expected.incomingCredit : 0n;
        const added = item.claimDomain === request.claimDomain ? expected.liabilitiesAdded : 0n;
        assert.ok(u(item.nativePrincipalAvailable) + credit >= u(item.liabilities) + added, 'CLAIM_CURRENT_PRINCIPAL_DEFICIT');
        assert.ok(u(item.feeReserveAvailable) >= (item.claimDomain === request.claimDomain ? expected.reservedFeesAfter : u(g.reservedFees)), 'CLAIM_FEE_RESERVE_DEFICIT');
        assert.ok(g.activePayout === ZERO || (reservation && item.claimDomain === request.claimDomain && g.activePayout === staged.operationId), 'CLAIM_UNMATCHED_OUTGOING_FENCE');
      }
      const inventoryCommitment = await retainInventoryAudit(report);
      const message = { claimDomain: request.claimDomain, custodyInventoryDomain: config.custodyInventoryDomain,
        actionDigest: claimActionDigest(request.claimDomain, terms), expectedClaimSequence: gateway.claimSequence,
        hubStateSequence: activeView.hubStateSequence, revocationState: gateway.revocationState,
        wrapperSupply: gateway.wrapperSupply, pendingRedemptions: gateway.pendingRedemptions,
        pendingRefunds: gateway.pendingRefunds, heldUnissued: gateway.heldUnissued, unknownExposure: '0',
        nativePrincipalAvailable: funds.nativePrincipalAvailable, feeReserveAvailable: funds.feeReserveAvailable,
        reservedFeesAfter: expected.reservedFeesAfter.toString(),
        inventoryCommitment,
        obligationsCommitment: commitment('LIANUM/PAEG/native-claim-obligations/1', activeView.gateways),
        validFrom: activeView.head.timestamp, validUntil: (claimUint(activeView.head.timestamp) + 30n).toString() };
      const healthMessage = { ...copy(gateway.healthState), validFrom: message.validFrom, validUntil: message.validUntil };
      if (assertPrepared) await assertPrepared();
      return { kind: reservation ? 'reservation' : 'backing', message, healthMessage };
      }, original, request);
      const { config, native, gateway } = selected(request.claimDomain), terms = request.terms;
      let assertPrepared;
      if (Object.hasOwn(request, 'prepared')) {
        assert.equal(terms.action, A.BEGIN_PAYOUT, 'CLAIM_PREPARED_ONLY_FOR_BEGIN_PAYOUT');
        const ticket = gateway.tickets.find(row => row.ticket.id === terms.operationId)?.ticket;
        assert.ok(ticket, 'CLAIM_PREPARED_CANONICAL_TICKET');
        assertPrepared = () => nativeReads.get(request.claimDomain).assertPreparedPayout({
          asset: config.nativeAsset, route: ticket.kind === '2' ? 'refund' : 'redeem', prepared: request.prepared });
        await assertPrepared();
        auditClaimPayoutPreparation({ gateway, config, ticketId: terms.operationId, prepared: request.prepared,
          route: request.route, roles: native.roles, requireSigning: false });
      }
      const reservation = [A.RESERVE_INGRESS, A.RESERVE_PAYOUT].includes(terms.action);
      assert.equal(reservation, reservationOnly, 'CLAIM_SCOPED_SIGNING_METHOD');
      const staged = reservation ? record.data.bindings.find(b => b.claimDomain === request.claimDomain && b.operationId === terms.operationId) : null;
      assert.ok(!reservation || staged, 'CLAIM_RESERVATION_HANDOFF_REQUIRED');
      if (staged) assert.equal(await observer.readReservation({ claimDomain: staged.claimDomain, admissionN: staged.admissionN }, activeView),
        null, 'CLAIM_RESERVATION_ALREADY_INCLUDED_RECONCILE_ORIGINAL');
      const report = await audit({ staged });
      const inventory = report.inventories.find(row => row.claimDomain === request.claimDomain).inventory;
      const funds = report.financials.find(row => row.claimDomain === request.claimDomain);
      const expected = validateAction({ request, gateway, config, native, inventory, staged, view: activeView });
      if (assertPrepared) await assertPrepared();
      if (terms.action === A.ISSUE) {
        const binding = record.data.bindings.find(b => b.claimDomain === request.claimDomain && b.operationId === terms.operationId);
        assert.ok(binding?.ingress, 'CLAIM_ISSUE_ORIGINAL_BINDING');
        assert.equal(terms.nullifier, binding.admissionN, 'CLAIM_ISSUE_N');
        assert.equal(terms.wireBindingCommitment, binding.wireBindingCommitment, 'CLAIM_ISSUE_ORIGINAL_WIRE_COMMITMENT');
      }
      jointProjection = async fresh => {
        const freshInventory = fresh.inventories.find(row=>row.claimDomain===request.claimDomain).inventory;
        const freshExpected = validateAction({request,gateway,config,native,inventory:freshInventory,staged,view:activeView});
        equal(freshExpected,expected,'WRAPPED_ORIGINAL_ACTION_PROJECTION_CHANGED');
      for (const item of fresh.financials) {
        const g = activeView.gateways.find(row => row.claimDomain === item.claimDomain);
        const credit = item.claimDomain === request.claimDomain ? expected.incomingCredit : 0n;
        const added = item.claimDomain === request.claimDomain ? expected.liabilitiesAdded : 0n;
        assert.ok(u(item.nativePrincipalAvailable) + credit >= u(item.liabilities) + added, 'CLAIM_CURRENT_PRINCIPAL_DEFICIT');
        assert.ok(u(item.feeReserveAvailable) >= (item.claimDomain === request.claimDomain ? expected.reservedFeesAfter : u(g.reservedFees)), 'CLAIM_FEE_RESERVE_DEFICIT');
        assert.ok(g.activePayout === ZERO || (reservation && item.claimDomain === request.claimDomain && g.activePayout === staged.operationId), 'CLAIM_UNMATCHED_OUTGOING_FENCE');
      }
        if (assertPrepared) await assertPrepared(); await current();
      };
      await jointProjection(report);
      const inventoryCommitment = await retainInventoryAudit(report);
      const message = { claimDomain: request.claimDomain, custodyInventoryDomain: config.custodyInventoryDomain,
        actionDigest: claimActionDigest(request.claimDomain, terms), expectedClaimSequence: gateway.claimSequence,
        hubStateSequence: activeView.hubStateSequence, revocationState: gateway.revocationState,
        wrapperSupply: gateway.wrapperSupply, pendingRedemptions: gateway.pendingRedemptions,
        pendingRefunds: gateway.pendingRefunds, heldUnissued: gateway.heldUnissued, unknownExposure: '0',
        nativePrincipalAvailable: funds.nativePrincipalAvailable, feeReserveAvailable: funds.feeReserveAvailable,
        reservedFeesAfter: expected.reservedFeesAfter.toString(),
        inventoryCommitment,
        obligationsCommitment: commitment('LIANUM/PAEG/native-claim-obligations/1', activeView.gateways),
        validFrom: activeView.head.timestamp, validUntil: (claimUint(activeView.head.timestamp) + 30n).toString() };
      const healthMessage = { ...copy(gateway.healthState), validFrom: message.validFrom, validUntil: message.validUntil };
      const [permit, healthCertificate] = await signedPair(reservation ? 'reservation' : 'backing', message, healthMessage, original);
      if (assertPrepared) await assertPrepared();
      return freeze({ ...permit, healthCertificate });
    }, expectedHead, quorumPermit);
  }
  function assertReverseCoverageLiveV4() {
    assertV4Live();
    for (const state of captureV4NativeState()) {
      for (const flag of ['operationBusy', 'observationBusy', 'inventoryBusy'])
        assert.equal(state[flag], false, 'WRAPPED_CLAIM_NATIVE_OPERATION_IN_FLIGHT');
      assert.equal(state.activeRoute, null, 'WRAPPED_CLAIM_NATIVE_ACTIVE_ROUTE');
      assert.equal(state.activePrepared, null, 'WRAPPED_CLAIM_NATIVE_UNFINISHED_PREPARATION');
    }
    // Completed preparation records stay retained. Every one must match its
    // original binding; an abandoned unsigned preparation is never ignored.
    for (const row of record.data.nativePreparations) {
      const matches = record.data.bindings.filter(value => value.claimDomain === row.claimDomain && value.operationId === row.operationId);
      assert.equal(matches.length, 1, 'WRAPPED_CLAIM_UNFINISHED_PREPARATION');
      const binding = matches[0];
      assert.equal(row.ingress, binding.ingress, 'WRAPPED_CLAIM_PREPARATION_KIND_CHANGED');
      assert.equal(row.revision, binding.revision, 'WRAPPED_CLAIM_PREPARATION_REVISION_CHANGED');
      assert.equal(row.wireSalt, binding.wireSalt, 'WRAPPED_CLAIM_PREPARATION_SALT_CHANGED');
      equal(row.prepared.intent, binding.intent, 'WRAPPED_CLAIM_PREPARATION_INTENT_CHANGED');
    }
  }
  function reverseSourceStateV4() {
    ready(); assertReverseCoverageLiveV4();
    return freeze({ profile: 'WRAPPED_COMBINED_CLAIM_SOURCE_STATE_V4', operationGeneration,
      keyUseEpoch, combinedKeyUseEpoch: wrappedOperatorKeyUsesV1(custody), record: copy(record),
      nativeStates: captureV4NativeState(), evmFence: captureV4EvmFence() });
  }
  function assertReverseSourceCurrentV4(snapshot) {
    assert.equal(busy, false, 'WRAPPED_CLAIM_OPERATION_IN_FLIGHT'); assertReverseCoverageLiveV4();
    const current = reverseSourceStateV4();
    const identity = value => { const result = copy(value); delete result.nativeStates; return result; };
    equal(identity(current), identity(snapshot), 'WRAPPED_CLAIM_SOURCE_CHANGED');
    assertV4NativeProjection(snapshot.nativeStates, current.nativeStates);
  }
  if (custody) registerCombinedOperatorBranch(custody, 'claim', { busy: () => busy || quorumReservation !== null, operationBusyV4: () => busy, close: cleanup,
    initializationCredentials() {
      assert.ok(!closed && !poisoned && !busy && quorumReservation === null && vault && vaultOptions,
        'WRAPPED_CLAIM_INITIAL_CREDENTIALS_NOT_IDLE');
      return copy(vaultOptions);
    },
    async captureRecovery(){
      assert.ok(!closed&&!poisoned&&!busy&&quorumReservation===null&&vault&&pendingAuthorizations.size===0,'WRAPPED_CLAIM_RECOVERY_NOT_IDLE');
      const snapshot=await vault.read();assert.deepEqual(snapshot,record,'WRAPPED_RECOVERY_CLAIM_MEMORY_DURABLE_MISMATCH');
      return {options:copy(vaultOptions),snapshot,keyUseEpoch,operationGeneration,originalPayoutFacts:copy([...originalPayoutFacts.entries()])};
    },
    sourceStateV4: reverseSourceStateV4,
    assertSourceCurrentV4: assertReverseSourceCurrentV4,
    nativeStateV4: () => { ready(); assertReverseCoverageLiveV4(); return captureV4NativeState(); },
    quiesceNativeV4: () => quiesceOwnedOperatorNativeReads([...nativeReads.values()]),
    assertNativeQuiescenceV4: assertOwnedOperatorNativeReadsQuiescent,
    releaseNativeQuiescenceV4: releaseOwnedOperatorNativeReadQuiescence,
    coverageStateV4(ticket) {
      const snapshot = reverseCoverageStatesV4.get(ticket);
      assert.ok(snapshot, 'WRAPPED_CLAIM_ORIGINAL_COVERAGE_REQUIRED');
      reverseCoverageStatesV4.delete(ticket); return snapshot;
    },
    assertCoverageV4(expectedHead) {
      const ticket = Object.freeze(Object.create(null)); reverseCoverageTicketsV4.add(ticket);
      return serial(async () => {
        const report = await auditOwn(); assertReconciledCoverage(report);
        for (const gateway of activeView.gateways)
          assert.equal(gateway.activePayout, ZERO, 'COMBINED_OPERATOR_CLAIM_OUTGOING_FENCE');
        await current(); return ticket;
      }, expectedHead);
    },
    noteKeyUse() { live(); assert.ok(busy && activeView, 'COMBINED_OPERATOR_CLAIM_SIGNING_OPERATION_REQUIRED'); activeKeyUsed = true; },
    assertSigningCoverage: facts => activeV4Facts ? activeV4Facts.beforeKey(facts) : jointCurrent(),
    assertGraphBinding(binding) {
      ready(); assert.ok(binding.runtime === bound.runtime && binding.system === bound.system.flatSystem,
        'WRAPPED_COMBINED_EXACT_DEPLOYMENT');
      equal(binding.system.registry, bound.registry); equal(binding.system.custodyRegistration, bound.system.custodyRegistration);
    },
    assertCoverage: expectedHead => serial(async () => {
      const report = await auditOwn(); assertReconciledCoverage(report);
      for (const gateway of activeView.gateways)
        assert.equal(gateway.activePayout, ZERO, 'COMBINED_OPERATOR_CLAIM_OUTGOING_FENCE');
      await current();
    }, expectedHead),
  });
  operators.set(operator, {
    captureGraphNativeStateV4: () => captureCombinedGraphNativeStateV4(custody),
    quiesceGraphNativeV4: () => quiesceCombinedGraphNativeV4(custody),
    assertGraphNativeQuiescenceV4: token => assertCombinedGraphNativeQuiescenceV4(custody, token),
    releaseGraphNativeQuiescenceV4: token => releaseCombinedGraphNativeQuiescenceV4(custody, token),
    ready, assertV4Live, captureV4EvmFence, captureV4NativeState, nativeReadHandles: () => [...nativeReads.values()], supportsV4: Boolean(custody), get keyUseEpoch() { return keyUseEpoch; },
    poisonIfKeyUsed(epoch) { if (keyUseEpoch !== epoch) poison(); },
    assertV4ResultCurrent(result, evmFence, withNativeState = true, quorumPermit = null) {
      const retained = v4OperationResults.get(result);
      assert.ok(retained, 'CLAIM_V4_ISSUED_OPERATOR_RESULT_REQUIRED');
      assert.equal(busy, false, 'CLAIM_V4_SIGNER_OPERATION_IN_FLIGHT');
      assertCombinedOperatorIdle(custody, quorumPermit);
      assert.equal(retained.generation, operationGeneration, 'CLAIM_V4_SIGNER_GENERATION_CHANGED');
      assert.equal(retained.revision, record.revision, 'CLAIM_V4_SIGNER_JOURNAL_CHANGED');
      assert.equal(retained.keyUseEpoch, keyUseEpoch, 'CLAIM_V4_SIGNER_KEY_USE_CHANGED');
      assertCombinedGraphSourceCurrentV4(custody, retained.graphSource);
      if (withNativeState) assertV4NativeProjection(retained.nativeStates);
      assertGraphNativeProjectionV4(retained.graphNativeStates, captureCombinedGraphNativeStateV4(custody));
      assertV4Live(evmFence);
    },
    isPayoutFacts: request => Boolean(payoutFactsBinding(request)),
    validatePayoutFacts(originalResult, request, head, quorumPermit = null) {
      const prior = originalPayoutFacts.get(canonical(request));
      assert.ok(prior, 'CLAIM_V4_ORIGINAL_PAYOUT_FACTS_REQUIRED');
      equal(originalResult.certificate, prior.certificate, 'CLAIM_V4_ORIGINAL_PAYOUT_FACTS_CHANGED');
      equal(originalResult.head, prior.head, 'CLAIM_V4_ORIGINAL_PAYOUT_FACTS_HEAD');
      return payoutFactsV4(request, head, null, prior, quorumPermit);
    }, get observer() { return observer; }, get bound() { ready(); return bound; },
    certify, health, backing, authorizeIngress, authorizePayout, authorizeBroadcast,
    authorizeBitcoinBroadcast: (request, head, original = null, permit = null) => authorizeBroadcast(request, head, original, true, permit), authorizeIngressBroadcast,
    finalCoverage: (result, permit) => { const retained = completedCoverage.get(result); assert.ok(retained,'WRAPPED_FINAL_COVERAGE_ORIGINAL_RESULT'); completedCoverage.delete(result);
      return serial(async () => { jointAuditOptions = retained.options; jointProjection = retained.projection; await jointCurrent(); }, retained.head, permit); },
    useCount: () => wrappedOperatorKeyUsesV1(custody), poison,
    reserve(permit) { ready(); assert.ok(!busy && quorumReservation === null); reserveWrappedOperatorV1(custody,'claim',permit); quorumReservation=permit; },
    release(permit) { assert.ok(!busy && quorumReservation===permit); releaseWrappedOperatorV1(custody,'claim',permit); quorumReservation=null; },

  });
  return Object.freeze(operator);
}

function validateAction({ request, gateway: g, config, native, inventory, staged, view }) {
  const t = request.terms, action = t.action;
  assert.equal(t.claimSequence, g.claimSequence, 'CLAIM_ACTION_SEQUENCE');
  assert.equal(t.hubSequence, view.hubStateSequence, 'CLAIM_ACTION_HUB_SEQUENCE');
  assert.ok(![A.RENEW, A.VOID].includes(action), 'CLAIM_ACTION_HAS_NO_BACKING_SIGNATURE');
  let fees = u(g.reservedFees), credit = 0n, added = 0n;
  if ([A.PREPOSITION, A.RESERVE_INGRESS, A.ISSUE].includes(action)) assertClaimHealthState(g, { allocateIngress: true });
  if (action === A.PREPOSITION) {
    assert.ok(g.intents.length < 16 && g.tickets.length + Number(g.reservedRefundTickets) < 32, 'CLAIM_NEW_INTENT_LIFETIME_CAPACITY');
    const owner = request.ownerAuthorization; exactRecord(owner, ['statement', 'proof']);
    const s = owner.statement; exactRecord(s, ['scope', 'policy', 'validFrom', 'validUntil', 'amount', 'output']);
    assert.equal(s.scope, config.scope); assert.equal(s.policy, config.policy);
    assert.equal(t.operationId, claimIntentId({ claimDomain: g.claimDomain, outputQ: s.output, amount: s.amount }));
    assert.ok(!g.intents.some(row => row.id === t.operationId), 'CLAIM_INTENT_ALREADY_EXISTS');
    assert.equal(t.revision, '1'); assert.equal(t.amount, s.amount); assert.equal(t.destinationCommitment, config.escrowEndpointCommitment);
    assert.equal(t.maxFee, config.refundMaxFee);
    assert.ok(claimUint(s.validFrom) <= claimUint(view.head.timestamp) && claimUint(view.head.timestamp) < claimUint(s.validUntil), 'CLAIM_OWNER_WINDOW');
    assert.ok(typeof owner.proof === 'string' && /^(?:[0-9a-f]{2})+$/.test(owner.proof), 'CLAIM_OWNER_PROOF_BYTES');
    const ownerBytes = Buffer.concat([Buffer.from(s.scope, 'hex'), Buffer.from(s.policy, 'hex'),
      ...[s.validFrom, s.validUntil, s.amount].map(value => Buffer.from(claimUint(value).toString(16).padStart(64, '0'), 'hex')),
      Buffer.from(bytes32(s.output, true), 'hex'), Buffer.from(claimHash(Buffer.from(owner.proof, 'hex')), 'hex')]);
    assert.equal(t.routeCommitment, claimHash(ownerBytes), 'CLAIM_OWNER_EXACT_AUTHORIZATION');
    fees += claimUint(config.refundMaxFee); credit = claimUint(t.amount); added = credit;
  } else if ([A.RESERVE_INGRESS, A.ISSUE].includes(action)) {
    const intent = g.intents.find(row => row.id === t.operationId); assert.equal(intent?.state, '1', 'CLAIM_CURRENT_INTENT');
    assert.equal(t.revision, intent.revision); assert.equal(t.amount, intent.amount); assert.equal(t.maxFee, config.refundMaxFee);
    if (action === A.ISSUE) { assert.equal(t.nullifier, intent.nullifier); assert.equal(t.destinationCommitment, intent.refundDestination);
      bytes32(t.routeCommitment, true); fees -= claimUint(config.refundMaxFee); }
    else { assert.equal(intent.nullifier, ZERO, 'CLAIM_INGRESS_ALREADY_RESERVED'); credit = claimUint(intent.amount); }
  } else {
    assert.ok([A.REDEEM, A.BEGIN_PAYOUT, A.RESERVE_PAYOUT].includes(action), 'CLAIM_ACTION_UNSUPPORTED');
    assert.equal(t.revision, '1');
    if (action !== A.REDEEM) {
      const row = g.tickets.find(item => item.ticket.id === t.operationId); assert.equal(row?.state, action === A.BEGIN_PAYOUT ? '1' : '2', 'CLAIM_CURRENT_TICKET');
      for (const field of ['amount', 'destinationCommitment', 'maxFee']) assert.equal(t[field], row.ticket[field], 'CLAIM_TICKET_TERMS');
      if (action === A.RESERVE_PAYOUT) assert.equal(t.routeCommitment, row.payoutRouteCommitment, 'CLAIM_PAYOUT_ROUTE');
    } else {
      assert.ok(g.tickets.length + Number(g.reservedRefundTickets) < 32, 'CLAIM_REDEMPTION_LIFETIME_CAPACITY');
      assert.equal(t.operationId, claimTicketId({ claimDomain: g.claimDomain, kind: '1', nonce: g.nextTicketNonce }), 'CLAIM_NEXT_TICKET_ID');
      assert.match(t.wireBindingCommitment, /^0{24}[0-9a-f]{40}$/, 'CLAIM_REDEMPTION_CALLER');
      assert.notEqual(t.wireBindingCommitment, ZERO); fees += claimUint(t.maxFee);
    }
    if (action !== A.RESERVE_PAYOUT) {
      assertClaimRoute({ config, claimDomain: g.claimDomain, amount: t.amount, destinationCommitment: t.destinationCommitment,
        maxFee: t.maxFee, route: request.route, inventory, roles: native.roles, prepared: request.prepared ?? null });
      assert.equal(t.routeCommitment, claimRouteCommitment(request.route));
    }
  }
  if (staged) {
    assert.equal(t.nullifier, staged.admissionN); assert.equal(t.wireBindingCommitment, staged.wireBindingCommitment);
    assert.equal(t.revision, staged.revision);
    if (staged.ingress) {
      assertClaimRoute({ config, claimDomain: g.claimDomain, amount: t.amount, destinationCommitment: t.destinationCommitment,
        maxFee: t.maxFee, route: request.route, inventory, roles: native.roles });
      assert.equal(request.route.endpoint, config.nativeFamily === '1' ? staged.intent.sourceScript : staged.intent.sourcePublicKey,
        'CLAIM_REFUND_ORIGINAL_SOURCE');
    } else {
      assert.equal(g.activePayout, staged.operationId);
      assert.equal(config.nativeFamily === '1' ? staged.intent.recipientScript : staged.intent.recipientPublicKey,
        request.route.endpoint, 'CLAIM_PAYOUT_EXACT_DESTINATION');
      assert.equal(t.routeCommitment, claimRouteCommitment(request.route));
      const fee = inventory.feeAudit.transfers.find(row => row.nativeId === staged.request.nativeId).preparedFee;
      assert.ok(claimUint(fee) <= claimUint(t.maxFee), 'CLAIM_PAYOUT_ACTUAL_FEE_BOUND');
      assert.equal(fee, request.route.quotedFee, 'CLAIM_PAYOUT_EXACT_PREPARED_FEE');
      if (config.nativeFamily === '1') assert.equal(staged.intent.sourceSatoshi, request.route.selectedInputValue, 'CLAIM_PAYOUT_EXACT_INPUT');
    }
  }
  if (action !== A.PREPOSITION) assert.equal(request.ownerAuthorization, null, 'CLAIM_UNEXPECTED_OWNER_AUTHORIZATION');
  if (![A.RESERVE_INGRESS, A.ISSUE, A.RESERVE_PAYOUT].includes(action)) assert.equal(t.nullifier, ZERO);
  if (![A.REDEEM, A.RESERVE_INGRESS, A.RESERVE_PAYOUT, A.ISSUE].includes(action)) assert.equal(t.wireBindingCommitment, ZERO);
  if (action === A.RESERVE_INGRESS) assert.equal(t.routeCommitment, ZERO);
  return { reservedFeesAfter: fees, incomingCredit: credit, liabilitiesAdded: added };
}

/** Only signedV4 can mint this private key lease. The fixed combined bridge
 * constructs the exact codec first, then consumes here immediately before its
 * key. All comparisons precede the terminal strict clock assertion. */
export function consumeWrappedClaimOperatorKeyLeaseV4(token, custody, kind, message, frame) {
  const state = operatorKeyLeases.get(token);
  assert.ok(state, 'CLAIM_V4_PRIVATE_KEY_LEASE_REQUIRED'); operatorKeyLeases.delete(token);
  assert.equal(state.custody, custody, 'CLAIM_V4_KEY_CUSTODY');
  assert.equal(state.kind, kind, 'CLAIM_V4_KEY_KIND');
  equal(state.message, message, 'CLAIM_V4_KEY_MESSAGE');
  assert.equal(state.frame, frame.toString('hex'), 'CLAIM_V4_KEY_FRAME');
  state.assertCurrent(); state.release(); state.noteKeyUse();
}
/** Fixed payout facts key domain. Only the active original claim peer's
 * staged immutable entry can mint this lease; no caller selects a signing API. */
export function consumeWrappedClaimPayoutFactsKeyLeaseV4(token, custody, facts, frame) {
  const state = factsKeyLeases.get(token);
  assert.ok(state, 'CLAIM_V4_PRIVATE_FACTS_KEY_LEASE_REQUIRED'); factsKeyLeases.delete(token);
  assert.equal(state.custody, custody, 'CLAIM_V4_FACTS_CUSTODY');
  equal(state.facts, facts, 'CLAIM_V4_FACTS_CHANGED');
  assert.equal(state.frame, frame.toString('hex'), 'CLAIM_V4_FACTS_FRAME_CHANGED');
  state.assertRound(); state.release(); state.noteKeyUse();
}
/** No minting API exists. Opening consumes the exact token/quorum/result triple.
 * The returned fixed assertion burns its one key right even when it refuses. */
export function openWrappedClaimOriginalAuthorizationLeaseV4(token, quorum, originalResult) {
  const state = originalValidationLeases.get(token);
  assert.ok(state, 'CLAIM_V4_PRIVATE_ORIGINAL_LEASE_REQUIRED'); originalValidationLeases.delete(token);
  assert.equal(arguments.length, 3, 'CLAIM_V4_LEASE_OPEN_NO_OPTIONS');
  assert.equal(state.quorum, quorum, 'CLAIM_V4_LEASE_QUORUM');
  assert.equal(state.result, originalResult, 'CLAIM_V4_LEASE_ORIGINAL_RESULT');
  let consumed = false, granted = false, continued = false;
  return Object.freeze({ profile: CLAIM_ORIGINAL_AUTHORIZATION_LEASE_PROFILE,
    auditStarted: state.started, method: state.original.method, head: state.original.head,
    assertBeforeKey() {
      assert.equal(consumed, false, 'CLAIM_V4_LEASE_ALREADY_CONSUMED'); consumed = true;
      assert.equal(arguments.length, 0, 'CLAIM_V4_LEASE_NO_OPTIONS');
      state.assertOriginal(); granted = true;
    },
    assertContinuationSourceCurrent() {
      assert.equal(continued, false, 'CLAIM_V4_SOURCE_CONTINUATION_ALREADY_CONSUMED'); continued = true;
      assert.equal(arguments.length, 0, 'CLAIM_V4_SOURCE_CONTINUATION_NO_OPTIONS');
      assert.equal(granted, true, 'CLAIM_V4_SOURCE_CONTINUATION_REQUIRES_CONSUMED_AUTHORITY');
      assert.ok(['broadcast', 'bitcoinBroadcast'].includes(state.original.method), 'CLAIM_V4_SOURCE_CONTINUATION_BROADCAST_ONLY');
      // Assertion-only residual source fence. Native mutation is not accepted
      // here; the original runtime/controller must separately prove its sole
      // permitted latch transition against its full private physical snapshot.
      state.assertContinuation();
    } });
}

export function createClaimOperatorQuorum(input) {
  exactRecord(input, ['operators']); fixedArray(input.operators, 3);
  const chosen = input.operators.slice(), states = chosen.map(value => {
    const state = operators.get(value); assert.ok(state, 'CLAIM_OWNED_OPERATOR_REQUIRED'); state.ready(); return state;
  });
  assert.ok(chosen.every((op, i) => i === 0 || chosen[i - 1].signerIndex < op.signerIndex), 'CLAIM_OPERATOR_ORDER');
  const first = states[0].bound, originalAuthorizations = new WeakMap(); let busy = false;
  const same = () => states.forEach(state => { state.ready(); assert.equal(state.observer, states[0].observer, 'CLAIM_OPERATOR_DIFFERENT_OBSERVER'); });
  const usesV4 = (method, request) => states.every(state => state.supportsV4) && (
    ['payout', 'broadcast', 'bitcoinBroadcast'].includes(method)
    || method === 'health' && request.mode === 'debt'
    || ['backing', 'reservation'].includes(method) && [A.REDEEM, A.BEGIN_PAYOUT, A.RESERVE_PAYOUT].includes(request.terms?.action));
  const frameFor = (method, value) => (method === 'health' ? encodeFlatNativeHealth
    : method === 'payout' ? claimPayoutAuthorizationFrame
      : method === 'broadcast' ? claimPayoutBroadcastFrame
        : method === 'bitcoinBroadcast' ? claimBitcoinPayoutBroadcastFrame : claimBackingFrame)(value);
  const captureOriginal = (method, request, result, signers) => freeze({ profile: CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE,
    method, request, result, head: copy(result.head), signers: signers.map(value => ({ result: copy(value),
      frameHex: frameFor(method, value.message).toString('hex'),
      healthFrameHex: value.healthCertificate ? encodeFlatNativeHealth(value.healthCertificate.message).toString('hex') : null })) });
  const invokeV4 = (method, request, head, original, quorumPermit) => states.map((state, i) => Promise.resolve().then(() =>
    method === 'health' ? state.health(request, head, original?.signers[i] ?? null, quorumPermit)
      : method === 'payout' ? state.authorizePayout(request, head, original?.signers[i] ?? null, quorumPermit)
        : method === 'broadcast' ? state.authorizeBroadcast(request, head, original?.signers[i] ?? null, false, quorumPermit)
          : method === 'bitcoinBroadcast' ? state.authorizeBitcoinBroadcast(request, head, original?.signers[i] ?? null, quorumPermit)
          : state.backing(request, method === 'reservation', head, original?.signers[i] ?? null, quorumPermit)));
  const drain = async promises => {
    const settled = await Promise.allSettled(promises), failure = settled.find(item => item.status === 'rejected');
    if (failure) throw failure.reason;
    return settled.map(item => item.value);
  };
  function assembleV4(method, results) {
    for (const result of results) {
      equal(result.head, results[0].head, 'CLAIM_QUORUM_HEAD_CHANGED');
      equal(result.message, results[0].message, 'CLAIM_QUORUM_INVENTORY_DISAGREES');
      assert.equal(result.authorizationLifecycleProfile, CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE, 'CLAIM_V4_SIGNER_PROFILE');
      assert.equal(result.economicInventoryCommitment, results[0].economicInventoryCommitment, 'CLAIM_V4_SIGNER_ECONOMIC_INVENTORY');
    }
    const indexes = chosen.map(op => op.signerIndex), signatures = results.map(row => row.signature);
    const verifier = createNativeQuorumHostVerifier({ registry: first.registry.quorum,
      expectedRegistryCommitment: nativeQuorumRegistryCommitment(first.registry.quorum) });
    verifier.assertQuorumForMessage({ messageBytes: frameFor(method, results[0].message), indexes, signatures });
    const abiSignatures = results.map(row => row.abiSignature);
    let authorization;
    if (['backing', 'reservation'].includes(method)) {
      const health = results[0].healthCertificate.message;
      for (const result of results) equal(result.healthCertificate.message, health, 'CLAIM_QUORUM_HEALTH_DISAGREES');
      verifier.assertQuorumForMessage({ messageBytes: encodeFlatNativeHealth(health), indexes,
        signatures: results.map(row => row.healthCertificate.signature) });
      authorization = { permit: copy(results[0].message), signatures: copy(abiSignatures),
        healthFrom: health.validFrom, healthUntil: health.validUntil,
        healthSignatures: results.map(row => row.healthCertificate.abiSignature) };
    }
    return freeze({ message: results[0].message, indexes, signatures, abiSignatures,
      authorizationLifecycleProfile: CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE, economicInventoryCommitment: results[0].economicInventoryCommitment,
      ...(authorization ? { authorization } : {}), head: results[0].head, independentOperators: false });
  }
  async function togetherV4(method, request, prior = null, mintLease = false) {
    same(); assert.ok(!busy, 'CLAIM_QUORUM_BUSY'); busy = true;
    const epochs = states.map(state => state.keyUseEpoch), quorumPermit = Object.freeze(Object.create(null)), reserved = []; let finalQuiescence, finalGraphQuiescence;
    try {
      for (const state of states) { state.reserve(quorumPermit); reserved.push(state); }
      request = freeze(copy(request));
      let original = prior;
      if (!original) {
        // Capture the immutable original head; each actor then independently
        // prepares and completes its full pre-key/persisted-return rounds.
        const headStarted = performance.now(), view = await states[0].observer.read(); same();
        const elapsed = performance.now() - headStarted;
        assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
        const signers = await drain(invokeV4(method, request, view.head, null, quorumPermit));
        same(); const result = assembleV4(method, signers);
        equal(result.head, view.head, 'CLAIM_QUORUM_HEAD_CHANGED');
        original = captureOriginal(method, request, result, signers);
      }
      assert.equal(original.profile, CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE, 'CLAIM_V4_ORIGINAL_PROFILE');
      equal(request, original.request, 'CLAIM_V4_ORIGINAL_REQUEST_CHANGED');
      // This is a new COMPLETE all-signer observation scope. Its start precedes
      // the first current/native read and is retained through aggregation,
      // final awaits, return and the eventual one-use key assertion.
      const started = performance.now(), evmFence = states[0].captureV4EvmFence();
      const view = await states[0].observer.read(); same();
      equal(view.head, original.head, 'CLAIM_ORIGINAL_QUORUM_AUTHORIZATION_HEAD');
      const signers = await drain(invokeV4(method, request, original.head, original, quorumPermit));
      const verified = assembleV4(method, signers);
      equal(verified, original.result, 'CLAIM_ORIGINAL_QUORUM_AUTHORIZATION_CHANGED');
      await states[0].observer.assertCurrent(view);
      finalQuiescence = await quiesceOwnedOperatorNativeReads(states.flatMap(state => state.nativeReadHandles()));
      finalGraphQuiescence = await states[0].quiesceGraphNativeV4();
      const nativeState = states[0].captureV4NativeState(), graphNativeState = assertGraphNativeIdleV4(states[0].captureGraphNativeStateV4());
      const assertOriginal = (withNativeState = true) => {
        same();
        equal(original.result, verified, 'CLAIM_V4_ORIGINAL_RESULT_CHANGED');
        equal(view.head, original.head, 'CLAIM_ORIGINAL_QUORUM_AUTHORIZATION_HEAD');
        for (const [i, signer] of signers.entries()) {
          equal(signer, original.signers[i].result, 'CLAIM_V4_ORIGINAL_SIGNER_CHANGED');
          assert.equal(frameFor(method, signer.message).toString('hex'), original.signers[i].frameHex, 'CLAIM_V4_ORIGINAL_FRAME_CHANGED');
          const messages = [signer.message, ...(signer.healthCertificate ? [signer.healthCertificate.message] : [])];
          for (const message of messages) {
            const now = claimUint(original.head.timestamp), from = claimUint(message.validFrom), until = claimUint(message.validUntil);
            assert.ok(from <= now && now + 1n < until && until - from <= 30n, 'CLAIM_ORIGINAL_AUTHORIZATION_EXPIRED');
          }
        }
        states.forEach((state, i) => state.assertV4ResultCurrent(signers[i], evmFence, withNativeState, quorumPermit));
        assertOwnedOperatorNativeReadsQuiescent(finalQuiescence);
        states[0].assertGraphNativeQuiescenceV4(finalGraphQuiescence);
        equal(states[0].captureGraphNativeStateV4(), graphNativeState, 'WRAPPED_GRAPH_NATIVE_STATE_CHANGED');
        if (withNativeState) equal(states[0].captureV4NativeState(), nativeState, 'CLAIM_V4_NATIVE_STATE_CHANGED');
        const elapsed = performance.now() - started;
        assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
      };
      // All costly synchronously recomputed frames precede this terminal fence.
      assertOriginal();
      originalAuthorizations.set(original.result, original);
      if (method === 'bitcoinBroadcast' && !prior) bitcoinBroadcastAuthorizations.set(original.result, {
        profile: CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE, lifecycleProfile: CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE,
        quorum, request, started, captured: freeze(copy(original.result)),
        frameHex: claimBitcoinPayoutBroadcastFrame(original.result.message).toString('hex'),
      });
      if (mintLease) {
        const token = Object.freeze(Object.create(null));
        originalValidationLeases.set(token, { quorum, result: original.result, original, started, assertOriginal, assertContinuation: () => assertOriginal(false) });
        // Do not return even the opaque token after expensive storage work aged it.
        assertOriginal(); return token;
      }
      // BTC metadata copy/codec construction above is also inside this scope.
      assertOriginal(); return prior ? undefined : original.result;
    } catch (cause) {
      // Every started actor has already drained. Include successfully persisted
      // early actors when a later final validation/aggregation/await fails.
      states.forEach((state, i) => state.poisonIfKeyUsed(epochs[i])); throw cause;
    } finally { if (finalGraphQuiescence) states[0].releaseGraphNativeQuiescenceV4(finalGraphQuiescence); if (finalQuiescence) releaseOwnedOperatorNativeReadQuiescence(finalQuiescence); for (const state of reserved) state.release(quorumPermit); busy = false; }
  }
  async function togetherPayoutFactsV4(raw) {
    same(); assert.ok(!busy, 'CLAIM_QUORUM_BUSY'); busy = true;
    const epochs = states.map(state => state.keyUseEpoch), quorumPermit = Object.freeze(Object.create(null)), reserved = []; let finalQuiescence, finalGraphQuiescence;
    try {
      for (const state of states) { state.reserve(quorumPermit); reserved.push(state); }
      const request = freeze(claimFactsRequest(raw));
      assert.ok(states.every(state => state.supportsV4 && state.isPayoutFacts(request)), 'CLAIM_V4_PAYOUT_FACTS_ALL_SIGNERS');
      const initialStarted = performance.now(), view = await states[0].observer.read(); same();
      const head = freeze(copy(view.head));
      assert.ok(performance.now() - initialStarted < 30_000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
      const results = [await states[0].certify(request, head, null, quorumPermit)];
      const anchor = freeze({ request, certificate: copy(results[0].certificate), head }); factsAnchors.add(anchor);
      results.push(...await drain(states.slice(1).map(state => Promise.resolve().then(() => state.certify(request, head, anchor, quorumPermit)))));
      // Original actual first-certificate anchor survives all rounds. No peer
      // shares an observation; all three re-read complete claim+GRAPH history.
      const started = performance.now(), evmFence = states[0].captureV4EvmFence();
      const currentView = await states[0].observer.read(); equal(currentView.head, head);
      const validated = await drain(states.map((state, i) => Promise.resolve().then(() => state.validatePayoutFacts(results[i], request, head, quorumPermit))));
      for (const [i, result] of validated.entries()) {
        equal(result, results[i], 'CLAIM_V4_ORIGINAL_PAYOUT_FACTS_CHANGED');
        equal(result.head, head, 'CLAIM_V4_ORIGINAL_PAYOUT_FACTS_HEAD');
        assert.equal(result.inventoryCommitment, results[0].inventoryCommitment, 'CLAIM_V4_PAYOUT_FACTS_INVENTORY_DISAGREES');
        assert.equal(result.certificate.frameHex, results[0].certificate.frameHex, 'CLAIM_FACTS_DISAGREE');
      }
      const certificates = validated.map(row => row.certificate);
      createNativeQuorumHostVerifier({ registry: first.registry.quorum, expectedRegistryCommitment: nativeQuorumRegistryCommitment(first.registry.quorum) })
        .assertQuorumForMessage({ messageBytes: Buffer.from(certificates[0].frameHex, 'hex'), indexes: chosen.map(op => op.signerIndex),
          signatures: certificates.map(row => row.signature) });
      await states[0].observer.assertCurrent(currentView); same();
      finalQuiescence = await quiesceOwnedOperatorNativeReads(states.flatMap(state => state.nativeReadHandles()));
      finalGraphQuiescence = await states[0].quiesceGraphNativeV4();
      const nativeState = states[0].captureV4NativeState(), graphNativeState = assertGraphNativeIdleV4(states[0].captureGraphNativeStateV4());
      const result = freeze({ certificates, head, independentOperators: false,
        authorizationLifecycleProfile: CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE, economicInventoryCommitment: results[0].inventoryCommitment });
      for (const certificate of certificates) {
        const observation = certificate.facts.observation, now = claimUint(head.timestamp);
        assert.ok(claimUint(observation.evidenceFrom) <= now && now + 1n < claimUint(observation.evidenceUntil), 'CLAIM_V4_ORIGINAL_FACTS_EXPIRED');
      }
      states.forEach((state, i) => state.assertV4ResultCurrent(validated[i], evmFence, true, quorumPermit));
      assertOwnedOperatorNativeReadsQuiescent(finalQuiescence);
      states[0].assertGraphNativeQuiescenceV4(finalGraphQuiescence);
      equal(states[0].captureGraphNativeStateV4(), graphNativeState, 'WRAPPED_GRAPH_NATIVE_STATE_CHANGED');
      equal(states[0].captureV4NativeState(), nativeState, 'CLAIM_V4_NATIVE_STATE_CHANGED');
      const elapsed = performance.now() - started;
      assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'CLAIM_V4_FACTS_FINAL_ROUND_TOO_OLD');
      return result;
    } catch (cause) { states.forEach((state, i) => state.poisonIfKeyUsed(epochs[i])); throw cause; }
    finally { if (finalGraphQuiescence) states[0].releaseGraphNativeQuiescenceV4(finalGraphQuiescence); if (finalQuiescence) releaseOwnedOperatorNativeReadQuiescence(finalQuiescence); for (const state of reserved) state.release(quorumPermit); busy = false; }
  }
  async function together(method, request, original = null) {
    if (method === 'facts' && states.some(state => state.supportsV4 && state.isPayoutFacts(request))) return togetherPayoutFactsV4(request);
    if (usesV4(method, request)) return togetherV4(method, request, original);
    same(); assert.ok(!busy, 'CLAIM_QUORUM_BUSY'); busy = true; const start = performance.now(), useCounts = states.map(state => state.useCount()), quorumPermit = Object.freeze(Object.create(null)), reserved = [];
    try {
      // One immutable request determines scheduling and every signer's input.
      // Its capture remains inside the original whole-quorum elapsed budget.
      // An own prepared field never becomes an unprepared request.
      for (const state of states) { state.reserve(quorumPermit); reserved.push(state); }
      request = freeze(copy(request));
      const results = [];
      let anchor, commonView, commonHead;
      const commonHeadCollection = method === 'broadcastIngressV3' || method === 'health'
        || method === 'backing' || method === 'payout' || method === 'broadcast' || method === 'bitcoinBroadcast'
        || (method === 'reservation' && request.terms?.action === A.RESERVE_PAYOUT);
      const invoke = index => {
        const state = states[index], head = commonHead ?? (original ? original.head : results[0]?.head);
        return method === 'facts' ? state.certify(request, head, anchor, quorumPermit)
          : method === 'health' ? state.health(request, head, original?.signers[index] ?? null, quorumPermit)
            : method === 'ingress' ? state.authorizeIngress(request, head, quorumPermit)
              : method === 'payout' ? state.authorizePayout(request, head, null, quorumPermit)
                : method === 'broadcast' ? state.authorizeBroadcast(request, head, null, false, quorumPermit)
                  : method === 'bitcoinBroadcast' ? state.authorizeBitcoinBroadcast(request, head, null, quorumPermit)
                  : method === 'broadcastIngressV3' ? state.authorizeIngressBroadcast(request, head, quorumPermit)
                  : state.backing(request, method === 'reservation', head, original?.signers[index] ?? null, quorumPermit);
      };
      if (commonHeadCollection || method === 'facts') {
        // All payout authorization collections, health and V3 ingress broadcast
        // use only queued native reads. No actor depends on a sibling certificate.
        // Facts capture the same original head, then retain the first actual
        // certificate anchor before starting either dependent tail actor.
        // Ingress presign/reservation ordering remains unchanged.
        // Capture only the shared canonical head through the original owned
        // observer, inside the unchanged whole-quorum budget. No first signer
        // supplies an audit/view to its peers; each reconstructs its own view.
        commonView = await states[0].observer.read(); same();
        commonHead = freeze(copy(commonView.head));
        if (original) equal(commonHead, original.head, 'CLAIM_ORIGINAL_QUORUM_AUTHORIZATION_HEAD');
        assert.ok(performance.now() - start < 30_000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
      }
      if (commonHeadCollection) {
        const settled = await Promise.allSettled(states.map((_, index) =>
          Promise.resolve().then(() => invoke(index))));
        // Keep the quorum busy until every started signer (and its queued
        // native reads) drains, including a sibling's late rejection.
        const failed = settled.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        same(); results.push(...settled.map(result => result.value));
        for (const result of results) equal(result.head, commonHead, 'CLAIM_QUORUM_HEAD_CHANGED');
      } else {
        results.push(await invoke(0));
        if (method === 'facts') {
          anchor = freeze({ request: claimFactsRequest(request), certificate: copy(results[0].certificate), head: copy(results[0].head) });
          factsAnchors.add(anchor);
          // The first certificate is still the sole actual-facts anchor. Both
          // tail actors independently reobserve every retained native history;
          // the original-node FIFO prevents overlap of native read windows.
          const settled = await Promise.allSettled([1, 2].map(index => Promise.resolve().then(() => invoke(index))));
          const failed = settled.find(result => result.status === 'rejected');
          if (failed) throw failed.reason;
          results.push(...settled.map(result => result.value));
          for (const result of results) equal(result.head, commonHead, 'CLAIM_QUORUM_HEAD_CHANGED');
        } else {
          // Unrelated ingress presign/reservation keep their established order.
          for (const index of [1, 2]) results.push(await invoke(index));
        }
      }
      // Every started signer has drained. A completed early signer may have
      // closed while a tail awaited; no ordinary success may outlive it. The
      // common-head branches retain the post-current-await gate below.
      same();
      const finalChecks = await Promise.allSettled(states.map((state, i) => state.finalCoverage(results[i], quorumPermit)));
      const finalFailure = finalChecks.find(item => item.status === 'rejected'); if (finalFailure) throw finalFailure.reason;
      same();
      assert.ok(performance.now() - start < 30_000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
      if (method === 'facts') {
        const certificates = results.map(row => row.certificate);
        for (const certificate of certificates) assert.equal(certificate.frameHex, certificates[0].frameHex, 'CLAIM_FACTS_DISAGREE');
        createNativeQuorumHostVerifier({ registry: first.registry.quorum, expectedRegistryCommitment: nativeQuorumRegistryCommitment(first.registry.quorum) })
          .assertQuorumForMessage({ messageBytes: Buffer.from(certificates[0].frameHex, 'hex'), indexes: chosen.map(op => op.signerIndex),
            signatures: certificates.map(row => row.signature) });
        await states[0].observer.assertCurrent(commonView); same();
        assert.ok(performance.now() - start < 30_000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
        return freeze({ certificates, head: results[0].head, independentOperators: false });
      }
      for (const result of results) equal(result.message, results[0].message, 'CLAIM_QUORUM_INVENTORY_DISAGREES');
      const permit = { message: results[0].message, indexes: chosen.map(op => op.signerIndex), signatures: results.map(row => row.signature) };
      if (!['health', 'ingress', 'payout', 'broadcast', 'bitcoinBroadcast', 'broadcastIngressV3'].includes(method)) assertClaimBackingQuorum(permit, { registry: first.registry.quorum,
        registryCommitment: nativeQuorumRegistryCommitment(first.registry.quorum), timestamp: results[0].head.timestamp });
      else createNativeQuorumHostVerifier({ registry: first.registry.quorum, expectedRegistryCommitment: nativeQuorumRegistryCommitment(first.registry.quorum) })
        .assertQuorumForMessage({ messageBytes: method === 'health' ? encodeFlatNativeHealth(permit.message)
          : method === 'ingress' ? claimIngressAuthorizationFrame(permit.message)
            : method === 'broadcast' ? claimPayoutBroadcastFrame(permit.message)
              : method === 'bitcoinBroadcast' ? claimBitcoinPayoutBroadcastFrame(permit.message)
              : method === 'broadcastIngressV3' ? nonceIngressBroadcastFrame(permit.message) : claimPayoutAuthorizationFrame(permit.message),
          indexes: permit.indexes, signatures: permit.signatures });
      const abiSignatures = results.map(row => row.abiSignature);
      let authorization;
      if (!['health', 'ingress', 'payout', 'broadcast', 'bitcoinBroadcast', 'broadcastIngressV3'].includes(method)) {
        const healthMessage = results[0].healthCertificate.message;
        for (const result of results) equal(result.healthCertificate.message, healthMessage, 'CLAIM_QUORUM_HEALTH_DISAGREES');
        createNativeQuorumHostVerifier({ registry: first.registry.quorum, expectedRegistryCommitment: nativeQuorumRegistryCommitment(first.registry.quorum) })
          .assertQuorumForMessage({ messageBytes: encodeFlatNativeHealth(healthMessage), indexes: permit.indexes,
            signatures: results.map(row => row.healthCertificate.signature) });
        authorization = { permit: copy(permit.message), signatures: copy(abiSignatures), healthFrom: healthMessage.validFrom,
          healthUntil: healthMessage.validUntil, healthSignatures: results.map(row => row.healthCertificate.abiSignature) };
      }
      const result = freeze({ ...permit, abiSignatures, ...(authorization ? { authorization } : {}), head: results[0].head, independentOperators: false });
      if (commonHeadCollection) {
        // After all signer RPC/journal awaits and aggregation, recheck the
        // original issued view, every operator, and the same whole budget.
        await states[0].observer.assertCurrent(commonView); same();
        assert.ok(performance.now() - start < 30_000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
      }
      if (method === 'bitcoinBroadcast') bitcoinBroadcastAuthorizations.set(result, {
        profile: CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE, quorum, request, started: start,
        captured: freeze(copy(result)), frameHex: claimBitcoinPayoutBroadcastFrame(result.message).toString('hex'),
      });
      if (original) {
        equal(result, original.result, 'CLAIM_ORIGINAL_QUORUM_AUTHORIZATION_CHANGED');
        same();
        assert.ok(performance.now() - start < 30_000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
        return;
      }
      if (['health', 'backing', 'reservation'].includes(method)) originalAuthorizations.set(result, freeze({
        profile: CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_PROFILE, method, request, result, head: copy(result.head),
        signers: results.map(value => ({ result: copy(value),
          frameHex: (method === 'health' ? encodeFlatNativeHealth : claimBackingFrame)(value.message).toString('hex'),
          healthFrameHex: method === 'health' ? null : encodeFlatNativeHealth(value.healthCertificate.message).toString('hex') })),
      }));
      return result;
    } catch (cause) { states.forEach((state, i) => { if (state.useCount() !== useCounts[i]) state.poison(); }); throw cause; }
    finally { for (const state of reserved) state.release(quorumPermit); busy = false; }
  }
  const quorum = Object.freeze({ profile: CLAIM_OPERATOR_PROFILE,
    ...(states.every(state => state.supportsV4) ? { authorizationLifecycleProfile: CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE } : {}),
    validateOriginalAuthorizationV4(originalResult) {
      assert.equal(arguments.length, 1, 'CLAIM_V4_ORIGINAL_NO_OPTIONS');
      const original = originalAuthorizations.get(originalResult);
      assert.ok(original?.profile === CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE, 'CLAIM_V4_ORIGINAL_AUTHORIZATION_REQUIRED');
      return togetherV4(original.method, original.request, original, true);
    }, collectionProfile: CLAIM_QUORUM_COLLECTION_PROFILE, bitcoinPayoutBroadcastProfile: CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE, signerIndexes: chosen.map(op => op.signerIndex), independentOperators: false,
    facts: request => together('facts', request), backing: request => together('backing', request),
    reservation: request => together('reservation', request), health: request => together('health', request),
    authorizeIngress: request => together('ingress', request), authorizePayout: request => together('payout', request),
    authorizeBroadcast: request => together('broadcast', request),
    authorizeBitcoinBroadcast: request => together('bitcoinBroadcast', request),
    authorizeIngressBroadcast: request => together('broadcastIngressV3', request),
    assertOriginalAuthorizationCurrent(originalResult) {
      assert.equal(arguments.length, 1, 'CLAIM_ORIGINAL_AUTHORIZATION_NO_OPTIONS');
      const original = originalAuthorizations.get(originalResult);
      assert.ok([CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_PROFILE, CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE].includes(original?.profile), 'CLAIM_ORIGINAL_QUORUM_AUTHORIZATION_REQUIRED');
      return together(original.method, original.request, original);
    } });
  same(); quorums.set(quorum, { same, observer: states[0].observer }); return quorum;
}
export function assertOwnedClaimOperatorQuorum(capability, observer) {
  const state = quorums.get(capability); assert.ok(state, 'CLAIM_OWNED_QUORUM_REQUIRED'); state.same();
  assert.equal(state.observer, observer, 'CLAIM_QUORUM_OBSERVER');
}
export function assertOwnedClaimOperator(capability, observer) {
  const state = operators.get(capability); assert.ok(state, 'CLAIM_OWNED_OPERATOR_REQUIRED'); state.ready();
  assert.equal(state.observer, observer, 'CLAIM_OPERATOR_OBSERVER');
}

/** Validation only: private issuance identity, original purpose/request/bytes,
 * same original deadline and current operator life. No signature or audit can
 * be renewed through this export, and a serialized certificate is not a lease. */
export function assertOriginalBitcoinPayoutBroadcastAuthorization(quorum, authorization, request) {
  assert.equal(arguments.length, 3, 'CLAIM_BITCOIN_ORIGINAL_AUTHORIZATION_NO_OPTIONS');
  const state = quorums.get(quorum), original = bitcoinBroadcastAuthorizations.get(authorization);
  assert.ok(state && original?.quorum === quorum
    && original.profile === CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE, 'CLAIM_BITCOIN_ORIGINAL_AUTHORIZATION_REQUIRED');
  state.same();
  equal(request, original.request, 'CLAIM_BITCOIN_ORIGINAL_REQUEST_CHANGED');
  equal(authorization, original.captured, 'CLAIM_BITCOIN_ORIGINAL_AUTHORIZATION_CHANGED');
  assert.equal(claimBitcoinPayoutBroadcastFrame(authorization.message).toString('hex'), original.frameHex,
    'CLAIM_BITCOIN_ORIGINAL_FRAME_CHANGED');
  const elapsed = performance.now() - original.started;
  // V4's mandatory complete original-validation lease owns freshness. This
  // exported identity check cannot mint or consume that separate authority.
  if (original.lifecycleProfile !== CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE)
    assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'CLAIM_BITCOIN_ORIGINAL_AUDIT_TOO_OLD');
  const now = claimUint(authorization.head.timestamp), from = claimUint(authorization.message.validFrom), until = claimUint(authorization.message.validUntil);
  assert.ok(from <= now && now + 1n < until && until - from <= 30n, 'CLAIM_BITCOIN_ORIGINAL_CERTIFICATE_EXPIRED');
}
