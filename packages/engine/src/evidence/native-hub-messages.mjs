/**
 * Exact CURRENT PrivateNativeReceiptHub H4 quorum messages. These are pure
 * host codecs/preflights, not authenticated chain reads or EVM acceptance.
 * Hashes/addresses are fixed-width lower-case 0x hex; integers are canonical
 * decimal strings. Messages are flat and accept no extra fields.
 *
 * Sign the original frame with SHA256/ECDSA once, or sign its SHA256 digest
 * directly with a raw-digest signer. Never add an Ethereum message prefix or
 * pass the digest to an API that hashes it again. No private keys are accepted.
 */
import {
  createNativeQuorumHostVerifier, nativeQuorumMessageDigest,
  normalizeNativeQuorumRegistry,
} from './native-quorum.mjs';

export const NATIVE_HUB_MESSAGE_TAG = Object.freeze({
  checkpoint: 'LIANUM/PAEG/checkpoint-authorize/2',
  revocation: 'LIANUM/PAEG/revoke-receipt/2',
  health: 'LIANUM/PAEG/finality-health/2',
});
export const MAX_FINALITY_HEALTH_SECONDS = '30';
const MAX_U64 = (1n << 64n) - 1n;
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const ZERO = `0x${'00'.repeat(32)}`;
const ZERO_ADDRESS = `0x${'00'.repeat(20)}`;
const DOMAIN = [['hubDomain', 32], ['registryCommitment', 32]];
// [field, byte width, optional integer maximum]
const CHECKPOINT = [...DOMAIN, ['pool', 20], ['expectedPoolSequence', 8, MAX_U64],
  ['expectedHubStateSequence', 8, MAX_U64], ['requestId', 32], ['validUntil', 8, MAX_U64]];
const REVOCATION = [...DOMAIN, ['gid', 32], ['expectedSequence', 8, MAX_U64],
  ['reasonCommitment', 32], ['authorizationExpiry', 8, MAX_U64]];
const EVIDENCE = [...DOMAIN, ['receiptRoot', 32], ['receiptCount', 4, 64n],
  ['revokedDigest', 32], ['revokedCount', 4, 64n], ['revocationSequence', 8, MAX_U64]];
const HEALTH = [...EVIDENCE, ['validFrom', 8, MAX_U64], ['validUntil', 8, MAX_U64]];
export const NATIVE_HUB_MESSAGE_FIELDS = Object.freeze({
  checkpoint: Object.freeze(CHECKPOINT.map(([name]) => name)),
  revocation: Object.freeze(REVOCATION.map(([name]) => name)),
  health: Object.freeze(HEALTH.map(([name]) => name)),
});
const need = (condition, code) => { if (!condition) throw new Error(code); };

function exact(value, fields, label) {
  const code = `NATIVE_HUB_${label}_FIELDS`;
  need(value !== null && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && fields.every(field => keys.includes(field)), code);
  need(fields.every(field => Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), 'value')), code);
}

function hex(value, width) {
  need(typeof value === 'string' && value.length === 2 + width * 2
    && /^0x[0-9a-f]+$/.test(value), 'NATIVE_HUB_HEX');
  return Buffer.from(value.slice(2), 'hex');
}

function uint(value, maximum) {
  need(typeof value === 'string' && value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value),
    'NATIVE_HUB_UINT');
  const result = BigInt(value);
  need(result <= maximum, 'NATIVE_HUB_UINT_RANGE');
  return result;
}

function components(input, spec, label) {
  exact(input, spec.map(([name]) => name), label);
  return spec.map(([name, width, maximum]) => maximum === undefined
    ? hex(input[name], width)
    : Buffer.from(uint(input[name], maximum).toString(16).padStart(width * 2, '0'), 'hex'));
}

function frame(tag, values) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), ...values].flatMap(value => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    return [length, value];
  }));
}

/** Encoding alone permits zero identifiers and expired/invalid intervals. */
export function checkpointAuthorizationFrame(message) {
  return frame(NATIVE_HUB_MESSAGE_TAG.checkpoint, components(message, CHECKPOINT, 'CHECKPOINT'));
}
export function checkpointAuthorizationDigest(message) {
  return `0x${nativeQuorumMessageDigest(checkpointAuthorizationFrame(message))}`;
}
export function revocationFrame(message) {
  return frame(NATIVE_HUB_MESSAGE_TAG.revocation, components(message, REVOCATION, 'REVOCATION'));
}
/** Matches the Solidity revocationMessage getter (one SHA256 of the frame). */
export function revocationMessage(message) {
  return `0x${nativeQuorumMessageDigest(revocationFrame(message))}`;
}
export function finalityHealthFrame(message) {
  return frame(NATIVE_HUB_MESSAGE_TAG.health, components(message, HEALTH, 'HEALTH'));
}
export function finalityHealthDigest(message) {
  return `0x${nativeQuorumMessageDigest(finalityHealthFrame(message))}`;
}

