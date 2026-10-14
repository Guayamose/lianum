import { createOriginalFactsRetentionV2 } from './original-facts-retention-v2.mjs';
/** Bounded same-host synthetic operators, one dedicated attester key each.
 * No arbitrary-message signer, unowned observer/clock/store, native transfer,
 * independent-operator claim or restart/rotation service is exposed. */
import assert from 'node:assert/strict';
import { AssertionError } from 'node:assert';
import { createHash, createPublicKey, createPrivateKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { types, isDeepStrictEqual } from 'node:util';
import { canonical } from '@lianum/engine/crypto/privacy';
import { createClaimRecordStore, openClaimRecordStore } from '@lianum/engine/storage/records';
import { signature as lowSignature } from '@lianum/engine/notes/private-note-encoding';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { assertLocalEvm } from '../../../chains/evm/runtime/local-evm-ownership.mjs';
import { decodeCanonicalEvmTransaction } from '../../../chains/evm/contracts/transaction-wire-codec.mjs';
import {isOwnedMetaMorphoGraphDeliveryBatchV4} from '../../../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';
import { assertOwnedEvmGraphDeliveryObserverV1, assertOwnedEvmGraphDeliveryFactsV1 }
  from '../../../chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs';
import { nativeAdmissionRulesTree } from '@lianum/engine/execution/native/dispatch/native-admission';
import { checkpointAuthorizationFrame, checkpointAuthorizationDigest, assertCheckpointAuthorizationValid,
  revocationFrame, revocationMessage, assertRevocationAuthorizationValid, nativeHubSignatureToAbi,
  createNativeHubMessageHostVerifier } from '@lianum/engine/evidence/native-hub-messages';
import { assertOwnedFlatSystem } from '../../deployments/system/deploy-system.mjs';
import { createFlatSystemStateReader } from '../../../execution/account/reconciliation/flat-system-state.mjs';
import { exactRecord, fixedArray, bytes32 } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import { assertOwnedBitcoinRuntime } from '../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime } from '../../../chains/solana/runtime/owned-solana-runtime.mjs';
import { createOriginalMetaMorphoBatchFactsPeerV4,createOriginalMetaMorphoBatchFactsInventoryV4,createNativeFactsSigner, createNativeFactsPeer, createNativeFactsInventory,
  createNativeFactsCollector } from '../../../chains/shared/dispatch/native-facts-peer.mjs';
import { nativeRuleCommitment, nativeFactsDigest, encodeNativeFacts, FACTS_SCHEMA } from '@lianum/engine/native/native-receipt-binding';
import { encodeFlatNativeHealth, flatNativeHealthDigest, assertFlatNativeHealth } from '../../../chains/shared/health/native-health.mjs';
import { assertStableOperatorFact } from './operator-fact-audit.mjs';
import { createOwnedOperatorNativeReads } from './owned-native-operator-reads.mjs';
import { acquireCombinedOperatorCustody, assertCombinedOperatorLive, combinedOperatorStatus,
  registerCombinedOperatorBranch, poisonCombinedOperator, closeCombinedOperator,
  signCombinedGraphAuthorization, createCombinedFactsSigner, assertCombinedGraphBinding,
  assertCombinedClaimCoverage } from './combined-native-operators.mjs';

export const LOCAL_FLAT_OPERATOR_PROFILE = 'SAME_HOST_SYNTHETIC_ONE_KEY_FLAT_OPERATOR_V1';
export const FLAT_FACTS_VALIDATION_PROFILE = 'SAME_HOST_GRAPH_FACTS_FINAL_FRESH_ROUND_V2';
const SCHEMA = 'LOCAL_FLAT_OPERATOR_INVENTORY_V3';
const operators = new WeakMap(), quorums = new WeakMap(), anchors = new WeakSet();
const privateAuditActivities = new WeakMap();
const sha = value => createHash('sha256').update(value).digest('hex');
const prefix = value => '0x' + value;
const unprefix = value => { assert.match(value, /^0x[0-9a-f]{64}$/); return value.slice(2); };
const word = value => BigInt(value).toString(16).padStart(64, '0');
const equal = (a, b) => assert.deepEqual(a, b, 'FLAT_OPERATOR_CHANGED_DATA');
const copy = cloneInput, freeze = frozenInput;
const AUDIT_PHASES = Object.freeze(['graph-current', 'after-native-audit', 'before-claim-coverage', 'after-claim-coverage', 'after-operation']);
function signingFailure(cause) {
  const codes = [], seen = new Set(); let current = cause, auditBudget;
  const protocol = /^(?:FLAT_OPERATOR|COMBINED_OPERATOR|CLAIM|CLAIM_STORE|CLAIM_OPERATOR|FLAT_STATE|OPERATOR_NATIVE_READ|FACTS_PEER|VAULT)_[A-Z0-9_]{1,100}$/;
  for (let depth = 0; depth < 6 && current && !types.isProxy(current) && types.isNativeError(current) && !seen.has(current); depth++) {
    seen.add(current);
    const fields = Object.getOwnPropertyDescriptors(current);
    const value = name => fields[name] && Object.hasOwn(fields[name], 'value') ? fields[name].value : undefined;
    const message = value('message');
    const candidate = current instanceof AssertionError && value('generatedMessage') === false && typeof message === 'string'
      ? message.split('\n', 1)[0] : value('code') ?? message;
    if (typeof candidate === 'string' && protocol.exec(candidate)?.[0] === candidate && !codes.includes(candidate)) codes.push(candidate);
    const budget = value('auditBudget');
    if (!auditBudget && candidate === 'FLAT_OPERATOR_AUDIT_TOO_OLD' && budget && !types.isProxy(budget)) {
      const fields = Object.getOwnPropertyDescriptors(budget), keys = Reflect.ownKeys(fields);
      if (keys.length === 3 && ['phase', 'elapsedMilliseconds', 'limitMilliseconds'].every(name => fields[name]
        && Object.hasOwn(fields[name], 'value')) && AUDIT_PHASES.includes(fields.phase.value)
        && Number.isSafeInteger(fields.elapsedMilliseconds.value) && fields.elapsedMilliseconds.value >= 0
        && fields.elapsedMilliseconds.value <= 3_600_000 && fields.limitMilliseconds.value === 30_000)
        auditBudget = Object.freeze({ phase: fields.phase.value, elapsedMilliseconds: fields.elapsedMilliseconds.value, limitMilliseconds: 30_000 });
    }
    current = value('cause');
  }
  return Object.assign(new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN', { cause }), {
    code: 'FLAT_OPERATOR_SIGNING_UNCERTAIN', causeCode: codes.at(-1) ?? null, causeCodes: Object.freeze(codes),
    ...(auditBudget ? { auditBudget } : {}),
  });
}
function assertInventoryRecordBound(revision, data) {
  // Keep the golden graph record's 1 MiB / 100k-node / depth-64 bound even
  // though the shared V3 storage implementation supports larger claim records.
  canonical({ revision, data });
}
function index(value) { assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value < 4, 'FLAT_OPERATOR_INDEX'); return value; }
function poolIndex(value) { index(value); assert.ok(value < 2, 'FLAT_OPERATOR_POOL'); return value; }
function healthAllowed(view) {
  assert.equal(view.healthState.halted, '0', 'FLAT_OPERATOR_HALTED');
  assert.equal(view.healthState.revocationOverflowCount, '0', 'FLAT_OPERATOR_OVERFLOW');
  for (const name of ['receiptCount', 'spentTagCount', 'revokedCount'])
    assert.ok(inputUint(view.healthState[name], 32, 64n) < 64n, 'FLAT_OPERATOR_SATURATED');
}
function frame(tag, parts) {
  return Buffer.concat([Buffer.from(tag), ...parts].flatMap(part => {
    const length = Buffer.alloc(4); length.writeUInt32BE(part.length); return [length, part];
  }));
}
const OBSERVED = ['status', 'genesis', 'asset', 'nativeWire', 'intent', 'blockId', 'blockHeight',
  'finalityKind', 'confirmations', 'nativeContext'];
