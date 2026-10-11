import {createOriginalNativeInventoryRoundV4} from './original-inventory-round-v4.mjs';
import {assertOriginalNativeAuditBudgetV4,runOriginalNativeAuditV4} from './original-audit-round-v4.mjs';
import {createOriginalCurrentRoundChecksV4} from './original-current-round-v4.mjs';
/** Fixed-purpose owned V2 operators. One private key and one atomic CAS journal
 * per signer, complete typed inventory, no raw signer/audit callback/verified
 * boolean. Shares only an authenticated immutable receiver head with siblings.
 * Activation is impossible until native-value-system-v2 owns a real deployment. */
import assert from 'node:assert/strict';
import { privateFailureDiagnostic } from '../../../execution/account/reconciliation/failure-diagnostics.mjs';
import { retainNativeValueOriginalAuditTimingV1 } from '../../../execution/native-value/reconciliation/native-value-failure-retention.mjs';
import { types } from 'node:util';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { signature as sign } from '@lianum/engine/notes/private-note-encoding';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { nativeHubSignatureToAbi } from '@lianum/engine/evidence/native-hub-messages';
import { exactRecord, fixedArray, bytes32 } from '@lianum/components/encoding/commitments';
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
import {assertNativeEconomicRecoveryCaptureV1,nativeEconomicRecoverySectionIdentityV1} from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
const bootstrapRequests = new WeakMap();
const operators = new WeakMap(), quorums = new WeakMap(), sourceOwners = new WeakMap(), sourceHistories = new WeakMap(), rounds = new WeakSet();
// Share only an outstanding public receiver-current check inside the genuine
// quorum round. Every settled check is discarded; inventories, store reads,
// native observations, certificates and key/send rounds remain independent.
const roundCurrentChecks = createOriginalCurrentRoundChecksV4();
// Numeric diagnostics follow the SAME original whole round across certify and
// final coverage. These private counters cannot reset or authorize its timer.
const roundAuditTimings = new WeakMap();
function newOriginalAuditTimingV4(){return {profile:'NATIVE_VALUE_ORIGINAL_AUDIT_TIMING_V1',operation:'audit',phase:'initial',
  currentMilliseconds:0,storeMilliseconds:0,nativeSourceMilliseconds:0,
  currentChecks:0,storeLoads:0,storeCommits:0,nativeSourceObservations:0,nativeReadCount:0};}
async function assertRoundCurrent(shared, reader, view) {
  if (shared === null) return reader.assertCurrent(view);
  assert.ok(rounds.has(shared) && shared.view === view, 'NATIVE_VALUE_PRIVATE_CURRENT_ROUND_REQUIRED');
  return roundCurrentChecks.check(shared, reader, view);
}
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
import { nativeSourceRecoverySectionIdentityV1 } from '../../recovery/native-original-source-lifecycle-v1.mjs';
const signerSlot = n => { assert.ok(Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0 && n < 4, 'NATIVE_VALUE_SIGNER_INDEX'); return n; };
const word = n => BigInt(n).toString(16).padStart(64, '0');
const b32 = n => '0x' + n;
async function drained(work) {
  const results = await Promise.allSettled(work.map(fn => Promise.resolve().then(fn)));
  const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
  return results.map(result => result.value);
}
const budget = started => assertOriginalNativeAuditBudgetV4(started, performance.now());
/** Creates only a dedicated synthetic same-host attester. Cannot import/export
 * a private key, bind a V1 system, or sign before authenticated private bootstrap. */
