import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constants, createCipheriv, createDecipheriv, createHash, createPrivateKey,
  createPublicKey, privateDecrypt, publicEncrypt,
} from 'node:crypto';
import { canonical, sign, verify } from '../src/privacy.mjs';
import {
  COMPACT_ENVELOPE_BYTES, ENVELOPE_DOMAIN, PLAINTEXT_SLOT_BYTES,
  newExecutorIdentity, newLegBinding, sealLeg, openLeg, ReplayGuard, inspectPublicEnvelope,
} from '../src/private-envelope.mjs';
import { buildPrivateEnvelopeEvidence } from '../scripts/private-envelope-demo.mjs';

// Publicly committed SYNTHETIC TEST KEYS. Never use for accounts, funds or secrets.
// Generated once locally; fixed fixture inputs do not change production randomness.
const RSA_PRIVATE = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCyEOSErBuiRdYM
05o7MBXb5B2r2F2ec96PjSp2Ujk8DiqeMgkSsa05qcC7jz30KOo+p3eDlh2X/dhG
11doIOfnOv2bxHmeEoOA1wV5rmDHVd7Wu7PJNpPELyEaShKcqPezAqm0+GzCcC2/
umLMzC2NiirLOOjA2/eBjGVLOu/6GTNR8cmGGOAdGI0uusKnR7kyi/3WRMJ29eys
SvIJ1IMbP14qHRkIFnWpFe6HzfWS7PqNR3kqaoPum+HYcoscATHgOtnREnDsoyYI
WCgURbKM1n8/rL5/2fjnW8vDX9AQfaXAwnFEtVQvRb9vscVh5AGhlPln4VO53xPB
zL1qZurJAgMBAAECggEAOkgaK6yTbOUTvuYBfK7r8Kl05rquRb8iEPVA+TJHZncy
js3Mt3AtRQrhOOKVAhXkObahgRHAxO9Ce0lfZAclMENYH8RKlCj2HtUCB0ZCiev6
wGj2Wv0Al31fhdXJyrnpPQ+5kTCglHGYH8F3NhX8MPAQuqx5TiqRE7dqrhlv03kf
8K8Htgwpu6aMwvXl3aRvfGpZoobZYsjS7csW5nQQPy19YNKL7Tumk5Slweh/UNmu
fb9t4IWAy0WRZn7m0jw/bsJcfg/PkYgNUQPfAVr82OamWflN1nZJUMEsJzCxGUwW
6ExPO6ut/bweUsAJGtp665VRDfHmkAyW3NZ78GXQawKBgQD13/fnlo8e7ykEr7rr
7euaJstDOLtn8ZsdHUI6zaB9IK02gRETvh9tCL32+isf1+oDIV9/02QKL5HP+WKm
f6JX0ehKrfwIzniMa7mcER7uyHIP9jt4TERkmgXlA8HLL2Bk3vmhYsRasMFEOJyk
+aZZhafpSNzBdfh5m+a1RkwI4wKBgQC5ZhPrOEMfh4xRMRPRsXYsMw+Y4lU4Dv+N
KnxuDv1uyk4fNP9KIq0DNJEd+Dg6SsMZ5SAWmpNjS1SauRO7bGMg1s/VA6L5oWuL
DpK+VlKdjerkJ07ek9J+01d6UdWF00YmfwlB+egfjeA2/MpVyQ1XveE0Vs/c3LUt
OSB1pyqJYwKBgHiDEEUonHmzC03KvDmLYeEqhpIqKmDmIPsCLkYYJ0NtUrjWRgKB
O3H7yPBW6fAvqfli0CYc/HmpmzRurZWiFXYp4ktIP7IpURiybEU8dwbepFmCfN+X
siYFAEKhtsjaLcsDJyOc/1TcMb44aT7LRme2hPhoyBrisakZatkK3ZW1AoGANSWZ
Ai3/t/Mge0npV4xaxvLgPsBrE4XhJjOOtfIgHnlqCbIkmLj2Bdw02XWFkNhLs4mm
ODSZmbZHi48QpAK/K/PIYlUHjC4E6TkFQgD27+l18299QXr4tZiaFBuPbSySiIiU
O9CLBTijlL/EtPDMnWF2RI26SqMOYOdmcbO5EucCgYB6orQRpfoEU6NbfFyNdPHP
sVzzsZR5GDH26yy+08ZltlsYMMcPjptr1WXYtv9u5S3vsB0flo4yc6LSQ7MUuqHB
bxlo/vGiFpKqmjJlQvuz+3TQ07GNGyamxrXhho+L308GkNmLlzl4mo6qTmRPC2vo
/BkRHC8aDUQLF/rI5yW+Gw==
-----END PRIVATE KEY-----
`;
const WRONG_RSA_PRIVATE = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCU4HpSfH51eljU
PuaGoZD9NC95iFXRWAMzfQe7jmeP3roYzf6hrl5aC2MJA+hwuaBnRht5am7OhdxU
INqHi1HK9TJAwAoapfZWzxY6g0kWXkr7NUboLPtZRIZeRRN8l3I8BLfhwK6+f/FI
grujBoZmpH371Dm1BqivgmrDitIB3MV0rLdZ4OtDgux8hQs8kjtNiZUwjq2rLgxk
DfVPYuXVXTnuKY5QWGQDx5KsbDP9rp4LQeduk1iD0lqrNGpx4n/PprFkMkuiYHlO
FtzUis4MRlMAhCia0c05An53kb/zBcmMHBgtmX8sDZwQ8KmAj0IyxF8FkGw91uqA
pqVQueyvAgMBAAECggEACn5VYOGxhX+dfz2nwK7mqfzhqRlOTeEm6JwpeAjY4oUl
F4EoL3vmM/FAMRnQv7v1wxG9TK450oi7jO/RN2M/MqUHE7/1dly4TkoZG6q2nhhW
BKWEB/K+Yf5jJ4XgPRSXqASqdAPBeAqglnx7KUnZHfxTfPU/1AindHzRdahKlng+
VVfFmTrnNZrWNkw06Tb3qsEjnF7G+bnwqAnF4Yvx7D3B6w94YWZBSn+31vFGidM+
60pmt3+l1ioH23juYqjda7NH72ZW1EU5qbfIOOrIQ9Eiht8jhxrTmoUjC0jPATCm
T9yl3kToIjmC7fcqGO5iN7++hAOpawu4/DubnZTasQKBgQDDaL5VJK+imQDCPVLf
b6cQCGLeeMhl6/JO2mfEF+TEvReNoweemvOmyW4A8aAsEPwEePXN8R2eukHDSX2q
AajSkRY/aLWDPbeqOiWjYk+dR1tN+acM9s80vp6icum9zAEqsr60u5/iv1b/5QBv
x6MalPRvQH2XX1bcj7sOmV92hQKBgQDDChP6xuFhwuPvSrMxq4ap3PSOu3wOAlnL
GR/S0e/z76+gNCYka2ReTvJllE+pd1TmbT2wrem8kZlFwhmERpdxEJB3J3Ar5HQE
OmWlJHpNjdPfTe4B1re0E32sCekqWZReYvkYNXz4IuCqKpDwFVXLR9czSKp9c8X9
6K9y4ux+owKBgFdajqNfSAim3zj10wNBVWyMYy5SzjsJ1AM+DV8S01jDszDE7ZYQ
bNVlfIB9g33Phem17SRIIlafquBTDRMftMmUxF5KP8JQp7c4UTUNsMt9Z6qe7PeV
qaFJiX7TYfxPo0HkL+55ZYsmwAya4awWkapDZlYJfVta6mik9BkdpRhFAoGAYBh9
E5gdv+8oIuRpOdXLObIWBKU3UCe0Wi780QCC+2ti2soW6ObIwvae05GpVlPnTskQ
Fhb6DOCn5gjmTZgCUcDZjPuvdtDOoK6tGhrI76ErfOCGnf1O8biQuM0BRs5wHbki
Bd2EvzVgADeMxd2dMdUpoKjy53C9Yobcuvw3jYUCgYBZWTevWEMbLebxHJwWxI2w
DEa+lOCkZyt9f7O3eroSHTJMhH7s7TPPGYzj0azuu0KuFQG8vOwQv3pRO9Ng6WiN
AHC3STOivciT3/g/s3WWxnRNSVVKLW1UcliykvIO4F5GpPaTfR45+Cv+BJaU9wXg
4IvGZr8BVjtjdHDdNjubFw==
-----END PRIVATE KEY-----
`;
const RSA_PUBLIC = createPublicKey(RSA_PRIVATE).export({ type: 'spki', format: 'pem' });
const KID = createHash('sha256').update(createPublicKey(RSA_PUBLIC).export({ type: 'spki', format: 'der' })).digest('hex');
function edKey(seedByte) {
  const key = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, seedByte)]),
    type: 'pkcs8', format: 'der',
  });
  return {
    authPrivateKey: key.export({ type: 'pkcs8', format: 'pem' }),
    authPublicKey: createPublicKey(key).export({ type: 'spki', format: 'pem' }),
  };
}
const SENDER = edKey(1);
const ATTACKER = edKey(2);
const BINDING = Object.freeze({
  context: '11'.repeat(32), dispatchToken: '22'.repeat(32), returnCapability: '33'.repeat(32), ...SENDER,
});
const NOW = 1_800_000_000_000;
const INSTRUCTION = Object.freeze({
  chain: 'ethereum', asset: 'ethereum:local:wei', amount: '777', maxFee: '7',
  recipient: 'synthetic:executor-output:alice', expiresAt: NOW + 60000,
});
const HEADER = Object.freeze({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: KID,
  typ: 'paeg-leg+jwe', cty: 'application/paeg-leg+json' });
