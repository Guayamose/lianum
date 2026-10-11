/** New domains; protected V2 frames/package exports are untouched. PROVE_D26
 * discloses one opening to the original ephemeral worker. FUND_D26 authorizes
 * one retained send. No root or private signing key can enter this protocol. */
import { normalizeOriginalAccountBindingV2, normalizeOriginalAccountSignatureV2 } from './original-account-review-v2.mjs';
import { normalizeMobileOrigin } from './authorization.mjs';
/** @typedef {import('./device-deposit-consent-v1.mjs').DeviceDepositStatementV1} DeviceDepositStatementV1 */
/** @typedef {import('./device-deposit-consent-v1.mjs').DeviceDepositWitnessV1} DeviceDepositWitnessV1 */
/** @typedef {import('./device-deposit-consent-v1.mjs').DeviceDepositConsentV1} DeviceDepositConsentV1 */
export const DEVICE_DEPOSIT_CONSENT_V1 = 'LIANUM_DEVICE_ORIGINAL_D26_V1';
/** @type {(value: unknown) => asserts value} */
const need = value => { if (!value) throw new Error('MOBILE_DEVICE_DEPOSIT_INVALID'); };
/** @param {unknown} value @param {readonly string[]} names @returns {Record<string, unknown>} */
function exact(value, names) {
  need(typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype);
  const keys = Reflect.ownKeys(value);
  need(keys.length === names.length && keys.every(key => names.some(name => name === key)));
  return Object.fromEntries(names.map(name => { const field = Object.getOwnPropertyDescriptor(value, name);
    need(field?.enumerable && Object.hasOwn(field, 'value')); return [name, field.value]; }));
}
/** @param {unknown} value @param {number} [width] @returns {value is string} */
const hex = (value, width = 64) => typeof value === 'string'
  && new RegExp('^[0-9a-f]{' + width + '}$').exec(value)?.[0] === value;
/** @param {unknown} value @returns {value is string} */
const u64 = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.exec(value)?.[0] === value
  && BigInt(value) < (1n << 64n);
/** @template {string} K @template V @param {Record<string, unknown>} value
 * @param {readonly K[]} names @param {(raw: unknown) => V} read @returns {Record<K, V>} */
