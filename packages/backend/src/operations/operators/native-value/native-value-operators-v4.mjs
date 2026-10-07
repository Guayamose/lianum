/** Fixed-purpose owned V2 operators. One private key and one atomic CAS journal
 * per signer, complete typed inventory, no raw signer/audit callback/verified
 * boolean. Shares only an authenticated immutable receiver head with siblings.
 * Activation is impossible until native-value-system-v2 owns a real deployment. */
import assert from 'node:assert/strict';
import { privateFailureDiagnostic } from '../../../execution/account/reconciliation/failure-diagnostics.mjs';
import { types } from 'node:util';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { signature as sign } from '../../../../../engine/src/notes/private-note-encoding.mjs';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { nativeHubSignatureToAbi } from '../../../../../engine/src/evidence/native-hub-messages.mjs';
import { exactRecord, fixedArray, bytes32 } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { assertOwnedNativeValueSystem, nativeValueOperatorResources } from '../../deployments/native-value/native-value-system-v2.mjs';
import { createNativeValueSystemStateReader, assertNativeValueCurrentView } from '../../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { assertOwnedNativeValueHealthObservation as assertTypedSourceObservation } from '../../../chains/shared/health/native-value-health-source-v4.mjs';
import { encodeFacts, validateFacts, factsSchema, profileCommitment, registryCommitment, assertFactsQuorum, sha256 }
  from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { encodeNativeValueHealth, assertNativeValueHealth, assertNativeValueHealthAllowed } from '../../../chains/shared/health/native-value-health-v2.mjs';
import { nativeValueInventoryBinding, nativeValuePolicy, validateNativeValueOperatorInventory,
  assertNativeValueSignature, assertStableNativeValueOriginal, assertNativeValueWatermark, nativeValueWatermark,
  MAX_CERTIFICATES_PER_ORIGINAL } from './native-value-inventory-v4.mjs';
import { nativeValueCheckpointMessage, assertNativeValueCheckpointCurrent, checkpointAuthorizationFrame,
  checkpointAuthorizationDigest, MAX_NATIVE_VALUE_CHECKPOINTS } from '../../recovery/native-value-checkpoint-v4.mjs';