function expectedMessage(binding = BINDING, input = INSTRUCTION) {
  return { version: 1, domain: ENVELOPE_DOMAIN, context: binding.context, recipientKid: KID,
    dispatchToken: binding.dispatchToken, ...input, returnCapability: binding.returnCapability };
}
function options(overrides = {}) {
  return { executorPrivateKey: RSA_PRIVATE, expectedContext: BINDING.context,
    expectedAuthPublicKey: SENDER.authPublicKey, replayGuard: new ReplayGuard(), now: NOW, ...overrides };
}
function frame(body) {
  const data = Buffer.from(typeof body === 'string' ? body : canonical(body));
  const result = Buffer.alloc(PLAINTEXT_SLOT_BYTES);
  result.writeUInt32BE(data.length); data.copy(result, 4); return result;
}
function signedBody(payload = expectedMessage(), key = SENDER.authPrivateKey) {
  return { message: payload, signature: sign(payload, key) };
}
// Malformed fixture builder ONLY: fixed CEK/IV enable reproducible authenticated
// adversarial payloads. The production seal API offers no RNG override.
function rawSeal({ plaintext = frame(signedBody()), protectedHeader = HEADER, headerText,
  oaepHash = 'sha256', wrappedCek = Buffer.alloc(32, 0x44), aadSuffix = '' } = {}) {
  const protectedSegment = Buffer.from(headerText ?? canonical(protectedHeader)).toString('base64url');
  const iv = Buffer.alloc(12, 0x55);
  const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 0x44), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(protectedSegment + aadSuffix, 'ascii'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const encryptedKey = publicEncrypt({ key: RSA_PUBLIC, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash }, wrappedCek);
  return [protectedSegment, encryptedKey.toString('base64url'), iv.toString('base64url'),
    ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}
function reject(compact, opts = options()) {
  assert.throws(() => openLeg(compact, opts), { code: 'ENVELOPE_REJECTED', message: 'Private envelope rejected' });
  assert.equal(opts.replayGuard.size, 0, 'invalid evidence never consumes a binding');
}

test('round trip reveals only the exact minimized signed instruction', () => {
  const compact = sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC);
  assert.equal(compact.length, COMPACT_ENVELOPE_BYTES);
  assert.equal(compact.split('.').length, 5);
  assert.deepEqual(openLeg(compact, options()), expectedMessage());
  const inspected = inspectPublicEnvelope(compact);
  assert.deepEqual(inspected.header, HEADER);
  assert.equal(inspected.plaintextSlotBytes, 4096);
  assert.equal(compact.includes(BINDING.returnCapability), false);
  assert.equal(compact.includes(INSTRUCTION.recipient), false);
});