function readFields(value, names, read) {
  return /** @type {Record<K, V>} */ (Object.fromEntries(names.map(name => [name, read(value[name])])));
}
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @returns {value is T} */
const oneOf = (value, choices) => choices.some(choice => choice === value);
/** @template T @param {T} value @returns {Readonly<T>} */
function freeze(value) { if (value && typeof value === 'object') {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
/** @param {unknown} raw @returns {DeviceDepositStatementV1} */
export function normalizeDeviceDepositStatementV1(raw) {
  const value = exact(raw, ['scope', 'policy', 'epoch', 'amount', 'output']);
  need(hex(value.scope) && hex(value.policy) && u64(value.epoch) && u64(value.amount)
    && BigInt(value.amount) > 0n && hex(value.output) && value.output !== '0'.repeat(64));
  return freeze(Object.assign(value, {scope: value.scope, policy: value.policy, epoch: value.epoch, amount: value.amount, output: value.output}));
}
/** Exact original Noir D26 ABI; reject extra keys including root/privateKey. */
/** @param {unknown} raw @returns {DeviceDepositWitnessV1} */
export function normalizeDeviceDepositWitnessV1(raw) {
  const value = exact(raw, ['scope', 'policy', 'epoch', 'amount', 'output', 'rho', 'key_x', 'key_y', 'secret', 'signature']);
  /** @param {unknown} input @param {number} count @param {number} limit @returns {number[]} */
  function array(input, count, limit) {
    need(Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype && input.length === count
      && Reflect.ownKeys(input).length === count + 1);
    return Array.from({ length: count }, (_, index) => {
      const row = Object.getOwnPropertyDescriptor(input, String(index));
      need(row?.enumerable && Object.hasOwn(row, 'value') && Number.isSafeInteger(row.value)
        && row.value >= 0 && row.value < limit); return row.value;
    });
  }
  const words = readFields(value, ['scope', 'policy', 'output'], raw => array(raw, 8, 2 ** 32));
  const bytes = readFields(value, ['rho', 'key_x', 'key_y', 'secret'], raw => array(raw, 32, 256));
  const signature = array(value.signature, 64, 256);
  need(u64(value.epoch) && u64(value.amount) && BigInt(value.amount) > 0n);
  normalizeOriginalAccountSignatureV2(signature.map(byte => byte.toString(16).padStart(2, '0')).join(''));
  return Object.assign(value, words, bytes, {epoch: value.epoch, amount: value.amount, signature}); // owned mutable copy for explicit erasure
}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceDepositWitnessBytesV1(raw) {
  const value = normalizeDeviceDepositWitnessV1(raw);
  try { return new TextEncoder().encode(JSON.stringify(value)); }
  finally { for (const item of Object.values(value)) if (Array.isArray(item)) item.fill(0); }
}
/** @param {unknown} raw @returns {DeviceDepositConsentV1} */
export function normalizeDeviceDepositConsentV1(raw) {
  const value = exact(raw, ['version', 'profile', 'action', 'origin', 'pairingId', 'devicePublicKey',
    'challengeId', 'nonce', 'expiresAt', 'binding', 'poolTerms', 'statement', 'rootId', 'noteRevision',
    'jobId', 'witnessSHA256', 'proofSHA256', 'publicInputsSHA256', 'observed', 'openingDisclosure']);
  need(value.version === 1 && value.profile === DEVICE_DEPOSIT_CONSENT_V1
    && oneOf(value.action, /** @type {const} */ (['PROVE_D26', 'FUND_D26', 'OBSERVE_D26'])));
  const origin = normalizeMobileOrigin(value.origin);
  need(hex(value.pairingId) && typeof value.devicePublicKey === 'string' && /^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0] === value.devicePublicKey
    && hex(value.challengeId) && hex(value.nonce) && new Set([value.pairingId, value.challengeId, value.nonce]).size === 3
    && typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0 && hex(value.rootId)
    && typeof value.noteRevision === 'number' && Number.isSafeInteger(value.noteRevision) && value.noteRevision >= 0 && hex(value.jobId)
    && hex(value.witnessSHA256));
  const binding = normalizeOriginalAccountBindingV2(value.binding);
  const poolTerms = readFields(exact(value.poolTerms, ['scope', 'policy', 'codeHash', 'assetIdentity', 'domainCommitment']),
    ['scope', 'policy', 'codeHash', 'assetIdentity', 'domainCommitment'], raw => { need(hex(raw)); return raw; });
  const statement = normalizeDeviceDepositStatementV1(value.statement);
  need(statement.scope === poolTerms.scope && statement.policy === poolTerms.policy);
  const observed = exact(value.observed, ['blockNumber', 'blockHash', 'timestamp']);
  need(u64(observed.blockNumber) && hex(observed.blockHash) && u64(observed.timestamp));
  /** @type {string | null} */ let proofSHA256 = null;
  /** @type {string | null} */ let publicInputsSHA256 = null;
  /** @type {DeviceDepositConsentV1['openingDisclosure']} */ let openingDisclosure = null;
  if (value.action === 'PROVE_D26') {
    need(value.proofSHA256 === null && value.publicInputsSHA256 === null
      && value.openingDisclosure === 'ONE_D26_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER'
      && statement.epoch === (BigInt(observed.timestamp) / 600n).toString());
    openingDisclosure = value.openingDisclosure;
  } else {
    need(hex(value.proofSHA256) && hex(value.publicInputsSHA256) && value.openingDisclosure === null);
    proofSHA256 = value.proofSHA256; publicInputsSHA256 = value.publicInputsSHA256;
  }
  /** @type {DeviceDepositConsentV1} */
  const validated = {version: value.version, profile: value.profile, action: value.action, origin,
    pairingId: value.pairingId, devicePublicKey: value.devicePublicKey, challengeId: value.challengeId,
    nonce: value.nonce, expiresAt: value.expiresAt, binding, poolTerms, statement, rootId: value.rootId,
    noteRevision: value.noteRevision, jobId: value.jobId, witnessSHA256: value.witnessSHA256,
    proofSHA256, publicInputsSHA256, observed: {blockNumber: observed.blockNumber, blockHash: observed.blockHash, timestamp: observed.timestamp}, openingDisclosure};
  return freeze(Object.assign(value, validated));
}
/** @param {unknown} raw @param {number} [now] @returns {DeviceDepositConsentV1} */
export function validateDeviceDepositConsentFreshV1(raw, now = Date.now()) {
  const value = normalizeDeviceDepositConsentV1(raw);
  need(Number.isSafeInteger(now) && value.expiresAt > now && value.expiresAt <= now + 15_000); return value;
}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceDepositConsentMessageV1(raw) {
  const value = normalizeDeviceDepositConsentV1(raw), text = value.profile + '\n' + JSON.stringify(value);
  need(text.length <= 6144 && /^[\x20-\x7e\n]*$/.exec(text)?.[0] === text);
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
