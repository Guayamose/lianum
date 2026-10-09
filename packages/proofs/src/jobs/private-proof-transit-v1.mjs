/** Recipient encryption for the original one-job IPC processes. This hides
 * witnesses on the two IPC wires, not from the API or the recipient's host.
 * The transport binding grants no proof, account or signing authority. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { generateKeyPairSync, createPublicKey, diffieHellman, hkdfSync,
  createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

export const PRIVATE_PROOF_TRANSIT_V1 = 'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1';
const MAX_CLEAR = 2 * 1024 * 1024, MAX_CIPHER = 4 * Math.ceil(MAX_CLEAR / 3);
const recipients = new WeakMap();
let intakeUsed = false;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function exact(value, names) {
  assert.ok(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'PRIVATE_PROOF_DATA_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort(), 'PRIVATE_PROOF_EXACT_FIELDS');
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(value, name);
    assert.ok(d && Object.hasOwn(d, 'value') && d.enumerable, 'PRIVATE_PROOF_DATA_FIELDS');
  }
}
function cloneData(value) {
  let nodes = 0, characters = 0;
  function visit(item, depth) {
    assert.ok(++nodes <= 300000 && depth <= 32, 'PRIVATE_PROOF_INPUT_BOUND');
    if (typeof item === 'string') {
      characters += item.length;
      assert.ok(characters <= MAX_CLEAR, 'PRIVATE_PROOF_INPUT_BOUND');
      return item;
    }
    if (item === null || typeof item === 'boolean'
      || (Number.isSafeInteger(item) && item >= 0 && !Object.is(item, -0))) return item;
    assert.ok(item && typeof item === 'object' && !types.isProxy(item), 'PRIVATE_PROOF_INPUT_DATA');
    if (Array.isArray(item)) {
      assert.equal(Object.getPrototypeOf(item), Array.prototype, 'PRIVATE_PROOF_INPUT_ARRAY');
      assert.ok(item.length <= 300000, 'PRIVATE_PROOF_INPUT_BOUND');
      assert.equal(Reflect.ownKeys(item).length, item.length + 1, 'PRIVATE_PROOF_INPUT_DENSE');
      return Array.from({ length: item.length }, (_, i) => {
        const d = Object.getOwnPropertyDescriptor(item, String(i));
        assert.ok(d && Object.hasOwn(d, 'value'), 'PRIVATE_PROOF_INPUT_DATA');
        return visit(d.value, depth + 1);
      });
    }
    assert.equal(Object.getPrototypeOf(item), Object.prototype, 'PRIVATE_PROOF_INPUT_DATA');
    return Object.fromEntries(Reflect.ownKeys(item).map(name => {
      assert.ok(typeof name === 'string', 'PRIVATE_PROOF_INPUT_DATA');
      characters += name.length; assert.ok(characters <= MAX_CLEAR, 'PRIVATE_PROOF_INPUT_BOUND');
      const d = Object.getOwnPropertyDescriptor(item, name);
      assert.ok(d && Object.hasOwn(d, 'value') && d.enumerable, 'PRIVATE_PROOF_INPUT_DATA');
      return [name, visit(d.value, depth + 1)];
    }));
  }
  return visit(value, 0);
}
function scope(value) {
  exact(value, ['relation', 'role', 'jobId']);
  assert.ok(typeof value.relation === 'string' && /^[a-z_]{1,64}$/.test(value.relation), 'PRIVATE_PROOF_RELATION');
  assert.ok(typeof value.role === 'string' && /^[a-z_]{1,32}$/.test(value.role), 'PRIVATE_PROOF_ROLE');
  assert.ok(typeof value.jobId === 'string' && /^[a-z0-9-]{8,100}$/.test(value.jobId), 'PRIVATE_PROOF_JOB');
  return { relation: value.relation, role: value.role, jobId: value.jobId };
}
export function privateProofAuthorizationBindingV1(value) {
  assert.equal(arguments.length, 1, 'PRIVATE_PROOF_ARITY');
  exact(value, ['kind', 'jobId', 'consentSHA256', 'witnessSHA256']);
  assert.ok(['SCOPED_JOB_V1', 'ORIGINAL_CONSENT_V1'].includes(value.kind), 'PRIVATE_PROOF_BINDING_KIND');
  assert.ok(typeof value.jobId === 'string' && /^[a-z0-9-]{8,100}$/.test(value.jobId), 'PRIVATE_PROOF_BINDING_JOB');
  assert.ok(hex(value.consentSHA256) && hex(value.witnessSHA256), 'PRIVATE_PROOF_BINDING_HASH');
  return Object.freeze({ kind: value.kind, jobId: value.jobId,
    consentSHA256: value.consentSHA256, witnessSHA256: value.witnessSHA256 });
}
export function privateProofBindingSHA256V1(value) {
  return digest(Buffer.from(JSON.stringify(privateProofAuthorizationBindingV1(value))));
}
function base64(value, maximum, bytes = null) {
  assert.ok(typeof value === 'string' && value.length <= maximum
    && /^[A-Za-z0-9+/]*={0,2}$/.test(value),
  'PRIVATE_PROOF_BASE64');
  const result = Buffer.from(value, 'base64');
  assert.equal(result.toString('base64'), value, 'PRIVATE_PROOF_BASE64');
  if (bytes !== null) assert.equal(result.length, bytes, 'PRIVATE_PROOF_BYTE_LENGTH');
  return result;
}
function publicKey(value) {
  const bytes = base64(value, 60, 44);
  try {
    const key = createPublicKey({ key: bytes, format: 'der', type: 'spki' });
    assert.equal(key.asymmetricKeyType, 'x25519', 'PRIVATE_PROOF_RECIPIENT_KEY');
    return key;
  } finally { bytes.fill(0); }
}
function ready(value) {
  exact(value, ['type', 'profile', 'relation', 'role', 'jobId', 'recipientPublicKey']);
  assert.equal(value.type, 'flat-private-proof-input-ready', 'PRIVATE_PROOF_READY');
  assert.equal(value.profile, PRIVATE_PROOF_TRANSIT_V1, 'PRIVATE_PROOF_PROFILE');
  const s = scope({ relation: value.relation, role: value.role, jobId: value.jobId });
  publicKey(value.recipientPublicKey);
  return { type: value.type, profile: value.profile, ...s, recipientPublicKey: value.recipientPublicKey };
}
export function createPrivateProofRecipientV1(input) {
  assert.equal(arguments.length, 1, 'PRIVATE_PROOF_ARITY');
  const s = scope(input), pair = generateKeyPairSync('x25519');
  const handle = Object.freeze({});
  recipients.set(handle, { scope: s, privateKey: pair.privateKey, used: false,
    ready: Object.freeze({ type: 'flat-private-proof-input-ready', profile: PRIVATE_PROOF_TRANSIT_V1,
      ...s, recipientPublicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }) });
  return handle;
}
export function readPrivateProofRecipientV1(handle) {
  assert.equal(arguments.length, 1, 'PRIVATE_PROOF_ARITY');
  const s = recipients.get(handle); assert.ok(s && !s.used, 'PRIVATE_PROOF_RECIPIENT_REQUIRED');
  return s.ready;
}
export function closePrivateProofRecipientV1(handle) {
  const s = recipients.get(handle); assert.ok(s, 'PRIVATE_PROOF_RECIPIENT_REQUIRED');
  s.used = true; s.privateKey = null;
}
export function sealPrivateProofJobV1(recipient, input) {
  assert.equal(arguments.length, 2, 'PRIVATE_PROOF_ARITY');
  const r = ready(recipient);
  exact(input, ['inputs', 'expectedPublicInputs', 'authorization']);
  const authorization = privateProofAuthorizationBindingV1(input.authorization);
  let body, clear, shared, key, encrypted, pair;
  try {
    body = cloneData({ inputs: input.inputs, expectedPublicInputs: input.expectedPublicInputs });
    const text = JSON.stringify(body);
    assert.ok(Buffer.byteLength(text) <= MAX_CLEAR, 'PRIVATE_PROOF_CLEAR_BOUND');
    clear = Buffer.from(text);
    pair = generateKeyPairSync('x25519');
    const header = { profile: PRIVATE_PROOF_TRANSIT_V1, relation: r.relation, role: r.role, jobId: r.jobId,
      recipientPublicKey: r.recipientPublicKey,
      senderPublicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      authorization, publicInputsSHA256: digest(Buffer.from(JSON.stringify(body.expectedPublicInputs))) };
    const aad = Buffer.from(JSON.stringify(header)), salt = randomBytes(32), iv = randomBytes(12);
    shared = diffieHellman({ privateKey: pair.privateKey, publicKey: publicKey(r.recipientPublicKey) });
    key = Buffer.from(hkdfSync('sha256', shared, salt, aad, 32));
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad); encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
    return { type: 'flat-private-proof-inputs', ...header, salt: salt.toString('base64'),
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') };
  } finally {
    clear?.fill(0); shared?.fill(0); key?.fill(0); encrypted?.fill(0);
    wipePrivateProofInputsV1(body); pair = null;
  }
}
export function openPrivateProofJobV1(handle, message) {
  assert.equal(arguments.length, 2, 'PRIVATE_PROOF_ARITY');
  const s = recipients.get(handle);
  assert.ok(s && !s.used && s.privateKey, 'PRIVATE_PROOF_ONE_HANDOFF');
  s.used = true; // Burn before validation/decryption, including corrupt packets.
  let shared, key, ciphertext, partial, tail, clear, salt, iv, tag, result;
  try {
    exact(message, ['type', 'profile', 'relation', 'role', 'jobId', 'recipientPublicKey', 'senderPublicKey',
      'authorization', 'publicInputsSHA256', 'salt', 'iv', 'tag', 'ciphertext']);
    assert.equal(message.type, 'flat-private-proof-inputs', 'PRIVATE_PROOF_PACKET');
    const authorization = privateProofAuthorizationBindingV1(message.authorization);
    assert.equal(message.profile, PRIVATE_PROOF_TRANSIT_V1, 'PRIVATE_PROOF_PROFILE');
    for (const field of ['relation', 'role', 'jobId']) assert.equal(message[field], s.scope[field], 'PRIVATE_PROOF_SCOPE');
    assert.equal(message.recipientPublicKey, s.ready.recipientPublicKey, 'PRIVATE_PROOF_RECIPIENT');
    assert.ok(hex(message.publicInputsSHA256), 'PRIVATE_PROOF_PUBLIC_HASH');
    const header = { profile: message.profile, ...s.scope, recipientPublicKey: message.recipientPublicKey,
      senderPublicKey: message.senderPublicKey, authorization, publicInputsSHA256: message.publicInputsSHA256 };
    const aad = Buffer.from(JSON.stringify(header));
    salt = base64(message.salt, 44, 32); iv = base64(message.iv, 16, 12); tag = base64(message.tag, 24, 16);
    ciphertext = base64(message.ciphertext, MAX_CIPHER);
    assert.ok(ciphertext.length > 0 && ciphertext.length <= MAX_CLEAR, 'PRIVATE_PROOF_CIPHER_BOUND');
    shared = diffieHellman({ privateKey: s.privateKey, publicKey: publicKey(message.senderPublicKey) });
    key = Buffer.from(hkdfSync('sha256', shared, salt, aad, 32));
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad); decipher.setAuthTag(tag);
    partial = decipher.update(ciphertext); tail = decipher.final();
    clear = Buffer.concat([partial, tail]);
    assert.ok(clear.length <= MAX_CLEAR, 'PRIVATE_PROOF_CLEAR_BOUND');
    result = JSON.parse(clear.toString('utf8'));
    exact(result, ['inputs', 'expectedPublicInputs']);
    assert.equal(digest(Buffer.from(JSON.stringify(result.expectedPublicInputs))), message.publicInputsSHA256,
      'PRIVATE_PROOF_PUBLIC_BINDING');
    // The pinned ABI validator remains the only circuit-input validator.
    const validated = cloneData(result);
    return { ...validated, authorization };
  } catch {
    throw Error('PRIVATE_PROOF_INVALID_ENCRYPTED_JOB');
  } finally {
    s.privateKey = null; shared?.fill(0); key?.fill(0); ciphertext?.fill(0); partial?.fill(0); tail?.fill(0); clear?.fill(0);
    salt?.fill(0); iv?.fill(0); tag?.fill(0); wipePrivateProofInputsV1(result);
  }
}
export function wipePrivateProofInputsV1(value) {
  const stack = [value], seen = new Set();
  while (stack.length && seen.size < 300000) {
    const item = stack.pop();
    if (!item || typeof item !== 'object' || types.isProxy(item) || seen.has(item)) continue;
    seen.add(item);
    if (Buffer.isBuffer(item) || item instanceof Uint8Array) { item.fill(0); continue; }
    for (const [name, d] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (!Object.hasOwn(d, 'value')) continue;
      if (d.value && typeof d.value === 'object') stack.push(d.value);
      if (d.writable && name !== 'length') item[name] = null;
    }
  }
}
export function preparePrivateProofJobV1(input) {
  assert.equal(arguments.length, 1, 'PRIVATE_PROOF_ARITY');
  assert.ok(!intakeUsed && process.connected && typeof process.send === 'function', 'PRIVATE_PROOF_PRIVATE_IPC');
  intakeUsed = true;
  const recipient = createPrivateProofRecipientV1(input);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; process.removeListener('message', receive); process.removeListener('disconnect', disconnect);
      closePrivateProofRecipientV1(recipient);
      if (error) reject(error); else resolve(value);
    };
    const disconnect = () => finish(Error('PRIVATE_PROOF_PARENT_DISCONNECTED'));
    const receive = message => {
      try { finish(null, openPrivateProofJobV1(recipient, message)); }
      catch { finish(Error('PRIVATE_PROOF_INVALID_ENCRYPTED_JOB')); }
    };
    process.once('message', receive); process.once('disconnect', disconnect);
    process.send(readPrivateProofRecipientV1(recipient), error => {
      if (error) finish(Error('PRIVATE_PROOF_READY_SEND_FAILED'));
    });
  });
}
