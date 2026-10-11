import { need as observationNeed } from '../../../chains/shared/portfolio/portfolio-registry.mjs';
import { PROFILE_SCHEMA as EVM_HEALTH_SCHEMA } from '../../../chains/evm/transfers/evm-native-value-v2.mjs';
import { PROFILE_SCHEMA as TRON_HEALTH_SCHEMA } from '../../../chains/tron/transfers/tron-native-graph-profile.mjs';
import { prepareEvmNativeValueHealthReaderV3, createEvmNativeValueHealthReaderV3 } from '../../../chains/evm/health/evm-native-value-health-reader-v3.mjs';
import { prepareTronNativeValueHealthReaderV3, createTronNativeValueHealthReaderV3 } from '../../../chains/tron/health/tron-native-value-health-reader-v3.mjs';
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
import { cloneInput, frozenInput, inputUint } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { assertOwnedNativeValueSystem, nativeValueOperatorResources } from '../../deployments/native-value/native-value-system-v2.mjs';
import { createNativeValueSystemStateReader, assertNativeValueCurrentView } from '../../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { encodeFacts, validateFacts, factsSchema, profileCommitment, registryCommitment, assertFactsQuorum, sha256 }
  from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { encodeNativeValueHealth, assertNativeValueHealth, assertNativeValueHealthAllowed } from '../../../chains/shared/health/native-value-health-v2.mjs';
import { nativeValueInventoryBinding, nativeValuePolicy, validateNativeValueOperatorInventory,
  assertNativeValueSignature, assertStableNativeValueOriginal, assertNativeValueWatermark, nativeValueWatermark,
  MAX_CERTIFICATES_PER_ORIGINAL } from './native-value-inventory-v3.mjs';