function sameDomain(message, current) {
  need(message.hubDomain === current.hubDomain, 'NATIVE_HUB_DOMAIN_CHANGED');
  need(message.registryCommitment === current.registryCommitment, 'NATIVE_HUB_REGISTRY_CHANGED');
}

/**
 * First-use preflight only. The caller must authenticate a same-block read of
 * the pinned pool/hub and separately check signatures/code. This cannot record
 * a checkpoint, authenticate a snapshot, or authorize native dispatch.
 * Use checkpointAuthorizationReplay first for an already accepted request.
 * Halt is intentionally not a condition: the hub can record halted snapshots.
 */
export function assertCheckpointAuthorizationValid(message, current) {
  checkpointAuthorizationFrame(message);
  components(current, [...DOMAIN, ['pool', 20], ['poolStateSequence', 8, MAX_U64],
    ['hubStateSequence', 8, MAX_U64], ['checkpointCount', 4, 64n], ['timestamp', 8, MAX_U64]],
  'CHECKPOINT_CURRENT');
  sameDomain(message, current);
  need(message.requestId !== ZERO, 'CHECKPOINT_ZERO_REQUEST');
  need(BigInt(current.timestamp) < BigInt(message.validUntil), 'CHECKPOINT_AUTHORIZATION_EXPIRED');
  need(BigInt(current.checkpointCount) < 64n, 'CHECKPOINT_TREE_FULL');
  need(message.pool !== ZERO_ADDRESS && message.pool === current.pool, 'CHECKPOINT_POOL_CHANGED');
  need(message.expectedPoolSequence === current.poolStateSequence, 'CHECKPOINT_POOL_SEQUENCE_CHANGED');
  need(message.expectedHubStateSequence === current.hubStateSequence, 'CHECKPOINT_HUB_SEQUENCE_CHANGED');
  return true;
}

/**
 * prior is the authenticated checkpointRequests(message.requestId) tuple,
 * with its bool represented as "0"/"1". A null RETURN means first use. An accepted
 * exact binding returns its ORIGINAL result despite expiry/state/code changes;
 * it says nothing about checkpoint currentness or permission to send.
 */
export function checkpointAuthorizationReplay(message, prior) {
  const binding = checkpointAuthorizationDigest(message);
  components(prior, [['accepted', 1, 1n], ['binding', 32], ['digest', 32],
    ['root', 32], ['index', 4, 63n]], 'CHECKPOINT_PRIOR');
  need(message.requestId !== ZERO, 'CHECKPOINT_ZERO_REQUEST');
  if (prior.accepted === '0') return null;
  need(prior.binding === binding, 'CHECKPOINT_REQUEST_REBOUND');
  return Object.freeze({ digest: prior.digest, root: prior.root, index: prior.index });
}

/**
 * Authorization for a NEW revocation; no halt restriction or 30-second limit.
 * Solidity first rejects zero GID, then returns false for an already revoked
 * GID without checking a new reason, sequence, expiry, or quorum. This helper
 * does not model that no-op, mutate a vector, or implement overflow storage.
 */
export function assertRevocationAuthorizationValid(message, current) {
  revocationFrame(message);
  components(current, [...DOMAIN, ['revocationSequence', 8, MAX_U64], ['timestamp', 8, MAX_U64]],
    'REVOCATION_CURRENT');
  sameDomain(message, current);
  need(message.gid !== ZERO, 'REVOKE_ZERO_GID');
  need(message.expectedSequence === current.revocationSequence, 'REVOCATION_SEQUENCE_CHANGED');
  need(message.reasonCommitment !== ZERO, 'REVOKE_ZERO_REASON');
  need(BigInt(current.timestamp) < BigInt(message.authorizationExpiry), 'REVOCATION_AUTHORIZATION_EXPIRED');
  return true;
}

/**
 * Fresh GLOBAL health preflight. current must be the authenticated current
 * global evidence state plus halt/timestamp, never selected receipts/routes.
 * Benign receipt appends change this message; spent tags alone do not.
 * Signature verification is separate and no observed-state trust is implied.
 */