export function createLocalNativeValueOperator(raw) {
  assert.equal(arguments.length,1);return createNativeOperator(raw);
}
function createNativeOperator(raw,recovery=null) {
  exactRecord(raw, ['signerIndex']); const signerIndex = signerSlot(raw.signerIndex);
  if(recovery){exactRecord(recovery,['schema','signerIndex','publicKey','privateKeyPem','uses','record','binding']);assert.equal(recovery.schema,'ORIGINAL_NATIVE_OPERATOR_ECONOMIC_RECOVERY_V1');assert.equal(recovery.signerIndex,signerIndex);assert.ok(Number.isSafeInteger(recovery.uses)&&recovery.uses>=0);}
  let key = recovery?{privateKey:createPrivateKey(recovery.privateKeyPem)}:generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = createPublicKey(key.privateKey).export({ format: 'jwk' });
  assert.equal(jwk.crv,'secp256k1','NATIVE_VALUE_OPERATOR_ORIGINAL_KEY_CURVE');
  const publicKey = freeze({ x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') });
  const signerAddress = '0x' + publicKeccak256(Buffer.from(publicKey.x + publicKey.y, 'hex')).subarray(12).toString('hex');
  if(recovery)equal(publicKey,recovery.publicKey);
  let bound, record, busy = false, poisoned = false, closed = false, bindAttempted = false, uses = recovery?.uses??0, sourceIdentity=null;
  let capturing=false,captured=false,captureToken;
  let active, keyUsed = false, reservation = null;
  function live() { assert.ok(!closed && !poisoned && !capturing, 'NATIVE_VALUE_OPERATOR_CLOSED_OR_POISONED'); }
  function poison() { poisoned = true; key = undefined; }
  function owned() { live(); assert.ok(bound, 'NATIVE_VALUE_OPERATOR_NOT_BOUND'); assertOwnedNativeValueSystem(bound.runtime, bound.system);
    assert.equal(bound.system.profile, 'OWNED_GENERIC_NATIVE_VALUE_SYSTEM_V2', 'NATIVE_VALUE_OPERATOR_SYSTEM_PROFILE');
    assert.equal(bound.system.claimsEnabled, false, 'NATIVE_VALUE_OPERATOR_GRAPH_ONLY');
    equal(bound.system.registry, bound.binding.registry); equal(bound.system.adapterProfiles, bound.binding.profiles);
    assert.equal(bound.resources.assertLive(), undefined, 'NATIVE_VALUE_SYNCHRONOUS_LIVENESS_REQUIRED'); }
  // Numeric private failure diagnostics only. Store counts are original
  // operator requests; source time excludes its nested receiver-current reads.
  async function timedStore(kind, work) {
    const timing = active?.timing, began = performance.now();
    if (timing) timing[kind === 'load' ? 'storeLoads' : 'storeCommits']++;
    try { return await work(); }
    finally { if (timing) timing.storeMilliseconds += performance.now() - began; }
  }
  function timingPhase(value) { if (active) active.timing.phase = value; }
  const inventoryRound = createOriginalNativeInventoryRoundV4({
    get bound() {return bound;}, get record() {return record;},
    set record(value) {record=value;}, get active() {return active;},
  }, Object.freeze({copy,freeze,equal,exactRecord,inputUint,validateNativeValueOperatorInventory,
    nativeValueWatermark,MAX_CERTIFICATES_PER_ORIGINAL,owned,poison,timedStore,current,observe,
    profileCommitment,encodeFacts,sha256,bytes32,pool,serial,timingPhase,coverage,keySign,
    assertNativeValueSignature,factsSchema,signerIndex,publicKey}));
  const unchanged = () => inventoryRound.unchanged();
  const save = next => inventoryRound.save(next);
  async function current() {
    const timing = active?.timing, began = performance.now();
    if (timing) timing.currentChecks++;
    try {
      owned(); budget(active.started);
      assertNativeValueCurrentView(active.view, { runtime: bound.runtime, system: bound.system, poolIndex: active.view.poolIndex });
      await assertRoundCurrent(active.shared, bound.readers[active.view.poolIndex], active.view); owned(); budget(active.started);
      assert.ok(BigInt(active.view.head.timestamp) >= BigInt(record.state.lastClock), 'NATIVE_VALUE_RECEIVER_CLOCK_ROLLBACK');
    } finally { if (timing) timing.currentMilliseconds += performance.now() - began; }
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
      let source, observed;
      const timing = active.timing, sourceBegan = performance.now(), priorCurrent = timing.currentMilliseconds;
      try {
        try { source = await bound.resources.readerFor({ history, profileCommitment: profileCommitment(registration.profile),
          nativeId, retained: entry ? freeze(copy(entry)) : null, currentRegistry }); }
        finally { sourceHistories.delete(history); }
        assert.ok(source && Object.isFrozen(source), 'NATIVE_VALUE_ORIGINAL_SOURCE_REQUIRED');
        assert.equal(source.sourceIndex, String(signerIndex), 'NATIVE_VALUE_SOURCE_SIGNER_POSITION');
        assert.equal(source.profileCommitment, profileCommitment(registration.profile), 'NATIVE_VALUE_SOURCE_PROFILE');
        assert.ok(!sourceOwners.has(source), 'NATIVE_VALUE_FRESH_SOURCE_INSTANCE_REQUIRED'); sourceOwners.set(source, operator);
        timing.nativeSourceObservations++;
        observed = await source.observe(freeze({ nativeId })); assertTypedSourceObservation(observed, source, policy);
        // Count only the genuine source's bounded numeric return. All original
        // validation and currentness assertions still follow in their old order.
        const reads = observed.nativeReadCount;
        if (typeof reads === 'string' && /^(0|[1-9][0-9]{0,3})$/.test(reads) && Number(reads) <= 4096)
          timing.nativeReadCount += Number(reads);
      } finally { timing.nativeSourceMilliseconds += Math.max(0, performance.now() - sourceBegan - (timing.currentMilliseconds - priorCurrent)); }
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
  const auditAll = (pending = null) => inventoryRound.audit(pending);
  async function coverage(pending = null) {
    const report = await auditAll(pending); assertNativeValueHealthAllowed(active.view.healthState);
    if(report.blockers.length!==0)throw inventoryFailure(report.blockers); return report;
  }
  async function serial(poolIndex, work, shared = null) {
    return runOriginalNativeAuditV4(poolIndex, work, shared, {
      admit(index, round) {
        owned();
        assert.ok(Object.isFrozen(bound.system), 'NATIVE_VALUE_OPERATOR_FROZEN_DEPLOYMENT');
        pool(index);
        assert.ok(!busy, 'NATIVE_VALUE_OPERATOR_BUSY');
        assert.ok(reservation === null || round?.token === reservation, 'NATIVE_VALUE_OPERATOR_QUORUM_RESERVED');
      },
      begin() { busy = true; keyUsed = false; },
      finish() { busy = false; active = undefined; keyUsed = false; },
      now: () => performance.now(), unchanged, current,
      assertRound: round => assert.ok(rounds.has(round), 'NATIVE_VALUE_PRIVATE_ROUND_REQUIRED'),
      read: index => bound.readers[index].read(),
      timing: round => round === null ? newOriginalAuditTimingV4() : roundAuditTimings.get(round)?.get(operator),
      activate: state => { active = state; },
      active: () => active, keyUsed: () => keyUsed, poison,
      retain: retainNativeValueOriginalAuditTimingV1,
    });
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
      active.timing.operation = 'health';
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
      active.timing.operation = 'checkpoint';
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
  const certify = (request, shared = null) => inventoryRound.certify(request, shared);
  const operator = Object.freeze({ profile: NATIVE_VALUE_OPERATOR_PROFILE, signerIndex, publicKey,
    async bind(input) {
      exactRecord(input, ['runtime', 'system']); live(); assert.ok(!bindAttempted, 'NATIVE_VALUE_BIND_ONCE'); bindAttempted = true;
      try {
        const { runtime, system } = input; assertOwnedNativeValueSystem(runtime, system);
        const observedBinding = nativeValueInventoryBinding({ registry: system.registry, profiles: system.adapterProfiles, signerIndex: String(signerIndex), publicKey });
        // Only the one-use original bootstrap token can retain this byte order.
        // The current deployed identity must still match every semantic field.
        const binding = recovery ? nativeValueInventoryBinding(recovery.binding) : observedBinding;
        if (recovery) equal(binding, observedBinding);
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
        validateNativeValueOperatorInventory(record.state, binding);
        if(recovery){equal(binding,recovery.binding);equal(record,recovery.record);recovery=null;}
        await unchanged(); owned();
        return freeze({ profile: NATIVE_VALUE_OPERATOR_PROFILE, signerIndex, publicKey });
      } catch (cause) { poison(); throw cause; }
    },
    health(request) { assert.equal(arguments.length, 1, 'NATIVE_VALUE_PUBLIC_REQUEST_ARITY'); return health(request); },
    certify(request) { assert.equal(arguments.length, 1, 'NATIVE_VALUE_PUBLIC_REQUEST_ARITY'); return certify(request); },
    checkpoint(request) { assert.equal(arguments.length, 1, 'NATIVE_VALUE_PUBLIC_REQUEST_ARITY'); return checkpoint(request); },
    audit(request) { const input = copy(request); exactRecord(input, ['poolIndex']); return serial(pool(input.poolIndex), () => auditAll()); },
    status() { return freeze({ closed, poisoned, bound: !!bound, busy, reserved: reservation !== null, signerIndex, keyUses: String(uses) }); },
    close() { assert.ok(!capturing||closed,'NATIVE_VALUE_OPERATOR_CAPTURE_OWNS_LIFETIME');assert.ok(!busy && reservation === null, 'NATIVE_VALUE_OPERATOR_BUSY');closed = true;key = recovery = undefined; },
  });
  operators.set(operator, {
    sourceSnapshot(token) {
      const admitted=nativeSourceRecoverySectionIdentityV1(token,'bootstrap');owned();
      assert.ok(bound&&record&&key,'NATIVE_VALUE_SOURCE_OPERATOR_ORIGINAL_REQUIRED');
      if(sourceIdentity)equal(admitted,sourceIdentity);else sourceIdentity=copy(admitted);
      return {schema:'ORIGINAL_NATIVE_OPERATOR_ECONOMIC_RECOVERY_V1',signerIndex,publicKey:copy(publicKey),
        privateKeyPem:key.privateKey.export({format:'pem',type:'pkcs8'}).toString(),uses,record:copy(record),binding:copy(bound.binding)};
    },
    recoveryIdle(){owned();assert.ok(bound&&record&&!busy&&reservation===null&&!keyUsed,'NATIVE_VALUE_OPERATOR_RECOVERY_NOT_IDLE');},
    fence(authority){assertNativeEconomicRecoveryCaptureV1(authority);owned();assert.equal(sourceIdentity,null,'NATIVE_SOURCE_OPERATOR_LEGACY_CAPTURE_DENIED');assert.ok(bound&&record&&!busy&&reservation===null&&!keyUsed,'NATIVE_VALUE_OPERATOR_RECOVERY_NOT_IDLE');capturing=true;},
    capture(token){nativeEconomicRecoverySectionIdentityV1(token,'bootstrap');assert.ok(capturing&&!closed&&!poisoned&&!busy&&reservation===null&&!captured,'NATIVE_VALUE_OPERATOR_RECOVERY_FENCE_REQUIRED');
      captured=true;captureToken=token;return {schema:'ORIGINAL_NATIVE_OPERATOR_ECONOMIC_RECOVERY_V1',signerIndex,publicKey:copy(publicKey),
        privateKeyPem:key.privateKey.export({format:'pem',type:'pkcs8'}).toString(),uses,record:copy(record),binding:copy(bound.binding)};},
    stopCaptured(token){nativeEconomicRecoverySectionIdentityV1(token,'bootstrap');assert.equal(token,captureToken);assert.ok(capturing&&captured&&!busy&&reservation===null,'NATIVE_VALUE_OPERATOR_CAPTURE_REQUIRED');closed=true;key=recovery=undefined;return {closed:true};},
    abortCaptured(token){nativeEconomicRecoverySectionIdentityV1(token,'bootstrap');if(captureToken)assert.equal(token,captureToken);assert.ok(capturing&&!busy&&reservation===null,'NATIVE_VALUE_OPERATOR_RECOVERY_FENCE_REQUIRED');closed=true;key=recovery=undefined;return {closed:true,recoveryIncomplete:true};},
    reserve(token) { owned(); assert.ok(!busy && reservation === null, 'NATIVE_VALUE_OPERATOR_BUSY'); reservation = token; },
    release(token) { assert.ok(!busy && reservation === token, 'NATIVE_VALUE_OPERATOR_RESERVATION'); reservation = null; },
    bound: () => { owned(); return bound; }, health, certify, checkpoint,
    coverage: shared => serial(shared.view.poolIndex, () => { active.timing.operation = 'coverage'; return coverage(); }, shared),
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
    let shared;
    try {
      binding(); for (const state of states) { state.reserve(token); reserved.push(state); }
      const started = performance.now(), view = await first.readers[input.poolIndex].read(), headReadMilliseconds=performance.now()-started;
      shared = Object.freeze({ view, started, token }); rounds.add(shared);
      roundCurrentChecks.retain(shared, first.readers[input.poolIndex], view);
      roundAuditTimings.set(shared,new Map(chosen.map(operator=>{const timing=newOriginalAuditTimingV4();timing.currentMilliseconds=headReadMilliseconds;return [operator,timing];})));
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
    finally { if (shared) { roundCurrentChecks.revoke(shared);roundAuditTimings.delete(shared); rounds.delete(shared); } for (const state of reserved) state.release(token); busy = false; }
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


/** Private operator retention paths. JSON/public-key data cannot create one. */
function nativeRecoveryOperator(operator){const state=operators.get(operator);assert.ok(state,'NATIVE_VALUE_ORIGINAL_OPERATOR_REQUIRED');return state;}
export function assertNativeOperatorEconomicRecoveryIdleV1(operator){assert.equal(arguments.length,1);nativeRecoveryOperator(operator).recoveryIdle();}
export function fenceOriginalNativeOperatorEconomicRecoveryV1(operator,authority){assert.equal(arguments.length,2);nativeRecoveryOperator(operator).fence(authority);}
export function captureOriginalNativeOperatorEconomicRecoveryV1(operator,token){assert.equal(arguments.length,2);return nativeRecoveryOperator(operator).capture(token);}
export function stopCapturedNativeOperatorEconomicRecoveryV1(operator,token){assert.equal(arguments.length,2);return nativeRecoveryOperator(operator).stopCaptured(token);}
export function abortNativeOperatorEconomicRecoveryV1(operator,token){assert.equal(arguments.length,2);return nativeRecoveryOperator(operator).abortCaptured(token);}
export async function reopenOriginalNativeOperatorEconomicRecoveryV1(token){
 assert.equal(arguments.length,1);const {consumeNativeBootstrapOperatorRecoveryV1}=await import('./native-value-local-operator-bootstrap-v4.mjs');
 const retained=consumeNativeBootstrapOperatorRecoveryV1(token);return createNativeOperator({signerIndex:retained.signerIndex},retained);
}

/** Only a SOURCE bootstrap token admits this original private signer snapshot.
 * Busy records are inspected only by the same bootstrap CAS barrier; no key,
 * signer or record is returned from an operator's public interface. */
export function snapshotOriginalNativeOperatorSourceV1(operator,token) {
  assert.equal(arguments.length,2);return nativeRecoveryOperator(operator).sourceSnapshot(token);
}
