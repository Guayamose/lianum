import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv, scryptSync, generateKeyPairSync } from 'node:crypto';
import { canonical, digest, commit, nullifier, newIdentity, sign, verify, encryptJson, decryptJson } from '../src/privacy.mjs';

const password = 'synthetic-testing-only-password';
const secret = 'a1'.repeat(32);
const domain = 'simulation:private-state:alice:v1';

test('canonical JSON is deterministic, rejects silent coercion and remains valid JSON', () => {
  assert.equal(canonical({ z: [true, null, 'á'], a: 17 }), '{"a":17,"z":[true,null,"á"]}');
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  const shared = { valid: true };
  assert.equal(canonical([shared, shared]), '[{"valid":true},{"valid":true}]');
  assert.equal(canonical(JSON.parse('{"__proto__":{"polluted":true}}')), '{"__proto__":{"polluted":true}}');
  assert.equal({}.polluted, undefined);
  assert.equal(canonical(Object.assign(Object.create(null), { safe: true })), '{"safe":true}');
  for (const value of [undefined, 1n, NaN, Infinity, 1.5, -0, Number.MAX_SAFE_INTEGER + 1,
    new Date(), new Map(), Buffer.from('a'), () => {}, Symbol('a'), '\ud800', [, 1]]) {
    assert.throws(() => canonical(value));
  }
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => canonical(cyclic), /Cyclic/);
  let getterCalled = false;
  const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { getterCalled = true; throw Error('executed'); } });
  assert.throws(() => canonical(getter), /data properties/);
  assert.equal(getterCalled, false);
  const proxy = new Proxy({}, { ownKeys() { throw new Error('Proxy trap executed'); } });
  assert.throws(() => canonical(proxy), /Unsupported JSON value/);
  assert.throws(() => canonical({ [Symbol('hidden')]: 1 }), /Symbol/);
  assert.throws(() => canonical(Object.defineProperty({}, 'hidden', { value: 1 })), /data properties/);
  const array = [1]; array.extra = true;
  assert.throws(() => canonical(array), /ordinary arrays/);
});

test('canonical JSON enforces size, depth and node bounds', () => {
  assert.throws(() => canonical('x'.repeat(1024 * 1024)), /byte limit/);
  assert.throws(() => canonical(Array(100_001).fill(null)), /arrays|complexity/);
  let nested = null;
  for (let i = 0; i < 66; i++) nested = [nested];
  assert.throws(() => canonical(nested), /complexity/);
});

test('property: object insertion order never changes digest or signature', () => {
  const identity = newIdentity();
  for (let seed = 0; seed < 40; seed++) {
    const ordered = { a: seed, b: `${seed}`, c: [seed, { z: 3, x: 1 }] };
    const reversed = { c: [seed, { x: 1, z: 3 }], b: `${seed}`, a: seed };
    assert.equal(digest(domain, ordered), digest(domain, reversed));
    assert.equal(sign(ordered, identity.privateKey), sign(reversed, identity.privateKey));
  }
});

test('hash framing separates domains, values, commitments and nullifiers', () => {
  const value = { amount: '1000', asset: 'simulation:ethereum:ETH' };
  assert.notEqual(digest('ab', 'c'), digest('a', 'bc'));
  assert.notEqual(digest(domain, value), digest(`${domain}:other`, value));
  assert.notEqual(commit(value, secret), commit(value, randomBytes(32).toString('hex')));
  assert.notEqual(commit(value, secret), commit({ ...value, amount: '1001' }, secret));
  assert.notEqual(commit(value, secret), digest(domain, value));
  assert.equal(nullifier(secret, domain, 'note-1'), nullifier(secret, domain, 'note-1'));
  assert.notEqual(nullifier(secret, domain, 'note-1'), nullifier(secret, domain, 'note-2'));
  assert.notEqual(nullifier(secret, domain, 'note-1'), nullifier(secret, `${domain}:other`, 'note-1'));
  assert.notEqual(nullifier(secret, 'ab', 'c'), nullifier(secret, 'a', 'bc'));
  // There is intentionally no graph argument: the state layer must reject a
  // previously consumed namespace+note nullifier across every graph.
  for (const bad of ['', 'aa', 'AA'.repeat(32), 'g0'.repeat(32), new Uint8Array(32)]) {
    assert.throws(() => commit(value, bad));
    assert.throws(() => nullifier(bad, domain, 'note-1'));
  }
  assert.throws(() => digest('', value));
  assert.throws(() => nullifier(secret, domain, ''));
  assert.throws(() => nullifier(secret, 'x'.repeat(257), 'note-1'));
});

