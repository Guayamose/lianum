/** Native-value consent schema V1. Legacy serialized review/records are never native consent. */
/** Strict bounded owner-local manual binding. Contains display terms only;
 * no consent, secret, opening, root, witness, endpoint or execution capability. */
import assert from 'node:assert/strict';
import { sha } from '@lianum/engine/accounts/journal';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { validateFlatAccountPrepare } from '../../../backend/src/api/accounts/flat-account-session.mjs';
import { validatePrivateAccountRegistry } from '../../../engine/src/accounts/private-account-state.mjs';

export const NATIVE_VALUE_MANUAL_KINDS = Object.freeze(['deposit', 'withdraw_source', 'withdraw_change', 'withdraw_recovery']);
const whole = (v, re) => typeof v === 'string' && re.exec(v)?.[0] === v;
const hex = (v, n = 64) => whole(v, new RegExp('^[0-9a-f]{' + n + '}$'));
const uint = (v, positive = false) => whole(v, /^(0|[1-9][0-9]{0,19})$/)
  && BigInt(v) < 1n << 64n && (!positive || BigInt(v) > 0n);
export function validateNativeValueManualReview(value) {
  exactRecord(value, ['version', 'profile', 'processIdentitySHA256', 'processGeneration', 'keyScopeSHA256', 'originalAccountLifetime', 'generationId', 'request', 'kind', 'ownerKind', 'ownerIdentitySHA256', 'accountIdentitySHA256', 'asset',
    'epoch', 'amount', 'recipient', 'role', 'noteStatus', 'observed', 'effect', 'fundingApproval', 'registration', 'spending']);
  assert.equal(value.version, 1); assert.equal(value.profile, 'NATIVE_VALUE_OWNER_NOTE_REVIEW_V1');
  for (const key of ['processIdentitySHA256', 'keyScopeSHA256', 'originalAccountLifetime', 'generationId']) assert.ok(hex(value[key]), 'NATIVE_VALUE_MANUAL_SCOPE');
  assert.ok(Number.isSafeInteger(value.processGeneration) && value.processGeneration > 0, 'NATIVE_VALUE_MANUAL_PROCESS_GENERATION');
  const request = validateFlatAccountPrepare(value.request), deposit = value.kind === 'TOP_UP';
  assert.ok(deposit || value.kind === 'EXIT', 'FLAT_OWNER_MANUAL_KIND');
  assert.equal(request.kind, value.kind); assert.ok(NATIVE_VALUE_MANUAL_KINDS.includes(value.ownerKind));
  assert.equal(value.ownerKind, deposit ? 'deposit' : 'withdraw_' + value.role);
  assert.ok(hex(value.ownerIdentitySHA256) && hex(value.accountIdentitySHA256), 'FLAT_OWNER_MANUAL_IDENTITY');
  exactRecord(value.asset, ['assetId', 'kind', 'symbol', 'decimals', 'chainId', 'genesis', 'pool', 'scope', 'policy',
    'token', 'codeHash', 'assetIdentity', 'custody', 'trust']);
  validatePrivateAccountRegistry([value.asset]);
  for (const name of ['assetId', 'genesis', 'scope', 'policy', 'codeHash', 'assetIdentity']) assert.ok(hex(value.asset[name]));
  for (const name of ['pool', 'token']) assert.ok(hex(value.asset[name], 40));
  assert.ok(whole(value.asset.symbol, /^[A-Z0-9]{2,12}$/) && uint(value.asset.chainId, true));
  assert.equal(value.asset.assetId, request.assetId);
  assert.ok(uint(value.epoch) && uint(value.amount, true) && hex(value.recipient, 40)
    && value.recipient !== '0'.repeat(40) && value.recipient !== value.asset.pool, 'FLAT_OWNER_MANUAL_TERMS');
  assert.ok(deposit ? value.role === null && value.noteStatus === null
    : ['source', 'change', 'recovery'].includes(value.role) && ['AVAILABLE', 'LOCKED'].includes(value.noteStatus));
  exactRecord(value.observed, ['blockHash', 'timestamp']);
  assert.ok(hex(value.observed.blockHash) && uint(value.observed.timestamp));
  assert.equal(String(BigInt(value.observed.timestamp) / 600n), value.epoch);
  assert.equal(value.effect, deposit ? 'CREATE_ORIGINAL_PRIVATE_DEPOSIT_PREPARATION' : 'LOCK_ORIGINAL_NOTE_FOR_FULL_WITHDRAWAL_PREPARATION');
  assert.equal(value.fundingApproval, 'EXISTING_EXACT_TOKEN_ALLOWANCE_REQUIRED_WHEN_APPLICABLE');
  assert.equal(value.registration, 'ORIGINAL_NATIVE_VALUE_AUTHORITY_OWNER_LOCAL_NOTE_PREPARATION');
  assert.equal(value.spending, 'SEPARATE_ACCOUNT_PREPARE_AND_EXECUTE_REVIEW_REQUIRED');
  return value;
}
export function validateNativeValueManualRecords(extension) {
  exactRecord(extension, ['version', 'records']); assert.equal(extension.version, 1);
  assert.ok(Array.isArray(extension.records) && extension.records.length <= 4, 'FLAT_OWNER_MANUAL_LIMIT');
  for (const entry of extension.records) {
    exactRecord(entry, ['review', 'ownerState', ...(extension.version === 2 ? ['reauthorizations'] : [])]); validateNativeValueManualReview(entry.review);
    if (extension.version === 2) {
      assert.ok(Array.isArray(entry.reauthorizations) && entry.reauthorizations.length <= 8);
      if (entry.reauthorizations.length) assert.equal(entry.ownerState, 'PREPARED');
      let previous = entry.review;
      for (const [index, authorization] of entry.reauthorizations.entries()) {
        validateNativeValueManualReauthorization(authorization);
        assert.equal(authorization.revision, index + 1); assert.equal(authorization.previousAuthorizationSHA256, sha(previous));
        assert.deepEqual(authorization.request, entry.review.request);
        for (const field of ['ownerIdentitySHA256', 'accountIdentitySHA256', 'amount', 'recipient', 'role'])
          assert.equal(authorization[field], entry.review[field]);
        assert.equal(authorization.priorEpoch, previous.epoch); assert.ok(BigInt(authorization.epoch) > BigInt(previous.epoch));
        previous = authorization;
      }
    }
    assert.ok(['LATCHED', 'PREPARED'].includes(entry.ownerState), 'FLAT_OWNER_MANUAL_STATE');
  }
  for (const field of ['ownerKind', 'requestId', 'ownerOperationRef']) {
    const values = extension.records.map(({ review }) => field === 'ownerKind' ? review[field] : review.request[field]);
    assert.equal(new Set(values).size, values.length, 'FLAT_OWNER_MANUAL_DUPLICATE');
  }
  return extension;
}

