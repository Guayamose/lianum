/** Private receipt-note byte contract for the generic native profile.
 * A commitment/opening is not evidence of a native fact. Only the deployed
 * admission relation may insert these notes. Read openings deliberately omit
 * the spend secret, so prerequisite proof actors cannot derive terminal tags.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fundedFrame } from './funded-graph.mjs';
import { uintBE } from '../private-note-encoding.mjs';
import { canonicalGlobalEffectId } from '../evidence/native-evidence.mjs';

export const NATIVE_EXECUTION_PROFILE = 'LIANUM_PAEG_NATIVE_4_V2';
export const RECEIPT_HASH_FIELDS = Object.freeze([
  'hubDomain', 'registryCommitment', 'globalEffectId', 'scope', 'policy',
  'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy',
  'actionCommitment', 'payoutCommitment',
]);
const READ_FIELDS = [...RECEIPT_HASH_FIELDS, 'validFrom', 'validUntil', 'receiptKeyCommitment', 'receiptRho'];
const ZERO = '0'.repeat(64);

function exact(value, fields, code) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...fields].sort(), code);
  for (const key of fields) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'), code);
}
function digest(value, code = 'NATIVE_RECEIPT_DIGEST', allowZero = false) {
  assert.equal(typeof value, 'string', code);
  assert.match(value, /^[0-9a-f]{64}$/, code);
  assert.ok(allowZero || value !== ZERO, code);
  return Buffer.from(value, 'hex');
}
function integer(value, width, code) {
  assert.equal(typeof value, 'string', code);
  assert.match(value, /^(0|[1-9][0-9]*)$/, code);
  assert.ok(value.length <= 39 && BigInt(value) < (1n << BigInt(width * 8)), code);
  return uintBE(value, width);
}
const hash = (tag, fields) => createHash('sha256').update(fundedFrame(tag, fields)).digest('hex');

export function nativeReceiptKeyCommitment(hubDomain, spendSecret) {
  return hash('LIANUM/PAEG/receipt-key/2', [digest(hubDomain), digest(spendSecret, 'NATIVE_RECEIPT_SPEND_SECRET')]);
}

/** This opening may be sent only to its designated prerequisite proof actor.
 * It reveals one admitted native effect, but no terminal spending secret.
 */
export function nativeReceiptReadOpening(input) {
  exact(input, READ_FIELDS, 'NATIVE_RECEIPT_READ_FIELDS');
  for (const key of [...RECEIPT_HASH_FIELDS, 'receiptKeyCommitment', 'receiptRho']) digest(input[key]);
  integer(input.validFrom, 8, 'NATIVE_RECEIPT_TIME'); integer(input.validUntil, 8, 'NATIVE_RECEIPT_TIME');
  assert.ok(BigInt(input.validFrom) < BigInt(input.validUntil), 'NATIVE_RECEIPT_WINDOW');
  return Object.freeze({ ...input });
}

export function nativeReceiptCommitment(input) {
  const opening = nativeReceiptReadOpening(input);
  return hash('LIANUM/PAEG/native-receipt/2', [Buffer.from(NATIVE_EXECUTION_PROFILE),
    ...RECEIPT_HASH_FIELDS.map(key => digest(opening[key])),
    integer(opening.validFrom, 8, 'NATIVE_RECEIPT_TIME'), integer(opening.validUntil, 8, 'NATIVE_RECEIPT_TIME'),
    digest(opening.receiptKeyCommitment), digest(opening.receiptRho)]);
}

/** Canonical spend tag is secret-derived; no role can choose a new salt after
 * admission to obtain a second spend of the same note. Cross-pool uniqueness
 * additionally requires every consumer to use the SAME authoritative hub.
 */
