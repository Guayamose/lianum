/**
 * Codec and host conformance checks for the separate secp256k1 V2 profile.
 * Circuit enforcement lives in generic-native/lib/src/quorum.nr. A successful
 * host check is not a proof, an onchain authorization, or native consensus.
 * The caller must compute the canonical Admission statement bytes separately.
 * This module accepts public keys/signatures only, never signing keys.
 */
import { createHash, createPublicKey, ECDH, verify } from 'node:crypto';

export const NATIVE_QUORUM_PROFILE = 'LIANUM_NATIVE_QUORUM_3_OF_4_SECP256K1_V2';
export const NATIVE_QUORUM_REGISTRY_TAG = 'LIANUM/native-registry/secp256k1/2';
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_ORDER = ORDER / 2n;
const MAX_U64 = (1n << 64n) - 1n;
const need = (condition, code) => { if (!condition) throw new Error(code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = hex => Buffer.from(hex, 'hex');

function exact(value, fields, code) {
  need(value !== null && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && fields.every(field => keys.includes(field)), code);
  need(fields.every(field => Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), 'value')), code);
}

function array(value, length, code) {
  need(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length === length, code);
  need(Reflect.ownKeys(value).length === length + 1, code);
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    need(descriptor && Object.hasOwn(descriptor, 'value'), code);
  }
}

function hex(value, length, code) {
  need(typeof value === 'string' && value.length === length * 2 && /^[0-9a-f]+$/.test(value), code);
  return value;
}

function epoch(value) {
  need(typeof value === 'string' && value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value)
    && BigInt(value) <= MAX_U64, 'NATIVE_QUORUM_REGISTRY_EPOCH');
  return value;
}

function publicKey(key) {
  return createPublicKey({ format: 'jwk', key: {
    kty: 'EC', crv: 'secp256k1', x: bytes(key.x).toString('base64url'), y: bytes(key.y).toString('base64url'),
  } });
}

/** Registry position IS signer identity; never sort or deduplicate this array. */
export function normalizeNativeQuorumRegistry(input) {
  exact(input, ['profile', 'hubDomain', 'registryEpoch', 'rulesRoot', 'keys'], 'NATIVE_QUORUM_REGISTRY_FIELDS');
  need(input.profile === NATIVE_QUORUM_PROFILE, 'NATIVE_QUORUM_PROFILE');
  const hubDomain = hex(input.hubDomain, 32, 'NATIVE_QUORUM_HUB_DOMAIN');
  const registryEpoch = epoch(input.registryEpoch);
  const rulesRoot = hex(input.rulesRoot, 32, 'NATIVE_QUORUM_RULES_ROOT');
  array(input.keys, 4, 'NATIVE_QUORUM_REGISTRY_REQUIRES_FOUR');
  const seenX = new Set();
  const keys = input.keys.map(key => {
    exact(key, ['x', 'y'], 'NATIVE_QUORUM_PUBLIC_KEY_FIELDS');
    const x = hex(key.x, 32, 'NATIVE_QUORUM_PUBLIC_KEY_X');
    const y = hex(key.y, 32, 'NATIVE_QUORUM_PUBLIC_KEY_Y');
    // OpenSSL rejects points outside the curve, noncanonical coordinates and
    // infinity. Sharing x also forbids P and -P from counting as two members.
    try { ECDH.convertKey(Buffer.concat([Buffer.from([4]), bytes(x), bytes(y)]), 'secp256k1'); }
    catch { throw new Error('NATIVE_QUORUM_PUBLIC_KEY_NOT_ON_CURVE'); }
    need(!seenX.has(x), 'NATIVE_QUORUM_DUPLICATE_KEY_X');
    seenX.add(x);
    return Object.freeze({ x, y });
  });
  return Object.freeze({ profile: NATIVE_QUORUM_PROFILE, hubDomain, registryEpoch, rulesRoot,
    keys: Object.freeze(keys) });
}