test('independent primitive decoding verifies OAEP256, GCM AAD, framing and Ed25519', () => {
  const compact = sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC);
  const [protectedSegment, encryptedKey, iv, ciphertext, tag] = compact.split('.');
  const key = privateDecrypt({ key: RSA_PRIVATE, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(encryptedKey, 'base64url'));
  assert.equal(key.length, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(protectedSegment, 'ascii')); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const decoded = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
  assert.equal(decoded.length, 4096);
  const length = decoded.readUInt32BE();
  const body = JSON.parse(decoded.subarray(4, 4 + length).toString('utf8'));
  assert.deepEqual(body.message, expectedMessage());
  assert.equal(verify(body.message, body.signature, SENDER.authPublicKey), true);
  assert.equal(decoded.subarray(4 + length).every((byte) => byte === 0), true);
  key.fill(0); decoded.fill(0);
});

test('fixed slot hides instruction length within bounds and every seal uses fresh randomness', () => {
  const short = sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC);
  const long = sealLeg({ ...INSTRUCTION, recipient: 'r'.repeat(2000) }, BINDING, RSA_PUBLIC);
  const again = sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC);
  assert.equal(short.length, long.length); assert.equal(short.length, again.length);
  assert.notEqual(short, again); // No deterministic nonce or encryption fixture expectation.
  assert.equal(openLeg(long, options()).recipient.length, 2000);
  assert.throws(() => sealLeg({ ...INSTRUCTION, recipient: 'r'.repeat(4000) }, BINDING, RSA_PUBLIC), { code: 'ENVELOPE_SLOT_EXCEEDED' });
});