function observationFromEntry(entry) {
  const facts = entry.facts, observation = facts.observation;
  return { status: 'observed', genesis: facts.genesis, asset: facts.asset,
    nativeWire: entry.nativeWire, intent: copy(entry.intent), blockId: observation.blockId,
    blockHeight: observation.blockHeight, finalityKind: observation.finalityKind,
    confirmations: observation.confirmations, nativeContext: copy(facts.nativeContext) };
}
function assertNativeCapabilities(binding) {
  for (const family of binding.families) {
    if (family === '1') assertOwnedBitcoinRuntime(binding.bitcoin);
    else if (family === '2') assertOwnedSolanaRuntime(binding.solana);
    else assertOwnedEvmGraphDeliveryObserverV1(binding.evmDelivery, {
      runtime: binding.runtime, system: binding.system, poolIndex: binding.evmPoolIndex });
  }
}
// The latest fresh context is retained separately from the signed reference.
// Comparing only to the old certificate misses a changed later same-height tip.
function assertCurrentNativeContext(family, before, after) {
  if (!before || !['1', '3'].includes(family)) return;
  assert.ok(inputUint(after.observedTipHeight) >= inputUint(before.observedTipHeight), 'FLAT_OPERATOR_NATIVE_TIP_ROLLBACK');
  if (after.observedTipHeight === before.observedTipHeight)
    assert.equal(after.observedTipId, before.observedTipId, 'FLAT_OPERATOR_NATIVE_SAME_HEIGHT_TIP_CHANGED');
}

/** Generates exactly one fresh synthetic secp256k1 key. No key import/export,
 * raw sign function, or sibling operators' private material is accepted. */
/** Private original-journal activity. The retained epoch is scope-specific;
 * this does not count all legacy or ephemeral key invocations. */
export function graphOperatorPrivateAuditActivity(capability) {
  assert.equal(arguments.length, 1, 'GRAPH_PRIVATE_AUDIT_ACTIVITY_NO_OPTIONS');
  const capture = privateAuditActivities.get(capability);
  assert.ok(capture, 'GRAPH_PRIVATE_AUDIT_ACTIVITY_ORIGINAL_OPERATOR_REQUIRED');
  return capture();
}

export function createLocalFlatOperator(input) { return createFlatOperator(input, null); }

