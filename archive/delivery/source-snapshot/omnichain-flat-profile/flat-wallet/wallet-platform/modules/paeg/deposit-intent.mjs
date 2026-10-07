/** D27 absolute-window deposit authorization. Host checks are witness hygiene;
 * only the circuit and receiving pool can establish proof/backing acceptance.
 * This module accepts a detached signature, never a signing key. */
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { exactRecord, fixedArray, bytes32, digestBytes, digestWords } from './commitments.mjs';
import { fundedFrame } from '../../../../../omnichain-product/src/paeg/funded-graph.mjs';
import { balanceCommitment } from '../../../../../omnichain-product/src/private-wallet-note-encoding.mjs';
import { uintBE } from '../../../../../omnichain-product/src/private-note-encoding.mjs';
import { SECP256K1_ORDER } from '../../../../../omnichain-product/src/private-native-certificate.mjs';

export const DEPOSIT_INTENT_TAG = 'LIANUM/PAEG/deposit-intent/1';
export const DEPOSIT_INTENT_PUBLIC_WORDS = 27;
export const DEPOSIT_INTENT_FIELDS = Object.freeze(['scope', 'policy', 'validFrom', 'validUntil', 'amount', 'output']);
const NOTE_FIELDS = ['type', 'rho', 'x', 'y', 'value', 'secret'];

function uint(value, bits = 64) {
  assert.equal(typeof value, 'string', 'DEPOSIT_INTENT_DECIMAL_STRING');
  assert.ok(value.length > 0 && value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value),
    'DEPOSIT_INTENT_CANONICAL_UINT');
  const result = BigInt(value);
  // The roundtrip also rejects a terminal LF, which JavaScript's $ can match.
  assert.equal(result.toString(), value, 'DEPOSIT_INTENT_CANONICAL_UINT');
  assert.ok(result < (1n << BigInt(bits)), 'DEPOSIT_INTENT_UINT_RANGE');
  return result;
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Absolute Unix seconds, half-open [validFrom,validUntil); no epoch conversion.
 * Scope/policy preserve their original raw 32-byte contract, including zero;
 * the receiving pool must enforce its actual configured scope and policy. */
export function validateDepositIntentStatement(statement) {
  exactRecord(statement, DEPOSIT_INTENT_FIELDS);
  bytes32(statement.scope); bytes32(statement.policy); bytes32(statement.output, true);
  assert.ok(uint(statement.validFrom) < uint(statement.validUntil), 'DEPOSIT_INTENT_WINDOW');
  assert.ok(uint(statement.amount) > 0n, 'DEPOSIT_INTENT_POSITIVE_AMOUNT');
  return freeze(structuredClone(statement));
}

/** Exact public ABI: scope[8],policy[8],valid_from,valid_until,amount,output[8]. */
export function encodeDepositIntentInputs(statement) {
  const s = validateDepositIntentStatement(statement);
  return Object.freeze([...digestWords(s.scope).map(String), ...digestWords(s.policy).map(String),
    s.validFrom, s.validUntil, s.amount, ...digestWords(s.output).map(String)]);
}

/** Canonical decimal field words only; reject alternate spelling or widths. */
export function decodeDepositIntentInputs(words) {
  fixedArray(words, DEPOSIT_INTENT_PUBLIC_WORDS);
  const digest = offset => {
    const result = Buffer.alloc(32);
    for (let i = 0; i < 8; i++) result.writeUInt32BE(Number(uint(words[offset + i], 32)), i * 4);
    return result.toString('hex');
  };
  return validateDepositIntentStatement({ scope: digest(0), policy: digest(8),
    validFrom: words[16], validUntil: words[17], amount: words[18], output: digest(19) });
}

/** Exact 176 bytes. H4 has a u32BE length on the tag and all six fields.
 * Sign SHA256(frame) using secp256k1 and a canonical low-S P1363 signature. */
export function depositIntentFrame(statement) {
  const s = validateDepositIntentStatement(statement);
  return fundedFrame(DEPOSIT_INTENT_TAG, [Buffer.from(s.scope, 'hex'), Buffer.from(s.policy, 'hex'),
    uintBE(s.validFrom, 8), uintBE(s.validUntil, 8), uintBE(s.amount, 8), Buffer.from(s.output, 'hex')]);
}

function checkNote(statement, note) {
  exactRecord(note, NOTE_FIELDS);
  assert.equal(note.type, 4, 'DEPOSIT_INTENT_NOTE_TYPE');
  for (const name of ['rho', 'x', 'y', 'secret']) bytes32(note[name]);
  uint(note.value);
  assert.equal(note.value, statement.amount, 'DEPOSIT_INTENT_NOTE_VALUE');
  assert.equal(balanceCommitment(statement.scope, statement.policy, note).toString('hex'), statement.output,
    'DEPOSIT_INTENT_NOTE_COMMITMENT');
}

function checkSignature(note, signature, frame) {
  assert.equal(typeof signature, 'string', 'DEPOSIT_INTENT_SIGNATURE_TYPE');
  assert.equal(signature.length, 128, 'DEPOSIT_INTENT_SIGNATURE_WIDTH');
  assert.match(signature, /^[0-9a-f]{128}$/, 'DEPOSIT_INTENT_SIGNATURE_ENCODING');
  const bytes = Buffer.from(signature, 'hex');
  const r = BigInt('0x' + bytes.subarray(0, 32).toString('hex'));
  const s = BigInt('0x' + bytes.subarray(32).toString('hex'));
  assert.ok(r > 0n && r < SECP256K1_ORDER && s > 0n && s <= SECP256K1_ORDER / 2n,
    'DEPOSIT_INTENT_SIGNATURE_LOW_S');
  const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(note.x, 'hex').toString('base64url'), y: Buffer.from(note.y, 'hex').toString('base64url') } });
  assert.ok(verify('sha256', frame, { key: publicKey, dsaEncoding: 'ieee-p1363' }, bytes),
    'DEPOSIT_INTENT_OWNER_SIGNATURE');
  return [...bytes];
}

/** Private owner-only construction after custody durably records signing intent.
 * Input is exactly {statement,note,signature}; note is the retained original
 * {type:4,rho,x,y,value,secret}; signature is 128 bare lowercase hex characters.
 * Retain the returned witness inside the owner proof capability. A solver/router
 * receives only the actual proof and the public statement, never this result. */
export function depositIntentWitness(request) {
  exactRecord(request, ['statement', 'note', 'signature']);
  const statement = validateDepositIntentStatement(request.statement);
  checkNote(statement, request.note);
  const signature = checkSignature(request.note, request.signature, depositIntentFrame(statement));
  return freeze({ statement, publicInputs: [...encodeDepositIntentInputs(statement)], inputs: {
    scope: digestWords(statement.scope), policy: digestWords(statement.policy),
    valid_from: statement.validFrom, valid_until: statement.validUntil, amount: statement.amount,
    output: digestWords(statement.output), rho: digestBytes(request.note.rho),
    key_x: digestBytes(request.note.x), key_y: digestBytes(request.note.y),
    secret: digestBytes(request.note.secret), signature,
  } });
}