export const NATIVE_VALUE_OPERATOR_PROFILE = 'SAME_HOST_NATIVE_VALUE_FULL_INVENTORY_BOUNDARIES_V3';
const bootstrapRequests = new WeakMap();
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
  function owned() { live(); assert.ok(bound, 'NATIVE_VALUE_OPERATOR_NOT_BOUND'); assertOwnedNativeValueSystem(bound.runtime, bound.system); assert.equal(bound.resources.assertLive(), undefined, 'NATIVE_VALUE_SYNCHRONOUS_LIVENESS_REQUIRED'); }
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
      sourceHistories.set(history, { entry: entry ? copy(entry) : null, policy, sourceIndex: String(signerIndex), nativeId });
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
        if (entry.status !== 'live') blockers.push({ profileCommitment: inventory.profileCommitment, nativeId: entry.original.nativeId, nativeGid: entry.original.facts.nativeGid, status: entry.status, reason: entry.reason });
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
    if (JSON.stringify(next) !== JSON.stringify(record.state)) await save(next);
    await current(); await unchanged();
    return freeze({ head: copy(active.view.head), inventoryCount: String(observations.length), observations, blockers });
  }
  async function coverage(pending = null) {
    const report = await auditAll(pending); assertNativeValueHealthAllowed(active.view.healthState);
    assert.equal(report.blockers.length, 0, 'NATIVE_VALUE_FULL_INVENTORY_BLOCKED'); return report;
  }
  async function serial(poolIndex, work, shared = null) {
    owned(); pool(poolIndex); assert.ok(!busy, 'NATIVE_VALUE_OPERATOR_BUSY');
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
  function keySign(bytes) { owned(); budget(active.started); keyUsed = true; uses++; return sign(key, bytes).toString('hex'); }
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
    audit(request) { const input = copy(request); exactRecord(input, ['poolIndex']); return serial(pool(input.poolIndex), () => auditAll()); },
    status() { return freeze({ closed, poisoned, bound: !!bound, busy, reserved: reservation !== null, signerIndex, keyUses: String(uses) }); },
    close() { assert.ok(!busy && reservation === null, 'NATIVE_VALUE_OPERATOR_BUSY'); closed = true; key = undefined; },
  });
  operators.set(operator, { reserve(token) { owned(); assert.ok(!busy && reservation === null, 'NATIVE_VALUE_OPERATOR_BUSY'); reservation = token; },
    release(token) { assert.ok(!busy && reservation === token, 'NATIVE_VALUE_OPERATOR_RESERVATION'); reservation = null; },
    bound: () => { owned(); return bound; }, health, certify,
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
      const registration = first.binding.profiles.find(row => profileCommitment(row.profile) === input.profileCommitment);
      const policy = nativeValuePolicy(first.binding, registration);
      const collected = assertFactsQuorum(results, policy, chosen.map(op => registration.sources[op.signerIndex]));
      const interval = collected.facts.observation;
      assert.ok(BigInt(interval.evidenceFrom) <= BigInt(view.head.timestamp) && BigInt(view.head.timestamp) < BigInt(interval.evidenceUntil), 'NATIVE_VALUE_FACTS_EXPIRED');
      return freeze({ certificates: results, collected, head: copy(view.head), audits });
    } catch (cause) { states.forEach((state, i) => state.poisonIfUsed(counts[i])); throw cause; }
    finally { for (const state of reserved) state.release(token); busy = false; }
  }
  const quorum = Object.freeze({ health: request => run('health', request), certify: request => run('certify', request),
    signerIndexes: freeze(chosen.map(op => op.signerIndex)) });
  quorums.set(quorum, { runtime: first.runtime, system: first.system, binding }); return quorum;
}
export function assertOwnedNativeValueQuorum(quorum, { runtime, system }) {
  const state = quorums.get(quorum); assert.ok(state && state.runtime === runtime && state.system === system, 'NATIVE_VALUE_OWNED_QUORUM_REQUIRED');
  state.binding();
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

/** Source-history issuance, source construction and output provenance share this
 * fixed kernel. The RPC readers below this boundary cannot mint owned outputs. */
const evmHealthOwners = new WeakSet(), evmHealthObservations = new WeakMap();
const tronHealthOwners = new WeakSet(), tronHealthObservations = new WeakMap();
function ownHealthReader(reader, owners, observations) {
  const source = Object.freeze({ ...reader, async observe(query) {
    const value = await reader.observe(query);
    observations.set(value, source);
    return value;
  } });
  owners.add(source);
  return source;
}
export async function createOwnedEvmNativeValueHealthSource(raw) {
  const prepared = prepareEvmNativeValueHealthReaderV3(raw);
  const history = nativeValueRetainedSourceHistory(prepared.historyToken, {
    policy: prepared.policy, sourceIndex: prepared.sourcePin.index, nativeId: prepared.identity.nativeId,
  });
  return ownHealthReader(createEvmNativeValueHealthReaderV3(prepared, history), evmHealthOwners, evmHealthObservations);
}
export function createOwnedTronNativeValueHealthSource(raw) {
  const prepared = prepareTronNativeValueHealthReaderV3(raw);
  const history = nativeValueRetainedSourceHistory(prepared.historyToken, {
    policy: prepared.policy, sourceIndex: prepared.pin.index, nativeId: prepared.identity.nativeId,
  });
  return ownHealthReader(createTronNativeValueHealthReaderV3(prepared, history), tronHealthOwners, tronHealthObservations);
}
export function assertOwnedEvmNativeValueHealthObservation(value, source) {
  observationNeed(evmHealthOwners.has(source) && evmHealthObservations.get(value) === source,
    'EVM_GRAPH_SOURCE_OBSERVATION_PROVENANCE');
}
export function assertOwnedTronNativeValueHealthObservation(value, source) {
  observationNeed(tronHealthOwners.has(source) && tronHealthObservations.get(value) === source,
    'TRON_GRAPH_OBSERVATION_PROVENANCE');
}
export function assertOwnedNativeValueHealthObservation(value, source, policy) {
  if (policy.profile.schema === EVM_HEALTH_SCHEMA) assertOwnedEvmNativeValueHealthObservation(value, source);
  else {
    assert.equal(policy.profile.schema, TRON_HEALTH_SCHEMA);
    assertOwnedTronNativeValueHealthObservation(value, source);
  }
}
const assertTypedSourceObservation = assertOwnedNativeValueHealthObservation;
