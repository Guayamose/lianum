import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  NATIVE_HUB_MESSAGE_TAG, NATIVE_HUB_MESSAGE_FIELDS, MAX_FINALITY_HEALTH_SECONDS,
  checkpointAuthorizationFrame, checkpointAuthorizationDigest,
  revocationFrame, revocationMessage, finalityHealthFrame, finalityHealthDigest,
  assertCheckpointAuthorizationValid, checkpointAuthorizationReplay,
  assertRevocationAuthorizationValid, assertFinalityHealthValid,
  nativeHubSignatureToAbi, nativeHubSignatureToHost, createNativeHubMessageHostVerifier,
} from '../src/evidence/native-hub-messages.mjs';
import { NATIVE_QUORUM_PROFILE, nativeQuorumRegistryCommitment } from '../src/evidence/native-quorum.mjs';
import { evidenceStateFrame } from '../src/paeg/native-state.mjs';

// Pure synthetic host checks: no nodes, RPC, EVM, native sends, keys on disk or proofs.
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const MAX = '18446744073709551615';
const raw32 = n => BigInt(n).toString(16).padStart(64, '0');
const h = n => `0x${raw32(n)}`;
const repeat = (n, width = 32) => `0x${n.repeat(width)}`;
const raw = value => Buffer.from(value.slice(2), 'hex');
const sha = value => `0x${createHash('sha256').update(value).digest('hex')}`;
// Deliberately independent of production framing and integer serialization.
function be(value, width) {
  const bytes = Buffer.alloc(width);
  let n = BigInt(value);
  for (let i = width - 1; i >= 0; i--) { bytes[i] = Number(n & 255n); n >>= 8n; }
  assert.equal(n, 0n);
  return bytes;
}
const h4 = (tag, parts) => Buffer.concat([Buffer.from(tag, 'ascii'), ...parts]
  .flatMap(part => [be(part.length, 4), part]));
const domain = { hubDomain: h(1), registryCommitment: h(2) };
const checkpoint = { ...domain, pool: repeat('44', 20), expectedPoolSequence: '72623859790382856',
  expectedHubStateSequence: MAX, requestId: h(5), validUntil: '1700000600' };
const revocation = { ...domain, gid: h(3), expectedSequence: MAX, reasonCommitment: h(4), authorizationExpiry: '1700000600' };
const evidence = { ...domain, receiptRoot: h(3), receiptCount: '64', revokedDigest: h(4), revokedCount: '63', revocationSequence: MAX };
const health = { ...evidence, validFrom: '1700000000', validUntil: '1700000030' };
const types = [
  ['checkpoint', checkpoint, checkpointAuthorizationFrame, checkpointAuthorizationDigest, 'assertCheckpointAuthorizationQuorum'],
  ['revocation', revocation, revocationFrame, revocationMessage, 'assertRevocationQuorum'],
  ['health', health, finalityHealthFrame, finalityHealthDigest, 'assertFinalityHealthQuorum'],
];
const currentCheckpoint = () => ({ ...domain, pool: checkpoint.pool,
  poolStateSequence: checkpoint.expectedPoolSequence, hubStateSequence: checkpoint.expectedHubStateSequence,
  checkpointCount: '63', timestamp: '1700000000' });
const currentRevocation = () => ({ ...domain, revocationSequence: revocation.expectedSequence, timestamp: '1700000000' });
const currentHealth = () => ({ ...evidence, halt: '0', timestamp: health.validFrom });

function fixture() {
  const members = Array.from({ length: 4 }, () => generateKeyPairSync('ec', { namedCurve: 'secp256k1' }));
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: domain.hubDomain.slice(2), registryEpoch: '1',
    rulesRoot: raw32(42), keys: members.map(({ publicKey }) => {
      const jwk = publicKey.export({ format: 'jwk' });
      return { x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') };
    }) };
  const commitment = nativeQuorumRegistryCommitment(registry);
  const verifier = createNativeHubMessageHostVerifier({ registry, expectedRegistryCommitment: commitment });
  const signMessage = (index, bytes) => {
    const signature = sign('sha256', bytes, { key: members[index].privateKey, dsaEncoding: 'ieee-p1363' });
    const s = BigInt(`0x${signature.subarray(32).toString('hex')}`);
    return signature.subarray(0, 32).toString('hex') + raw32(s > ORDER / 2n ? ORDER - s : s);
  };
  const request = (message, encode, indexes = [0, 1, 2]) => {
    const bound = { ...message, registryCommitment: `0x${commitment}` };
    return { message: bound, indexes, signatures: indexes.map(index => signMessage(index, encode(bound))) };
  };
  return { registry, commitment, verifier, request, signMessage };
}