test('fresh binding has separate random tokens and a new per-leg signing key', () => {
  const a = newLegBinding(); const b = newLegBinding();
  assert.equal(new Set([a.context, a.dispatchToken, a.returnCapability, b.context, b.dispatchToken, b.returnCapability]).size, 6);
  assert.notEqual(a.authPublicKey, b.authPublicKey);
  const executor = newExecutorIdentity();
  assert.match(executor.kid, /^[0-9a-f]{64}$/);
  const opened = openLeg(sealLeg(INSTRUCTION, a, executor.publicKey), options({
    executorPrivateKey: executor.privateKey, expectedContext: a.context, expectedAuthPublicKey: a.authPublicKey,
  }));
  assert.equal(opened.context, a.context);
});

test('each wire segment is authenticated or rejected before decryption', () => {
  const compact = sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC);
  for (let index = 0; index < 5; index++) {
    const segments = compact.split('.');
    const bytes = Buffer.from(segments[index], 'base64url'); bytes[Math.floor(bytes.length / 2)] ^= 1;
    segments[index] = bytes.toString('base64url'); reject(segments.join('.'));
  }
  reject(rawSeal({ aadSuffix: 'wrong-associated-data' }));
});

test('algorithms, routing key, unknown key URLs, compression and duplicate headers are rejected', () => {
  for (const patch of [{ alg: 'RSA1_5' }, { alg: 'RSA-OAEP' }, { enc: 'A128GCM' }, { kid: 'aa'.repeat(32) },
    { zip: 'DEF' }, { jku: 'https://untrusted.invalid/key' }, { jwk: {} }, { typ: 'other-leg+jwe' }]) {
    reject(rawSeal({ protectedHeader: { ...HEADER, ...patch } }));
  }
  const duplicate = canonical(HEADER).replace('{', '{"alg":"RSA-OAEP-256",');
  reject(rawSeal({ headerText: duplicate }));
  reject(rawSeal({ headerText: JSON.stringify(HEADER) })); // Noncanonical order.
  reject(rawSeal({ oaepHash: 'sha1' }));
  reject(rawSeal({ wrappedCek: Buffer.alloc(16) }));
});

test('wrong executor, expected context, expected signer and expiry have generic failure', () => {
  const compact = sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC);
  reject(compact, options({ executorPrivateKey: WRONG_RSA_PRIVATE }));
  reject(compact, options({ expectedContext: 'ff'.repeat(32) }));
  reject(compact, options({ expectedAuthPublicKey: ATTACKER.authPublicKey }));
  reject(compact, options({ now: INSTRUCTION.expiresAt }));
  reject(compact, options({ now: -1 }));
  reject(compact, options({ executorPrivateKey: 'x'.repeat(8193) }));
  reject(compact, options({ expectedAuthPublicKey: 'x'.repeat(4097) }));
  reject(compact, options({ expectedAuthPublicKey: SENDER.authPrivateKey }));
});