test('Ed25519 binds the complete signed object and rejects malformed/non-Ed25519 keys', () => {
  const identity = newIdentity();
  const other = newIdentity();
  const receipt = { version: 1, domain, graph: 'g1', leg: 'l1', amount: '1000' };
  const signature = sign(receipt, identity.privateKey);
  assert.equal(verify(receipt, signature, identity.publicKey), true);
  for (const change of [{ version: 2 }, { domain: 'other' }, { graph: 'g2' }, { leg: 'l2' }, { amount: '1001' }]) {
    assert.equal(verify({ ...receipt, ...change }, signature, identity.publicKey), false);
  }
  assert.equal(verify(receipt, signature, other.publicKey), false);
  assert.equal(verify(receipt, signature.slice(2), identity.publicKey), false);
  assert.equal(verify(receipt, 'ff'.repeat(64), identity.publicKey), false);
  assert.equal(verify(receipt, signature, identity.privateKey), false);
  assert.equal(verify(receipt, signature, 'not a key'), false);
  assert.equal(verify(undefined, signature, identity.publicKey), false);
  const ec = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  assert.throws(() => sign(receipt, ec.privateKey), /Ed25519/);
  assert.equal(verify(receipt, signature, ec.publicKey), false);
});

test('AES-GCM/scrypt roundtrip uses fresh salt and IV and exposes no plaintext', () => {
  const value = { secretStrategy: 'synthetic-buy-two-assets', amount: '123456789', notes: [1, 2] };
  const first = encryptJson(value, password);
  const second = encryptJson(value, password);
  assert.deepEqual(decryptJson(first, password), value);
  assert.notEqual(first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.cipher.iv, second.cipher.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(JSON.stringify(first).includes(value.secretStrategy), false);
  assert.throws(() => decryptJson(first, 'different-synthetic-password'), /authentication failed/);
  assert.throws(() => encryptJson(value, ''), /password/);
  assert.throws(() => encryptJson(value, 'a'.repeat(1025)), /password/);
});

test('envelope rejects ciphertext/tag/IV/salt tampering and hostile parameter/shape inputs', () => {
  const envelope = encryptJson({ private: 'synthetic' }, password);
  const corruptions = [
    (e) => { e.ciphertext = `${e.ciphertext[0] === 'A' ? 'B' : 'A'}${e.ciphertext.slice(1)}`; },
    (e) => { e.cipher.tag = `${e.cipher.tag[0] === 'a' ? 'b' : 'a'}${e.cipher.tag.slice(1)}`; },
    (e) => { e.cipher.iv = '00'.repeat(12); },
    (e) => { e.kdf.salt = '00'.repeat(32); },
    (e) => { e.version = 2; },
    (e) => { e.kdf.N = 2 ** 30; },
    (e) => { e.kdf.p = 999999; },
    (e) => { e.cipher.name = 'aes-128-gcm'; },
    (e) => { e.cipher.tag = 'aa'; },
    (e) => { e.cipher.iv = 'aa'; },
    (e) => { e.ciphertext += '='; },
    (e) => { e.ciphertext = 'A'.repeat(2 * 1024 * 1024); },
    (e) => { e.extra = 'unexpected'; },
    (e) => { e.kdf.extra = 'unexpected'; },
    (e) => { e.cipher.extra = 'unexpected'; },
  ];
  for (const corrupt of corruptions) {
    const modified = structuredClone(envelope); corrupt(modified);
    assert.throws(() => decryptJson(modified, password));
  }
  let called = false;
  const accessor = Object.defineProperty({}, 'version', { enumerable: true, get() { called = true; return 1; } });
  assert.throws(() => decryptJson(accessor, password));
  assert.equal(called, false);
  const proxy = new Proxy(envelope, { ownKeys() { throw new Error('Proxy trap executed'); } });
  assert.throws(() => decryptJson(proxy, password), /Invalid envelope/);
});

test('valid ciphertext encrypted with wrong associated data cannot be decrypted', () => {
  const envelope = encryptJson({ synthetic: true }, password);
  const key = scryptSync(password, Buffer.from(envelope.kdf.salt, 'hex'), 32,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  try {
    const cipher = createCipheriv('aes-256-gcm', key, Buffer.from(envelope.cipher.iv, 'hex'));
    cipher.setAAD(Buffer.from('wrong-envelope-context'));
    envelope.ciphertext = Buffer.concat([cipher.update(canonical({ synthetic: true })), cipher.final()]).toString('base64url');
    envelope.cipher.tag = cipher.getAuthTag().toString('hex');
    assert.throws(() => decryptJson(envelope, password), /authentication failed/);
  } finally { key.fill(0); }
});