export function nativeReceiptNullifier(readOpening, spendSecret) {
  const opening = nativeReceiptReadOpening(readOpening);
  assert.equal(nativeReceiptKeyCommitment(opening.hubDomain, spendSecret), opening.receiptKeyCommitment,
    'NATIVE_RECEIPT_KEY_MISMATCH');
  return hash('LIANUM/PAEG/receipt-spend/2', [digest(opening.hubDomain),
    digest(spendSecret, 'NATIVE_RECEIPT_SPEND_SECRET'), digest(nativeReceiptCommitment(opening))]);
}

/** Preserve the original BTC/SOL/EVM identity byte contract. TRON adds one
 * registered family label with the same framing; this codec does not establish
 * that a TRON adapter, finality predicate or deployment has been implemented.
 */
export function canonicalNativeEffectId(input) {
  exact(input, ['chainDomain', 'effectIdentity'], 'NATIVE_EFFECT_FIELDS');
  const domain = input.chainDomain, effect = input.effectIdentity;
  exact(domain, ['chain', 'genesis', 'asset'], 'NATIVE_EFFECT_DOMAIN');
  exact(effect, ['transactionId', 'effectIndex'], 'NATIVE_EFFECT_IDENTITY');
  assert.ok(['BTC', 'SOL', 'EVM', 'TRON'].includes(domain.chain), 'NATIVE_EFFECT_FAMILY');
  digest(domain.genesis, 'NATIVE_EFFECT_GENESIS', true); digest(domain.asset, 'NATIVE_EFFECT_ASSET', true);
  assert.equal(typeof effect.transactionId, 'string', 'NATIVE_EFFECT_TRANSACTION');
  assert.match(effect.transactionId, domain.chain === 'SOL' ? /^[0-9a-f]{128}$/ : /^[0-9a-f]{64}$/, 'NATIVE_EFFECT_TRANSACTION');
  integer(effect.effectIndex, 4, 'NATIVE_EFFECT_POSITION');
  const domainBytes = fundedFrame('LIANUM/evidence-chain/1', [Buffer.from(domain.chain),
    digest(domain.genesis, 'NATIVE_EFFECT_GENESIS', true), digest(domain.asset, 'NATIVE_EFFECT_ASSET', true)]);
  const result = hash('LIANUM/native-global-effect/1', [domainBytes,
    Buffer.from(effect.transactionId, 'hex'), Buffer.from(effect.effectIndex, 'ascii')]);
  if (domain.chain !== 'TRON') assert.equal(result, canonicalGlobalEffectId(input), 'NATIVE_EFFECT_LEGACY_BYTES_CHANGED');
  return result;
}

/** Strict witness codec for receipt::ReceiptRead. Preserve every digest byte
 * and the full u64 decimal values; never include the terminal spend secret.
 * Preparing this witness does not authenticate an admitted receipt.
 */
export function nativeReceiptToNoir(input) {
  const opening = nativeReceiptReadOpening(input);
  return Object.fromEntries(READ_FIELDS.map(field => [
    field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`),
    field === 'validFrom' || field === 'validUntil' ? opening[field] : [...digest(opening[field])],
  ]));
}

/** Strict witness codec for receipt::NativeEffect. The family selector fixes
 * native identity width; 32-byte identities receive canonical zero padding.
 * Neither this codec nor identity hashing proves native consensus or policy.
 */
export function nativeEffectToNoir(input) {
  canonicalNativeEffectId(input);
  const { chainDomain, effectIdentity } = input;
  const transactionId = Buffer.from(effectIdentity.transactionId, 'hex');
  return {
    family: String(['BTC', 'SOL', 'EVM', 'TRON'].indexOf(chainDomain.chain) + 1),
    genesis: [...digest(chainDomain.genesis, 'NATIVE_EFFECT_GENESIS', true)],
    asset: [...digest(chainDomain.asset, 'NATIVE_EFFECT_ASSET', true)],
    transaction_id: [...transactionId, ...Array(64 - transactionId.length).fill(0)],
    effect_index: effectIdentity.effectIndex,
  };
}
