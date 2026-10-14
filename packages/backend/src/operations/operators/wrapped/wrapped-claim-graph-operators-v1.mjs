import {createOriginalGraphInventoryRoundV4} from './original-graph-inventory-round-v4.mjs';
import {assertGraphNativeStateV4,graphNativeProjectionV4 as compareGraphNativeStateV4} from './graph-native-state-v4.mjs';
import { readWrappedGraphDispatchOperationV4 } from '../../../chains/shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs';
import { assertCombinedClaimCoverageV4, assertCombinedClaimSourceCurrentV4, captureCombinedClaimNativeStateV4, quiesceCombinedClaimNativeV4, assertCombinedClaimNativeQuiescenceV4, releaseCombinedClaimNativeQuiescenceV4, assertCombinedGraphOperatorIdleV4, beginWrappedGraphAuditRoundV4, signWrappedGraphAuthorizationV4, acquireCombinedOperatorCustody, assertCombinedOperatorLive, poisonCombinedOperator, closeCombinedOperator, registerCombinedOperatorBranch, consumeCombinedBranchRecoveryV1, enterWrappedOperatorBranchV1, exitWrappedOperatorBranchV1, reserveWrappedOperatorV1, releaseWrappedOperatorV1 } from './wrapped-claim-combined-operators-v1.mjs';
/** Fixed-purpose owned V2 operators. One private key and one atomic CAS journal
 * per signer, complete typed inventory, no raw signer/audit callback/verified
 * boolean. Shares only an authenticated immutable receiver head with siblings.
 * Activation is impossible until native-value-system-v2 owns a real deployment. */
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { signature as sign } from '@lianum/engine/notes/private-note-encoding';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { nativeHubSignatureToAbi } from '@lianum/engine/evidence/native-hub-messages';
import { exactRecord, fixedArray, bytes32 } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import { assertOwnedWrappedClaimGraphSystem, wrappedClaimGraphOperatorResources } from '../../deployments/wrapped/wrapped-claim-system-v1.mjs';
import { createWrappedClaimGraphStateReaderV1, assertWrappedClaimGraphCurrentViewV1 } from '../../../execution/wrapped/reconciliation/wrapped-claim-system-state-v1.mjs';
import { assertOwnedNativeValueHealthObservation as assertTypedSourceObservation } from '../../../chains/shared/health/native-value-health-source-v4.mjs';
import { encodeFacts, validateFacts, factsSchema, profileCommitment, registryCommitment, assertFactsQuorum, sha256 }
  from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { encodeNativeValueHealth, assertNativeValueHealth, assertNativeValueHealthAllowed } from '../../../chains/shared/health/native-value-health-v2.mjs';
import { nativeValueInventoryBinding, nativeValuePolicy, validateNativeValueOperatorInventory,
  assertNativeValueSignature, assertStableNativeValueOriginal, assertNativeValueWatermark, nativeValueWatermark,
  MAX_CERTIFICATES_PER_ORIGINAL, wrappedGraphProfilesV1 } from './wrapped-claim-graph-inventory-v1.mjs';
import { nativeValueCheckpointMessage, assertNativeValueCheckpointCurrent, checkpointAuthorizationFrame,
  checkpointAuthorizationDigest, MAX_NATIVE_VALUE_CHECKPOINTS } from '../../recovery/native-value-checkpoint-v4.mjs';
export const NATIVE_VALUE_OPERATOR_PROFILE = 'OWNED_WRAPPED_SHARED_KEY_GRAPH_OPERATOR_V1';
export const WRAPPED_GRAPH_AUTHORIZATION_LIFECYCLE_V4 = 'WRAPPED_GRAPH_ORIGINAL_AUTHORIZATION_V4';
const bootstrapRequests = new WeakMap(), graphKeyLeasesV4 = new WeakMap(), originalAuthorizationsV4 = new WeakMap(), originalValidationLeasesV4 = new WeakMap();
const operators = new WeakMap(), quorums = new WeakMap(), sourceOwners = new WeakMap(), sourceHistories = new WeakMap(), rounds = new WeakSet();
const copy = cloneInput, freeze = frozenInput;
const equal = (a, b) => assert.deepEqual(a, b, 'NATIVE_VALUE_OPERATOR_CHANGED');
const pool = n => { assert.ok(Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0 && n < 2, 'NATIVE_VALUE_POOL_INDEX'); return n; };
const signerSlot = n => { assert.ok(Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0 && n < 4, 'NATIVE_VALUE_SIGNER_INDEX'); return n; };
const word = n => BigInt(n).toString(16).padStart(64, '0');
const b32 = n => '0x' + n;
async function drained(work) {
  const results = await Promise.allSettled(work.map(fn => Promise.resolve().then(fn)));
  const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
  return results.map(result => result.value);
}
function budget(started) {
  assert.ok(typeof started === 'number' && Number.isFinite(started), 'NATIVE_VALUE_PRIVATE_ROUND_TIME');
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= 0 && elapsed < 30_000, 'NATIVE_VALUE_COMPLETE_AUDIT_DEADLINE');
}
function operationIdentityV4(operation) {
  if (operation === null) return null;
  const { physicalState, nativeAuditStarted, ...identity } = readWrappedGraphDispatchOperationV4(operation);
  return freeze(copy(identity));
}
function graphNativeStateV4(rows, operation = null) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 5, 'WRAPPED_GRAPH_NATIVE_REGISTRY_REQUIRED');
  const original = operation === null ? null : readWrappedGraphDispatchOperationV4(operation);
  return assertGraphNativeStateV4(rows, original, inputUint);
}
function assertMessageWindowV4(kind, message, head) {
  const now = inputUint(head.timestamp);
  if (kind === 'facts') {
    const observation = message.observation;
    assert.equal(observation.observedAt, head.timestamp, 'WRAPPED_GRAPH_ORIGINAL_FACTS_TIME');
    assert.ok(inputUint(observation.evidenceFrom) <= now && now + 1n < inputUint(observation.evidenceUntil), 'WRAPPED_GRAPH_ORIGINAL_FACTS_EXPIRED');
  } else {
    const from = kind === 'checkpoint' ? now : inputUint(message.validFrom), until = inputUint(message.validUntil);
    assert.ok(from <= now && now + 1n < until && until - from <= 30n, 'WRAPPED_GRAPH_ORIGINAL_AUTHORIZATION_EXPIRED');
  }
}
function frameV4(kind, message, policy = null) {
  if (kind === 'health') return encodeNativeValueHealth(message);
  if (kind === 'checkpoint') return checkpointAuthorizationFrame(message);
  assert.equal(kind, 'facts', 'WRAPPED_GRAPH_FIXED_SIGNING_DOMAIN'); return encodeFacts(message, policy);
}
/** Only the original operator's complete post-persistence audit mints these. */
export function consumeWrappedGraphOperatorKeyLeaseV4(lease, custody, kind, message, policy, frame) {
  const state = graphKeyLeasesV4.get(lease); assert.ok(state, 'WRAPPED_GRAPH_PRIVATE_KEY_LEASE_REQUIRED'); graphKeyLeasesV4.delete(lease);
  assert.equal(arguments.length, 6, 'WRAPPED_GRAPH_KEY_NO_OPTIONS');
  assert.equal(state.custody, custody, 'WRAPPED_GRAPH_KEY_CUSTODY'); assert.equal(state.kind, kind, 'WRAPPED_GRAPH_KEY_KIND');
  equal(message, state.message); equal(policy, state.policy); assert.equal(frame.toString('hex'), state.frame, 'WRAPPED_GRAPH_KEY_FRAME');
  state.assertCurrent(); state.noteKeyUse(); state.release();
}