test('encryption alone does not authenticate sender; attacker-controlled signing key fails pinned binding', () => {
  const forged = sealLeg(INSTRUCTION, { ...BINDING, ...ATTACKER }, RSA_PUBLIC);
  reject(forged);
  reject(rawSeal({ plaintext: frame({ ...signedBody(), signature: '00'.repeat(64) }) }));
  reject(rawSeal({ plaintext: frame({ ...signedBody(), authPublicKey: ATTACKER.authPublicKey }) }));
});

test('authenticated but malformed frames and noncanonical plaintext are rejected', () => {
  const nonzeroPadding = frame(signedBody()); nonzeroPadding[4095] = 1;
  const tooLong = frame(signedBody()); tooLong.writeUInt32BE(4093);
  const zeroLength = frame(signedBody()); zeroLength.writeUInt32BE(0);
  const malformedUtf8 = Buffer.alloc(4096); malformedUtf8.writeUInt32BE(1); malformedUtf8[4] = 0xff;
  const duplicate = canonical(signedBody()).replace('{', '{"signature":"' + '00'.repeat(64) + '",');
  for (const plaintext of [nonzeroPadding, tooLong, zeroLength, malformedUtf8, frame('{'),
    frame(JSON.stringify(signedBody())), frame(duplicate)]) reject(rawSeal({ plaintext }));
});

test('authenticated plaintext cannot add full-graph or owner fields or switch chain/domain', () => {
  for (const patch of [{ graphHash: 'aa'.repeat(32) }, { ownerPublicKey: SENDER.authPublicKey },
    { siblingLegs: [] }, { commitment: 'bb'.repeat(32) }, { domain: 'other-domain' }, { version: 2 },
    { recipientKid: 'aa'.repeat(32) }, { chain: 'solana' }, { amount: '01' }, { amount: '0' },
    { maxFee: '-1' }, { amount: (1n << 128n).toString() }, { returnCapability: 'bad' }]) {
    reject(rawSeal({ plaintext: frame(signedBody({ ...expectedMessage(), ...patch })) }));
  }
});

test('strict seal input shape, bounds and key types reject before producing an envelope', () => {
  for (const patch of [{ graphHash: 'a' }, { amount: 777 }, { amount: '01' }, { chain: 'base' },
    { recipient: 'x'.repeat(4097) }, { recipient: 'address with spaces' }, { expiresAt: NaN }]) {
    assert.throws(() => sealLeg({ ...INSTRUCTION, ...patch }, BINDING, RSA_PUBLIC));
  }
  assert.throws(() => sealLeg(INSTRUCTION, { ...BINDING, graphHash: 'a' }, RSA_PUBLIC));
  assert.throws(() => sealLeg(INSTRUCTION, { ...BINDING, authPublicKey: ATTACKER.authPublicKey }, RSA_PUBLIC));
  assert.throws(() => sealLeg(INSTRUCTION, BINDING, RSA_PRIVATE));
  assert.throws(() => sealLeg(INSTRUCTION, BINDING, SENDER.authPublicKey));
  assert.throws(() => sealLeg(INSTRUCTION, BINDING, 'x'.repeat(4097)));
  let reads = 0;
  const malicious = { ...INSTRUCTION };
  Object.defineProperty(malicious, 'amount', { enumerable: true, get() { reads++; return '1'; } });
  assert.throws(() => sealLeg(malicious, BINDING, RSA_PUBLIC)); assert.equal(reads, 0);
});