test('all three CURRENT messages match independent H4 bytes, widths, tags and lengths', () => {
  const c = checkpoint, r = revocation, f = health;
  const expected = [
    h4('LIANUM/PAEG/checkpoint-authorize/2', [raw(c.hubDomain), raw(c.registryCommitment), raw(c.pool),
      be(c.expectedPoolSequence, 8), be(c.expectedHubStateSequence, 8), raw(c.requestId), be(c.validUntil, 8)]),
    h4('LIANUM/PAEG/revoke-receipt/2', [raw(r.hubDomain), raw(r.registryCommitment), raw(r.gid),
      be(r.expectedSequence, 8), raw(r.reasonCommitment), be(r.authorizationExpiry, 8)]),
    h4('LIANUM/PAEG/finality-health/2', [raw(f.hubDomain), raw(f.registryCommitment), raw(f.receiptRoot),
      be(f.receiptCount, 4), raw(f.revokedDigest), be(f.revokedCount, 4), be(f.revocationSequence, 8),
      be(f.validFrom, 8), be(f.validUntil, 8)]),
  ];
  types.forEach(([type, message, encode, digest], i) => {
    assert.deepEqual(encode(message), expected[i]);
    assert.equal(digest(message), sha(expected[i]));
    assert.equal(expected[i].length, [206, 200, 229][i]);
    assert.equal(expected[i].readUInt32BE(0), [34, 28, 29][i]);
    assert.equal(expected[i].subarray(4, 4 + expected[i].readUInt32BE(0)).toString(), NATIVE_HUB_MESSAGE_TAG[type]);
    assert.deepEqual(Object.keys(message), NATIVE_HUB_MESSAGE_FIELDS[type]);
  });
  assert.equal(checkpointAuthorizationFrame(checkpoint).subarray(138, 146).toString('hex'), '0102030405060708');
  // Health has exactly the existing evidence-state components, then its window.
  assert.deepEqual(finalityHealthFrame(health).subarray(33, -24), evidenceStateFrame(evidence).subarray(32));
});

test('all frozen independent Python vectors from the hub specification match', () => {
  const d = { hubDomain: '0x736d1f907b2425c21d5c3516793a7bcb5f8dc0af1c562e06b39f9d71d4c68f7e',
    registryCommitment: repeat('33') };
  assert.equal(checkpointAuthorizationDigest({ ...d, pool: repeat('44', 20), expectedPoolSequence: '0',
    expectedHubStateSequence: '0', requestId: repeat('bb'), validUntil: '1700000600' }),
  '0x5d09c94aabbb5f56497c5c59bf150bca152ff495cf1fa01aaab6a239fa99715a');
  assert.equal(revocationMessage({ ...d, gid: repeat('99'), expectedSequence: '0', reasonCommitment: repeat('aa'),
    authorizationExpiry: '1700000600' }), '0x89f42b5642eb8c03b78675ae488a54c41749f38804ad9c60c50db3f6510e5007');
  assert.equal(finalityHealthDigest({ ...d,
    receiptRoot: '0xc6984907d2e534964351393bc85f04374065b63870cc859c68192def090c1017', receiptCount: '0',
    revokedDigest: '0x55b13bafe45456b39f5f921fcc42e3268a39ad035dd3054fcfd44f7962f94ad3',
    revokedCount: '0', revocationSequence: '0', validFrom: '1700000000', validUntil: '1700000030' }),
  '0x64aacebe35f0b5cce3170ba121a7790424d02b5c8eb15db26ffe3e8417d5067c');
});

test('every message component changes its digest, with no implicit domain/profile wrapper', () => {
  for (const [, message, encode, digest] of types) {
    for (const [field, value] of Object.entries(message)) {
      const changed = value.startsWith('0x') ? repeat('ab', (value.length - 2) / 2) : String(BigInt(value) - 1n);
      assert.notEqual(digest({ ...message, [field]: changed }), digest(message), field);
    }
    assert.notEqual(digest(message), sha(h4(NATIVE_QUORUM_PROFILE, [encode(message)])));
    const result = encode(message); result.fill(0);
    assert.notEqual(digest(message), sha(result));
  }
});

