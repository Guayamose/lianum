import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import {
  SCHEMAS, domainCommitment, envelopeLeafCommitment, buildEnvelope,
  computeEnvelopeRoot, computeAuthorizationRoot, readinessJoinCommitment,
  readyOpeningCommitment, completionOpeningCommitment, receiptKeyCommitment,
  nativeAdmissionNullifier, encodeWireCommitment, decodeWireCommitment,
  nativeFactIdentity, encodeNativeFacts, nativeFactsDigest,
} from '../src/framing.mjs';
import { canonicalNativeEffectId, nativeReceiptKeyCommitment }
  from '@lianum/engine/execution/native/state/native-receipt';

const h = value => createHash('sha256').update(String(value)).digest('hex');
const copy = value => structuredClone(value);
const zero = '0'.repeat(64);
let fixtureSequence = 0;
function sampleType(type) {
  if (Array.isArray(type)) {
    if (type[0] === 'record') return sample(type[1]);
    return Array.from({ length: type[2] }, () => sampleType(type[1]));
  }
  if (type === 'digest') return h(++fixtureSequence);
  if (type === 'bytes64') return h(++fixtureSequence) + h(++fixtureSequence);
  if (type === 'bool') return true;
  if (type === 'slot' || type === 'count3') return '0';
  return '10';
}
function sample(schema) {
  const value = Object.fromEntries(schema.map(([name, type]) => [name, sampleType(type)]));
  for (const name of Object.keys(value)) {
    if (name.endsWith('Until')) value[name] = '20';
    if (name === 'settleBefore') value[name] = '200';
  }
  return value;
}
function leaf(index, domain) {
  const kind = index < 4 ? ['core', 'funding', 'recovery', 'settlement'][index]
    : index < 8 ? 'local' : index < 12 ? 'dependency' : 'payout';
  const payload = sample(SCHEMAS[kind]);
  if (index >= 4) payload[kind === 'dependency' ? 'targetSlot' : 'slot'] = String((index - 4) % 4);
  return { domain, index, kind, payload, blind: h('leaf-blind-' + index) };
}
function facts(family) {
  const value = sample(SCHEMAS.facts);
  value.family = family;
  value.effectIndex = '0';
  value.wireBindingVersion = '1';
  value.wireBindingKind = family;
  value.wireBindingPosition = family === '1' ? '2' : '1';
  value.transactionId = family === '1' ? h('btc-tx') + zero : h('sol-sig-a') + h('sol-sig-b');
  Object.assign(value.observation, { blockHeight: '50', observedAt: '100', finalityKind: family,
    confirmations: family === '1' ? '6' : '0', amount: '100000', custodyKind: '1',
    evidenceFrom: '100', evidenceUntil: '500' });
  value.nativeContext = family === '1'
    ? { observedTipId: h('tip'), observedTipHeight: '55', transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
    : { observedTipId: zero, observedTipHeight: '0', transactionSlot: '70', parentSlot: '69', observedSlot: '75' };
  value.nativeGid = nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex']
    .map(name => [name, value[name]])));
  return value;
}

test('HOST ONLY: every deployment domain field is committed; profile inputs stay exact', () => {
  const value = sample(SCHEMAS.domain), original = domainCommitment(value);
  for (const [field] of SCHEMAS.domain) {
    assert.notEqual(domainCommitment({ ...value, [field]: h(field + '-substitution') }), original);
  }
  assert.equal(domainCommitment(Object.fromEntries(Object.entries(value).reverse())), original);
  assert.throws(() => domainCommitment({ ...value, extra: 'ignored?' }), /EXACT_FIELDS/);
  assert.throws(() => domainCommitment({ ...value, ledgerNamespace: zero }), /NONZERO/);
});

test('HOST ONLY: records reject getters/proxies and canonical integers are not coerced', () => {
  let invoked = false;
  const dangerous = { ledgerNamespace: h('namespace') };
  Object.defineProperty(dangerous, 'secret', { enumerable: true, get() { invoked = true; return h('secret'); } });
  assert.throws(() => receiptKeyCommitment(dangerous), /DATA_FIELDS/);
  assert.equal(invoked, false);
  assert.throws(() => receiptKeyCommitment(new Proxy({}, {})), /PLAIN_RECORD/);
  const domain = domainCommitment(sample(SCHEMAS.domain));
  for (const value of [10, -0, NaN, '01', '-0', '+1', '1e2', '18446744073709551616']) {
    const input = leaf(1, domain); input.payload.fundingNotBefore = value;
    assert.throws(() => envelopeLeafCommitment(input));
  }
  for (const ending of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
    assert.throws(() => receiptKeyCommitment({ ledgerNamespace: h('namespace'), secret: h('secret') + ending }),
      /HEX_LENGTH/);
    const input = leaf(1, domain); input.payload.fundingNotBefore = '1' + ending;
    assert.throws(() => envelopeLeafCommitment(input), /CANONICAL_UINT/);
  }
});