/** Internal constructor: only the combined factory holds an original token. */
export function createScopedFlatOperator(input, custody) {
  assertCombinedOperatorLive(custody); return createFlatOperator(input, custody);
}
function createFlatOperator(input, custody, recovered = null) {
  exactRecord(input, ['signerIndex']); const signerIndex = index(input.signerIndex);
  let key = custody ? null : recovered ? {privateKey:createPrivateKey(recovered.privateKeyPem)} : generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = key && createPublicKey(key.privateKey).export({ format: 'jwk' });
  const publicKey = custody ? acquireCombinedOperatorCustody(custody, 'graph', signerIndex)
    : freeze({ x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') });
  if(recovered)equal(publicKey,recovered.publicKey);
  let retention=null,storeOptions=null;
  const signerAddress = '0x' + publicKeccak256(Buffer.from(publicKey.x + publicKey.y, 'hex')).subarray(12).toString('hex');
  let bound, bindAttempted = false, busy = false, poisoned = false, closed = false;
  let vault, inventoryPath, record, peers, collectors, factReaders, policies, paths, recipients, activeView, activeAnchor, activeFreshness, activeBudget;
  let originalFactsCertificates = new WeakMap(), activeKeyUsed = false, operationGeneration = 0, keyUseEpoch = 0;
  const coverageTicketsV4 = new WeakSet(), coverageStatesV4 = new WeakMap();
  // Original immutable reader-issued EVM reconstructions only, one per pool.
  // Native observations/inventories are never cached or shared with a sibling.
  const currentViews = [undefined, undefined];
  const live = () => {
    assert.ok(!closed && !poisoned, 'FLAT_OPERATOR_CLOSED_OR_POISONED');
    if (custody) assertCombinedOperatorLive(custody);
    if(retention)assert.ok(!retention.fault&&!retention.sealed,'FLAT_OPERATOR_ORIGINAL_RETAINED_GROUP_CLOSED');
  };
  const poison = () => { poisoned = true; if (custody) poisonCombinedOperator(custody); };
  const cleanup = () => {
    closed = true; key = peers = collectors = factReaders = bound = undefined; vault?.close();
    originalFactsCertificates = new WeakMap();
    currentViews.fill(undefined); operators.delete(operator);
  };
  const retained = () => { live(); assert.ok(bound, 'FLAT_OPERATOR_NOT_BOUND'); return bound; };
  function privateInitialization() {
    assert.ok(!custody && key, 'FLAT_OPERATOR_STANDALONE_KEY_REQUIRED');
    return {signerIndex,publicKey:copy(publicKey),privateKeyPem:key.privateKey.export({type:'pkcs8',format:'pem'}),
      store:storeOptions?{...copy(storeOptions),checkpoint:record?{revision:record.revision,commitment:record.commitment}:null}:null};
  }
  async function retainCurrent() {
    if(retention)await persistOriginalOperatorRow(retention,signerIndex,privateInitialization());
  }
  async function assertVault() {
    try { const latest = await vault.read(); assertInventoryRecordBound(latest.revision, latest.data); equal(latest, record); return latest; }
    catch (cause) { poison(); throw new Error('FLAT_OPERATOR_INVENTORY_UNAVAILABLE_OR_CHANGED', { cause }); }
  }
  async function save(data) {
    try {
      live();
      assertInventoryRecordBound(record.revision + 1, data);
      const next = await vault.update(record.revision, () => copy(data));
      const readback = await vault.read(); assertInventoryRecordBound(readback.revision, readback.data);
      equal(readback, next); record = next; await retainCurrent();
    } catch (cause) { poison(); throw new Error('FLAT_OPERATOR_DURABLE_WRITE_UNCERTAIN', { cause }); }
  }
  async function current(phase = 'graph-current') {
    live();
    assert.ok(activeView, 'FLAT_OPERATOR_NO_OWN_VIEW');
    try {
      activeBudget?.(phase);
      await bound.readers[activeView.poolIndex].assertCurrent(activeView);
      live();
      activeBudget?.(phase);
    } catch (error) { currentViews[activeView.poolIndex] = undefined; throw error; }
  }
  async function currentView(selectedPool) {
    const reader = bound.readers[selectedPool], retained = currentViews[selectedPool];
    try {
      if (retained) {
        const header = await bound.runtime.block();
        if (['number', 'hash', 'timestamp'].every(field => header[field] === retained.header[field])) {
          // The original reader proves its private issued-view identity,
          // canonical current head and code pins again. A failure never falls
          // back to this view or a silently reconstructed replacement.
          await reader.assertCurrent(retained); return retained;
        }
      }
      currentViews[selectedPool] = undefined;
      const view = await reader.read();
      currentViews[selectedPool] = view; return view;
    } catch (error) { currentViews[selectedPool] = undefined; throw error; }
  }
  const clock = Object.freeze({ async read() {
    await current(); return freeze({ timestamp: activeView.head.timestamp, head: activeView.head.hash });
  }, async assertCurrent(header) {
    equal(header, { timestamp: activeView.head.timestamp, head: activeView.head.hash }); await current();
  } });
  async function serial(selectedPool, work) {
    retained(); assert.ok(!busy, 'FLAT_OPERATOR_BUSY'); busy = true; operationGeneration++; activeKeyUsed = false;
    try {
      await assertLocalEvm(bound.runtime); assertOwnedFlatSystem(bound.runtime, bound.system);
      assertNativeCapabilities(bound); await assertVault();
      activeView = await currentView(selectedPool);
      const started = performance.now();
      const withinBudget = (phase = 'graph-current') => {
        live();
        const elapsed = performance.now() - started;
        try { assert.ok(elapsed < 30_000, 'FLAT_OPERATOR_AUDIT_TOO_OLD'); }
        catch (error) {
          error.auditBudget = Object.freeze({ phase,
            elapsedMilliseconds: Number.isFinite(elapsed) ? Math.min(3_600_000, Math.max(0, Math.ceil(elapsed))) : 3_600_000,
            limitMilliseconds: 30_000 });
          throw error;
        }
      };
      activeBudget = withinBudget;
      const freshness = (phase = 'graph-current') => current(phase);
      activeFreshness = freshness;
      const result = await work(activeView, freshness); await freshness('after-operation');
      if (coverageTicketsV4.has(result)) {
        // Capture inside this exact completed full audit, never after another
        // operation could be admitted through the public GRAPH facade.
        coverageStatesV4.set(result, sourceStateV4());
        withinBudget('after-v4-source-state-capture');
      }
      return result;
    } catch (cause) {
      // A combined key attempt remains uncertain until the last original-head
      // await has completed. Reuse/validation-only failures never use a key.
      if (custody && activeKeyUsed && !poisoned) { poison(); throw signingFailure(cause); }
      throw cause;
    } finally { activeView = undefined; activeAnchor = undefined; activeFreshness = undefined; activeBudget = undefined; activeKeyUsed = false; busy = false; }
  }
  function store(family) {
    return Object.freeze({ async load() {
      await assertVault(); return copy(record.data.inventories[family]);
    }, async commit(input) {
      exactRecord(input, ['expectedRevision', 'nextState']); await assertVault();
      const old = record.data.inventories[family]; assert.equal(input.expectedRevision, old.revision, 'FLAT_OPERATOR_CAS');
      const updated = { revision: (inputUint(old.revision) + 1n).toString(), state: copy(input.nextState) };
      const next = copy(record.data); next.inventories[family] = updated; await save(next); return copy(updated);
    } });
  }
  async function wrappedObservation(family, request) {
    const observed = await factReaders[family].observe(request);
    if (!activeAnchor || ['family', 'recipientIndex', 'nativeId'].some(name => request[name] !== activeAnchor.readerRequest[name])) return observed;
    assert.ok(anchors.has(activeAnchor), 'FLAT_OPERATOR_PRIVATE_ANCHOR');
    equal(activeAnchor.head, activeView.head);
    assert.ok(performance.now() - activeAnchor.started < 30_000, 'FLAT_OPERATOR_ANCHOR_EXPIRED');
    let contradiction = observed.status === 'adverse' ? observed.reason : null;
    if (observed.status !== 'observed' && !contradiction) return observed;
    if (!contradiction) {
      try {
        assertStableOperatorFact(activeAnchor.entry, observed, policies[family]);
        if (family === '3') {
          equal(observed.nativeContext, activeAnchor.observation.nativeContext);
          assert.equal(observed.confirmations, activeAnchor.observation.confirmations, 'FLAT_OPERATOR_EVM_FRESH_DEPTH_CHANGED');
        }
      }
      catch { contradiction = 'CERTIFIED_NATIVE_FACT_CHANGED'; }
    }
    if (contradiction) {
      if (typeof contradiction !== 'string' || !/^[A-Z0-9_]{1,80}$/.test(contradiction)) contradiction = 'CERTIFIED_NATIVE_FACT_CHANGED';
      const next = copy(record.data), gid = activeAnchor.entry.facts.nativeGid;
      next.adverse[gid] ??= { family, reason: contradiction, firstHead: copy(activeView.head) };
      await save(next); return { status: 'adverse', reason: contradiction };
    }
    // Keep the actual fresh context separately. The signed observedSlot is the
    // actual finalized reference captured by the first operator, never a made-up
    // current getSlot value. No other inventory audit may use this reference.
    const next = copy(record.data);
    next.currentNativeContexts[activeAnchor.entry.facts.nativeGid] = {
      head: copy(activeView.head), nativeContext: copy(observed.nativeContext),
      confirmations: observed.confirmations, signedReference: copy(activeAnchor.entry.facts.nativeContext) };
    await save(next); await current();
    // Same EVM head must produce the same actual tip; never normalize it.
    return copy(family === '3' ? observed : activeAnchor.observation);
  }
  async function auditAll(view, freshness) {
    const peerReports = {}, errors = [], blockers = [], nextAdverse = copy(record.data.adverse);
    // Continue all families after a read failure so another learned adverse
    // fact is still retained before any health/checkpoint refusal.
    for (const family of bound.families) {
      try { peerReports[family] = await peers[family].auditInventory(); }
      catch { errors.push({ family, code: 'PEER_AUDIT_UNAVAILABLE' }); }
    }
    const currentContexts = copy(record.data.currentNativeContexts);
    let total = 0;
    for (const family of bound.families) {
      const inventory = record.data.inventories[family].state;
      const freshTips = new Map();
      for (const entry of inventory.entries) {
        total++; const gid = entry.facts.nativeGid;
        if (nextAdverse[gid]) { blockers.push({ family, nativeGid: gid, status: 'adverse', reason: nextAdverse[gid].reason }); continue; }
        let observed;
        try { observed = copy(await factReaders[family].observe({ family, recipientIndex: entry.request.recipientIndex, nativeId: entry.request.nativeId })); }
        catch { observed = { status: 'unknown', reason: 'FRESH_NATIVE_READ_UNAVAILABLE' }; }
        let status = 'live', reason = null;
        if (observed.status !== 'observed') {
          status = observed.status === 'adverse' ? 'adverse' : 'unknown';
          reason = typeof observed.reason === 'string' && /^[A-Z0-9_]{1,80}$/.test(observed.reason) ? observed.reason : 'NATIVE_OBSERVATION_UNAVAILABLE';
        } else {
          try {
            exactRecord(observed, OBSERVED); assertStableOperatorFact(entry, observed, policies[family]);
            assertCurrentNativeContext(family, currentContexts[gid]?.nativeContext, observed.nativeContext);
            if (family === '1' || family === '3') {
              const { observedTipHeight, observedTipId } = observed.nativeContext;
              if (freshTips.has(observedTipHeight)) assert.equal(freshTips.get(observedTipHeight), observedTipId,
                'FLAT_OPERATOR_FRESH_TIPS_DISAGREE');
              freshTips.set(observedTipHeight, observedTipId);
            }
            currentContexts[gid] = { head: copy(view.head), nativeContext: copy(observed.nativeContext),
              confirmations: observed.confirmations, signedReference: copy(entry.facts.nativeContext) };
          } catch { status = 'adverse'; reason = 'CERTIFIED_NATIVE_FACT_CHANGED'; }
        }
        if (entry.status === 'adverse') { status = 'adverse'; reason = entry.reason; }
        if (status !== 'live') blockers.push({ family, nativeGid: gid, status, reason });
        if (status === 'adverse') nextAdverse[gid] ??= { family, reason, firstHead: copy(view.head) };
      }
      if (inventory.entries.length >= 64) errors.push({ family, code: 'CERTIFIED_INVENTORY_SATURATED' });
    }
    for (const [nativeGid, adverse] of Object.entries(nextAdverse))
      if (!blockers.some(item => item.nativeGid === nativeGid))
        blockers.push({ family: adverse.family, nativeGid, status: 'adverse', reason: adverse.reason });
    const report = { head: copy(view.head), certifiedInventoryCount: String(total),
      everyIssuedIdentityIncluded: true, includesExpiredAndUnadmitted: true, peerReports, blockers, errors };
    const next = copy(record.data); next.adverse = nextAdverse; next.currentNativeContexts = currentContexts;
    next.lastAudit = report;
    // Reciprocal signing gates can re-audit the same empty inventory at one
    // head. Avoid identical durable rewrites, but still verify the original
    // persisted record. First/changed/adverse audits always retain their data.
    if (isDeepStrictEqual(next, record.data)) await assertVault();
    else await save(next);
    await freshness('after-native-audit'); return freeze(report);
  }
  function clearAudit(report) {
    assert.equal(report.errors.length, 0, 'FLAT_OPERATOR_INVENTORY_UNAVAILABLE');
    assert.equal(report.blockers.length, 0, 'FLAT_OPERATOR_INVENTORY_BLOCKED');
    for (const family of bound.families) assert.equal(report.peerReports[family].ready, true, 'FLAT_OPERATOR_PEER_BLOCKED');
  }
  function coverageFreshness(view, freshness) {
    if (!custody) return freshness;
    return async () => {
      await freshness('before-claim-coverage'); await assertCombinedClaimCoverage(custody, bound, view.head); await freshness('after-claim-coverage');
    };
  }
  async function signed(kind, message, bytes, audit, freshness) {
    // V3 stages immutable unsigned intent under only original-head/liveness
    // checks. Full independent reciprocal audits guard key use and return.
    if (custody) { message = freeze(copy(message)); bytes = Buffer.from(bytes); await current(); }
    else await freshness();
    const digest = sha(bytes), prior = record.data.authorizations.find(item => item.kind === kind && item.digest === digest);
    if (kind === 'checkpoint') {
      const old = record.data.authorizations.find(item => item.kind === kind && item.message.requestId === message.requestId);
      assert.ok(!old || old.digest === digest, 'FLAT_OPERATOR_CHECKPOINT_REQUEST_REBOUND');
    }
    if (prior) {
      assert.ok(prior.signature && prior.abiSignature, 'FLAT_OPERATOR_UNFINISHED_AUTHORIZATION');
      await freshness(); return freeze({ message: copy(message), signerIndex, signature: prior.signature,
        abiSignature: copy(prior.abiSignature), head: copy(activeView.head), audit });
    }
    assert.ok(record.data.authorizations.length < 256, 'FLAT_OPERATOR_AUTHORIZATION_CAPACITY');
    const next = copy(record.data), position = next.authorizations.length;
    next.authorizations.push({ kind, message: copy(message), digest, head: copy(activeView.head), signature: null, abiSignature: null });
    await save(next); await freshness();
    try {
      if (custody) { activeKeyUsed = true; keyUseEpoch++; }
      const signature = custody ? signCombinedGraphAuthorization(custody, kind, message) : lowSignature(key, bytes).toString('hex');
      const candidates = [];
      for (const v of ['27', '28']) {
        const recovered = await bound.runtime.call({ to: '0x0000000000000000000000000000000000000001',
          data: prefix(digest + word(v) + signature) }, activeView.header.number);
        if (recovered === '0x' + '00'.repeat(12) + signerAddress.slice(2)) candidates.push(v);
      }
      assert.equal(candidates.length, 1, 'FLAT_OPERATOR_EVM_RECOVERY');
      const abiSignature = nativeHubSignatureToAbi({ signerIndex: String(signerIndex), v: candidates[0], signature });
      // No further key use follows recovery. Persist its exact result before
      // the mandatory final joint audit; any write/audit failure still poisons
      // the key and returns no signature, matching the claim paired lifecycle.
      const signed = copy(record.data);
      signed.authorizations[position].signature = signature; signed.authorizations[position].abiSignature = abiSignature;
      await save(signed); await freshness();
      return freeze({ message: copy(message), signerIndex, signature, abiSignature, head: copy(activeView.head), audit });
    } catch (cause) { poison(); throw signingFailure(cause); }
  }
  const {originalFactsEntry,validateOriginalFacts}=createOriginalFactsRetentionV2(Object.freeze({
    schema:FACTS_SCHEMA,signerIndex,record:()=>record,encodeNativeFacts,policies:()=>{retained();assert.ok(policies,'FLAT_OPERATOR_NOT_BOUND');return policies;},equal,sha,
    retained,original:certificate=>originalFactsCertificates.get(certificate),serial,
    healthAllowed,clearAudit,auditAll,coverageFreshness,
  }));
  async function certify(request, anchor) {
    request = copy(request); exactRecord(request, ['family', 'recipientIndex', 'nativeId', 'wireKeyCommitment']);
    assert.ok(retained().families.includes(request.family), 'FLAT_OPERATOR_FAMILY');
    let original;
    const certificate = await serial(0, async (view, freshness) => {
      healthAllowed(view); const audit = await auditAll(view, freshness); clearAudit(audit);
      if (anchor) {
        assert.ok(anchors.has(anchor) && anchor.runtime === bound.runtime && anchor.system === bound.system
          && anchor.bitcoin === bound.bitcoin && anchor.solana === bound.solana
          && anchor.evmDelivery === bound.evmDelivery, 'FLAT_OPERATOR_ANCHOR_BINDING');
        equal(anchor.request, request); equal(anchor.head, view.head); activeAnchor = anchor;
      }
      const jointFreshness = coverageFreshness(view, freshness);
      // The actual combined facts signer performs the full pre-key audit after
      // durable peer staging. Cached certificates need only the final gate.
      if (custody) await freshness(); else await jointFreshness();
      const certificate = await peers[request.family].certify(request); activeAnchor = undefined;
      // A cached peer certificate takes the same complete coverage gate.
      await jointFreshness();
      const entry = originalFactsEntry(certificate, request, view.head);
      original = freeze({ certificate: copy(certificate), request: copy(request), head: copy(view.head), entry: copy(entry) });
      return certificate;
    });
    originalFactsCertificates.set(certificate, original); return certificate;
  }
  const operator = Object.create(null);
  Object.defineProperties(operator, {
    profile: { value: LOCAL_FLAT_OPERATOR_PROFILE, enumerable: true },
    signerIndex: { value: signerIndex, enumerable: true }, publicKey: { value: publicKey, enumerable: true },
    bind: { value: async input => {
      live(); assert.ok(!bindAttempted && !busy, 'FLAT_OPERATOR_BIND_ONCE'); bindAttempted = true; busy = true;
      try {
        assert.ok(input && !types.isProxy(input), 'FLAT_OPERATOR_BIND_INPUT');
        exactRecord(input, ['runtime', 'system', 'bitcoin', 'solana', 'rules', 'rulePaths',
          ...(Object.hasOwn(input, 'evmDelivery') ? ['evmDelivery'] : [])]);
        const { runtime, system, bitcoin, solana } = input, evmDelivery = input.evmDelivery ?? null;
        assert.ok(Array.isArray(input.rules) && !types.isProxy(input.rules)
          && input.rules.length >= 1 && input.rules.length <= 3, 'FLAT_OPERATOR_RULE_COUNT');
        fixedArray(input.rules, input.rules.length); fixedArray(input.rulePaths, input.rules.length);
        const rules = copy(input.rules), rulePaths = copy(input.rulePaths), families = rules.map(rule => rule.family);
        assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
        equal(system.registry.keys[signerIndex], publicKey);
        assert.equal(new Set(families).size, families.length, 'FLAT_OPERATOR_DUPLICATE_FAMILY');
        rules.forEach(nativeRuleCommitment);
        // A combined SPL attester's original CLAIM branch covers USDC custody
        // separately from native SOL GRAPH. No caller-selected registered set
        // is accepted; standalone and legacy bindings still require all rules.
        const registeredRules = (custody ? assertCombinedGraphBinding(custody,
          { runtime, system, bitcoin, solana, rules }) : null) ?? rules;
        const completeTree = nativeAdmissionRulesTree(registeredRules);
        assert.equal(completeTree.root, system.registry.rulesRoot, 'FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES');
        const commitments = registeredRules.map(nativeRuleCommitment);
        const graphPaths = rules.map(rule => {
          const index = commitments.indexOf(nativeRuleCommitment(rule));
          assert.ok(index >= 0, 'FLAT_OPERATOR_UNREGISTERED_GRAPH_RULE'); return completeTree.paths[index];
        });
        equal(rulePaths, graphPaths);
        paths = Object.fromEntries(families.map((family, i) => [family, rulePaths[i]]));
        if (families.includes('1')) {
          assertOwnedBitcoinRuntime(bitcoin);
          assert.equal(rules.find(rule => rule.family === '1').genesis, bitcoin.genesis);
        } else if (bitcoin !== null) assertOwnedBitcoinRuntime(bitcoin);
        if (families.includes('2')) {
          assertOwnedSolanaRuntime(solana);
          assert.equal(rules.find(rule => rule.family === '2').genesis, unprefix(solana.genesisHex));
        } else if (solana !== null) assertOwnedSolanaRuntime(solana);
        let evmPoolIndex = null;
        if (families.includes('3')) {
          assert.ok(evmDelivery && !types.isProxy(evmDelivery), 'FLAT_OPERATOR_EVM_OBSERVER');
          const property = Object.getOwnPropertyDescriptor(evmDelivery, 'binding');
          assert.ok(property && Object.hasOwn(property, 'value'), 'FLAT_OPERATOR_EVM_OBSERVER_BINDING');
          const binding = copy(property.value);
          exactRecord(binding, ['poolIndex', 'recipientIndex', 'genesis', 'asset', 'sourceEndpoint', 'destinationEndpoint']);
          evmPoolIndex = poolIndex(binding.poolIndex);
          assertOwnedEvmGraphDeliveryObserverV1(evmDelivery, { runtime, system, poolIndex: evmPoolIndex });
          assert.equal(binding.recipientIndex, String(evmPoolIndex), 'FLAT_OPERATOR_EVM_RECIPIENT');
          const rule = rules.find(rule => rule.family === '3');
          assert.equal(binding.genesis, rule.genesis, 'FLAT_OPERATOR_EVM_GENESIS');
          assert.equal(binding.asset, rule.asset, 'FLAT_OPERATOR_EVM_ASSET');
          assert.equal(binding.genesis, unprefix(runtime.metadata.evmGenesis), 'FLAT_OPERATOR_EVM_RUNTIME_GENESIS');
          assert.equal(typeof runtime.signedTransaction, 'function', 'FLAT_OPERATOR_EVM_SIGNED_JOURNAL_REQUIRED');
        } else assert.equal(evmDelivery, null, 'FLAT_OPERATOR_EVM_UNREGISTERED');
        const readers = [await createFlatSystemStateReader({ runtime, system, poolIndex: 0 }),
          await createFlatSystemStateReader({ runtime, system, poolIndex: 1 })];
        bound = { runtime, system, bitcoin, solana, evmDelivery, evmPoolIndex, readers, rules, families };
        if (custody) assertCombinedGraphBinding(custody, bound);
        activeView = await readers[0].read();
        const registered = await system.hub.call('attester(uint8)', [signerIndex], activeView.header.number);
        assert.equal(registered, prefix(publicKey.x + publicKey.y + '00'.repeat(12) + signerAddress.slice(2)), 'FLAT_OPERATOR_REGISTERED_KEY');
        policies = {}; recipients = {}; factReaders = {}; collectors = {}; const inventories = {};
        for (const rule of rules) {
          const family = rule.family, native = family === '1' ? bitcoin : solana;
          policies[family] = freeze({ ledgerNamespace: unprefix(system.ledgerNamespace), hubDomain: unprefix(system.hubDomain),
            registryCommitment: unprefix(system.registryCommitment), rule });
          recipients[family] = family === '3' ? [copy({ recipientIndex: evmDelivery.binding.recipientIndex,
            sourceEndpoint: evmDelivery.binding.sourceEndpoint, destinationEndpoint: evmDelivery.binding.destinationEndpoint })]
            : [0, 1].map(recipientIndex => {
            const route = native.adapter({ asset: rule.asset, recipientIndex }).binding;
            equal({ family: route.family, genesis: route.genesis, asset: route.asset }, { family, genesis: rule.genesis, asset: rule.asset });
            return { recipientIndex: String(recipientIndex), sourceEndpoint: route.sourceEndpoint, destinationEndpoint: route.destinationEndpoint };
          });
          factReaders[family] = family === '3' ? Object.freeze({ async observe(request) {
            exactRecord(request, ['family', 'recipientIndex', 'nativeId']);
            assert.equal(request.family, '3', 'FLAT_OPERATOR_EVM_FAMILY');
            assert.equal(request.recipientIndex, evmDelivery.binding.recipientIndex, 'FLAT_OPERATOR_EVM_RECIPIENT');
            bytes32(request.nativeId, true);
            assertOwnedEvmGraphDeliveryObserverV1(evmDelivery, { runtime, system, poolIndex: evmPoolIndex });
            const signed = await runtime.signedTransaction(prefix(request.nativeId));
            let decoded;
            try {
              decoded = decodeCanonicalEvmTransaction(signed.nativeWire);
              assert.equal(decoded.nativeId, prefix(request.nativeId), 'FLAT_OPERATOR_EVM_JOURNAL_ID');
              assert.equal(signed.nativeId, decoded.nativeId, 'FLAT_OPERATOR_EVM_JOURNAL_ID');
              assert.equal(signed.transactionSHA256, decoded.transactionSHA256, 'FLAT_OPERATOR_EVM_JOURNAL_SHA');
            } catch { return { status: 'adverse', reason: 'EVM_ORIGINAL_SIGNED_WIRE_CHANGED' }; }
            const actual = await evmDelivery.observeFacts({ transactionHash: request.nativeId,
              calldataSHA256: sha(Buffer.from(decoded.data.slice(2), 'hex')) });
            assertOwnedEvmGraphDeliveryFactsV1(actual, { observer: evmDelivery });
            const observed = copy(actual);
            if (observed.status !== 'observed') {
              exactRecord(observed, ['status', 'reason']);
              assert.ok(['unknown', 'unavailable', 'adverse'].includes(observed.status), 'FLAT_OPERATOR_EVM_STATUS');
              assert.match(observed.reason, /^[A-Z0-9_]{1,80}$/); return observed;
            }
            try {
              exactRecord(observed, OBSERVED);
              assert.equal(observed.nativeWire, decoded.nativeWire.slice(2), 'FLAT_OPERATOR_EVM_OBSERVED_WIRE');
              if (observed.nativeContext.observedTipHeight !== activeView.head.number)
                return { status: 'unknown', reason: 'EVM_HEAD_CHANGED_DURING_OBSERVATION' };
              assert.equal(observed.nativeContext.observedTipId, activeView.head.hash, 'FLAT_OPERATOR_EVM_ACTUAL_TIP');
            } catch { return { status: 'adverse', reason: 'EVM_OBSERVED_WIRE_OR_TIP_CHANGED' }; }
            return observed;
          } }) : createOwnedOperatorNativeReads({ native, family }).factReader({ asset: rule.asset });
          // Construction validates the rule's exact SHA path against the
          // already authenticated registry. No collector/caller truth is used.
          collectors[family] = createNativeFactsCollector({ policy: policies[family], registry: system.registry, rulePath: paths[family], clock });
          inventories[family] = { revision: '0', state: (family==='3'&&isOwnedMetaMorphoGraphDeliveryBatchV4(evmDelivery)?createOriginalMetaMorphoBatchFactsInventoryV4:createNativeFactsInventory)({ policy: policies[family],
            signerIndex: String(signerIndex), publicKey, recipients: recipients[family] },...(family==='3'&&isOwnedMetaMorphoGraphDeliveryBatchV4(evmDelivery)?[evmDelivery]:[])) };
        }
        const binding = { hub: system.hub.address,
          hubDomain: system.hubDomain, registryCommitment: system.registryCommitment, ledgerNamespace: system.ledgerNamespace,
          evmGenesis: runtime.metadata.evmGenesis, deploymentTransaction: system.hub.receipt.transactionHash,
          policies, paths, recipients };
        const initial = { schema: SCHEMA, publicKey, signerIndex, binding,
          inventories, adverse: {}, currentNativeContexts: {}, lastAudit: null, authorizations: [] };
        assertInventoryRecordBound(0, initial);
        inventoryPath = join(runtime.metadata.scratchDirectory, 'flat-operator-' + signerIndex + '.v3');
        const identity = { schema: 'LOCAL_FLAT_OPERATOR_STORE_IDENTITY_V3', profile: LOCAL_FLAT_OPERATOR_PROFILE,
          signerIndex, publicKey, binding, registry: copy(system.registry) };
        if(recovered?.store){
          equal(recovered.store.path,inventoryPath);equal(recovered.store.identity,identity);
          storeOptions={path:inventoryPath,password:recovered.store.password,identity};
          vault=await openClaimRecordStore(storeOptions);record=await vault.read();
          equal({revision:record.revision,commitment:record.commitment},recovered.store.checkpoint);
          assert.equal(record.data.schema,SCHEMA);equal(record.data.publicKey,publicKey);equal(record.data.binding,binding);
          assert.equal(record.data.signerIndex,signerIndex);
          assert.ok(record.data.authorizations.every(item=>item.signature&&item.abiSignature),'FLAT_OPERATOR_UNFINISHED_AUTHORIZATION_REOPEN');
          for(const inventory of Object.values(record.data.inventories))
            assert.ok(inventory.state.entries.every(item=>item.signature),'FLAT_OPERATOR_UNFINISHED_FACTS_REOPEN');
        }else{
          storeOptions={path:inventoryPath,password:randomBytes(32).toString('hex'),identity};
          await retainCurrent(); // Retain the password before creating its encrypted journal.
          vault=await createClaimRecordStore(storeOptions,initial);record=await vault.read();
        }
        await retainCurrent();
        await assertVault(); peers = {};
        for (const family of families) peers[family] = await (family==='3'&&isOwnedMetaMorphoGraphDeliveryBatchV4(evmDelivery)?createOriginalMetaMorphoBatchFactsPeerV4:createNativeFactsPeer)({ policy: policies[family], signerIndex: String(signerIndex),
          recipients: recipients[family], signer: custody ? createCombinedFactsSigner(custody, 'graph', policies[family])
            : createNativeFactsSigner({ privateKey: key.privateKey, policy: policies[family] }),
          reader: { observe: request => wrappedObservation(family, request) }, clock, store: store(family) },...(family==='3'&&isOwnedMetaMorphoGraphDeliveryBatchV4(evmDelivery)?[evmDelivery]:[]));
        await current(); currentViews[0] = activeView;
        return freeze({ profile: LOCAL_FLAT_OPERATOR_PROFILE, publicKey, signerIndex,
          registryCommitment: system.registryCommitment, inventoryPath });
      } catch (cause) { poison(); collectors = undefined; vault?.close(); throw new Error('FLAT_OPERATOR_BIND_FAILED', { cause }); }
      finally { activeView = undefined; busy = false; }
    } },
    certify: { value: request => certify(request) },
    audit: { value: () => serial(0, (view, freshness) => auditAll(view, freshness)) },
    health: { value: request => {
      request = copy(request); exactRecord(request, ['poolIndex']); const selected = poolIndex(request.poolIndex);
      return serial(selected, async (view, freshness) => {
        healthAllowed(view); const audit = await auditAll(view, freshness); clearAudit(audit);
        const { timestamp, ...state } = view.healthState;
        const message = { ...state, validFrom: timestamp, validUntil: (inputUint(timestamp) + 30n).toString() };
        const bytes = encodeFlatNativeHealth(message);
        assert.equal(prefix(flatNativeHealthDigest(message)), await bound.system.hub.call('finalityHealthDigest(address,uint64,uint64)',
          [view.poolAddress, message.validFrom, message.validUntil], view.header.number), 'FLAT_OPERATOR_HEALTH_CODEC');
        return signed('health', message, bytes, audit, coverageFreshness(view, freshness));
      });
    } },
    checkpoint: { value: request => {
      request = copy(request); exactRecord(request, ['poolIndex', 'requestId']); const selected = poolIndex(request.poolIndex);
      bytes32(request.requestId, true);
      return serial(selected, async (view, freshness) => {
        healthAllowed(view); const audit = await auditAll(view, freshness); clearAudit(audit);
        const old = record.data.authorizations.find(item => item.kind === 'checkpoint' && item.message.requestId === prefix(request.requestId));
        const message = old ? copy(old.message) : { hubDomain: bound.system.hubDomain, registryCommitment: bound.system.registryCommitment, pool: view.poolAddress,
          expectedPoolSequence: view.snapshot.poolStateSequence, expectedHubStateSequence: view.snapshot.hubStateSequence,
          requestId: prefix(request.requestId), validUntil: (inputUint(view.head.timestamp) + 30n).toString() };
        assertCheckpointAuthorizationValid(message, { hubDomain: message.hubDomain, registryCommitment: message.registryCommitment,
          pool: view.poolAddress, poolStateSequence: view.snapshot.poolStateSequence, hubStateSequence: view.snapshot.hubStateSequence,
          checkpointCount: view.checkpointCount, timestamp: view.head.timestamp });
        assert.equal(checkpointAuthorizationDigest(message), await bound.system.hub.call('checkpointAuthorizationDigest(address,uint64,uint64,bytes32,uint64)',
          [message.pool, message.expectedPoolSequence, message.expectedHubStateSequence, message.requestId, message.validUntil], view.header.number), 'FLAT_OPERATOR_CHECKPOINT_CODEC');
        return signed('checkpoint', message, checkpointAuthorizationFrame(message), audit, coverageFreshness(view, freshness));
      });
    } },
    revocation: { value: request => {
      request = copy(request); exactRecord(request, ['nativeGid']); bytes32(request.nativeGid, true);
      return serial(0, async (view, freshness) => {
        const audit = await auditAll(view, freshness), adverse = record.data.adverse[request.nativeGid];
        assert.ok(adverse, 'FLAT_OPERATOR_NO_OBSERVED_ADVERSE_FACT');
        const revoked = await bound.system.hub.call('revoked(bytes32)', [prefix(request.nativeGid)], view.header.number);
        assert.equal(revoked, prefix(word(0)), 'FLAT_OPERATOR_ALREADY_REVOKED');
        const reasonCommitment = sha(frame('LIANUM/PAEG/flat-operator-adverse/1', [Buffer.from(LOCAL_FLAT_OPERATOR_PROFILE),
          Buffer.from(unprefix(bound.system.hubDomain), 'hex'), Buffer.from(request.nativeGid, 'hex'), Buffer.from(adverse.reason)]));
        const message = { hubDomain: bound.system.hubDomain, registryCommitment: bound.system.registryCommitment,
          gid: prefix(request.nativeGid), expectedSequence: view.healthState.revocationSequence,
          reasonCommitment: prefix(reasonCommitment), authorizationExpiry: (inputUint(view.head.timestamp) + 30n).toString() };
        assertRevocationAuthorizationValid(message, { hubDomain: message.hubDomain, registryCommitment: message.registryCommitment,
          revocationSequence: view.healthState.revocationSequence, timestamp: view.head.timestamp });
        assert.equal(revocationMessage(message), await bound.system.hub.call('revocationMessage(bytes32,uint64,bytes32,uint64)',
          [message.gid, message.expectedSequence, message.reasonCommitment, message.authorizationExpiry], view.header.number), 'FLAT_OPERATOR_REVOCATION_CODEC');
        return signed('revocation', message, revocationFrame(message), audit, coverageFreshness(view, freshness));
      });
    } },
    status: { value: () => freeze({ profile: LOCAL_FLAT_OPERATOR_PROFILE, signerIndex, publicKey,
      bound: Boolean(bound), closed, poisoned, ...(custody ? combinedOperatorStatus(custody) : {}), inventoryPath: inventoryPath ?? null,
      certifiedInventoryCount: record ? Object.values(record.data.inventories).reduce((sum, item) => sum + item.state.entries.length, 0) : 0 }) },
    close: { value: () => {
      assert.ok(!busy, 'FLAT_OPERATOR_BUSY'); if (custody) closeCombinedOperator(custody); else cleanup();
    } },
    toJSON: { value: () => { throw new Error('FLAT_OPERATOR_NOT_SERIALIZABLE'); } },
  });
  function sourceStateV4() {
    retained(); assert.ok(record, 'FLAT_OPERATOR_GRAPH_SOURCE_REQUIRED');
    return freeze({ profile: 'COMBINED_GRAPH_SOURCE_STATE_V4', operationGeneration, keyUseEpoch, record: copy(record) });
  }
  if (custody) registerCombinedOperatorBranch(custody, 'graph', { busy: () => busy, close: cleanup,
    sourceStateV4,
    coverageStateV4(ticket) {
      const state = coverageStatesV4.get(ticket); assert.ok(state, 'FLAT_OPERATOR_ORIGINAL_GRAPH_COVERAGE_REQUIRED'); return state;
    },
    assertCoverageV4(expectedHead) {
      const ticket = Object.freeze(Object.create(null)); coverageTicketsV4.add(ticket);
      return serial(0, async (view, freshness) => {
        equal(view.head, expectedHead); assertCombinedGraphBinding(custody, bound);
        clearAudit(await auditAll(view, freshness)); await freshness(); return ticket;
      });
    },
    noteKeyUse() { live(); assert.ok(busy && activeFreshness, 'COMBINED_OPERATOR_GRAPH_SIGNING_OPERATION_REQUIRED'); activeKeyUsed = true; keyUseEpoch++; },
    assertSigningCoverage() {
      assert.ok(activeFreshness, 'COMBINED_OPERATOR_GRAPH_SIGNING_OPERATION_REQUIRED');
      return coverageFreshness(activeView, activeFreshness)();
    },
    assertCoverage: expectedHead => serial(0, async (view, freshness) => {
      equal(view.head, expectedHead);
      assertCombinedGraphBinding(custody, bound);
      clearAudit(await auditAll(view, freshness));
      await freshness();
    }),
  });
  function privateAuditState() {
    assert.ok(record, 'GRAPH_PRIVATE_AUDIT_STATE_REQUIRED');
    const custodyState = custody ? combinedOperatorStatus(custody) : null;
    const authorizations = record.data.authorizations;
    const entries = Object.values(record.data.inventories).flatMap(inventory => inventory.state.entries);
    return freeze({ schema: 'GRAPH_PRIVATE_AUDIT_ACTIVITY_V1',
      epochScope: 'ORIGINAL_GRAPH_SIGNING_NOTIFICATIONS', keyUseEpoch,
      originalHistoriesMeasured: true, totalKeyInvocationsMeasured: false,
      authorizationCount: authorizations.length,
      signedAuthorizationCount: authorizations.filter(row => typeof row.signature === 'string').length,
      factCount: entries.length, signedFactCount: entries.filter(row => typeof row.signature === 'string').length,
      busy, branchClosed: closed, branchPoisoned: poisoned,
      custodyClosed: custodyState?.closed ?? null, custodyPoisoned: custodyState?.poisoned ?? null });
  }
  privateAuditActivities.set(operator, privateAuditState);
  operators.set(operator, {
    combined: Boolean(custody), bound: retained, certify,
    attachRetention(state){assert.ok(!custody&&!retention&&!busy);retention=state;},
    assertRetainedLive(){live();assert.ok(!busy,'FLAT_OPERATOR_CAPTURE_BUSY');},
    captureInitialization(){live();assert.ok(!busy,'FLAT_OPERATOR_CAPTURE_BUSY');return privateInitialization();},
    validateOriginalFacts,
    anchor(certificate, request, started) {
      const b = retained(), entry = record.data.inventories[request.family].state.entries.find(item => item.facts.nativeGid === certificate.facts.nativeGid);
      assert.ok(entry && entry.signature === certificate.signature, 'FLAT_OPERATOR_ANCHOR_CERTIFICATE');
      assert.equal(nativeFactsDigest(entry.facts, policies[request.family]), certificate.digest);
      const head = record.data.lastAudit.head;
      assert.equal(head.timestamp, certificate.facts.observation.observedAt, 'FLAT_OPERATOR_ANCHOR_TIME');
      const anchor = { runtime: b.runtime, system: b.system, bitcoin: b.bitcoin, solana: b.solana, evmDelivery: b.evmDelivery,
        request: copy(request), readerRequest: { family: request.family, recipientIndex: request.recipientIndex, nativeId: request.nativeId },
        head: copy(head), started, entry: freeze(copy(entry)), observation: freeze(observationFromEntry(entry)) };
      anchors.add(anchor); return Object.freeze(anchor);
    },
    collect: (family, certificates, expectedHead) => serial(0, async (view, freshness) => {
      equal(view.head, expectedHead);
      const result = await collectors[family].collect({ certificates });
      await freshness(); return result;
    }),
  });
  return Object.freeze(operator);
}

/** Coordinates three branded single-key operators; it holds no private keys.
 * This is still one local host, not independent operators or native consensus. */
export function createFlatOperatorQuorum(input) {
  exactRecord(input, ['operators']); fixedArray(input.operators, 3);
  for (const operator of input.operators) assert.ok(operators.has(operator), 'FLAT_OPERATOR_OWNED_CAPABILITY');
  const chosen = [...input.operators].sort((a, b) => a.signerIndex - b.signerIndex);
  const states = chosen.map(operator => { assert.ok(operators.has(operator), 'FLAT_OPERATOR_OWNED_CAPABILITY'); return operators.get(operator); });
  assert.equal(new Set(chosen.map(operator => operator.signerIndex)).size, 3, 'FLAT_OPERATOR_DISTINCT_SIGNERS');
  const first = states[0].bound();
  function sameBinding() {
    for (const state of states) {
      const b = state.bound();
      assert.ok(b.runtime === first.runtime && b.system === first.system && b.bitcoin === first.bitcoin && b.solana === first.solana
        && b.evmDelivery === first.evmDelivery, 'FLAT_OPERATOR_QUORUM_BINDING');
      equal(b.rules, first.rules);
    }
  }
  sameBinding(); let busy = false;
  async function serial(work) {
    assert.ok(!busy, 'FLAT_OPERATOR_QUORUM_BUSY'); busy = true;
    try { sameBinding(); return await work(performance.now()); } finally { busy = false; }
  }
  // Operators own distinct keys, busy flags and durable vaults. Their fresh
  // read/sign operations may overlap, but a failure MUST drain every started
  // operation before the quorum lock releases or callers can clean up keys.
  // Preserve signer order and the original error; never race or reuse facts.
  async function together(operations) {
    const results = await Promise.allSettled(operations.map(operation => Promise.resolve().then(operation)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    return results.map(result => result.value);
  }
  async function assemble(kind, request) {
    request = copy(request);
    return serial(async started => {
      const results = await together(chosen.map(operator => () => operator[kind](request)));
      assert.ok(performance.now() - started < 30_000, 'FLAT_OPERATOR_QUORUM_TOO_OLD');
      for (const result of results) { equal(result.message, results[0].message); equal(result.head, results[0].head); }
      const message = results[0].message, indexes = results.map(item => item.signerIndex), signatures = results.map(item => item.signature);
      const reader = first.readers[request.poolIndex ?? 0], view = await reader.read(); equal(view.head, results[0].head);
      if (kind === 'health') assertFlatNativeHealth({ message, indexes, signatures }, view.healthState, first.system.registry);
      else {
        const verifier = createNativeHubMessageHostVerifier({ registry: first.system.registry, expectedRegistryCommitment: unprefix(first.system.registryCommitment) });
        verifier[kind === 'checkpoint' ? 'assertCheckpointAuthorizationQuorum' : 'assertRevocationQuorum']({ message, indexes, signatures });
      }
      await reader.assertCurrent(view);
      if (states.some(state => state.combined)) sameBinding();
      assert.ok(performance.now() - started < 30_000, 'FLAT_OPERATOR_QUORUM_TOO_OLD');
      return freeze({ message, indexes, signatures, abiSignatures: results.map(item => item.abiSignature), head: view.head, audits: results.map(item => item.audit) });
    });
  }
  const quorum = Object.freeze({ profile: LOCAL_FLAT_OPERATOR_PROFILE, factsValidationProfile: FLAT_FACTS_VALIDATION_PROFILE,
    signerIndexes: freeze(chosen.map(operator => operator.signerIndex)),
    facts: raw => {
      const request = copy(raw); exactRecord(request, ['family', 'recipientIndex', 'nativeId', 'wireKeyCommitment']);
      return serial(async started => {
        const certificates = [await chosen[0].certify(request)];
        const anchor = states[0].anchor(certificates[0], request, started);
        certificates.push(...await together(states.slice(1).map(state => () => state.certify(request, anchor))));
        // V2 starts a separate final full-audit budget. The original common
        // anchor/deadline and every certificate byte/window remain unchanged.
        const finalRoundStarted = performance.now();
        await together(states.map((state, index) => () => state.validateOriginalFacts(certificates[index], request, anchor.head)));
        const collected = await states[0].collect(request.family, certificates, anchor.head);
        sameBinding();
        const finished = performance.now();
        assert.ok(finished - finalRoundStarted < 30_000, 'FLAT_OPERATOR_FACTS_FINAL_ROUND_TOO_OLD');
        return freeze({ certificates, collected, signedFinalityReference: copy(anchor.entry.facts.nativeContext), head: copy(anchor.head),
          freshness: { profile: FLAT_FACTS_VALIDATION_PROFILE, assemblyWithin30Seconds: finalRoundStarted - started < 30_000,
            totalWithin30Seconds: finished - started < 30_000, finalRoundWithin30Seconds: true,
            originalCertificatesUnchanged: true, allOriginalSignersRevalidated: true } });
      });
    },
    health: request => assemble('health', request), checkpoint: request => assemble('checkpoint', request),
    revocation: request => assemble('revocation', request),
    audit: () => serial(async () => freeze(await together(chosen.map(operator => () => operator.audit())))),
  });
  quorums.set(quorum, () => { sameBinding(); return first; });
  return quorum;
}

/** Checks a real quorum's live operators and exact deployment/native ownership.
 * This identity assertion is synchronous; each issued authorization additionally
 * performs the fresh fixed-head and durable-inventory checks above. */
export function assertOwnedFlatOperatorQuorum(capability, input) {
  assert.ok(quorums.has(capability), 'FLAT_OPERATOR_OWNED_QUORUM');
  exactRecord(input, ['runtime', 'system', 'nativeRuntime', 'family']);
  assert.ok(['1', '2', '3'].includes(input.family), 'FLAT_OPERATOR_FAMILY');
  const bound = quorums.get(capability)();
  assert.ok(bound.runtime === input.runtime && bound.system === input.system,
    'FLAT_OPERATOR_QUORUM_BINDING');
  assert.ok(bound.families.includes(input.family), 'FLAT_OPERATOR_FAMILY');
  const nativeRuntime = input.family === '1' ? bound.bitcoin : input.family === '2' ? bound.solana : bound.evmDelivery;
  assert.equal(nativeRuntime, input.nativeRuntime, 'FLAT_OPERATOR_QUORUM_NATIVE_BINDING');
  assertOwnedFlatSystem(input.runtime, input.system);
  assertNativeCapabilities(bound);
  return capability;
}

/** Private-bootstrap inventory discovery for a genuine live quorum. Returns
 * only its complete registered family set and original native capabilities;
 * no caller-selected inventory, signer, reader, journal or authority override.
 * This synchronous ownership snapshot does not replace a fresh audited permit. */
export function ownedFlatOperatorQuorumBindings(capability, input) {
  assert.ok(quorums.has(capability), 'FLAT_OPERATOR_OWNED_QUORUM');
  exactRecord(input, ['runtime', 'system']);
  const bound = quorums.get(capability)();
  assert.ok(bound.runtime === input.runtime && bound.system === input.system,
    'FLAT_OPERATOR_QUORUM_BINDING');
  assertOwnedFlatSystem(input.runtime, input.system);
  assertNativeCapabilities(bound);
  return Object.freeze({ families: Object.freeze([...bound.families]),
    bitcoin: bound.bitcoin, solana: bound.solana, evmDelivery: bound.evmDelivery });
}

// Fixed original standalone operator group, retained in the existing encrypted
// attempt registry. These functions never accept a caller key or store password.
const RETAINED_OPERATOR_GROUP = 'ORIGINAL_STANDALONE_FLAT_OPERATOR_GROUP_V1';
const retainedGroups = new WeakMap(), retainedRuntimeGroups = new WeakMap();
async function lifetimeModule() { return import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs'); }
function operatorGroupIdentity(runtime) {
  return {profile:RETAINED_OPERATOR_GROUP,genesis:runtime.metadata.evmGenesis,chainId:runtime.metadata.chainId};
}
function validateOperatorRows(rows) {
  fixedArray(rows,4);const identities=new Set();
  for(const [i,row]of rows.entries()){
    exactRecord(row,['signerIndex','publicKey','privateKeyPem','store']);assert.equal(row.signerIndex,i);
    exactRecord(row.publicKey,['x','y']);bytes32(row.publicKey.x,true);bytes32(row.publicKey.y,true);
    assert.ok(typeof row.privateKeyPem==='string'&&Buffer.byteLength(row.privateKeyPem)<=2048,'FLAT_OPERATOR_RETAINED_KEY_ENCODING');
    const privateKey=createPrivateKey(row.privateKeyPem);
    assert.equal(privateKey.asymmetricKeyType,'ec');assert.equal(privateKey.asymmetricKeyDetails.namedCurve,'secp256k1');
    assert.ok(privateKey.export({type:'pkcs8',format:'pem'})===row.privateKeyPem,'FLAT_OPERATOR_CANONICAL_PRIVATE_KEY');
    const jwk=createPublicKey(privateKey).export({format:'jwk'});
    equal(row.publicKey,{x:Buffer.from(jwk.x,'base64url').toString('hex'),y:Buffer.from(jwk.y,'base64url').toString('hex')});
    const identity=row.publicKey.x+row.publicKey.y;assert.ok(!identities.has(identity),'FLAT_OPERATOR_DUPLICATE_ORIGINAL_KEY');identities.add(identity);
    if(row.store!==null){
      exactRecord(row.store,['path','password','identity','checkpoint']);
      assert.ok(typeof row.store.path==='string'&&row.store.path.length<2048);
      assert.ok(typeof row.store.password==='string'&&/^[0-9a-f]{64}$/.test(row.store.password),'FLAT_OPERATOR_STORE_CREDENTIAL_ENCODING');exactRecord(row.store.checkpoint,['revision','commitment']);
      assert.ok(Number.isSafeInteger(row.store.checkpoint.revision)&&row.store.checkpoint.revision>=0);bytes32(row.store.checkpoint.commitment,true);
    }
  }
}
function operatorGroupReceipt(identity,state) {
  return freeze({profile:RETAINED_OPERATOR_GROUP,generation:state.generation,genesis:identity.genesis,chainId:identity.chainId,
    publicKeys:state.rows.map(row=>copy(row.publicKey)),journals:state.rows.map(row=>({signerIndex:row.signerIndex,
      bound:row.store!==null,identitySHA256:row.store?sha(canonical(row.store.identity)):null,
      checkpoint:row.store?copy(row.store.checkpoint):null})),sealed:true});
}
async function persistOriginalOperatorRow(state,index,row) {
  assert.ok(!state.fault&&!state.sealed,'FLAT_OPERATOR_RETAINED_GROUP_CLOSED');
  const pending=state.tail.then(async()=>{
    assert.ok(!state.fault&&!state.sealed,'FLAT_OPERATOR_RETAINED_GROUP_CLOSED');
    const next=copy(state.privateState);assert.equal(next.phase,'LIVE');equal(next.rows[index].publicKey,row.publicKey);
    next.rows[index]=copy(row);
    try{await state.lifetime.updateWrappedPrivateLifetimePartV1(state.handle,next);state.privateState=next;}
    catch(error){state.fault=true;throw error;}
  });state.tail=pending.catch(()=>{});return pending;
}
function publicOperatorGroup(state) {
  const group=Object.freeze({profile:RETAINED_OPERATOR_GROUP,operators:Object.freeze([...state.operators]),
    toJSON(){throw new Error('FLAT_OPERATOR_GROUP_NOT_SERIALIZABLE');}});
  retainedGroups.set(group,state);retainedRuntimeGroups.set(state.runtime,group);
  for(const operator of state.operators)operators.get(operator).attachRetention(state);
  return group;
}
export async function createRetainedLocalFlatOperatorGroupV1(input) {
  exactRecord(input,['runtime']);const {runtime}=input;
  const {assertOwnedLocalEvmV2}=await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');await assertOwnedLocalEvmV2(runtime);
  assert.ok(!retainedRuntimeGroups.has(runtime),'FLAT_OPERATOR_GROUP_ALREADY_CREATED');
  const identity=operatorGroupIdentity(runtime),lifetime=await lifetimeModule(),created=[];
  try{
    for(let i=0;i<4;i++)created.push(createLocalFlatOperator({signerIndex:i}));
    const rows=created.map(operator=>operators.get(operator).captureInitialization());validateOperatorRows(rows);
    const privateState={profile:RETAINED_OPERATOR_GROUP,generation:1,phase:'LIVE',rows};
    const handle=await lifetime.retainWrappedPrivateLifetimePartV1(runtime,'operator-keys',identity,privateState);
    lifetime.assertWrappedPrivateLifetimePartSealedV1(handle);
    return publicOperatorGroup({runtime,identity,lifetime,handle,privateState,operators:created,tail:Promise.resolve(),sealed:false,fault:false});
  }catch(error){for(const operator of created)try{operator.close();}catch{}throw error;}
}
export async function captureRetainedLocalFlatOperatorGroupV1(group) {
  const state=retainedGroups.get(group);assert.ok(state&&!state.fault&&!state.sealed,'FLAT_OPERATOR_ORIGINAL_GROUP_REQUIRED');
  await state.tail;
  const rows=state.operators.map(operator=>operators.get(operator).captureInitialization());validateOperatorRows(rows);
  // These synchronous closures prevent another operation between the original
  // idle snapshots and the durable sealed handoff. Failed seal stays blocked.
  state.sealed=true;for(const operator of state.operators)operator.close();
  const next={...copy(state.privateState),phase:'SEALED',rows};
  try{await state.lifetime.updateWrappedPrivateLifetimePartV1(state.handle,next);state.privateState=next;
    state.lifetime.assertWrappedPrivateLifetimePartSealedV1(state.handle);return operatorGroupReceipt(state.identity,next);
  }catch(error){state.fault=true;throw error;}
}
export async function reopenRetainedLocalFlatOperatorGroupV1(input) {
  exactRecord(input,['runtime','expected','bindings']);const {runtime}=input;fixedArray(input.bindings,4);
  const {assertOwnedLocalEvmV2}=await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');await assertOwnedLocalEvmV2(runtime);
  assert.ok(!retainedRuntimeGroups.has(runtime),'FLAT_OPERATOR_GROUP_ALREADY_CREATED');
  const identity=operatorGroupIdentity(runtime),lifetime=await lifetimeModule();
  const saved=await lifetime.readWrappedPrivateLifetimePartV1(runtime,'operator-keys',identity),original=copy(saved.privateState);
  exactRecord(original,['profile','generation','phase','rows']);assert.equal(original.profile,RETAINED_OPERATOR_GROUP);
  assert.equal(original.phase,'SEALED','FLAT_OPERATOR_ORIGINAL_SEALED_GROUP_REQUIRED');
  assert.ok(Number.isSafeInteger(original.generation)&&original.generation>0&&original.generation<1000000);
  validateOperatorRows(original.rows);equal(copy(input.expected),operatorGroupReceipt(identity,original));
  for(const [i,row]of original.rows.entries()){
    if(row.store===null)assert.equal(input.bindings[i],null,'FLAT_OPERATOR_UNBOUND_ORIGINAL_REQUIRED');
    else assert.ok(input.bindings[i]&&input.bindings[i].runtime===runtime,'FLAT_OPERATOR_ORIGINAL_BINDING_REQUIRED');
  }
  const next={...original,generation:original.generation+1,phase:'REOPENING'};
  await lifetime.updateWrappedPrivateLifetimePartV1(saved.handle,next);
  const created=[];
  try{
    for(const row of original.rows){
      const operator=createFlatOperator({signerIndex:row.signerIndex},null,row);created.push(operator);
      if(row.store!==null)await operator.bind(input.bindings[row.signerIndex]);
    }
    next.rows=created.map(operator=>operators.get(operator).captureInitialization());validateOperatorRows(next.rows);
    next.phase='LIVE';await lifetime.updateWrappedPrivateLifetimePartV1(saved.handle,next);
    lifetime.assertWrappedPrivateLifetimePartSealedV1(saved.handle);
    return publicOperatorGroup({runtime,identity,lifetime,handle:saved.handle,privateState:next,operators:created,
      tail:Promise.resolve(),sealed:false,fault:false});
  }catch(error){for(const operator of created)try{operator.close();}catch{}throw error;}
}
export function retainedLocalFlatOperatorPublicKeysV1(group, input) {
  exactRecord(input,['runtime']);const state=retainedGroups.get(group);
  assert.ok(state&&state.runtime===input.runtime&&!state.fault&&!state.sealed,'FLAT_OPERATOR_ORIGINAL_GROUP_REQUIRED');
  for(const operator of state.operators)operators.get(operator).assertRetainedLive();
  return freeze(state.operators.map(operator=>copy(operator.publicKey)));
}

export function assertRetainedLocalFlatOperatorGroupV1(group,input) {
  const publicKeys=retainedLocalFlatOperatorPublicKeysV1(group,input);
  return freeze({profile:RETAINED_OPERATOR_GROUP,publicKeys});
}