/** Creates only a dedicated synthetic same-host attester. Cannot import/export
 * a private key, bind a V1 system, or sign before authenticated private bootstrap. */
export function createScopedWrappedClaimGraphOperatorV1(raw, custody) {
  assertCombinedOperatorLive(custody);
  exactRecord(raw, ['signerIndex']); const signerIndex = signerSlot(raw.signerIndex);
  const retainedRecovery=consumeCombinedBranchRecoveryV1(custody,'graph');
  if(retainedRecovery){exactRecord(retainedRecovery,['uses','operationGeneration','record']);for(const n of [retainedRecovery.uses,retainedRecovery.operationGeneration])assert.ok(Number.isSafeInteger(n)&&n>=0);}
  const publicKey = acquireCombinedOperatorCustody(custody, 'graph', signerIndex);
  const signerAddress = '0x' + publicKeccak256(Buffer.from(publicKey.x + publicKey.y, 'hex')).subarray(12).toString('hex');
  let bound, record, busy = false, poisoned = false, closed = false, bindAttempted = false, uses = retainedRecovery?.uses??0;
  let active, keyUsed = false, reservation = null, operationGeneration = retainedRecovery?.operationGeneration??0;
  const coverageTicketsV4 = new WeakSet(), coverageStatesV4 = new WeakMap(), resultStatesV4 = new WeakMap();
  function live() { assert.ok(!closed && !poisoned, 'NATIVE_VALUE_OPERATOR_CLOSED_OR_POISONED'); assertCombinedOperatorLive(custody); }
  function poison() { poisoned = true; poisonCombinedOperator(custody); }
  function owned() { live(); assert.ok(bound, 'NATIVE_VALUE_OPERATOR_NOT_BOUND'); assertOwnedWrappedClaimGraphSystem(bound.runtime, bound.system);
    assert.equal(bound.system.profile, 'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1', 'NATIVE_VALUE_OPERATOR_SYSTEM_PROFILE');
    assert.equal(bound.system.claimsEnabled, true, 'WRAPPED_COMBINED_CLAIMS_REQUIRED');
    equal(bound.system.registry, bound.binding.registry); equal(bound.system.adapterProfiles, bound.binding.profiles);
    assert.equal(bound.resources.assertLive(), undefined, 'NATIVE_VALUE_SYNCHRONOUS_LIVENESS_REQUIRED'); }
  const inventoryRound = createOriginalGraphInventoryRoundV4({
    get bound() { return bound; }, get record() { return record; },
    set record(next) { record = next; }, get active() { return active; },
  }, {copy,freeze,equal,exactRecord,inputUint,validateNativeValueOperatorInventory,
    nativeValueWatermark,MAX_CERTIFICATES_PER_ORIGINAL,owned,poison,current,observe});
  const {unchanged,save,audit:auditAll} = inventoryRound;
  async function current() {
    owned(); budget(active.started);
    assertWrappedClaimGraphCurrentViewV1(active.view, { runtime: bound.runtime, system: bound.system, poolIndex: active.view.poolIndex });
    await bound.readers[active.view.poolIndex].assertCurrent(active.view); owned(); budget(active.started);
    assert.ok(BigInt(active.view.head.timestamp) >= BigInt(record.state.lastClock), 'NATIVE_VALUE_RECEIVER_CLOCK_ROLLBACK');
  }
  // Only these native-only current-registry fields cross into each source.
  const currentRegistry = Object.freeze({ async read() {
    await current(); return freeze({ registryCommitment: registryCommitment(bound.binding.registry),
      registryEpoch: bound.binding.registry.quorum.registryEpoch, halt: active.view.healthState.halted, head: active.view.head.hash });
  }, async assertCurrent(value) {
    equal(value, await currentRegistry.read()); await current();
  } });
  async function observe(i, nativeId, entry) {
    active?.quiet?.release();
    const registration = wrappedGraphProfilesV1(bound.binding)[i], policy = bound.policies[i];
    try {
      await current();
      // This private deployment-owned factory must independently reopen the
      // registered original reader, using this signer's authenticated history.
      // No Action/P/R/checkpoint/payout, public callback or cached audit enters it.
      const history = Object.freeze(Object.create(null));
      sourceHistories.set(history, { entry: entry ? copy(entry) : null, policy, sourceIndex: String(signerIndex), nativeId, head: copy(active.view.head) });
      let source, observed;
      try { ({ source, observation: observed } = await bound.resources.observeNativeV4({ history, profileCommitment: profileCommitment(registration.profile),
        nativeId, retained: entry ? freeze(copy(entry)) : null, currentRegistry })); }
      finally { sourceHistories.delete(history); }
      assert.ok(source && Object.isFrozen(source), 'NATIVE_VALUE_ORIGINAL_SOURCE_REQUIRED');
      assert.equal(source.sourceIndex, String(signerIndex), 'NATIVE_VALUE_SOURCE_SIGNER_POSITION');
      assert.equal(source.profileCommitment, profileCommitment(registration.profile), 'NATIVE_VALUE_SOURCE_PROFILE');
      assert.ok(!sourceOwners.has(source), 'NATIVE_VALUE_FRESH_SOURCE_INSTANCE_REQUIRED'); sourceOwners.set(source, operator);
      assertTypedSourceObservation(observed, source, policy);
      await current(); inputUint(observed.nativeReadCount, 32, 4096n); assert.equal(observed.nativeId, nativeId); assert.equal(observed.sourceIndex, String(signerIndex));
      if (observed.status !== 'observed') return { status: observed.status === 'reorged' ? 'adverse' : 'unknown',
        reason: observed.status === 'reorged' ? 'NATIVE_VALUE_AUTHENTICATED_SOURCE_ADVERSE' : 'NATIVE_VALUE_SOURCE_UNKNOWN', observed: false, nativeReadCount: observed.nativeReadCount, sourceStatus: observed.status };
      const proposal = copy(observed.proposal), facts = validateFacts(proposal.facts, policy);
      assert.equal(facts.observation.observedAt, active.view.head.timestamp, 'NATIVE_VALUE_INDEPENDENT_COMMON_ROUND');
      assert.equal(facts.transactionId, nativeId + '0'.repeat(64));
      assert.equal(proposal.frameHex, encodeFacts(facts, policy).toString('hex')); assert.equal(proposal.digest, sha256(Buffer.from(proposal.frameHex, 'hex')));
      const original = { nativeId, nativeWire: proposal.nativeWire, inclusion: proposal.inclusion, facts };
      if (entry) {
        try { assertStableNativeValueOriginal(entry.original, original); }
        catch { return { status: entry.history.length ? 'adverse' : 'unknown', reason: 'NATIVE_VALUE_ORIGINAL_IDENTITY_CONTRADICTION', observed: true, nativeReadCount: observed.nativeReadCount, sourceStatus: observed.status }; }
        try { assertNativeValueWatermark(entry.watermark, facts); }
        catch { return { status: 'adverse', reason: 'NATIVE_VALUE_FINALITY_CONTEXT_CONTRADICTION', observed: true, nativeReadCount: observed.nativeReadCount, sourceStatus: observed.status }; }
      }
      return { status: 'live', reason: null, original, observed: true, nativeReadCount: observed.nativeReadCount, sourceStatus: observed.status };
    } catch (cause) {
      // Currentness/deadline/liveness is rechecked outside this native error
      // classifier and can never be converted into a successful audit.
      return { status: 'unknown', reason: 'NATIVE_VALUE_SOURCE_UNAVAILABLE_OR_INVALID', observed: false, nativeReadCount: '0', sourceStatus: 'unverified' };
    }
  }
  function evmFenceV4() {
    owned(); const state = bound.runtime.ingressSendState;
    exactRecord(state, ['epoch', 'busy', 'uncertain']); inputUint(state.epoch);
    assert.equal(typeof state.busy, 'boolean', 'WRAPPED_GRAPH_EVM_BUSY_STATE'); assert.equal(state.uncertain, false, 'WRAPPED_GRAPH_EVM_UNCERTAIN'); return freeze(copy(state));
  }
  function quiescenceV4() {
    let claimLease = null, graphLease = null, claimSnapshot = null, graphSnapshot = null;
    const release = () => { if (graphLease) bound.resources.releaseNativeQuiescenceV4(graphLease); if (claimLease) releaseCombinedClaimNativeQuiescenceV4(custody, claimLease); };
    return {
      async acquire() {
        claimLease = await quiesceCombinedClaimNativeV4(custody);
        try { graphLease = await bound.resources.quiesceNativeV4();
          claimSnapshot = captureCombinedClaimNativeStateV4(custody);
          graphSnapshot = graphNativeStateV4(bound.resources.nativeStateV4(), active.operation);
        } catch (cause) { release(); throw cause; }
      },
      assertCurrent() {
        assert.ok(claimLease && graphLease && claimSnapshot && graphSnapshot, 'WRAPPED_GRAPH_COMPLETE_QUIESCENCE_REQUIRED');
        assertCombinedClaimNativeQuiescenceV4(custody, claimLease); bound.resources.assertNativeQuiescenceV4(graphLease);
        equal(captureCombinedClaimNativeStateV4(custody), claimSnapshot);
        equal(graphNativeStateV4(bound.resources.nativeStateV4(), active.operation), graphSnapshot);
      }, release,
      graphState() { return graphSnapshot; }, claimState() { return claimSnapshot; },
    };
  }
  function assertRoundV4() {
    owned(); assert.ok(active?.claimSource && active.quiet, 'WRAPPED_GRAPH_COMPLETE_ROUND_REQUIRED');
    equal(active.view.head, active.originalHead); equal(evmFenceV4(), active.evmFence);
    equal(operationIdentityV4(active.operation), active.operationIdentity);
    assertCombinedClaimSourceCurrentV4(custody, active.claimSource); active.quiet.assertCurrent(); budget(active.started);
  }
  async function coverage(pending = null) {
    // Invalidate the prior observations before opening this COMPLETE independent
    // claim/GRAPH scope. Neither a clock refresh nor persistence mints authority.
    active.quiet?.release(); active.quiet = null; active.claimSource = null;
    active.started = beginWrappedGraphAuditRoundV4(custody);
    await unchanged(); await current();
    const report = await auditAll(pending); assertNativeValueHealthAllowed(active.view.healthState);
    assert.equal(report.blockers.length, 0, 'NATIVE_VALUE_FULL_INVENTORY_BLOCKED');
    active.claimSource = await assertCombinedClaimCoverageV4(custody, bound, active.view.head);
    await current(); await unchanged(); await current();
    active.quiet = quiescenceV4(); await active.quiet.acquire(); assertRoundV4(); active.report = report; return report;
  }
  async function serial(poolIndex, work, shared = null) {
    owned(); assert.ok(Object.isFrozen(bound.system), 'NATIVE_VALUE_OPERATOR_FROZEN_DEPLOYMENT'); pool(poolIndex); assert.ok(!busy, 'NATIVE_VALUE_OPERATOR_BUSY');
    assert.ok(reservation === null || shared?.token === reservation, 'NATIVE_VALUE_OPERATOR_QUORUM_RESERVED');
    const operation = enterWrappedOperatorBranchV1(custody, 'graph', shared?.token ?? null); busy = true; operationGeneration++; keyUsed = false;
    try {
      await unchanged(); if (shared !== null) assert.ok(rounds.has(shared), 'NATIVE_VALUE_PRIVATE_ROUND_REQUIRED');
      const started = shared?.started ?? performance.now();
      const view = shared?.view ?? await bound.readers[poolIndex].read();
      active = { view, started, originalHead: freeze(copy(view.head)), operation: shared?.operation ?? null,
        operationIdentity: operationIdentityV4(shared?.operation ?? null), evmFence: evmFenceV4(), quiet: null, claimSource: null }; assert.equal(view.poolIndex, poolIndex); await current();
      const result = await work(view); await current(); await unchanged(); await current();
      if (active.claimSource) {
        assertRoundV4(); resultStatesV4.set(result, { source: sourceStateV4(), claimSource: active.claimSource,
          audit: active.report, graphNative: active.quiet.graphState(), evmFence: active.evmFence, operation: active.operation, operationIdentity: active.operationIdentity });
      }
      if (coverageTicketsV4.has(result)) { coverageStatesV4.set(result, sourceStateV4()); }
      budget(active.started); return result;
    } catch (cause) {
      if (keyUsed) { poison(); throw new Error('NATIVE_VALUE_POST_KEY_UNCERTAIN', { cause }); }
      throw cause;
    } finally { active?.quiet?.release(); busy = false; active = undefined; keyUsed = false; exitWrappedOperatorBranchV1(custody, operation); }
  }
  function keySign(kind, message, policy = null) {
    const frame = frameV4(kind, message, policy), digest = sha256(frame);
    const assertIntent = () => {
      assertRoundV4();
      const rows = kind === 'health' ? record.state.authorizations : kind === 'checkpoint' ? record.state.checkpoints
        : record.state.inventories.flatMap(row => row.entries.flatMap(entry => entry.pending ? [entry.pending] : []));
      const matches = rows.filter(row => row.digest === digest); assert.equal(matches.length, 1, 'WRAPPED_GRAPH_ORIGINAL_UNSIGNED_INTENT');
      const row = matches[0]; equal(kind === 'facts' ? row.facts : row.message, message);
      assert.equal(row.frameHex, frame.toString('hex'), 'WRAPPED_GRAPH_ORIGINAL_FRAME_CHANGED');
      if (kind !== 'facts') { assert.equal(row.signature, null, 'WRAPPED_GRAPH_ORIGINAL_ALREADY_SIGNED'); equal(row.head, active.originalHead); }
      assertMessageWindowV4(kind, message, active.originalHead); budget(active.started);
    };
    assertIntent(); const lease = Object.freeze(Object.create(null));
    graphKeyLeasesV4.set(lease, { custody, kind, message: freeze(copy(message)), policy: policy === null ? null : freeze(copy(policy)), frame: frame.toString('hex'),
      assertCurrent: assertIntent, release: active.quiet.release, noteKeyUse() { keyUsed = true; uses++; } });
    return signWrappedGraphAuthorizationV4(custody, kind, message, policy, lease);
  }
  async function recover(signature, digest) {
    const candidates = [];
    for (const v of ['27', '28']) {
      const result = await bound.runtime.call({ to: '0x0000000000000000000000000000000000000001',
        data: b32(digest + word(v) + signature) }, active.view.header.number);
      if (result === '0x' + '00'.repeat(12) + signerAddress.slice(2)) candidates.push(v);
    }
    assert.equal(candidates.length, 1, 'NATIVE_VALUE_SIGNATURE_EVM_RECOVERY');
    return nativeHubSignatureToAbi({ signerIndex: String(signerIndex), v: candidates[0], signature });
  }
  async function health(request, shared = null) {
    const input = copy(request); exactRecord(input, ['poolIndex', 'validUntil']); pool(input.poolIndex); inputUint(input.validUntil);
    return serial(input.poolIndex, async view => {
      await coverage(); const { timestamp, ...state } = view.healthState;
      const message = freeze({ ...state, validFrom: timestamp, validUntil: input.validUntil });
      assert.ok(BigInt(input.validUntil) > BigInt(timestamp) && BigInt(input.validUntil) - BigInt(timestamp) <= 30n, 'NATIVE_VALUE_HEALTH_WINDOW');
      const bytes = encodeNativeValueHealth(message), digest = sha256(bytes);
      let position = record.state.authorizations.findIndex(row => row.digest === digest);
      if (position < 0) {
        const next = copy(record.state); position = next.authorizations.length;
        next.authorizations.push({ message, frameHex: bytes.toString('hex'), digest, head: copy(view.head), signature: null, abiSignature: null });
        await save(next); await coverage(digest); // durable unsigned intent -> full pre-key audit
        const signature = keySign('health', message); assertNativeValueSignature(publicKey, signature, bytes);
        const abiSignature = await recover(signature, digest), signed = copy(record.state);
        Object.assign(signed.authorizations[position], { signature, abiSignature }); await save(signed);
      }
      const audit = await coverage(); // fresh full post-persistence coverage, never cached
      const row = record.state.authorizations[position]; assert.ok(row.signature && row.abiSignature); equal(row.head, view.head);
      return freeze({ message: copy(message), signature: row.signature, abiSignature: copy(row.abiSignature), signerIndex, head: copy(view.head), audit });
    }, shared);
  }
  function checkpointContext(view, requestId) {
    return { hubDomain: bound.system.hubDomain, registryCommitment: bound.system.registryCommitment,
      pool: view.poolAddress, poolStateSequence: view.snapshot.poolStateSequence,
      hubStateSequence: view.snapshot.hubStateSequence, checkpointCount: String(view.checkpointCount), head: copy(view.head), requestId };
  }
  async function checkpointGuard(row, view, requestId) {
    await current(); assertNativeValueCheckpointCurrent({ message: row.message, head: row.head }, checkpointContext(view, requestId));
    const m = row.message;
    assert.equal(checkpointAuthorizationDigest(m), await bound.system.hub.call('checkpointAuthorizationDigest(address,uint64,uint64,bytes32,uint64)',
      [m.pool, m.expectedPoolSequence, m.expectedHubStateSequence, m.requestId, m.validUntil], view.header.number), 'NATIVE_VALUE_CHECKPOINT_CODEC');
    await current();
  }
  async function checkpoint(request, shared = null) {
    const input = copy(request); exactRecord(input, ['poolIndex', 'requestId']); pool(input.poolIndex); bytes32(input.requestId, true);
    return serial(input.poolIndex, async view => {
      await coverage();
      let position = record.state.checkpoints.findIndex(row => row.message.requestId === b32(input.requestId));
      if (position < 0) {
        assert.ok(record.state.checkpoints.length < MAX_NATIVE_VALUE_CHECKPOINTS, 'NATIVE_VALUE_CHECKPOINT_HISTORY_SATURATED');
        const message = nativeValueCheckpointMessage(checkpointContext(view, input.requestId));
        const bytes = checkpointAuthorizationFrame(message), digest = sha256(bytes), next = copy(record.state);
        position = next.checkpoints.length;
        const intent = { message, frameHex: bytes.toString('hex'), digest, head: copy(view.head), signature: null, abiSignature: null };
        await checkpointGuard(intent, view, input.requestId); next.checkpoints.push(intent);
        await save(next); await coverage(digest); // full independent audit AFTER durable intent
        await checkpointGuard(record.state.checkpoints[position], view, input.requestId);
        const signature = keySign('checkpoint', message); assertNativeValueSignature(publicKey, signature, bytes);
        const abiSignature = await recover(signature, digest), signed = copy(record.state);
        Object.assign(signed.checkpoints[position], { signature, abiSignature }); await save(signed);
      }
      // Reuse has the same full audits, original-head/window and code guards.
      // A retained signature never acts as cached native-currentness authority.
      const audit = await coverage(), row = record.state.checkpoints[position];
      await checkpointGuard(row, view, input.requestId);
      assert.ok(row.signature && row.abiSignature, 'NATIVE_VALUE_CHECKPOINT_UNSIGNED');
      assertNativeValueSignature(publicKey, row.signature, checkpointAuthorizationFrame(row.message));
      return freeze({ message: copy(row.message), signature: row.signature, abiSignature: copy(row.abiSignature), signerIndex, head: copy(view.head), audit });
    }, shared);
  }
  async function certify(request, shared = null) {
    const input = copy(request); exactRecord(input, ['poolIndex', 'profileCommitment', 'nativeId']); pool(input.poolIndex); bytes32(input.nativeId, true); bytes32(input.profileCommitment, true);
    return serial(input.poolIndex, async () => {
      await coverage(); const i = wrappedGraphProfilesV1(bound.binding).findIndex(row => profileCommitment(row.profile) === input.profileCommitment);
      assert.ok(i >= 0, 'NATIVE_VALUE_UNREGISTERED_PROFILE'); const inventory = record.state.inventories[i];
      let position = inventory.entries.findIndex(entry => entry.original.nativeId === input.nativeId);
      const previous = inventory.entries[position], result = await observe(i, input.nativeId, previous);
      if (previous) {
        const checked = copy(record.state), entry = checked.inventories[i].entries[position];
        checked.lastClock = active.view.head.timestamp; entry.lastCheckedAt = active.view.head.timestamp;
        if (entry.status !== 'adverse') { entry.status = result.status; entry.reason = result.reason; }
        if (result.status === 'live') entry.watermark = nativeValueWatermark(result.original.facts);
        await save(checked);
      }
      assert.equal(result.status, 'live', 'NATIVE_VALUE_NEW_ORIGINAL_UNAVAILABLE');
      const facts = result.original.facts, bytes = encodeFacts(facts, bound.policies[i]), digest = sha256(bytes);
      const retained = previous?.history.find(certificate => certificate.digest === digest);
      if (retained) { await coverage(); return copy(retained); }
      const next = copy(record.state);
      if (position < 0) {
        position = next.inventories[i].entries.length;
        next.inventories[i].entries.push({ original: result.original, history: [], pending: null, watermark: nativeValueWatermark(facts),
          status: 'live', reason: null, lastCheckedAt: active.view.head.timestamp, maximumEvidenceUntil: '0' });
      }
      const entry = next.inventories[i].entries[position];
      entry.pending = { facts, frameHex: bytes.toString('hex'), digest }; next.lastClock = active.view.head.timestamp;
      await save(next); await coverage(digest);
      const signature = keySign('facts', facts, bound.policies[i]); assertNativeValueSignature(publicKey, signature, bytes);
      const certificate = { schema: factsSchema(bound.policies[i]), signerIndex: String(signerIndex), facts, frameHex: bytes.toString('hex'), digest, signature };
      const signed = copy(record.state), row = signed.inventories[i].entries[position];
      row.history.push(certificate); row.pending = null;
      if (BigInt(facts.observation.evidenceUntil) > BigInt(row.maximumEvidenceUntil)) row.maximumEvidenceUntil = facts.observation.evidenceUntil;
      await save(signed); await coverage(); return freeze(copy(certificate));
    }, shared);
  }
  function assertRetainedResultV4(kind, request, result) {
    const signingKind = kind === 'certify' ? 'facts' : kind;
    if (kind === 'health') {
      const { timestamp, ...health } = active.view.healthState;
      equal(result.message, { ...health, validFrom: timestamp, validUntil: request.validUntil });
    }
    const policy = kind === 'certify' ? bound.policies[wrappedGraphProfilesV1(bound.binding).findIndex(row => profileCommitment(row.profile) === request.profileCommitment)] : null;
    const message = kind === 'certify' ? result.facts : result.message, frame = frameV4(signingKind, message, policy), digest = sha256(frame);
    const matches = kind === 'certify' ? record.state.inventories.filter(row => row.profileCommitment === request.profileCommitment)
      .flatMap(row => row.entries.filter(entry => entry.original.nativeId === request.nativeId).flatMap(entry => entry.history)).filter(row => row.digest === digest)
      : (kind === 'health' ? record.state.authorizations : record.state.checkpoints).filter(row => row.digest === digest);
    assert.equal(matches.length, 1, 'WRAPPED_GRAPH_ORIGINAL_RETAINED_AUTHORIZATION_REQUIRED'); const retained = matches[0];
    assert.equal(retained.frameHex, frame.toString('hex'), 'WRAPPED_GRAPH_ORIGINAL_FRAME_CHANGED');
    assert.equal(retained.signature, result.signature, 'WRAPPED_GRAPH_ORIGINAL_SIGNATURE_CHANGED');
    assertNativeValueSignature(publicKey, result.signature, frame);
    if (kind === 'certify') equal(retained, result);
    else { equal(retained.message, result.message); equal(retained.abiSignature, result.abiSignature); equal(retained.head, result.head); equal(result.head, active.view.head); }
    assertMessageWindowV4(signingKind, message, active.view.head);
  }
  async function validateOriginalV4(kind, request, result, shared) {
    return serial(request.poolIndex, async () => {
      await coverage();
      if (kind === 'checkpoint') await checkpointGuard(result, active.view, request.requestId);
      assertRetainedResultV4(kind, request, result); assertRoundV4(); return result;
    }, shared);
  }
  const operator = Object.freeze({ profile: NATIVE_VALUE_OPERATOR_PROFILE, signerIndex, publicKey,
    async bind(input) {
      exactRecord(input, ['runtime', 'system']); live(); assert.ok(!bindAttempted, 'NATIVE_VALUE_BIND_ONCE'); bindAttempted = true;
      try {
        const { runtime, system } = input; assertOwnedWrappedClaimGraphSystem(runtime, system);
        const binding = nativeValueInventoryBinding({ registry: system.registry, profiles: system.adapterProfiles, signerIndex: String(signerIndex), publicKey });
        // The private one-use request prevents a holder of the public system
        // from opening this operator's resource store and rewriting its history.
        const request = Object.freeze(Object.create(null));
        bootstrapRequests.set(request, { runtime, system, signerIndex, publicKey });
        let resources;
        try { resources = wrappedClaimGraphOperatorResources(runtime, system, request); }
        finally { bootstrapRequests.delete(request); }
        exactRecord(resources, ['store', 'readerFor', 'assertLive', 'nativeStateV4', 'quiesceNativeV4', 'assertNativeQuiescenceV4', 'releaseNativeQuiescenceV4', 'observeNativeV4']); exactRecord(resources.store, ['load', 'commit']);
        for (const fn of [resources.store.load, resources.store.commit, resources.readerFor, resources.assertLive, resources.nativeStateV4, resources.quiesceNativeV4, resources.assertNativeQuiescenceV4, resources.releaseNativeQuiescenceV4, resources.observeNativeV4]) assert.equal(typeof fn, 'function');
        const readers = await Promise.all([0, 1].map(poolIndex => createWrappedClaimGraphStateReaderV1({ runtime, system, poolIndex })));
        bound = { runtime, system, binding, resources, readers, policies: wrappedGraphProfilesV1(binding).map(row => nativeValuePolicy(binding, row)) };
        record = copy(await resources.store.load()); exactRecord(record, ['revision', 'state']); inputUint(record.revision);
        validateNativeValueOperatorInventory(record.state, binding); await unchanged(); owned();
        return freeze({ profile: NATIVE_VALUE_OPERATOR_PROFILE, signerIndex, publicKey });
      } catch (cause) { poison(); throw cause; }
    },
    health(request) { assert.equal(arguments.length, 1, 'NATIVE_VALUE_PUBLIC_REQUEST_ARITY'); return health(request); },
    certify(request) { assert.equal(arguments.length, 1, 'NATIVE_VALUE_PUBLIC_REQUEST_ARITY'); return certify(request); },
    checkpoint(request) { assert.equal(arguments.length, 1, 'NATIVE_VALUE_PUBLIC_REQUEST_ARITY'); return checkpoint(request); },
    audit(request) { const input = copy(request); exactRecord(input, ['poolIndex']); return serial(pool(input.poolIndex), () => auditAll()); },
    status() { return freeze({ closed, poisoned, bound: !!bound, busy, reserved: reservation !== null, signerIndex, keyUses: String(uses) }); },
    close() { assert.ok(!busy && reservation === null, 'NATIVE_VALUE_OPERATOR_BUSY'); closeCombinedOperator(custody); },
  });
  operators.set(operator, { reserve(token) { owned(); assert.ok(!busy && reservation === null, 'NATIVE_VALUE_OPERATOR_BUSY'); reserveWrappedOperatorV1(custody, 'graph', token); reservation = token; },
    release(token) { assert.ok(!busy && reservation === token, 'NATIVE_VALUE_OPERATOR_RESERVATION'); releaseWrappedOperatorV1(custody, 'graph', token); reservation = null; },
    bound: () => { owned(); return bound; }, health, certify, checkpoint, validateOriginalV4,
    evmFenceV4,
    claimNativeStateV4: () => captureCombinedClaimNativeStateV4(custody),
    quiesceClaimNativeV4: () => quiesceCombinedClaimNativeV4(custody),
    assertClaimNativeQuiescenceV4: lease => assertCombinedClaimNativeQuiescenceV4(custody, lease),
    releaseClaimNativeQuiescenceV4: lease => releaseCombinedClaimNativeQuiescenceV4(custody, lease),
    completedAuditV4(result) { const row = resultStatesV4.get(result); assert.ok(row); return row.audit; },
    assertResultCurrentV4(result, permit) {
      const retained = resultStatesV4.get(result); assert.ok(retained, 'WRAPPED_GRAPH_ORIGINAL_SIGNER_RESULT_REQUIRED');
      assertCombinedGraphOperatorIdleV4(custody, permit); equal(sourceStateV4(), retained.source); equal(evmFenceV4(), retained.evmFence);
      equal(operationIdentityV4(retained.operation), retained.operationIdentity);
      assertCombinedClaimSourceCurrentV4(custody, retained.claimSource);
      compareGraphNativeStateV4(retained.graphNative, graphNativeStateV4(bound.resources.nativeStateV4(), retained.operation), inputUint);
    },
    coverage: shared => serial(shared.view.poolIndex, () => coverage(), shared),
    useCount: () => uses, poisonIfUsed: count => { if (uses !== count) poison(); }, poison,
  });
  function sourceStateV4() {
    owned(); assert.ok(record, 'WRAPPED_GRAPH_SOURCE_REQUIRED');
    return freeze({ profile: 'WRAPPED_COMBINED_GRAPH_SOURCE_STATE_V4', operationGeneration, keyUseEpoch: uses,
      record: copy(record) });
  }
  registerCombinedOperatorBranch(custody, 'graph', { busy: () => busy || reservation !== null,
    operationBusyV4: () => busy,
    captureRecovery(){assert.ok(!closed&&!poisoned&&!busy&&reservation===null,'WRAPPED_GRAPH_RECOVERY_NOT_IDLE');assert.ok(record,'WRAPPED_RECOVERY_GRAPH_BOUND_REQUIRED');return {uses,operationGeneration,record:copy(record)};},
    nativeStateV4() { owned(); return bound.resources.nativeStateV4(); },
    quiesceNativeV4() { owned(); return bound.resources.quiesceNativeV4(); },
    assertNativeQuiescenceV4(lease) { owned(); return bound.resources.assertNativeQuiescenceV4(lease); },
    releaseNativeQuiescenceV4(lease) { return bound.resources.releaseNativeQuiescenceV4(lease); },
    sourceStateV4,
    coverageStateV4(ticket) {
      const snapshot = coverageStatesV4.get(ticket);
      assert.ok(snapshot, 'WRAPPED_GRAPH_ORIGINAL_COVERAGE_REQUIRED'); return snapshot;
    },
    assertCoverageV4(head) {
      const ticket = Object.freeze(Object.create(null)); coverageTicketsV4.add(ticket);
      return serial(0, async () => {
        equal(active.view.head, head); const report = await auditAll();
        assertNativeValueHealthAllowed(active.view.healthState);
        assert.equal(report.blockers.length, 0, 'WRAPPED_GRAPH_FULL_INVENTORY_BLOCKED');
        await current(); return ticket;
      });
    },
    close() { closed = true; },
    assertCoverage: head => serial(0, async () => { equal(active.view.head, head); const report = await auditAll();
      assertNativeValueHealthAllowed(active.view.healthState); assert.equal(report.blockers.length, 0, 'WRAPPED_GRAPH_FULL_INVENTORY_BLOCKED'); await current(); }),
  });
  return operator;
}
/** The quorum retains original operator handles. All started work drains before
 * locks release; no Promise.race permits a rejected sibling to keep signing. */
