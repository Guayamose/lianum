/** Dedicated V2 native-only signer/peer with durable original/certificate CAS.
 * Trusted private-bootstrap capabilities only. Request: {nativeId}; no graph,
 * source override, action, receipt secret, arbitrary frame or authority boolean. */
import assert from 'node:assert/strict';
import { KeyObject, createPublicKey, sign, verify } from 'node:crypto';
import { exactRecord, bytes32, fixedArray } from '../paeg/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../paeg/readiness-inputs.mjs';
import { assertTypedSourceObservation } from './generic-native-value-v2-source.mjs';
import { factsSchema, nativeWireBytes, assertRegistration, assertSource, profileCommitment, registryCommitment,
  encodeFacts, validateFacts, sha256, assertFactsQuorum } from './generic-native-value-v2.mjs';
const INVENTORY_SCHEMA = 'LIANUM_GENERIC_NATIVE_VALUE_CERTIFICATE_INVENTORY_V2';
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const equal = (a, b) => assert.deepEqual(a, b);
const clone = cloneInput, frozen = frozenInput;
function policyCopy(input) {
  const policy = clone(input); exactRecord(policy, ['ledgerNamespace', 'registry', 'profile', 'profilePath']);
  assert.equal(policy.ledgerNamespace, policy.registry.quorum.hubDomain);
  assertRegistration(policy.profile, policy.registry, policy.profilePath); return frozen(policy);
}
function checkSignature(point, signature, frame) {
  exactRecord(point, ['x', 'y']); bytes32(point.x, true); bytes32(point.y, true);
  assert.equal(typeof signature, 'string'); assert.match(signature, /^[0-9a-f]{128}$/);
  const r = BigInt('0x' + signature.slice(0, 64)), s = BigInt('0x' + signature.slice(64));
  assert.ok(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'NATIVE_VALUE_LOW_S');
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(point.x, 'hex').toString('base64url'), y: Buffer.from(point.y, 'hex').toString('base64url') } });
  assert.ok(verify('sha256', frame, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex')), 'NATIVE_VALUE_SIGNATURE');
}
export function createNativeValueSigner(raw) {
  exactRecord(raw, ['privateKey', 'policy']); const policy = policyCopy(raw.policy), key = raw.privateKey;
  assert.ok(key instanceof KeyObject && key.type === 'private' && key.asymmetricKeyType === 'ec'
    && key.asymmetricKeyDetails?.namedCurve === 'secp256k1', 'NATIVE_VALUE_DEDICATED_ATTESTER');
  const jwk = createPublicKey(key).export({ format: 'jwk' });
  const publicKey = frozen({ x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') });
  return Object.freeze({ publicKey, signFacts(facts) {
    const bytes = encodeFacts(facts, policy), signature = sign('sha256', bytes, { key, dsaEncoding: 'ieee-p1363' });
    const s = BigInt('0x' + signature.subarray(32).toString('hex'));
    return signature.subarray(0, 32).toString('hex') + (s > ORDER / 2n ? ORDER - s : s).toString(16).padStart(64, '0');
  } });
}
function configuration(raw) {
  exactRecord(raw, ['policy', 'source', 'publicKey']); const config = clone(raw);
  config.policy = policyCopy(config.policy); assertSource(config.policy.profile, config.source);
  equal(config.publicKey, config.policy.registry.quorum.keys[Number(config.source.index)]);
  return frozen(config);
}
const configurationDigest = config => sha256(JSON.stringify(config));
/** Explicit first use only. Store bootstrap is an operator decision; createPeer
 * never initializes a missing inventory or overwrites a previous history. */
export function createNativeValueInventory(raw) {
  const config = configuration(raw);
  return frozen({ schema: INVENTORY_SCHEMA, configurationDigest: configurationDigest(config), lastClock: '0', entries: [] });
}
const request = raw => { exactRecord(raw, ['nativeId']); bytes32(raw.nativeId, true); return clone(raw); };
function checkedState(raw, config) {
  const state = clone(raw); exactRecord(state, ['schema', 'configurationDigest', 'lastClock', 'entries']);
  assert.equal(state.schema, INVENTORY_SCHEMA); assert.equal(state.configurationDigest, configurationDigest(config));
  inputUint(state.lastClock); assert.ok(Array.isArray(state.entries) && state.entries.length <= 64); fixedArray(state.entries, state.entries.length);
  const seen = new Set();
  for (const entry of state.entries) {
    exactRecord(entry, ['request', 'nativeWire', 'inclusion', 'facts', 'signature', 'status', 'reason', 'lastCheckedAt', 'maximumEvidenceUntil']);
    request(entry.request); assert.ok(!seen.has(entry.request.nativeId)); seen.add(entry.request.nativeId);
    const facts = validateFacts(entry.facts, config.policy);
    assert.equal(facts.transactionId.slice(0, 64), entry.request.nativeId);
    assert.equal(sha256(nativeWireBytes(entry.nativeWire, config.policy)), facts.transactionSHA256);
    exactRecord(entry.inclusion, ['blockId', 'blockHeight', 'transactionIndex', 'receiptCommitment']);
    bytes32(entry.inclusion.receiptCommitment, true); inputUint(entry.inclusion.transactionIndex, 32);
    assert.equal(entry.inclusion.blockId, facts.observation.blockId); assert.equal(entry.inclusion.blockHeight, facts.observation.blockHeight);
    assert.ok(['live', 'unknown', 'adverse'].includes(entry.status));
    assert.ok(entry.status === 'live' ? entry.reason === null : typeof entry.reason === 'string' && /^[A-Z0-9_]{1,100}$/.test(entry.reason));
    assert.ok(inputUint(entry.lastCheckedAt) <= inputUint(state.lastClock));
    assert.ok(inputUint(entry.maximumEvidenceUntil) >= inputUint(facts.observation.evidenceUntil));
    if (entry.signature !== null) checkSignature(config.publicKey, entry.signature, encodeFacts(facts, config.policy));
  }
  return state;
}
function stable(previous, observed) {
  equal(previous.inclusion, observed.inclusion); assert.equal(previous.nativeWire, observed.nativeWire);
  for (const name of ['family', 'genesis', 'asset', 'transactionId', 'effectIndex', 'nativeGid', 'transactionSHA256', 'wireKeyCommitment', 'executionEvidenceCommitment'])
    assert.equal(previous.facts[name], observed.facts[name]);
  for (const name of ['blockId', 'blockHeight', 'sourceCommitment', 'destinationCommitment', 'amount', 'custodyKind', 'custodyCommitment'])
    assert.equal(previous.facts.observation[name], observed.facts.observation[name]);
  assert.ok(BigInt(observed.facts.finalizedBlockHeight) >= BigInt(previous.facts.finalizedBlockHeight));
  if (observed.facts.finalizedBlockHeight === previous.facts.finalizedBlockHeight)
    assert.equal(observed.facts.finalizedBlockId, previous.facts.finalizedBlockId);
}
function certificate(entry, index, policy) {
  const frame = encodeFacts(entry.facts, policy);
  return frozen({ schema: factsSchema(policy), signerIndex: index, facts: clone(entry.facts), frameHex: frame.toString('hex'),
    digest: sha256(frame), signature: entry.signature });
}
/** readerFor must return an independently bootstrapped branded V2 source at
 * THIS registered signer/source position. Store.load/commit is durable CAS.
 * All retained identities are audited even after their certificates expire. */
export async function createNativeValuePeer(raw) {
  exactRecord(raw, ['policy', 'source', 'signer', 'readerFor', 'clock', 'store']);
  exactRecord(raw.signer, ['publicKey', 'signFacts']); assert.equal(typeof raw.signer.signFacts, 'function');
  exactRecord(raw.clock, ['read', 'assertCurrent']); exactRecord(raw.store, ['load', 'commit']);
  for (const fn of [raw.readerFor, raw.clock.read, raw.clock.assertCurrent, raw.store.load, raw.store.commit]) assert.equal(typeof fn, 'function');
  const config = configuration({ policy: raw.policy, source: raw.source, publicKey: raw.signer.publicKey });
  const load = raw.store.load.bind(raw.store), save = raw.store.commit.bind(raw.store), readerFor = raw.readerFor;
  const readClock = raw.clock.read.bind(raw.clock), assertCurrent = raw.clock.assertCurrent.bind(raw.clock), signFacts = raw.signer.signFacts.bind(raw.signer);
  let persisted = await load(); exactRecord(persisted, ['revision', 'state']); inputUint(persisted.revision);
  let revision = persisted.revision, state = checkedState(persisted.state, config), busy = false, poisoned = false;
  async function unchanged() {
    try { const value = await load(); exactRecord(value, ['revision', 'state']); equal(value, { revision, state }); }
    catch (cause) { poisoned = true; throw new Error('NATIVE_VALUE_INVENTORY_REOPEN_REQUIRED', { cause }); }
  }
  async function commit(next) {
    try {
      const checked = checkedState(next, config), value = await save(frozen({ expectedRevision: revision, nextState: clone(checked) }));
      exactRecord(value, ['revision', 'state']); assert.equal(inputUint(value.revision), BigInt(revision) + 1n); equal(value.state, checked);
      equal(await load(), value); revision = value.revision; state = checked;
    } catch (cause) { poisoned = true; throw new Error('NATIVE_VALUE_DURABLE_WRITE_FAILED_REOPEN_REQUIRED', { cause }); }
  }
  async function serial(work) {
    assert.ok(!busy && !poisoned, 'NATIVE_VALUE_BUSY_OR_REOPEN_REQUIRED'); busy = true;
    try { await unchanged(); return await work(); } finally { busy = false; }
  }
  async function clock() {
    const head = clone(await readClock()); exactRecord(head, ['timestamp', 'head']); bytes32(head.head, true);
    assert.ok(inputUint(head.timestamp) >= BigInt(state.lastClock), 'NATIVE_VALUE_CLOCK_ROLLBACK'); return frozen(head);
  }
  async function current(head) { assert.equal(await assertCurrent(head), undefined, 'NATIVE_VALUE_CLOCK_ASSERT'); }
  async function inspect(query, head) {
    try {
      const source = await readerFor(frozen(clone(query)));
      assert.equal(source.sourceIndex, config.source.index); assert.equal(source.profileCommitment, profileCommitment(config.policy.profile));
      const value = await source.observe(frozen(clone(query))); assertTypedSourceObservation(value, source, config.policy);
      assert.equal(value.nativeId, query.nativeId); assert.equal(value.sourceIndex, config.source.index);
      if (value.status !== 'observed') return { status: value.status === 'reorged' ? 'adverse' : 'unknown', reason: value.reason };
      const observed = clone(value.proposal); const facts = validateFacts(observed.facts, config.policy);
      assert.equal(facts.observation.observedAt, head.timestamp, 'NATIVE_VALUE_COMMON_OBSERVATION_ROUND');
      assert.equal(facts.transactionId.slice(0, 64), query.nativeId);
      assert.equal(observed.frameHex, encodeFacts(facts, config.policy).toString('hex')); assert.equal(observed.digest, sha256(Buffer.from(observed.frameHex, 'hex')));
      return { status: 'observed', nativeWire: observed.nativeWire, inclusion: observed.inclusion, facts };
    } catch { return { status: 'unknown', reason: 'NATIVE_VALUE_SOURCE_UNAVAILABLE_OR_INVALID' }; }
  }
  async function mark(index, observed, at) {
    const next = clone(state); next.lastClock = at;
    Object.assign(next.entries[index], { status: observed.status === 'observed' ? 'live' : observed.status,
      reason: observed.status === 'observed' ? null : observed.reason, lastCheckedAt: at });
    await commit(next);
  }
  async function audit(head) {
    const observations = new Map(), blockers = [];
    for (let i = 0; i < state.entries.length; i++) {
      const entry = state.entries[i];
      if (entry.status === 'adverse') { blockers.push({ nativeId: entry.request.nativeId, status: entry.status, reason: entry.reason }); continue; }
      let observed = await inspect(entry.request, head);
      if (observed.status === 'observed') {
        try { stable(entry, observed); }
        catch { observed = { status: 'unknown', reason: 'NATIVE_VALUE_ORIGINAL_IDENTITY_CHANGED' }; }
      }
      await mark(i, observed, head.timestamp);
      if (observed.status === 'observed') observations.set(entry.request.nativeId, observed);
      else blockers.push({ nativeId: entry.request.nativeId, status: observed.status, reason: observed.reason });
    }
    await current(head); return { observations, blockers };
  }
  async function issue(input, refresh) {
    const query = request(input);
    return serial(async () => {
      const head = await clock(), { observations, blockers } = await audit(head);
      assert.equal(blockers.length, 0, 'NATIVE_VALUE_INVENTORY_BLOCKED');
      const index = state.entries.findIndex(entry => entry.request.nativeId === query.nativeId), prior = state.entries[index];
      assert.ok(!refresh || prior, 'NATIVE_VALUE_REFRESH_UNKNOWN_ID'); assert.ok(prior || state.entries.length < 64, 'NATIVE_VALUE_INVENTORY_FULL');
      const observed = observations.get(query.nativeId) ?? await inspect(query, head);
      assert.equal(observed.status, 'observed', 'NATIVE_VALUE_ORIGINAL_UNAVAILABLE'); if (prior) stable(prior, observed);
      await current(head);
      if (prior?.signature && JSON.stringify(prior.facts) === JSON.stringify(observed.facts)) {
        await unchanged(); return certificate(prior, config.source.index, config.policy);
      }
      const next = clone(state); next.lastClock = head.timestamp;
      const entry = { request: query, nativeWire: observed.nativeWire, inclusion: observed.inclusion, facts: observed.facts,
        signature: null, status: 'live', reason: null, lastCheckedAt: head.timestamp,
        maximumEvidenceUntil: prior && BigInt(prior.maximumEvidenceUntil) > BigInt(observed.facts.observation.evidenceUntil)
          ? prior.maximumEvidenceUntil : observed.facts.observation.evidenceUntil };
      const position = index < 0 ? next.entries.length : index; next.entries[position] = entry;
      await commit(next); await current(head); // persist original BEFORE signing
      const signature = await signFacts(frozen(clone(entry.facts)));
      checkSignature(config.publicKey, signature, encodeFacts(entry.facts, config.policy));
      const signed = clone(state); signed.entries[position].signature = signature;
      await commit(signed); await current(head); await unchanged();
      return certificate(state.entries[position], config.source.index, config.policy);
    });
  }
  return Object.freeze({ signerIndex: config.source.index, certify: input => issue(input, false), refresh: input => issue(input, true),
    auditInventory: () => serial(async () => { const head = await clock(), { blockers } = await audit(head);
      return frozen({ sourceIndex: config.source.index, registryCommitment: registryCommitment(config.policy.registry),
        at: head.timestamp, inventoryCount: String(state.entries.length), capacityAvailable: state.entries.length < 64, blockers }); }) });
}
export function createNativeValueCollector(raw) {
  exactRecord(raw, ['policy', 'sources', 'clock']); const policy = policyCopy(raw.policy), sources = clone(raw.sources);
  fixedArray(sources, 4); sources.forEach((source, i) => { assertSource(policy.profile, source); assert.equal(source.index, String(i)); });
  exactRecord(raw.clock, ['read', 'assertCurrent']); const read = raw.clock.read.bind(raw.clock), current = raw.clock.assertCurrent.bind(raw.clock);
  return Object.freeze({ async collect(input) {
    exactRecord(input, ['certificates']); const certificates = clone(input.certificates), head = clone(await read());
    exactRecord(head, ['timestamp', 'head']); bytes32(head.head, true); const now = inputUint(head.timestamp);
    const selected = certificates.map(c => sources[Number(inputUint(c.signerIndex, 8, 3n))]);
    const quorum = assertFactsQuorum(certificates, policy, selected), o = quorum.facts.observation;
    assert.ok(BigInt(o.evidenceFrom) <= now && now < BigInt(o.evidenceUntil), 'NATIVE_VALUE_CERTIFICATE_EXPIRED');
    assert.equal(await current(head), undefined); return frozen({ ...quorum, sources: selected });
  } });
}