/** Exact new manual review, never a permission token or no-dispatch receipt. */
export function validateNativeValueManualReauthorization(value) {
  exactRecord(value, ['version', 'profile', 'revision', 'request', 'ownerIdentitySHA256', 'accountIdentitySHA256',
    'amount', 'recipient', 'role', 'priorEpoch', 'epoch', 'observed', 'previousAuthorizationSHA256']);
  assert.equal(value.version, 1); assert.equal(value.profile, 'NATIVE_VALUE_MANUAL_EPOCH_REAUTHORIZATION_V1');
  assert.ok(Number.isInteger(value.revision) && value.revision >= 1 && value.revision <= 8);
  validateFlatAccountPrepare(value.request); assert.ok(['TOP_UP', 'EXIT'].includes(value.request.kind));
  for (const key of ['ownerIdentitySHA256', 'accountIdentitySHA256', 'previousAuthorizationSHA256']) assert.ok(hex(value[key]));
  assert.ok(uint(value.amount, true) && hex(value.recipient, 40) && value.recipient !== '0'.repeat(40));
  assert.ok(value.request.kind === 'TOP_UP' ? value.role === null : ['source', 'change', 'recovery'].includes(value.role));
  assert.ok(uint(value.priorEpoch) && uint(value.epoch) && BigInt(value.epoch) > BigInt(value.priorEpoch));
  exactRecord(value.observed, ['blockHash', 'timestamp']); assert.ok(hex(value.observed.blockHash) && uint(value.observed.timestamp));
  assert.equal(String(BigInt(value.observed.timestamp) / 600n), value.epoch); return value;
}
export const currentNativeValueManualAuthorization = entry => entry.reauthorizations?.at(-1) ?? entry.review;