test('HOST ONLY: fixed leaf positions, slots and blinding bind the complete envelope', () => {
  const domain = domainCommitment(sample(SCHEMAS.domain));
  const inputs = Array.from({ length: 16 }, (_, index) => leaf(index, domain));
  const hashes = inputs.map(envelopeLeafCommitment), envelope = buildEnvelope(hashes);
  for (let index = 0; index < 16; index++) assert.equal(computeEnvelopeRoot(envelope.path(index)), envelope.root);
  const wrongSlot = copy(inputs[5]); wrongSlot.payload.slot = '0';
  assert.throws(() => envelopeLeafCommitment(wrongSlot), /SLOT_POSITION/);
  assert.throws(() => envelopeLeafCommitment({ ...inputs[0], index: 1 }), /LEAF_POSITION/);
  assert.throws(() => envelopeLeafCommitment({ ...inputs[0], blind: zero }), /NONZERO/);
  assert.notEqual(envelopeLeafCommitment({ ...inputs[0], blind: h('different-blind') }), hashes[0]);
  assert.notEqual(buildEnvelope([...hashes.slice(1), hashes[0]]).root, envelope.root);
  const retainedPath = envelope.path(0); hashes[0] = h('caller-mutates-array');
  assert.deepEqual(envelope.path(0), retainedPath);
});

test('HOST ONLY: fixed depth and position prevent path reuse or omitted siblings', () => {
  const domain = domainCommitment(sample(SCHEMAS.domain));
  const hashes = Array.from({ length: 16 }, (_, index) => envelopeLeafCommitment(leaf(index, domain)));
  const envelope = buildEnvelope(hashes), original = envelope.path(3);
  assert.notEqual(computeEnvelopeRoot({ ...original, index: 2 }), envelope.root);
  assert.throws(() => computeEnvelopeRoot({ ...original, siblings: original.siblings.slice(1) }), /FIXED_ARRAY/);
  const hole = [...original.siblings]; delete hole[1];
  assert.throws(() => computeEnvelopeRoot({ ...original, siblings: hole }));
  assert.throws(() => computeAuthorizationRoot(original), /FIXED_ARRAY/);
  assert.throws(() => computeEnvelopeRoot({ ...original, index: 16 }), /MERKLE_INDEX/);
});

test('HOST ONLY: P/R join binds target, envelope, roots, historical state and signing window', () => {
  const input = { domain: domainCommitment(sample(SCHEMAS.domain)), ...sample(SCHEMAS.join) };
  const original = readinessJoinCommitment(input);
  for (const name of ['domain', 'envelope', 'targetContext', 'authorizationRoot', 'checkpoint', 'readinessEvidenceState', 'blind']) {
    assert.notEqual(readinessJoinCommitment({ ...input, [name]: h(name + '-changed') }), original);
  }
  assert.notEqual(readinessJoinCommitment({ ...input, readinessFrom: '11' }), original);
  assert.notEqual(readinessJoinCommitment({ ...input, readinessUntil: '21' }), original);
  assert.throws(() => readinessJoinCommitment({ ...input, readinessUntil: input.readinessFrom }), /POSITIVE_WINDOW/);
});

test('HOST ONLY: L commits every R98 field and the P/R join', () => {
  const input = { domain: domainCommitment(sample(SCHEMAS.domain)), joinCommitment: h('join'),
    descriptor: sample(SCHEMAS.ready), blind: h('ready-blind') };
  const original = readyOpeningCommitment(input);
  for (const [name, type] of SCHEMAS.ready) {
    const changed = copy(input);
    changed.descriptor[name] = type === 'digest' ? h(name + '-changed') : name === 'readyFrom' ? '11' : '21';
    assert.notEqual(readyOpeningCommitment(changed), original, name);
  }
  assert.notEqual(readyOpeningCommitment({ ...input, joinCommitment: h('other-join') }), original);
});