export const NATIVE_VALUE_OPERATOR_PROFILE = 'SAME_HOST_NATIVE_VALUE_FULL_INVENTORY_CHECKPOINT_BOUNDARIES_V4';
const bootstrapRequests = new WeakMap();
const operators = new WeakMap(), quorums = new WeakMap(), sourceOwners = new WeakMap(), sourceHistories = new WeakMap(), rounds = new WeakSet();
const copy = cloneInput, freeze = frozenInput;
const equal = (a, b) => assert.deepEqual(a, b, 'NATIVE_VALUE_OPERATOR_CHANGED');
// Closed source labels only. Diagnostics cannot mint an observation or weaken
// the live requirement; raw RPC text, native IDs and signatures never escape.
const sourceFailureLabels=new Set(["EVM_GRAPH_ANCESTRY_UNAVAILABLE","EVM_GRAPH_CANONICAL_RPC_QUANTITY","EVM_GRAPH_CURRENT_HEAD","EVM_GRAPH_CURRENT_REGISTRY_CHANGED","EVM_GRAPH_CURRENT_STATE_ASSERTION","EVM_GRAPH_CURRENT_STATE_CHANGED","EVM_GRAPH_EVIDENCE_OVERFLOW","EVM_GRAPH_EXECUTION_REVERTED","EVM_GRAPH_FINALITY_FRESHNESS_WINDOW_TOO_SHORT","EVM_GRAPH_FINALIZED_ANCESTRY_CHANGED","EVM_GRAPH_FINALIZED_CANONICAL_CHANGED","EVM_GRAPH_FINALIZED_INCLUSION_CHANGED","EVM_GRAPH_FINALIZED_SOURCE_CHANGED","EVM_GRAPH_INITIAL_NAMESPACE","EVM_GRAPH_NOT_FINALIZED","EVM_GRAPH_OBSERVED_CHAIN","EVM_GRAPH_OBSERVED_GENESIS","EVM_GRAPH_OLD_INCLUSION_UNAVAILABLE","EVM_GRAPH_ORIGINAL_CANONICAL_BLOCK_CHANGED","EVM_GRAPH_ORIGINAL_HISTORY_UNAVAILABLE","EVM_GRAPH_ORIGINAL_INCLUSION_CHANGED","EVM_GRAPH_ORIGINAL_NOT_INCLUDED","EVM_GRAPH_ORIGINAL_QUERY","EVM_GRAPH_PRIVATE_HISTORY_ORIGINAL","EVM_GRAPH_PRIVATE_HISTORY_WIRE","EVM_GRAPH_RECEIPT_INTRINSIC_GAS","EVM_GRAPH_REGISTERED_NATIVE_ASSET","EVM_GRAPH_REGISTRY_READER","EVM_GRAPH_SOURCE_BUSY","EVM_GRAPH_SOURCE_INVALID","EVM_GRAPH_SOURCE_OBSERVATION_PROVENANCE","EVM_GRAPH_SOURCE_TIMEOUT","EVM_GRAPH_SOURCE_UNAVAILABLE","EVM_GRAPH_TRACE_BYTES","EVM_GRAPH_TRACE_FAILED_OR_WRONG_MODE","EVM_GRAPH_TRACE_GAS","EVM_GRAPH_TRACE_NONCE","EVM_GRAPH_TRACE_ORIGINAL_CALL","EVM_GRAPH_TRANSACTION_TRACE_CHANGED","EVM_TRANSFER_BLOCK_DUPLICATE_TRANSACTION","EVM_TRANSFER_BLOCK_TRANSACTION_INDEX","EVM_TRANSFER_CANONICAL_BLOCK_CHANGED","EVM_TRANSFER_RECEIPT_GAS","EVM_TRANSFER_RECEIPT_IDENTITY","EVM_TRANSFER_RECEIPT_INCLUSION","EVM_TRANSFER_RECEIPT_LOG","EVM_TRANSFER_RECEIPT_LOG_ORDER","EVM_TRANSFER_RECEIPT_STATUS","EVM_TRANSFER_RECEIPT_TYPE","EVM_TRANSFER_RPC_ACCESS_LIST","EVM_TRANSFER_RPC_ADDRESS","EVM_TRANSFER_RPC_ARRAY","EVM_TRANSFER_RPC_BYTES","EVM_TRANSFER_RPC_EFFECTIVE_FEE","EVM_TRANSFER_RPC_ORIGINAL_HASH_TYPE","EVM_TRANSFER_RPC_SIGNATURE","EVM_TRANSFER_RPC_SIGNED_FEES","EVM_TRANSFER_RPC_SIGNED_FIELDS","FUTURE_BLOCK","INTEGER_RANGE","INVALID_ADAPTER","INVALID_ADAPTERS","INVALID_ADDRESS","INVALID_ADDRESS_CHECKSUM","INVALID_CLOCK","INVALID_DATA_FIELD","INVALID_FRESHNESS","INVALID_HASH","INVALID_INTEGER","INVALID_PARENT_HASH","INVALID_QUANTITY","INVALID_RECORD","INVALID_TRANSPORT","MISSING_FIELD","QUERY_TIMEOUT","TRON_GRAPH_ANCESTRY_CHANGED","TRON_GRAPH_ARRAY","TRON_GRAPH_BOOTSTRAP_CAPABILITY","TRON_GRAPH_BUSY","TRON_GRAPH_CANONICAL_ANCESTRY_CHANGED","TRON_GRAPH_CURRENT_ASSERTION","TRON_GRAPH_CURRENT_REGISTRY_CHANGED","TRON_GRAPH_EXPIRATION_NEXT_SLOT","TRON_GRAPH_EXPIRATION_PARENT_WINDOW","TRON_GRAPH_FRESHNESS_WINDOW_TOO_SHORT","TRON_GRAPH_GENESIS_CHANGED","TRON_GRAPH_HISTORICAL_PERMISSION_UNAVAILABLE","TRON_GRAPH_HISTORICAL_REPLAY_UNAVAILABLE","TRON_GRAPH_HISTORY_UNAVAILABLE","TRON_GRAPH_OBSERVATION_PROVENANCE","TRON_GRAPH_ORIGINAL_CANONICAL_BLOCK_CHANGED","TRON_GRAPH_ORIGINAL_EXECUTION_CONTEXT_CHANGED","TRON_GRAPH_ORIGINAL_INCLUSION_CHANGED","TRON_GRAPH_ORIGINAL_OR_SOLIDIFIED_CHANGED","TRON_GRAPH_ORIGINAL_QUERY","TRON_GRAPH_ORIGINAL_RETAINED_MISMATCH","TRON_GRAPH_ORIGINAL_UNKNOWN","TRON_GRAPH_PARENT_MISMATCH","TRON_GRAPH_PARENT_UNAVAILABLE","TRON_GRAPH_PERMISSION_ADDRESS","TRON_GRAPH_PERMISSION_DUPLICATE","TRON_GRAPH_PERMISSION_ID","TRON_GRAPH_PERMISSION_NOT_AUTHORIZED","TRON_GRAPH_PERMISSION_THRESHOLD","TRON_GRAPH_PERMISSION_WEIGHT","TRON_GRAPH_PRIVATE_HISTORY_ORIGINAL","TRON_GRAPH_REPLAY_CAPABILITY","TRON_GRAPH_REPLAY_CHANGED","TRON_GRAPH_REPLAY_FORK_FLAGS","TRON_GRAPH_REPLAY_ORIGINAL","TRON_GRAPH_REPLAY_OWNER","TRON_GRAPH_REPLAY_PARENT_CONTEXT","TRON_GRAPH_REPLAY_POSITION","TRON_GRAPH_REQUESTED_HEIGHT","TRON_GRAPH_RETAINED_HEIGHT","TRON_GRAPH_RETAINED_IDENTITY","TRON_GRAPH_RETAINED_INDEX","TRON_GRAPH_RETAINED_PROFILE","TRON_GRAPH_RETAINED_SCHEMA","TRON_GRAPH_SOLIDIFIED_ANCESTRY_BOUND","TRON_GRAPH_SOLIDIFIED_INCLUSION_CHANGED","TRON_GRAPH_SOURCE_INVALID","TRON_GRAPH_TAPOS_HISTORY_BOUND","TRON_GRAPH_TAPOS_REFERENCE","TRON_GRAPH_TIMEOUT","UNEXPECTED_FIELD","ZERO_HASH"]);
function sourceFailureCode(value){return typeof value==='string'&&sourceFailureLabels.has(value)?'NATIVE_VALUE_SOURCE_'+value:null;}
// Constructor failures have a narrower vocabulary than observation results.
const sourceConstructorFailureLabels=new Set(['EVM_GRAPH_PRIVATE_HISTORY_ORIGINAL','EVM_GRAPH_PRIVATE_HISTORY_WIRE',
  'TRON_GRAPH_PRIVATE_HISTORY_ORIGINAL','TRON_GRAPH_ORIGINAL_RETAINED_MISMATCH']);
