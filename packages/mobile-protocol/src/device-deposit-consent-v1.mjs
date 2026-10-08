/** New domains; protected V2 frames/package exports are untouched. PROVE_D26
 * discloses one opening to the original ephemeral worker. FUND_D26 authorizes
 * one retained send. No root or private signing key can enter this protocol. */
import { normalizeOriginalAccountBindingV2, normalizeOriginalAccountSignatureV2 } from './original-account-review-v2.mjs';
import { normalizeMobileOrigin } from './authorization.mjs';
export const DEVICE_DEPOSIT_CONSENT_V1 = 'LIANUM_DEVICE_ORIGINAL_D26_V1';
const need = value => { if (!value) throw new Error('MOBILE_DEVICE_DEPOSIT_INVALID'); };
function exact(value, names) {
  need(value && Object.getPrototypeOf(value) === Object.prototype);
  const keys = Reflect.ownKeys(value);
  need(keys.length === names.length && keys.every(key => names.includes(key)));
  return Object.fromEntries(names.map(name => { const field = Object.getOwnPropertyDescriptor(value, name);
    need(field?.enumerable && Object.hasOwn(field, 'value')); return [name, field.value]; }));
}
const hex = (value, width = 64) => typeof value === 'string'
  && new RegExp('^[0-9a-f]{' + width + '}$').exec(value)?.[0] === value;
const u64 = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.exec(value)?.[0] === value
  && BigInt(value) < (1n << 64n);
function freeze(value) { if (value && typeof value === 'object') {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export function normalizeDeviceDepositStatementV1(raw) {
  const value = exact(raw, ['scope', 'policy', 'epoch', 'amount', 'output']);
  need(hex(value.scope) && hex(value.policy) && u64(value.epoch) && u64(value.amount)
    && BigInt(value.amount) > 0n && hex(value.output) && value.output !== '0'.repeat(64));
  return freeze(value);
}
/** Exact original Noir D26 ABI; reject extra keys including root/privateKey. */
export function normalizeDeviceDepositWitnessV1(raw) {
  const value = exact(raw, ['scope', 'policy', 'epoch', 'amount', 'output', 'rho', 'key_x', 'key_y', 'secret', 'signature']);
  function array(input, count, limit) {
    need(Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype && input.length === count
      && Reflect.ownKeys(input).length === count + 1);
    return Array.from({ length: count }, (_, index) => {
      const row = Object.getOwnPropertyDescriptor(input, String(index));
      need(row?.enumerable && Object.hasOwn(row, 'value') && Number.isSafeInteger(row.value)
        && row.value >= 0 && row.value < limit); return row.value;
    });
  }
  for (const name of ['scope', 'policy', 'output']) value[name] = array(value[name], 8, 2 ** 32);
  for (const name of ['rho', 'key_x', 'key_y', 'secret']) value[name] = array(value[name], 32, 256);
  value.signature = array(value.signature, 64, 256);
  need(u64(value.epoch) && u64(value.amount) && BigInt(value.amount) > 0n);
  normalizeOriginalAccountSignatureV2(value.signature.map(byte => byte.toString(16).padStart(2, '0')).join(''));
  return value; // owned mutable copy for explicit erasure
}
export function deviceDepositWitnessBytesV1(raw) {
  const value = normalizeDeviceDepositWitnessV1(raw);
  try { return new TextEncoder().encode(JSON.stringify(value)); }
  finally { for (const item of Object.values(value)) if (Array.isArray(item)) item.fill(0); }
}
export function normalizeDeviceDepositConsentV1(raw) {
  const value = exact(raw, ['version', 'profile', 'action', 'origin', 'pairingId', 'devicePublicKey',
    'challengeId', 'nonce', 'expiresAt', 'binding', 'poolTerms', 'statement', 'rootId', 'noteRevision',
    'jobId', 'witnessSHA256', 'proofSHA256', 'publicInputsSHA256', 'observed', 'openingDisclosure']);
  need(value.version === 1 && value.profile === DEVICE_DEPOSIT_CONSENT_V1
    && ['PROVE_D26', 'FUND_D26', 'OBSERVE_D26'].includes(value.action));
  normalizeMobileOrigin(value.origin);
  need(hex(value.pairingId) && /^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0] === value.devicePublicKey
    && hex(value.challengeId) && hex(value.nonce) && new Set([value.pairingId, value.challengeId, value.nonce]).size === 3
    && Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0 && hex(value.rootId)
    && Number.isSafeInteger(value.noteRevision) && value.noteRevision >= 0 && hex(value.jobId)
    && hex(value.witnessSHA256));
  value.binding = normalizeOriginalAccountBindingV2(value.binding);
  value.poolTerms = exact(value.poolTerms, ['scope', 'policy', 'codeHash', 'assetIdentity', 'domainCommitment']);
  need(Object.values(value.poolTerms).every(field => hex(field)));
  value.statement = normalizeDeviceDepositStatementV1(value.statement);
  need(value.statement.scope === value.poolTerms.scope && value.statement.policy === value.poolTerms.policy);
  value.observed = exact(value.observed, ['blockNumber', 'blockHash', 'timestamp']);
  need(u64(value.observed.blockNumber) && hex(value.observed.blockHash) && u64(value.observed.timestamp));
  if (value.action === 'PROVE_D26') need(value.proofSHA256 === null && value.publicInputsSHA256 === null
    && value.openingDisclosure === 'ONE_D26_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER'
    && value.statement.epoch === (BigInt(value.observed.timestamp) / 600n).toString());
  else need(hex(value.proofSHA256) && hex(value.publicInputsSHA256) && value.openingDisclosure === null);
  return freeze(value);
}
export function validateDeviceDepositConsentFreshV1(raw, now = Date.now()) {
  const value = normalizeDeviceDepositConsentV1(raw);
  need(Number.isSafeInteger(now) && value.expiresAt > now && value.expiresAt <= now + 15_000); return value;
}
export function deviceDepositConsentMessageV1(raw) {
  const value = normalizeDeviceDepositConsentV1(raw), text = value.profile + '\n' + JSON.stringify(value);
  need(text.length <= 6144 && /^[\x20-\x7e\n]*$/.exec(text)?.[0] === text);
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