test('message schemas reject missing/extra/grouped fields, accessors, symbols and nonplain objects', () => {
  for (const [, message, encode] of types) {
    for (const extra of ['profile', 'verified', 'route', 'graph', 'operation', 'tags', 'receiptSelection', 'messageDigest', 'privateKey']) {
      assert.throws(() => encode({ ...message, [extra]: true }), /FIELDS/);
    }
    for (const field of Object.keys(message)) {
      const missing = { ...message }; delete missing[field];
      assert.throws(() => encode(missing), /FIELDS/);
      const getter = { ...message };
      Object.defineProperty(getter, field, { get() { throw new Error('accessor must not run'); } });
      assert.throws(() => encode(getter), /FIELDS/);
    }
    assert.throws(() => encode({ ...message, [Symbol('extra')]: true }), /FIELDS/);
    assert.throws(() => encode(Object.assign(Object.create(null), message)), /FIELDS/);
    assert.throws(() => encode(Object.assign(Object.create({ inherited: true }), message)), /FIELDS/);
    assert.throws(() => encode({ message }), /FIELDS/);
  }
});

test('hex and uint encodings reject coercion, aliases, overflow and capacity overflow', () => {
  for (const [, message, encode] of types) {
    for (const [field, value] of Object.entries(message)) {
      if (value.startsWith('0x')) {
        for (const invalid of [value.slice(2), repeat('AB', (value.length - 2) / 2), value + '00', '0x0', raw(value), null]) {
          assert.throws(() => encode({ ...message, [field]: invalid }), /HEX/);
        }
      } else {
        for (const invalid of [0, -0, 1n, true, '01', '-1', '+1', '1.0', '1e2', ' 1', '1 ', '1\n', '1\r', '1\u2028', '1\u2029', '', '18446744073709551616', '1'.repeat(100)]) {
          assert.throws(() => encode({ ...message, [field]: invalid }), /UINT/);
        }
      }
    }
  }
  for (const field of ['receiptCount', 'revokedCount']) {
    for (const count of ['0', '1', '64']) assert.doesNotThrow(() => finalityHealthFrame({ ...health, [field]: count }));
    for (const count of ['65', '4294967295', '4294967296']) {
      assert.throws(() => finalityHealthFrame({ ...health, [field]: count }), /UINT_RANGE/);
    }
  }
  for (const value of ['0', '9007199254740993', MAX]) {
    assert.deepEqual(revocationFrame({ ...revocation, authorizationExpiry: value }).subarray(-8), be(value, 8));
  }
});

test('encoding computes bytes without asserting nonzero identifiers, freshness or interval validity', () => {
  assert.doesNotThrow(() => checkpointAuthorizationFrame({ ...checkpoint, pool: repeat('00', 20), requestId: h(0), validUntil: '0' }));
  assert.doesNotThrow(() => revocationFrame({ ...revocation, gid: h(0), reasonCommitment: h(0), authorizationExpiry: '0' }));
  assert.doesNotThrow(() => finalityHealthFrame({ ...health, validFrom: MAX, validUntil: '0' }));
});

test('checkpoint first use requires a nonzero request, capacity, exact pool/sequences and exclusive expiry', () => {
  const current = currentCheckpoint();
  assert.equal(assertCheckpointAuthorizationValid(checkpoint, current), true);
  assert.equal(assertCheckpointAuthorizationValid(checkpoint, { ...current, timestamp: '1700000599' }), true);
  for (const timestamp of ['1700000600', '1700000601']) {
    assert.throws(() => assertCheckpointAuthorizationValid(checkpoint, { ...current, timestamp }), /AUTHORIZATION_EXPIRED/);
  }
  for (const [field, value, error] of [
    ['requestId', h(0), /ZERO_REQUEST/], ['pool', repeat('00', 20), /POOL_CHANGED/],
    ['pool', repeat('55', 20), /POOL_CHANGED/], ['expectedPoolSequence', '0', /POOL_SEQUENCE_CHANGED/],
    ['expectedHubStateSequence', '0', /HUB_SEQUENCE_CHANGED/],
  ]) assert.throws(() => assertCheckpointAuthorizationValid({ ...checkpoint, [field]: value }, current), error);
  assert.throws(() => assertCheckpointAuthorizationValid(checkpoint, { ...current, checkpointCount: '64' }), /TREE_FULL/);
});

