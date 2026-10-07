/** Compact evidence for the controller's original EVM dispatch. Calldata and
 * unsigned RLP are commitments here; the exact signed wire is retained once.
 * Reopening still requires the same owned runtime and its original journal. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { cloneInput as copy } from '../../execution/account/preparation/readiness-inputs.mjs';

function wireHash(value) {
  assert.ok(typeof value === 'string' && value.length <= 262146
    && /^0x(?:[0-9a-f]{2})*$/.exec(value)?.[0] === value, 'CLAIM_EVM_CANONICAL_WIRE');
  return createHash('sha256').update(Buffer.from(value.slice(2), 'hex')).digest('hex');
}
export function compactClaimEvmRequest(value) {
  const request = copy(value); exactRecord(request, ['from', 'to', 'gas', 'value', 'data']);
  const { data, ...terms } = request;
  return { ...terms, calldataSHA256: wireHash(data) };
}
export function compactClaimEvmPreparation(value) {
  const prepared = copy(value); exactRecord(prepared, ['genesis', 'head', 'transaction', 'unsignedWire', 'funds']);
  exactRecord(prepared.transaction, ['chainId', 'from', 'to', 'nonce', 'gasPrice', 'gas', 'value', 'data']);
  const { data, ...terms } = prepared.transaction;
  return { genesis: prepared.genesis, head: prepared.head, transaction: terms, funds: prepared.funds,
    calldataSHA256: wireHash(data), unsignedWireSHA256: wireHash(prepared.unsignedWire) };
}
/** Lookup only. Missing/ambiguous originals never authorize another dispatch.
 * Full signature verification remains at the controller/runtime boundary. */
export function originalClaimEvmRecord(row, entries) {
  if (!row.prepared) { assert.ok(!row.signed, 'CLAIM_EVM_SIGNED_WITHOUT_PREPARATION'); return null; }
  assert.equal(row.transaction.calldataSHA256, row.calldataSHA256, 'CLAIM_EVM_REQUEST_COMMITMENT');
  assert.equal(row.prepared.calldataSHA256, row.calldataSHA256, 'CLAIM_EVM_PREPARED_COMMITMENT');
  const matches = entries.filter(entry => !(entry.phase === 'pre-sign-rejected' && !entry.signed)
    && entry.prepared && entry.request
    && entry.request.from === row.transaction.from && entry.request.to === row.transaction.to
    && wireHash(entry.request.data) === row.calldataSHA256
    && wireHash(entry.prepared.unsignedWire) === row.prepared.unsignedWireSHA256);
  assert.ok(matches.length <= 1, 'CLAIM_MULTIPLE_ORIGINAL_EVM_SENDS');
  const original = matches[0];
  if (!original) { assert.ok(!row.signed, 'CLAIM_EVM_ORIGINAL_RUNTIME_REQUIRED'); return null; }
  assert.deepEqual(compactClaimEvmRequest(original.request), row.transaction, 'CLAIM_EVM_ORIGINAL_REQUEST');
  assert.deepEqual(compactClaimEvmPreparation(original.prepared), row.prepared, 'CLAIM_EVM_ORIGINAL_PREPARATION');
  if (row.signed) {
    assert.deepEqual(original.signed, row.signed, 'CLAIM_EVM_ORIGINAL_SIGNED_WIRE');
    assert.equal(original.transactionHash, row.signed.nativeId, 'CLAIM_EVM_ORIGINAL_SIGNED_IDENTITY');
  }
  return original;
}