export function assertFinalityHealthValid(message, current) {
  finalityHealthFrame(message);
  components(current, [...EVIDENCE, ['halt', 1, 1n], ['timestamp', 8, MAX_U64]], 'HEALTH_CURRENT');
  sameDomain(message, current);
  need(current.halt === '0', 'NATIVE_HALTED');
  const from = BigInt(message.validFrom), until = BigInt(message.validUntil), now = BigInt(current.timestamp);
  need(from < until, 'INVALID_WINDOW');
  need(from <= now && now < until, 'OUTSIDE_WINDOW');
  need(until - from <= BigInt(MAX_FINALITY_HEALTH_SECONDS), 'FINALITY_HEALTH_WINDOW_TOO_LONG');
  for (const [field] of EVIDENCE) {
    need(message[field] === current[field], 'FINALITY_HEALTH_STATE_CHANGED');
  }
  return true;
}

function signatureParts(r, s) {
  hex(r, 32); hex(s, 32);
  need(BigInt(r) > 0n && BigInt(r) < ORDER, 'SIGNATURE_R');
  need(BigInt(s) > 0n && BigInt(s) <= ORDER / 2n, 'SIGNATURE_LOW_S');
}

function signatureIdentity(signerIndex, v) {
  uint(signerIndex, 3n);
  need(v === '27' || v === '28', 'SIGNATURE_V');
}

/**
 * Syntactic conversion to the existing host utility's P1363 representation.
 * v is checked but discarded: Node verify does NOT check EVM recovery parity.
 * Never treat a successful host check as acceptance of this ABI signature.
 */
export function nativeHubSignatureToHost(signature) {
  exact(signature, ['signerIndex', 'v', 'r', 's'], 'ABI_SIGNATURE');
  signatureIdentity(signature.signerIndex, signature.v);
  signatureParts(signature.r, signature.s);
  return Object.freeze({ index: Number(signature.signerIndex), signature: signature.r.slice(2) + signature.s.slice(2) });
}

/**
 * The EXTERNAL signer must supply the correct recovery v for its low-S value.
 * This adapter neither guesses v nor normalizes high-S (which also flips v).
 * It validates encoding only; actual recovery remains an EVM/integration check.
 */
export function nativeHubSignatureToAbi(input) {
  exact(input, ['signerIndex', 'v', 'signature'], 'HOST_SIGNATURE');
  signatureIdentity(input.signerIndex, input.v);
  need(typeof input.signature === 'string' && input.signature.length === 128 && /^[0-9a-f]{128}$/.test(input.signature),
    'NATIVE_HUB_SIGNATURE_ENCODING');
  const r = `0x${input.signature.slice(0, 64)}`, s = `0x${input.signature.slice(64)}`;
  signatureParts(r, s);
  return Object.freeze({ signerIndex: input.signerIndex, v: input.v, r, s });
}

/**
 * P1363/SHA256 host conformance against a captured, trusted registry. All
 * methods take EXACTLY {message, indexes, signatures}; indexes/signatures use
 * native-quorum.mjs's numeric-index/unprefixed-P1363 host format. Domain and
 * registry are pinned here, with no request-time key/profile/digest override.
 * These methods check signatures only, not freshness/state or EVM recovery v.
 */
export function createNativeHubMessageHostVerifier(configuration) {
  exact(configuration, ['registry', 'expectedRegistryCommitment'], 'CONFIGURATION');
  const registry = normalizeNativeQuorumRegistry(configuration.registry);
  const quorum = createNativeQuorumHostVerifier({ registry,
    expectedRegistryCommitment: configuration.expectedRegistryCommitment });
  function check(input, encode) {
    exact(input, ['message', 'indexes', 'signatures'], 'QUORUM_REQUEST');
    const messageBytes = encode(input.message);
    sameDomain(input.message, { hubDomain: `0x${registry.hubDomain}`,
      registryCommitment: `0x${quorum.registryCommitment}` });
    return quorum.assertQuorumForMessage({ messageBytes, indexes: input.indexes, signatures: input.signatures });
  }
  return Object.freeze({
    assurance: 'host-conformance-only',
    profile: quorum.profile,
    hubDomain: `0x${registry.hubDomain}`,
    registryCommitment: `0x${quorum.registryCommitment}`,
    assertCheckpointAuthorizationQuorum: input => check(input, checkpointAuthorizationFrame),
    assertRevocationQuorum: input => check(input, revocationFrame),
    assertFinalityHealthQuorum: input => check(input, finalityHealthFrame),
  });
}