test('accepted checkpoint retries return original result after expiry/state change and reject rebinding', () => {
  const absent = { accepted: '0', binding: h(0), digest: h(0), root: h(0), index: '0' };
  assert.equal(checkpointAuthorizationReplay(checkpoint, absent), null);
  const prior = { accepted: '1', binding: checkpointAuthorizationDigest(checkpoint), digest: h(11), root: h(12), index: '63' };
  const result = checkpointAuthorizationReplay(checkpoint, prior);
  assert.deepEqual(result, { digest: h(11), root: h(12), index: '63' });
  assert.ok(Object.isFrozen(result));
  assert.throws(() => assertCheckpointAuthorizationValid(checkpoint,
    { ...currentCheckpoint(), timestamp: MAX, checkpointCount: '64', poolStateSequence: '0' }), /EXPIRED/);
  assert.deepEqual(checkpointAuthorizationReplay(checkpoint, prior), result);
  for (const [field, value] of Object.entries(checkpoint)) {
    const changed = value.startsWith('0x') ? repeat('ab', (value.length - 2) / 2) : String(BigInt(value) - 1n);
    assert.throws(() => checkpointAuthorizationReplay({ ...checkpoint, [field]: changed }, prior), /REQUEST_REBOUND/);
  }
  assert.throws(() => checkpointAuthorizationReplay({ ...checkpoint, requestId: h(0) }, absent), /ZERO_REQUEST/);
  assert.throws(() => checkpointAuthorizationReplay(checkpoint, { ...prior, accepted: true }), /UINT/);
  assert.throws(() => checkpointAuthorizationReplay(checkpoint, { ...prior, current: true }), /FIELDS/);
});

test('new revocation authorization checks nonzero facts/current sequence/exclusive expiry with no short window', () => {
  const current = currentRevocation();
  assert.equal(assertRevocationAuthorizationValid(revocation, current), true);
  assert.equal(assertRevocationAuthorizationValid({ ...revocation, authorizationExpiry: MAX }, current), true);
  assert.throws(() => assertRevocationAuthorizationValid({ ...revocation, gid: h(0) }, current), /ZERO_GID/);
  assert.throws(() => assertRevocationAuthorizationValid({ ...revocation, reasonCommitment: h(0) }, current), /ZERO_REASON/);
  assert.throws(() => assertRevocationAuthorizationValid({ ...revocation, expectedSequence: '0' }, current), /SEQUENCE_CHANGED/);
  assert.equal(assertRevocationAuthorizationValid(revocation, { ...current, timestamp: '1700000599' }), true);
  for (const timestamp of ['1700000600', MAX]) {
    assert.throws(() => assertRevocationAuthorizationValid(revocation, { ...current, timestamp }), /AUTHORIZATION_EXPIRED/);
  }
});

test('fresh health enforces halt, exact global state, half-open boundaries and at most 30 seconds', () => {
  const current = currentHealth();
  assert.equal(MAX_FINALITY_HEALTH_SECONDS, '30');
  for (const timestamp of ['1700000000', '1700000029']) {
    assert.equal(assertFinalityHealthValid(health, { ...current, timestamp }), true);
  }
  for (const timestamp of ['1699999999', '1700000030', '1700000031']) {
    assert.throws(() => assertFinalityHealthValid(health, { ...current, timestamp }), /OUTSIDE_WINDOW/);
  }
  for (const validUntil of ['1699999999', '1700000000']) {
    assert.throws(() => assertFinalityHealthValid({ ...health, validUntil }, current), /INVALID_WINDOW/);
  }
  assert.throws(() => assertFinalityHealthValid({ ...health, validUntil: '1700000031' }, current), /WINDOW_TOO_LONG/);
  assert.equal(assertFinalityHealthValid({ ...health, validUntil: '1700000001' }, current), true);
  assert.throws(() => assertFinalityHealthValid(health, { ...current, halt: '1' }), /NATIVE_HALTED/);
  for (const field of ['receiptRoot', 'receiptCount', 'revokedDigest', 'revokedCount', 'revocationSequence']) {
    const value = current[field].startsWith('0x') ? h(9) : String(BigInt(current[field]) - 1n);
    assert.throws(() => assertFinalityHealthValid(health, { ...current, [field]: value }), /STATE_CHANGED/);
  }
  const high = { ...health, validFrom: '18446744073709551585', validUntil: MAX };
  assert.equal(assertFinalityHealthValid(high, { ...current, timestamp: high.validFrom }), true);
  assert.equal(assertFinalityHealthValid(high, { ...current, timestamp: '18446744073709551614' }), true);
  assert.throws(() => assertFinalityHealthValid(high, { ...current, timestamp: MAX }), /OUTSIDE_WINDOW/);
});