function sourceExceptionCode(error){
  if(!error||typeof error!=='object'||types.isProxy(error))return null;
  const code=Object.getOwnPropertyDescriptor(error,'code')?.value;
  return sourceConstructorFailureLabels.has(code)?sourceFailureCode(code):null;
}
const inventoryFailureReasons=new Set(['NATIVE_VALUE_INVENTORY_SATURATED','NATIVE_VALUE_AUTHENTICATED_SOURCE_ADVERSE',
  'NATIVE_VALUE_SOURCE_UNKNOWN','NATIVE_VALUE_ORIGINAL_IDENTITY_CONTRADICTION','NATIVE_VALUE_FINALITY_CONTEXT_CONTRADICTION',
  'NATIVE_VALUE_SOURCE_UNAVAILABLE_OR_INVALID','NATIVE_VALUE_PROFILE_FINALITY_DISAGREEMENT','NATIVE_VALUE_UNFINISHED_SIGNING_INTENT',
  'NATIVE_VALUE_SIGNED_HISTORY_SATURATED','NATIVE_VALUE_UNFINISHED_HEALTH_INTENT','NATIVE_VALUE_HEALTH_HISTORY_SATURATED',
  'NATIVE_VALUE_UNFINISHED_CHECKPOINT_INTENT']);
function inventoryFailure(blockers){
  const failure=new Error('NATIVE_VALUE_FULL_INVENTORY_BLOCKED'),codes=[];
  for(const row of blockers)for(const value of [row.reason,row.sourceFailureCode]){
    const source=typeof value==='string'&&value.startsWith('NATIVE_VALUE_SOURCE_')
      &&sourceFailureLabels.has(value.slice('NATIVE_VALUE_SOURCE_'.length));
    if((inventoryFailureReasons.has(value)||source)&&!codes.includes(value)&&codes.length<4)codes.push(value);
  }
  failure.causeCodes=Object.freeze(codes);return failure;
}
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
/** Creates only a dedicated synthetic same-host attester. Cannot import/export
 * a private key, bind a V1 system, or sign before authenticated private bootstrap. */