export function createNativeValueOperatorQuorum(raw) {
  exactRecord(raw, ['operators']); fixedArray(raw.operators, 3);
  raw.operators.forEach(value => assert.ok(operators.has(value), 'NATIVE_VALUE_OWNED_OPERATOR_REQUIRED'));
  const chosen = [...raw.operators].sort((a, b) => a.signerIndex - b.signerIndex), states = chosen.map(value => operators.get(value));
  assert.equal(new Set(chosen.map(value => value.signerIndex)).size, 3, 'NATIVE_VALUE_DISTINCT_SIGNERS');
  const first = states[0].bound(); let busy = false;
  function binding() {
    for (const state of states) { const b = state.bound(); assert.ok(b.runtime === first.runtime && b.system === first.system, 'NATIVE_VALUE_QUORUM_SYSTEM');
      equal(b.binding.registry, first.binding.registry); equal(b.binding.profiles, first.binding.profiles); }
  }
  binding();
  function assemble(kind, input, results, view, audits) {
    if (kind === 'health') {
      for (const result of results) { equal(result.message, results[0].message); equal(result.head, view.head); }
      const permit = { message: results[0].message, indexes: chosen.map(op => op.signerIndex), signatures: results.map(row => row.signature) };
      assertNativeValueHealth(permit, view.healthState, first.system.registry);
      return freeze({ ...permit, abiSignatures: results.map(row => row.abiSignature), head: copy(view.head), audits });
    }
    if (kind === 'checkpoint') {
      for (let i = 0; i < results.length; i++) {
        const result = results[i]; equal(result.message, results[0].message); equal(result.head, view.head);
        assertNativeValueCheckpointCurrent({ message: result.message, head: result.head }, {
        hubDomain: first.system.hubDomain, registryCommitment: first.system.registryCommitment, pool: view.poolAddress,
        poolStateSequence: view.snapshot.poolStateSequence, hubStateSequence: view.snapshot.hubStateSequence,
        checkpointCount: String(view.checkpointCount), head: copy(view.head), requestId: input.requestId });
        // The hub binds the WRAPPED native-value registry, never the old inner
        // quorum registry commitment. Verify against its exact registered keys.
        assertNativeValueSignature(first.binding.registry.quorum.keys[chosen[i].signerIndex], result.signature,
        checkpointAuthorizationFrame(result.message));
      }
      return freeze({ message: copy(results[0].message), indexes: chosen.map(op => op.signerIndex),
        signatures: results.map(row => row.signature), abiSignatures: results.map(row => row.abiSignature), head: copy(view.head), audits });
    }
    const registration = wrappedGraphProfilesV1(first.binding).find(row => profileCommitment(row.profile) === input.profileCommitment);
    const policy = nativeValuePolicy(first.binding, registration);
    const collected = assertFactsQuorum(results, policy, chosen.map(op => registration.sources[op.signerIndex]));
    const interval = collected.facts.observation;
    assert.ok(BigInt(interval.evidenceFrom) <= BigInt(view.head.timestamp) && BigInt(view.head.timestamp) < BigInt(interval.evidenceUntil), 'NATIVE_VALUE_FACTS_EXPIRED');
    return freeze({ certificates: results, collected, head: copy(view.head), audits });
  }
  async function run(kind, request, operation = null, prior = null, mintLease = false) {
    const input = freeze(copy(request)); if (kind === 'coverage') exactRecord(input, ['poolIndex']); pool(input.poolIndex);
    assert.ok(!busy, 'NATIVE_VALUE_QUORUM_BUSY'); busy = true;
    const counts = states.map(state => state.useCount()), token = Object.freeze(Object.create(null)), reserved = [];
    let claimQuiet = null, graphQuiet = null;
    try {
      binding(); for (const state of states) { state.reserve(token); reserved.push(state); }
      let original = prior;
      if (!original) {
        const headStarted = performance.now(), view = await first.readers[input.poolIndex].read(); budget(headStarted);
        const shared = Object.freeze({ view, started: headStarted, token, operation }); rounds.add(shared);
        const results = await drained(states.map(state => () => kind === 'coverage' ? state.coverage(shared) : state[kind](input, shared)));
        binding();
        if (kind === 'coverage') {
          // Read-only audit is not a key/result capability. Every actor still
          // completed its own original reciprocal, physically fenced round.
          return freeze({ classification: 'ORIGINAL_WRAPPED_RECIPROCAL_FULL_INVENTORY_AUDIT_V1',
            head: copy(view.head), signerIndexes: chosen.map(op => op.signerIndex), audits: results, signed: false });
        }
        original = { kind, request: input, operation, operationIdentity: operationIdentityV4(operation),
          head: freeze(copy(view.head)), signers: results, signerSnapshots: results.map(value => freeze(copy(value))), result: null };
      }
      assert.equal(original.kind, kind, 'WRAPPED_GRAPH_ORIGINAL_KIND'); equal(input, original.request);
      assert.equal(operation, original.operation, 'WRAPPED_GRAPH_ORIGINAL_OPERATION_IDENTITY');
      equal(operationIdentityV4(operation), original.operationIdentity);
      // A new COMPLETE all-signer round starts before its first receiver/native
      // read. Persistence and initial issuance cannot borrow this clock.
      const started = performance.now(), evmFence = states[0].evmFenceV4();
      const view = await first.readers[input.poolIndex].read(); equal(view.head, original.head);
      const operationBefore = operation === null ? null : readWrappedGraphDispatchOperationV4(operation);
      const graphBefore = graphNativeStateV4(first.resources.nativeStateV4(), operation);
      const shared = Object.freeze({ view, started, token, operation }); rounds.add(shared);
      const validated = await drained(states.map((state, i) => () => state.validateOriginalV4(kind, input, original.signers[i], shared)));
      await first.readers[input.poolIndex].assertCurrent(view); binding();
      claimQuiet = await states[0].quiesceClaimNativeV4(); graphQuiet = await first.resources.quiesceNativeV4();
      const claimSnapshot = states[0].claimNativeStateV4(), graphSnapshot = graphNativeStateV4(first.resources.nativeStateV4(), operation);
      compareGraphNativeStateV4(graphBefore, graphSnapshot, inputUint);
      const operationSnapshot = operation === null ? null : readWrappedGraphDispatchOperationV4(operation);
      if (operationBefore) {
        assert.equal(operationSnapshot.nativeAuditStarted, operationBefore.nativeAuditStarted, 'WRAPPED_GRAPH_NATIVE_ROUND_REPLACED');
        if (mintLease) budget(operationSnapshot.nativeAuditStarted);
      }
      const audits = states.map((state, i) => state.completedAuditV4(validated[i]));
      const candidate = assemble(kind, input, validated, view, audits);
      if (original.result === null) original.result = candidate;
      else {
        // Audit counters are fresh diagnostic observations, never substituted
        // for the original signed authorization or its retained public object.
        const signed = value => { const out = copy(value); delete out.audits; return out; };
        equal(signed(candidate), signed(original.result));
      }
      const immutableResult = freeze(copy(original.result));
      const assertOriginal = () => {
        binding(); equal(original.result, immutableResult); equal(view.head, original.head); equal(states[0].evmFenceV4(), evmFence);
        equal(operationIdentityV4(operation), original.operationIdentity);
        for (const [i, result] of validated.entries()) {
          equal(result, original.signerSnapshots[i]); states[i].assertResultCurrentV4(result, token);
          const message = kind === 'certify' ? result.facts : result.message;
          assertMessageWindowV4(kind === 'certify' ? 'facts' : kind, message, original.head);
        }
        states[0].assertClaimNativeQuiescenceV4(claimQuiet); first.resources.assertNativeQuiescenceV4(graphQuiet);
        equal(states[0].claimNativeStateV4(), claimSnapshot);
        equal(graphNativeStateV4(first.resources.nativeStateV4(), operation), graphSnapshot);
        if (operationSnapshot) { equal(readWrappedGraphDispatchOperationV4(operation), operationSnapshot); if (mintLease) budget(operationSnapshot.nativeAuditStarted); }
        budget(started);
      };
      assertOriginal(); originalAuthorizationsV4.set(original.result, { ...original, quorum });
      if (mintLease) {
        const lease = Object.freeze(Object.create(null));
        originalValidationLeasesV4.set(lease, { quorum, result: original.result, started, assertOriginal });
        assertOriginal(); return lease;
      }
      assertOriginal(); return original.result;
    } catch (cause) { states.forEach((state, i) => state.poisonIfUsed(counts[i])); throw cause; }
    finally {
      if (graphQuiet) first.resources.releaseNativeQuiescenceV4(graphQuiet);
      if (claimQuiet) states[0].releaseClaimNativeQuiescenceV4(claimQuiet);
      for (const state of reserved) state.release(token); busy = false;
    }
  }
  const quorum = Object.freeze({ audit: request => run('coverage', request), health: request => run('health', request), certify: request => run('certify', request), checkpoint: request => run('checkpoint', request),
    signerIndexes: freeze(chosen.map(op => op.signerIndex)) });
  quorums.set(quorum, { runtime: first.runtime, system: first.system, binding, run }); return quorum;
}
/** Dispatch may enter only with the authentic active runtime operation token.
 * This does not mint native operation identities or accept phase overrides. */