test('bad segment counts, noncanonical base64, truncation, lengths and oversized input reject', () => {
  const compact = sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC);
  for (const bad of ['', compact + '.extra', compact.slice(1), compact.repeat(2), compact.replace('.', '='),
    compact.split('.').map((part) => part + '=').join('.')]) reject(bad);
  for (const index of [1, 2, 3, 4]) {
    const segments = compact.split('.'); segments[index] = segments[index].slice(1); reject(segments.join('.'));
  }
  const segments = compact.split('.');
  // A noncanonical base64url spelling with identical decoded last tag bits.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = segments[4].at(-1);
  segments[4] = segments[4].slice(0, -1) + alphabet[alphabet.indexOf(last) + 1];
  reject(segments.join('.'));
  assert.throws(() => inspectPublicEnvelope(compact.repeat(2)), { code: 'ENVELOPE_REJECTED' });
});

test('replay is context-scoped across re-encryption and invalid messages consume nothing', () => {
  const replayGuard = new ReplayGuard();
  const opts = options({ replayGuard });
  reject(sealLeg(INSTRUCTION, { ...BINDING, ...ATTACKER }, RSA_PUBLIC), opts);
  openLeg(sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC), opts);
  assert.equal(replayGuard.size, 1);
  assert.throws(() => openLeg(sealLeg({ ...INSTRUCTION, amount: '888' }, BINDING, RSA_PUBLIC), opts), { code: 'REPLAY_DETECTED' });
  assert.equal(replayGuard.size, 1);
});

test('bounded guard never evicts, while a new process guard has no restart protection', () => {
  const replayGuard = new ReplayGuard({ maxEntries: 1 });
  const first = sealLeg(INSTRUCTION, BINDING, RSA_PUBLIC);
  openLeg(first, options({ replayGuard }));
  const second = { ...BINDING, context: '44'.repeat(32) };
  assert.throws(() => openLeg(sealLeg(INSTRUCTION, second, RSA_PUBLIC), options({
    replayGuard, expectedContext: second.context,
  })), { code: 'REPLAY_CAPACITY' });
  assert.throws(() => openLeg(first, options({ replayGuard })), { code: 'REPLAY_DETECTED' });
  assert.equal(replayGuard.size, 1);
  assert.deepEqual(openLeg(first, options({ replayGuard: new ReplayGuard() })), expectedMessage());
  for (const maximum of [0, 4097, 1.5]) assert.throws(() => new ReplayGuard({ maxEntries: maximum }));
});

test('actual role-view demo exposes routing and shared-operator correlation without publishing secrets', () => {
  const evidence = buildPrivateEnvelopeEvidence();
  assert.equal(evidence.mode, 'LOCAL_CRYPTO_ONLY_SYNTHETIC_INSTRUCTIONS');
  assert.equal(evidence.checks.sealedAndOpenedEnvelopes, 5);
  assert.deepEqual(evidence.checks.observedWireLengths, [6068]);
  assert.equal(evidence.checks.uniqueLegContexts, 5);
  assert.equal(evidence.checks.uniqueAuthPublicKeys, 5);
  assert.deepEqual(evidence.checks.consumedBindingsPerExecutor, [3, 2]);
  const { individualExecutors, publicEnvelopeObserver, sharedOperator } = evidence.roleViews;
  assert.deepEqual(individualExecutors.map((view) => view.receivedCount), [3, 2]);
  assert.equal(sharedOperator.union.length, 5);
  assert.equal(publicEnvelopeObserver.observations.length, 5);
  assert.equal(sharedOperator.equalityCandidate.sameAsset, true);
  assert.equal(sharedOperator.equalityCandidate.sameAmount, true);
  assert.equal(sharedOperator.equalityCandidate.distinctContexts, true);
  assert.equal(sharedOperator.equalityCandidate.distinctAuthenticationKeys, true);
  assert.equal(sharedOperator.equalityCandidate.distinctRoutingRecipients, true);
  assert.equal(sharedOperator.equalityCandidate.equalWireLengths, true);
  assert.ok(sharedOperator.equalityCandidate.actualLocalDeliveryGapMs >= 0);
  for (const item of sharedOperator.union) {
    assert.match(item.message.returnCapability, /^\[REDACTED:/);
    for (const field of ['graphHash', 'graphId', 'ownerPublicKey', 'globalCommitment', 'siblingLegs']) {
      assert.equal(Object.hasOwn(item.message, field), false);
    }
  }
  assert.equal(JSON.stringify(evidence).includes('PRIVATE KEY'), false);
});