export function createLocalNativeValueOperator(raw) {
  exactRecord(raw, ['signerIndex']); const signerIndex = signerSlot(raw.signerIndex);
  let key = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = createPublicKey(key.privateKey).export({ format: 'jwk' });
  const publicKey = freeze({ x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') });
  const signerAddress = '0x' + publicKeccak256(Buffer.from(publicKey.x + publicKey.y, 'hex')).subarray(12).toString('hex');
  let bound, record, busy = false, poisoned = false, closed = false, bindAttempted = false, uses = 0;
  let active, keyUsed = false, reservation = null;
  function live() { assert.ok(!closed && !poisoned, 'NATIVE_VALUE_OPERATOR_CLOSED_OR_POISONED'); }
  function poison() { poisoned = true; key = undefined; }
  function owned() { live(); assert.ok(bound, 'NATIVE_VALUE_OPERATOR_NOT_BOUND'); assertOwnedNativeValueSystem(bound.runtime, bound.system);
    assert.equal(bound.system.profile, 'OWNED_GENERIC_NATIVE_VALUE_SYSTEM_V2', 'NATIVE_VALUE_OPERATOR_SYSTEM_PROFILE');
    assert.equal(bound.system.claimsEnabled, false, 'NATIVE_VALUE_OPERATOR_GRAPH_ONLY');
    equal(bound.system.registry, bound.binding.registry); equal(bound.system.adapterProfiles, bound.binding.profiles);
    assert.equal(bound.resources.assertLive(), undefined, 'NATIVE_VALUE_SYNCHRONOUS_LIVENESS_REQUIRED'); }
  async function unchanged() {
    try { equal(await bound.resources.store.load(), record); }
    catch (cause) { poison(); throw new Error('NATIVE_VALUE_JOURNAL_UNAVAILABLE_OR_CHANGED', { cause }); }
  }
  async function save(next) {
    try {
      owned(); await unchanged(); const state = validateNativeValueOperatorInventory(next, bound.binding);
      const result = await bound.resources.store.commit(freeze({ expectedRevision: record.revision, nextState: copy(state) }));
      exactRecord(result, ['revision', 'state']); assert.equal(inputUint(result.revision), BigInt(record.revision) + 1n); equal(result.state, state);
      equal(await bound.resources.store.load(), result); record = copy(result);
    } catch (cause) { poison(); throw new Error('NATIVE_VALUE_DURABLE_WRITE_UNCERTAIN', { cause }); }
  }
  async function current() {
    owned(); budget(active.started);
    assertNativeValueCurrentView(active.view, { runtime: bound.runtime, system: bound.system, poolIndex: active.view.poolIndex });
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
    const registration = bound.binding.profiles[i], policy = bound.policies[i];
    try {
      await current();
      // This private deployment-owned factory must independently reopen the
      // registered original reader, using this signer's authenticated history.
      // No Action/P/R/checkpoint/payout, public callback or cached audit enters it.
      const history = Object.freeze(Object.create(null));
      sourceHistories.set(history, { entry: entry ? copy(entry) : null, policy, sourceIndex: String(signerIndex), nativeId, head: copy(active.view.head) });
      let source;
      try { source = await bound.resources.readerFor({ history, profileCommitment: profileCommitment(registration.profile),
        nativeId, retained: entry ? freeze(copy(entry)) : null, currentRegistry }); }
      finally { sourceHistories.delete(history); }
      assert.ok(source && Object.isFrozen(source), 'NATIVE_VALUE_ORIGINAL_SOURCE_REQUIRED');
      assert.equal(source.sourceIndex, String(signerIndex), 'NATIVE_VALUE_SOURCE_SIGNER_POSITION');
      assert.equal(source.profileCommitment, profileCommitment(registration.profile), 'NATIVE_VALUE_SOURCE_PROFILE');
      assert.ok(!sourceOwners.has(source), 'NATIVE_VALUE_FRESH_SOURCE_INSTANCE_REQUIRED'); sourceOwners.set(source, operator);
      const observed = await source.observe(freeze({ nativeId })); assertTypedSourceObservation(observed, source, policy);
      await current(); inputUint(observed.nativeReadCount, 32, 4096n); assert.equal(observed.nativeId, nativeId); assert.equal(observed.sourceIndex, String(signerIndex));
      if (observed.status !== 'observed') return { status: observed.status === 'reorged' ? 'adverse' : 'unknown',
        reason: observed.status === 'reorged' ? 'NATIVE_VALUE_AUTHENTICATED_SOURCE_ADVERSE' : 'NATIVE_VALUE_SOURCE_UNKNOWN', observed: false, nativeReadCount: observed.nativeReadCount, sourceStatus: observed.status, sourceFailureCode:sourceFailureCode(observed.reason) };
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
      const diagnostic=privateFailureDiagnostic(cause);
      return { status: 'unknown', reason: 'NATIVE_VALUE_SOURCE_UNAVAILABLE_OR_INVALID', observed: false, nativeReadCount: '0', sourceStatus: 'unverified',
        sourceFailureCode:sourceExceptionCode(cause)??(diagnostic.code==='FLAT_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED'?null:diagnostic.code) };
    }
  }
  async function auditAll(allowedPending = null) {
    await current(); await unchanged(); const next = copy(record.state), blockers = [], observations = [];
    next.lastClock = active.view.head.timestamp;
    for (let i = 0; i < next.inventories.length; i++) {
      const inventory = next.inventories[i], finality = new Map();
      if (inventory.entries.length >= 64) blockers.push({ profileCommitment: inventory.profileCommitment, reason: 'NATIVE_VALUE_INVENTORY_SATURATED' });
      for (const entry of inventory.entries) {
        // Deliberately includes expired, unadmitted, unsigned and adverse rows.
        const result = await observe(i, entry.original.nativeId, entry);
        observations.push({ profileCommitment: inventory.profileCommitment, nativeId: entry.original.nativeId,
          attempted: true, nativeObservationReturned: result.observed, authenticatedNativeReadCount: result.nativeReadCount, sourceStatus: result.sourceStatus, priorAdverse: entry.status === 'adverse' });
        if (entry.status !== 'adverse') { entry.status = result.status; entry.reason = result.reason; }
        entry.lastCheckedAt = active.view.head.timestamp;
        if (result.status === 'live') {
          entry.watermark = nativeValueWatermark(result.original.facts);
          const height = entry.watermark.blockHeight, prior = finality.get(height);
          if (prior && prior !== entry.watermark.blockId) { entry.status = 'adverse'; entry.reason = 'NATIVE_VALUE_PROFILE_FINALITY_DISAGREEMENT'; }
          finality.set(height, entry.watermark.blockId);
        }
        if (entry.status !== 'live') blockers.push({ profileCommitment: inventory.profileCommitment, nativeId: entry.original.nativeId, nativeGid: entry.original.facts.nativeGid, status: entry.status, reason: entry.reason, sourceFailureCode: result.sourceFailureCode ?? null });
        if (entry.pending && entry.pending.digest !== allowedPending) blockers.push({ profileCommitment: inventory.profileCommitment,
          nativeId: entry.original.nativeId, reason: 'NATIVE_VALUE_UNFINISHED_SIGNING_INTENT' });
        if (entry.history.length >= MAX_CERTIFICATES_PER_ORIGINAL) blockers.push({ profileCommitment: inventory.profileCommitment,
          nativeId: entry.original.nativeId, reason: 'NATIVE_VALUE_SIGNED_HISTORY_SATURATED' });
      }
    }
    for (const authorization of next.authorizations)
      if (authorization.signature === null && authorization.digest !== allowedPending)
        blockers.push({ reason: 'NATIVE_VALUE_UNFINISHED_HEALTH_INTENT' });
    if (next.authorizations.length >= 256) blockers.push({ reason: 'NATIVE_VALUE_HEALTH_HISTORY_SATURATED' });
    for (const authorization of next.checkpoints)
      if (authorization.signature === null && authorization.digest !== allowedPending)
        blockers.push({ reason: 'NATIVE_VALUE_UNFINISHED_CHECKPOINT_INTENT' });

    if (JSON.stringify(next) !== JSON.stringify(record.state)) await save(next);
    await current(); await unchanged();
    return freeze({ head: copy(active.view.head), inventoryCount: String(observations.length), observations, blockers });
  }
  async function coverage(pending = null) {
    const report = await auditAll(pending); assertNativeValueHealthAllowed(active.view.healthState);
    if(report.blockers.length!==0)throw inventoryFailure(report.blockers); return report;
  }
  async function serial(poolIndex, work, shared = null) {
    owned(); assert.ok(Object.isFrozen(bound.system), 'NATIVE_VALUE_OPERATOR_FROZEN_DEPLOYMENT'); pool(poolIndex); assert.ok(!busy, 'NATIVE_VALUE_OPERATOR_BUSY');
    assert.ok(reservation === null || shared?.token === reservation, 'NATIVE_VALUE_OPERATOR_QUORUM_RESERVED');
    busy = true; keyUsed = false;
    try {
      await unchanged(); if (shared !== null) assert.ok(rounds.has(shared), 'NATIVE_VALUE_PRIVATE_ROUND_REQUIRED');
      const started = shared?.started ?? performance.now();
      const view = shared?.view ?? await bound.readers[poolIndex].read();
      active = { view, started }; assert.equal(view.poolIndex, poolIndex); await current();
      const result = await work(view); await current(); await unchanged(); await current(); return result;
    } catch (cause) {
      if (keyUsed) { poison(); throw new Error('NATIVE_VALUE_POST_KEY_UNCERTAIN', { cause }); }
      throw cause;
    } finally { busy = false; active = undefined; keyUsed = false; }
  }
  function keySign(bytes) { owned(); assert.ok(Object.isFrozen(bound.system), 'NATIVE_VALUE_OPERATOR_FROZEN_DEPLOYMENT'); budget(active.started); keyUsed = true; uses++; return sign(key, bytes).toString('hex'); }
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
        const signature = keySign(bytes); assertNativeValueSignature(publicKey, signature, bytes);
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
        const signature = keySign(bytes); assertNativeValueSignature(publicKey, signature, bytes);
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
      await coverage(); const i = bound.binding.profiles.findIndex(row => profileCommitment(row.profile) === input.profileCommitment);
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
      if(result.status!=='live'){
        const failure=new Error('NATIVE_VALUE_NEW_ORIGINAL_UNAVAILABLE');
        failure.causeCodes=Object.freeze([result.reason,result.sourceFailureCode].filter(value=>typeof value==='string'));
        throw failure;
      }
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
      const signature = keySign(bytes); assertNativeValueSignature(publicKey, signature, bytes);
      const certificate = { schema: factsSchema(bound.policies[i]), signerIndex: String(signerIndex), facts, frameHex: bytes.toString('hex'), digest, signature };
      const signed = copy(record.state), row = signed.inventories[i].entries[position];
      row.history.push(certificate); row.pending = null;
      if (BigInt(facts.observation.evidenceUntil) > BigInt(row.maximumEvidenceUntil)) row.maximumEvidenceUntil = facts.observation.evidenceUntil;
      await save(signed); await coverage(); return freeze(copy(certificate));
    }, shared);
  }
  const operator = Object.freeze({ profile: NATIVE_VALUE_OPERATOR_PROFILE, signerIndex, publicKey,
    async bind(input) {
      exactRecord(input, ['runtime', 'system']); live(); assert.ok(!bindAttempted, 'NATIVE_VALUE_BIND_ONCE'); bindAttempted = true;
      try {
        const { runtime, system } = input; assertOwnedNativeValueSystem(runtime, system);
        const binding = nativeValueInventoryBinding({ registry: system.registry, profiles: system.adapterProfiles, signerIndex: String(signerIndex), publicKey });
        // The private one-use request prevents a holder of the public system
        // from opening this operator's resource store and rewriting its history.
        const request = Object.freeze(Object.create(null));
        bootstrapRequests.set(request, { runtime, system, signerIndex, publicKey });
        let resources;
        try { resources = nativeValueOperatorResources(runtime, system, request); }
        finally { bootstrapRequests.delete(request); }
        exactRecord(resources, ['store', 'readerFor', 'assertLive']); exactRecord(resources.store, ['load', 'commit']);
        for (const fn of [resources.store.load, resources.store.commit, resources.readerFor, resources.assertLive]) assert.equal(typeof fn, 'function');
        const readers = await Promise.all([0, 1].map(poolIndex => createNativeValueSystemStateReader({ runtime, system, poolIndex })));
        bound = { runtime, system, binding, resources, readers, policies: binding.profiles.map(row => nativeValuePolicy(binding, row)) };
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
    close() { assert.ok(!busy && reservation === null, 'NATIVE_VALUE_OPERATOR_BUSY'); closed = true; key = undefined; },
  });
  operators.set(operator, { reserve(token) { owned(); assert.ok(!busy && reservation === null, 'NATIVE_VALUE_OPERATOR_BUSY'); reservation = token; },
    release(token) { assert.ok(!busy && reservation === token, 'NATIVE_VALUE_OPERATOR_RESERVATION'); reservation = null; },
    bound: () => { owned(); return bound; }, health, certify, checkpoint,
    coverage: shared => serial(shared.view.poolIndex, () => coverage(), shared),
    useCount: () => uses, poisonIfUsed: count => { if (uses !== count) poison(); }, poison,
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
  async function run(kind, request) {
    const input = copy(request); pool(input.poolIndex); assert.ok(!busy, 'NATIVE_VALUE_QUORUM_BUSY'); busy = true;
    const counts = states.map(state => state.useCount()), token = Object.freeze(Object.create(null)), reserved = [];
    try {
      binding(); for (const state of states) { state.reserve(token); reserved.push(state); }
      const started = performance.now(), view = await first.readers[input.poolIndex].read(), shared = Object.freeze({ view, started, token }); rounds.add(shared);
      const results = await drained(states.map(state => () => state[kind](input, shared))); budget(started); binding();
      // Final fresh independently reobserved inventories after all signatures
      // have persisted. A failure poisons every key used by this whole round.
      const audits = await drained(states.map(state => () => state.coverage(shared)));
      await first.readers[input.poolIndex].assertCurrent(view); binding(); budget(started);
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
      const registration = first.binding.profiles.find(row => profileCommitment(row.profile) === input.profileCommitment);
      const policy = nativeValuePolicy(first.binding, registration);
      const collected = assertFactsQuorum(results, policy, chosen.map(op => registration.sources[op.signerIndex]));
      const interval = collected.facts.observation;
      assert.ok(BigInt(interval.evidenceFrom) <= BigInt(view.head.timestamp) && BigInt(view.head.timestamp) < BigInt(interval.evidenceUntil), 'NATIVE_VALUE_FACTS_EXPIRED');
      return freeze({ certificates: results, collected, head: copy(view.head), audits });
    } catch (cause) { states.forEach((state, i) => state.poisonIfUsed(counts[i])); throw cause; }
    finally { for (const state of reserved) state.release(token); busy = false; }
  }
  const quorum = Object.freeze({ health: request => run('health', request), certify: request => run('certify', request), checkpoint: request => run('checkpoint', request),
    signerIndexes: freeze(chosen.map(op => op.signerIndex)) });
  quorums.set(quorum, { runtime: first.runtime, system: first.system, binding }); return quorum;
}
export function assertOwnedNativeValueQuorum(quorum, { runtime, system }) {
  const state = quorums.get(quorum); assert.ok(state && state.runtime === runtime && state.system === system, 'NATIVE_VALUE_OWNED_QUORUM_REQUIRED');
  state.binding();
}

/** Original receiver clock bound to the same private token as retained native
 * history. It exposes DATA only, never a callback, signer or ownership grant.
 * Source factories read this before consuming history; copied tokens fail. */
export function nativeValueRetainedSourceClock(token, { policy, sourceIndex, nativeId }) {
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
export function nativeValueRetainedSourceHistory(token, { policy, sourceIndex, nativeId }) {
  const item = sourceHistories.get(token);
  assert.ok(item, 'NATIVE_VALUE_PRIVATE_RETAINED_HISTORY_REQUIRED');
  equal(item.policy, policy); assert.equal(item.sourceIndex, sourceIndex); assert.equal(item.nativeId, nativeId);
  sourceHistories.delete(token); return item.entry ? freeze(copy(item.entry)) : null;
}

/** Consumes only the private request created inside bind(), never a public slot. */
export function consumeNativeValueOperatorBootstrapRequest(token, { runtime, system }) {
  const entry = bootstrapRequests.get(token);
  assert.ok(entry && entry.runtime === runtime && entry.system === system, 'NATIVE_VALUE_PRIVATE_BOOTSTRAP_REQUEST');
  bootstrapRequests.delete(token); return freeze({ signerIndex: entry.signerIndex, publicKey: entry.publicKey });
}