test('validity assertions reject context substitutions, coercion and extra alleged assurance', () => {
  for (const [message, current, check] of [[checkpoint, currentCheckpoint(), assertCheckpointAuthorizationValid],
    [revocation, currentRevocation(), assertRevocationAuthorizationValid], [health, currentHealth(), assertFinalityHealthValid]]) {
    for (const field of ['hubDomain', 'registryCommitment']) {
      assert.throws(() => check(message, { ...current, [field]: h(9) }), /DOMAIN_CHANGED|REGISTRY_CHANGED/);
    }
    for (const extra of ['verified', 'route', 'spentTagDigest']) {
      assert.throws(() => check(message, { ...current, [extra]: true }), /FIELDS/);
    }
    assert.throws(() => check(message, { ...current, timestamp: 1700000000 }), /UINT/);
  }
  for (const halt of [true, 0, '2', '00']) assert.throws(() => assertFinalityHealthValid(health, { ...currentHealth(), halt }), /UINT/);
});

test('each message verifies all four choices of three registered synthetic signers', () => {
  const f = fixture();
  assert.equal(f.verifier.assurance, 'host-conformance-only');
  assert.equal(f.verifier.registryCommitment, `0x${f.commitment}`);
  for (const [, message, encode, , method] of types) {
    for (const indexes of [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]) {
      assert.equal(f.verifier[method](f.request(message, encode, indexes)), true);
    }
  }
});

test('signatures reject every rebound field, cross-message use and double hashing', () => {
  const f = fixture();
  for (const [, message, encode, , method] of types) {
    const request = f.request(message, encode);
    for (const [field, value] of Object.entries(request.message)) {
      const changed = value.startsWith('0x') ? repeat('ab', (value.length - 2) / 2) : String(BigInt(value) - 1n);
      assert.throws(() => f.verifier[method]({ ...request, message: { ...request.message, [field]: changed } }),
        /SIGNATURE_INVALID|DOMAIN_CHANGED|REGISTRY_CHANGED/, field);
    }
    const doubleHashed = { ...request, signatures: [...request.signatures] };
    doubleHashed.signatures[2] = f.signMessage(2, raw(sha(encode(request.message))));
    assert.throws(() => f.verifier[method](doubleHashed), /SIGNATURE_INVALID/);
    const otherBytes = Buffer.concat([Buffer.from('\x19Ethereum Signed Message:\n32'), raw(sha(encode(request.message)))]);
    const prefixed = { ...request, signatures: request.indexes.map(i => f.signMessage(i, otherBytes)) };
    assert.throws(() => f.verifier[method](prefixed), /SIGNATURE_INVALID/);
  }
  const checkpointRequest = f.request(checkpoint, checkpointAuthorizationFrame);
  const healthRequest = f.request(health, finalityHealthFrame);
  assert.throws(() => f.verifier.assertFinalityHealthQuorum({ ...healthRequest,
    signatures: checkpointRequest.signatures }), /SIGNATURE_INVALID/);
});