/** H4: u32BE byte length on EVERY component, including the ASCII domain tag. */
export function encodeNativeQuorumRegistry(input) {
  const r = normalizeNativeQuorumRegistry(input);
  const registryEpoch = Buffer.alloc(8);
  registryEpoch.writeBigUInt64BE(BigInt(r.registryEpoch));
  return Buffer.concat([
    Buffer.from(NATIVE_QUORUM_REGISTRY_TAG, 'ascii'), Buffer.from(r.profile, 'ascii'),
    bytes(r.hubDomain), registryEpoch, bytes(r.rulesRoot),
    ...r.keys.flatMap(key => [bytes(key.x), bytes(key.y)]),
  ].flatMap(value => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    return [length, value];
  }));
}

export const nativeQuorumRegistryCommitment = registry => hash(encodeNativeQuorumRegistry(registry));

/**
 * Give these original canonical statement bytes to an EXTERNAL signer using
 * SHA256/ECDSA with IEEE P1363 encoding and low-S normalization. This helper
 * only snapshots bytes; it takes no private key and does not sign anything.
 * Do not pass the digest to Node's sign/verify('sha256'): that hashes twice.
 */
export function nativeQuorumMessageBytes(messageBytes) {
  need(Buffer.isBuffer(messageBytes) || (messageBytes instanceof Uint8Array
    && Object.getPrototypeOf(messageBytes) === Uint8Array.prototype), 'NATIVE_QUORUM_MESSAGE_BYTES');
  return Buffer.from(messageBytes);
}

/** The single SHA256 digest supplied to Noir's verify_signature black box. */
export const nativeQuorumMessageDigest = messageBytes => hash(nativeQuorumMessageBytes(messageBytes));

function signatureBytes(signature) {
  hex(signature, 64, 'NATIVE_QUORUM_SIGNATURE_ENCODING');
  const r = BigInt('0x' + signature.slice(0, 64));
  const s = BigInt('0x' + signature.slice(64));
  need(r > 0n && r < ORDER && s > 0n && s < ORDER, 'NATIVE_QUORUM_SIGNATURE_RANGE');
  need(s <= HALF_ORDER, 'NATIVE_QUORUM_SIGNATURE_HIGH_S');
  return bytes(signature);
}

/**
 * Construct ONLY from trusted deployment configuration. Whoever selects the
 * expected commitment selects the attesters; this module cannot establish
 * that trust or administrative independence. No verification-time registry,
 * threshold, key, profile, digest override, or preverified flag is accepted.
 */
export function createNativeQuorumHostVerifier(configuration) {
  exact(configuration, ['registry', 'expectedRegistryCommitment'], 'NATIVE_QUORUM_CONFIGURATION_FIELDS');
  const registry = normalizeNativeQuorumRegistry(configuration.registry);
  const expectedRegistryCommitment = hex(configuration.expectedRegistryCommitment, 32,
    'NATIVE_QUORUM_REGISTRY_COMMITMENT');
  need(nativeQuorumRegistryCommitment(registry) === expectedRegistryCommitment, 'NATIVE_QUORUM_REGISTRY_NOT_PINNED');
  const keys = registry.keys.map(publicKey);
  return Object.freeze({
    assurance: 'host-conformance-only',
    profile: NATIVE_QUORUM_PROFILE,
    registryCommitment: expectedRegistryCommitment,
    /** Throws on any malformed/invalid witness; true is ONLY host conformance. */
    assertQuorumForMessage(input) {
      exact(input, ['messageBytes', 'indexes', 'signatures'], 'NATIVE_QUORUM_REQUEST_FIELDS');
      const message = nativeQuorumMessageBytes(input.messageBytes);
      array(input.indexes, 3, 'NATIVE_QUORUM_EXACTLY_THREE_INDEXES');
      array(input.signatures, 3, 'NATIVE_QUORUM_EXACTLY_THREE_SIGNATURES');
      for (let i = 0; i < 3; i++) {
        const index = input.indexes[i];
        need(Number.isInteger(index) && !Object.is(index, -0) && index >= 0 && index < 4,
          'NATIVE_QUORUM_INDEX_RANGE');
        need(i === 0 || input.indexes[i - 1] < index, 'NATIVE_QUORUM_INDEX_ORDER');
        const signature = signatureBytes(input.signatures[i]);
        need(verify('sha256', message, { key: keys[index], dsaEncoding: 'ieee-p1363' }, signature),
          'NATIVE_QUORUM_SIGNATURE_INVALID');
      }
      return true;
    },
  });
}