export function issueWrappedGraphDispatchHealthV4(quorum, request, operation) {
  assert.equal(arguments.length, 3, 'WRAPPED_GRAPH_DISPATCH_NO_OPTIONS');
  const state = quorums.get(quorum); assert.ok(state, 'NATIVE_VALUE_OWNED_QUORUM_REQUIRED');
  readWrappedGraphDispatchOperationV4(operation); state.binding(); return state.run('health', request, operation);
}
export function validateWrappedGraphOriginalAuthorizationV4(quorum, originalResult) {
  assert.equal(arguments.length, 2, 'WRAPPED_GRAPH_ORIGINAL_NO_OPTIONS');
  const state = quorums.get(quorum), original = originalAuthorizationsV4.get(originalResult);
  assert.ok(state && original && original.quorum === quorum, 'WRAPPED_GRAPH_ORIGINAL_AUTHORIZATION_REQUIRED');
  state.binding(); return state.run(original.kind, original.request, original.operation, original, true);
}
export function consumeWrappedGraphOriginalAuthorizationV4(lease, quorum, originalResult) {
  const state = originalValidationLeasesV4.get(lease); assert.ok(state, 'WRAPPED_GRAPH_PRIVATE_ORIGINAL_LEASE_REQUIRED');
  originalValidationLeasesV4.delete(lease); // burn before every fallible comparison
  assert.equal(arguments.length, 3, 'WRAPPED_GRAPH_ORIGINAL_NO_OPTIONS');
  assert.equal(state.quorum, quorum, 'WRAPPED_GRAPH_ORIGINAL_LEASE_QUORUM');
  assert.equal(state.result, originalResult, 'WRAPPED_GRAPH_ORIGINAL_LEASE_RESULT');
  state.assertOriginal(); return state.started;
}
export function assertOwnedNativeValueQuorum(quorum, { runtime, system }) {
  const state = quorums.get(quorum); assert.ok(state && state.runtime === runtime && state.system === system, 'NATIVE_VALUE_OWNED_QUORUM_REQUIRED');
  state.binding();
}