test('host quorum enforces three ascending distinct signers, low-S, fixed registry and exact request schema', () => {
  const f = fixture(), request = f.request(health, finalityHealthFrame);
  const check = value => f.verifier.assertFinalityHealthQuorum(value);
  for (const indexes of [[0], [0, 1], [0, 1, 2, 3]]) {
    assert.throws(() => check(f.request(health, finalityHealthFrame, indexes)), /EXACTLY_THREE/);
  }
  for (const indexes of [[0, 0, 2], [0, 2, 1], [1, 1, 2]]) {
    assert.throws(() => check(f.request(health, finalityHealthFrame, indexes)), /INDEX_ORDER/);
  }
  for (const index of [-0, '0', 4, 0.5]) {
    assert.throws(() => check({ ...request, indexes: [index, 1, 2] }), /INDEX_RANGE/);
  }
  const highS = [...request.signatures];
  highS[0] = highS[0].slice(0, 64) + raw32(ORDER - BigInt(`0x${highS[0].slice(64)}`));
  assert.throws(() => check({ ...request, signatures: highS }), /HIGH_S/);
  const outsider = fixture();
  assert.throws(() => check({ ...request, signatures: [request.signatures[0], request.signatures[1],
    outsider.signMessage(2, finalityHealthFrame(request.message))] }), /SIGNATURE_INVALID/);
  assert.throws(() => check({ ...request, signatures: Array(3).fill(request.signatures[0]) }), /SIGNATURE_INVALID/);
  for (const extra of ['v', 'verified', 'messageBytes', 'messageDigest', 'registry', 'threshold', 'privateKey']) {
    assert.throws(() => check({ ...request, [extra]: true }), /FIELDS/);
  }
  assert.throws(() => createNativeHubMessageHostVerifier({ registry: f.registry, expectedRegistryCommitment: raw32(0) }), /NOT_PINNED/);
  assert.throws(() => createNativeHubMessageHostVerifier({ registry: f.registry,
    expectedRegistryCommitment: f.commitment, verified: true }), /FIELDS/);
  assert.throws(() => createNativeHubMessageHostVerifier({ registry: { ...f.registry, registryEpoch: '1\n' },
    expectedRegistryCommitment: f.commitment }), /REGISTRY_EPOCH/);
  f.registry.hubDomain = raw32(0); f.registry.keys[0].x = raw32(0);
  assert.equal(check(request), true);
});

test('cryptographic conformance is distinct from current permit validity', () => {
  const f = fixture();
  const request = f.request({ ...health, validFrom: '0', validUntil: '0' }, finalityHealthFrame);
  assert.equal(f.verifier.assertFinalityHealthQuorum(request), true);
  assert.throws(() => assertFinalityHealthValid(request.message,
    { ...currentHealth(), registryCommitment: request.message.registryCommitment }), /INVALID_WINDOW/);
});

test('ABI/P1363 adapters preserve canonical r/s and require external recovery v without normalizing', () => {
  const signature = raw32(1) + raw32(ORDER / 2n);
  for (const signerIndex of ['0', '1', '2', '3']) {
    for (const v of ['27', '28']) {
      const abi = nativeHubSignatureToAbi({ signerIndex, v, signature });
      assert.deepEqual(abi, { signerIndex, v, r: h(1), s: h(ORDER / 2n) });
      assert.deepEqual(nativeHubSignatureToHost(abi), { index: Number(signerIndex), signature });
      assert.ok(Object.isFrozen(abi));
    }
  }
  const input = { signerIndex: '0', v: '27', signature };
  for (const v of [27, '0', '1', '29', '35', '027', null]) {
    assert.throws(() => nativeHubSignatureToAbi({ ...input, v }), /SIGNATURE_V/);
  }
  for (const signerIndex of [0, -0, '00', '4', '-1', '256']) {
    assert.throws(() => nativeHubSignatureToAbi({ ...input, signerIndex }), /UINT/);
  }
  for (const r of [0n, ORDER]) {
    assert.throws(() => nativeHubSignatureToAbi({ ...input, signature: raw32(r) + raw32(1) }), /SIGNATURE_R/);
  }
  for (const s of [0n, ORDER / 2n + 1n, ORDER]) {
    assert.throws(() => nativeHubSignatureToAbi({ ...input, signature: raw32(1) + raw32(s) }), /SIGNATURE_LOW_S/);
  }
  for (const invalid of ['0x' + signature, signature.toUpperCase(), signature.slice(2), signature + '00', signature + '\n']) {
    assert.throws(() => nativeHubSignatureToAbi({ ...input, signature: invalid }), /SIGNATURE_ENCODING/);
  }
  const abi = nativeHubSignatureToAbi(input);
  assert.throws(() => nativeHubSignatureToHost({ ...abi, r: abi.r.slice(2) }), /HEX/);
  assert.throws(() => nativeHubSignatureToHost({ ...abi, s: h(ORDER / 2n + 1n) }), /LOW_S/);
  assert.throws(() => nativeHubSignatureToHost({ ...abi, verified: true }), /FIELDS/);
  assert.throws(() => nativeHubSignatureToAbi({ ...input, lowS: true }), /FIELDS/);
  // Conversions are syntactic only: the adapter intentionally does not claim
  // either recovery parity is correct, and the host request contains no v.
  assert.deepEqual(nativeHubSignatureToHost(abi), nativeHubSignatureToHost({ ...abi, v: '28' }));
});