test('HOST ONLY: M prevents splicing a matching context from another E and binds all N51 fields', () => {
  const input = { domain: domainCommitment(sample(SCHEMAS.domain)), envelope: h('E-one'),
    statement: sample(SCHEMAS.completion), blind: h('node-blind') };
  const original = completionOpeningCommitment(input);
  assert.notEqual(completionOpeningCommitment({ ...input, envelope: h('E-two') }), original);
  for (const [name, type] of SCHEMAS.completion) {
    const changed = copy(input);
    changed.statement[name] = type === 'digest' ? h(name + '-changed')
      : type === 'slot' ? '1' : name === 'validFrom' ? '11' : '21';
    assert.notEqual(completionOpeningCommitment(changed), original, name);
  }
});

test('HOST ONLY: same-effect N has no pool/registry/rho choice and preserves stable K bytes', () => {
  const ledgerNamespace = h('namespace'), secret = h('secret'), nativeGid = h('effect');
  const key = receiptKeyCommitment({ ledgerNamespace, secret });
  assert.equal(key, nativeReceiptKeyCommitment(ledgerNamespace, secret));
  const input = { ledgerNamespace, secret, nativeGid }, original = nativeAdmissionNullifier(input);
  assert.equal(nativeAdmissionNullifier(copy(input)), original);
  assert.notEqual(original, key);
  for (const name of ['ledgerNamespace', 'secret', 'nativeGid']) {
    assert.notEqual(nativeAdmissionNullifier({ ...input, [name]: h(name + '-other') }), original);
  }
  for (const name of ['pool', 'registryEpoch', 'receiptRho', 'profile']) {
    assert.throws(() => nativeAdmissionNullifier({ ...input, [name]: h(name) }), /EXACT_FIELDS/);
  }
});

test('HOST ONLY: one canonical 70-byte ASCII wire commitment; no normalization fallback', () => {
  const key = h('wire-key'), bytes = encodeWireCommitment(key);
  assert.equal(bytes.length, 70); assert.equal(decodeWireCommitment(bytes), key);
  for (const other of [Buffer.concat([bytes, Buffer.from([0])]), Buffer.from(bytes.toString().toUpperCase()),
    Buffer.from(bytes.toString().replace('LNRB1:', 'LNRB2:')), Buffer.from('LNRB1:' + zero)]) {
    assert.throws(() => decodeWireCommitment(other));
  }
  const highBit = Buffer.from(bytes); highBit[0] |= 0x80;
  assert.throws(() => decodeWireCommitment(highBit), /CANONICAL/);
});

test('HOST ONLY: BTC/SOL facts preserve canonical GID while rejecting padding/finality substitutions', () => {
  for (const family of ['1', '2']) {
    const value = facts(family);
    assert.equal(value.nativeGid, canonicalNativeEffectId({ chainDomain: {
      chain: family === '1' ? 'BTC' : 'SOL', genesis: value.genesis, asset: value.asset },
    effectIdentity: { transactionId: family === '1' ? value.transactionId.slice(0, 64) : value.transactionId, effectIndex: '0' } }));
    assert.ok(encodeNativeFacts(value).length > 0);
    for (const change of [v => { v.effectIndex = '1'; }, v => { v.wireBindingVersion = '2'; },
      v => { v.nativeGid = h('wrong-gid'); }, v => { v.observation.custodyKind = '2'; },
      v => { v.observation.evidenceFrom = '99'; }, v => { v.nativeContext.extra = 'hidden'; }]) {
      const changed = copy(value); change(changed); assert.throws(() => encodeNativeFacts(changed));
    }
  }
  const btc = facts('1'); btc.transactionId = btc.transactionId.slice(0, 64) + h('nonzero-padding');
  assert.throws(() => encodeNativeFacts(btc), /PADDING/);
  const tooFew = facts('1'); tooFew.observation.confirmations = '5';
  assert.throws(() => encodeNativeFacts(tooFew), /CONFIRMATIONS/);
  const sol = facts('2'); sol.nativeContext.parentSlot = sol.nativeContext.transactionSlot;
  assert.throws(() => encodeNativeFacts(sol), /SLOT_ORDER/);
});

test('HOST SIGNATURE ONLY: facts sign the original H4 frame with one SHA256, not hash-of-hash', () => {
  const value = facts('1'), frame = encodeNativeFacts(value);
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const signature = sign('sha256', frame, privateKey);
  assert.equal(verify('sha256', frame, publicKey, signature), true);
  assert.equal(verify('sha256', Buffer.from(nativeFactsDigest(value), 'hex'), publicKey, signature), false);
  const changed = copy(value); changed.observation.amount = '100001';
  assert.equal(verify('sha256', encodeNativeFacts(changed), publicKey, signature), false);
  // No low-S/quorum/native-fact acceptance is asserted by this byte-binding test.
});