/** Original receiver clock bound to the same private token as retained native
 * history. It exposes DATA only, never a callback, signer or ownership grant.
 * Source factories read this before consuming history; copied tokens fail. */
export function wrappedClaimRetainedSourceClockV1(token, { policy, sourceIndex, nativeId }) {
  const item = sourceHistories.get(token);
  assert.ok(item, 'NATIVE_VALUE_PRIVATE_RETAINED_CLOCK_REQUIRED');
  equal(item.policy, policy); assert.equal(item.sourceIndex, sourceIndex); assert.equal(item.nativeId, nativeId);
  const milliseconds = inputUint(item.head.timestamp) * 1000n;
  assert.ok(milliseconds <= BigInt(Number.MAX_SAFE_INTEGER), 'NATIVE_VALUE_RECEIVER_CLOCK_RANGE');
  return freeze({ timestampMs: Number(milliseconds), head: copy(item.head) });
}

/** Read-only opener for a one-use private native-history capability. Only the
 * operator above can mint it after authenticated store readback; copied records
 * and otherwise genuine third-party certificates cannot impersonate its history. */
export function wrappedClaimRetainedSourceHistoryV1(token, { policy, sourceIndex, nativeId }) {
  const item = sourceHistories.get(token);
  assert.ok(item, 'NATIVE_VALUE_PRIVATE_RETAINED_HISTORY_REQUIRED');
  equal(item.policy, policy); assert.equal(item.sourceIndex, sourceIndex); assert.equal(item.nativeId, nativeId);
  sourceHistories.delete(token); return item.entry ? freeze(copy(item.entry)) : null;
}

/** Consumes only the private request created inside bind(), never a public slot. */
export function consumeWrappedClaimGraphOperatorBootstrapRequestV1(token, { runtime, system }) {
  const entry = bootstrapRequests.get(token);
  assert.ok(entry && entry.runtime === runtime && entry.system === system, 'NATIVE_VALUE_PRIVATE_BOOTSTRAP_REQUEST');
  bootstrapRequests.delete(token); return freeze({ signerIndex: entry.signerIndex, publicKey: entry.publicKey });
}

export function isWrappedClaimSourceHistoryV1(token) { return sourceHistories.has(token); }
