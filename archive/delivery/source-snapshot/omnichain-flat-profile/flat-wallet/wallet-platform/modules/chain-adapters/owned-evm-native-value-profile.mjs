/** Fixed, TEST-ONLY owned-loopback native-value mechanics. Validation of this
 * public data never mints a runtime, dispatch request, lease, or signer. The
 * genesis is the original runtime's observed genesis, never a mainnet alias. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const OWNED_EVM_NATIVE_VALUE_PROFILE_V1 = Object.freeze({
  schema: 'LIANUM_OWNED_LOCAL_EVM_NATIVE_VALUE_V1',
  classification: 'LOCAL_SYNTHETIC_EVM_CHAIN_ID_1', chainId: '1',
  transactionType: '0', gas: '100000', gasPrice: '1000000000',
  memoPrefix: 'LNRB1:', memoBytes: 70, publicNetwork: false,
  recipientControlProven: false, recipientValueRetentionProven: false,
});
/** Closed public codec catalogue, not a runtime/signing capability. These are
 * local Anvil transaction profiles with real EVM wire execution only. Sharing a
 * public network chain ID does not reproduce its client, consensus or finality. */
export const OWNED_EVM_NATIVE_VALUE_BASE_PROFILE_V1 = Object.freeze({
  ...OWNED_EVM_NATIVE_VALUE_PROFILE_V1, classification: 'LOCAL_SYNTHETIC_EVM_CHAIN_ID_8453', chainId: '8453',
});
export const OWNED_EVM_NATIVE_VALUE_ARBITRUM_PROFILE_V1 = Object.freeze({
  ...OWNED_EVM_NATIVE_VALUE_PROFILE_V1, classification: 'LOCAL_SYNTHETIC_EVM_CHAIN_ID_42161', chainId: '42161',
});
export const OWNED_EVM_NATIVE_VALUE_BNB_PROFILE_V1 = Object.freeze({
  ...OWNED_EVM_NATIVE_VALUE_PROFILE_V1, classification: 'LOCAL_SYNTHETIC_EVM_CHAIN_ID_56', chainId: '56',
});
export const OWNED_EVM_NATIVE_VALUE_FIXED_PROFILES_V1 = Object.freeze({
  ethereum: OWNED_EVM_NATIVE_VALUE_PROFILE_V1, base: OWNED_EVM_NATIVE_VALUE_BASE_PROFILE_V1,
  arbitrum: OWNED_EVM_NATIVE_VALUE_ARBITRUM_PROFILE_V1, bnb: OWNED_EVM_NATIVE_VALUE_BNB_PROFILE_V1,
});
const hash = raw => createHash('sha256').update(raw).digest('hex');
const isHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.exec(value)?.[0] === value;
const isAddress = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/.exec(value)?.[0] === value;
const freeze = value => { if (value && typeof value === 'object') {
  for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); } return value; };
function dataRecord(value, names) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, 'OWNED_NATIVE_VALUE_PLAIN_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort(), 'OWNED_NATIVE_VALUE_EXACT_FIELDS');
  for (const name of names) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value'),
    'OWNED_NATIVE_VALUE_DATA_PROPERTIES');
}
function quantity(value) {
  assert.ok(typeof value === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.exec(value)?.[0] === value
    && value.length <= 66, 'OWNED_NATIVE_VALUE_CANONICAL_QUANTITY');
  return BigInt(value);
}

/** Pure exact profile validation. Callers cannot supply keys, RPC, callbacks,
 * a signer, a fee replacement, an access list, or an unsigned wire to sign. */
export function normalizeOwnedEvmNativeValueIntent(raw, original) {
  assert.equal(arguments.length, 2, 'OWNED_NATIVE_VALUE_FIXED_NORMALIZER');
  return normalizeFixedIntent(raw, original, OWNED_EVM_NATIVE_VALUE_PROFILE_V1);
}
export function normalizeOwnedEvmNativeValueBaseIntent(raw, original) {
  assert.equal(arguments.length, 2, 'OWNED_NATIVE_VALUE_FIXED_NORMALIZER');
  return normalizeFixedIntent(raw, original, OWNED_EVM_NATIVE_VALUE_BASE_PROFILE_V1);
}
export function normalizeOwnedEvmNativeValueArbitrumIntent(raw, original) {
  assert.equal(arguments.length, 2, 'OWNED_NATIVE_VALUE_FIXED_NORMALIZER');
  return normalizeFixedIntent(raw, original, OWNED_EVM_NATIVE_VALUE_ARBITRUM_PROFILE_V1);
}
export function normalizeOwnedEvmNativeValueBnbIntent(raw, original) {
  assert.equal(arguments.length, 2, 'OWNED_NATIVE_VALUE_FIXED_NORMALIZER');
  return normalizeFixedIntent(raw, original, OWNED_EVM_NATIVE_VALUE_BNB_PROFILE_V1);
}
function normalizeFixedIntent(raw, original, profile) {
  dataRecord(raw, ['transaction', 'binding']); dataRecord(original, ['accounts', 'genesis']);
  const b = raw.binding, t = raw.transaction;
  const bindingFields = ['leaseId', 'profileCommitment', 'chainId', 'genesis', 'actionCommitment',
    'receiptKeyCommitment', 'readyStatement', 'dependencyProofSHA256', 'readyProofSHA256'];
  dataRecord(b, bindingFields); dataRecord(t, ['from', 'to', 'data', 'gas', 'value']);
  for (const name of bindingFields.filter(name => name !== 'chainId')) assert.ok(isHash(b[name]), 'OWNED_NATIVE_VALUE_BINDING_HASH');
  assert.equal(b.chainId, profile.chainId, 'OWNED_NATIVE_VALUE_LOCAL_CHAIN_ONLY');
  assert.equal(original.genesis, '0x' + b.genesis, 'OWNED_NATIVE_VALUE_ORIGINAL_GENESIS');
  assert.ok(Array.isArray(original.accounts) && original.accounts.every(isAddress), 'OWNED_NATIVE_VALUE_ORIGINAL_ACCOUNTS');
  assert.ok(isAddress(t.from) && original.accounts.includes(t.from), 'OWNED_NATIVE_VALUE_SOLVER_NOT_OWNED');
  assert.ok(isAddress(t.to) && t.to !== t.from && !/^0x0+$/.test(t.to), 'OWNED_NATIVE_VALUE_RECIPIENT');
  assert.equal(quantity(t.gas).toString(), profile.gas, 'OWNED_NATIVE_VALUE_FIXED_GAS');
  const amount = quantity(t.value);
  assert.ok(amount > 0n && amount < 1n << 128n, 'OWNED_NATIVE_VALUE_AMOUNT');
  const memo = Buffer.from(profile.memoPrefix + b.receiptKeyCommitment, 'ascii');
  assert.equal(memo.length, profile.memoBytes);
  assert.equal(t.data, '0x' + memo.toString('hex'), 'OWNED_NATIVE_VALUE_EXACT_K_MEMO');
  return freeze({ transaction: { ...t }, binding: { ...b } });
}

/** Audit commitments only. They authenticate no signer or RPC by themselves. */
export function ownedEvmNativeValueAuditCommitments({ binding, transaction, head, balanceWei, estimatedGas, targetCodeHash }) {
  return Object.freeze({
    ownershipCommitment: hash(JSON.stringify({ schema: 'LIANUM_OWNED_EVM_NATIVE_VALUE_SOLVER_AUDIT_V1',
      chainId: transaction.chainId, genesis: binding.genesis, solver: transaction.from, leaseId: binding.leaseId })),
    observationCommitment: hash(JSON.stringify({ schema: 'LIANUM_OWNED_EVM_NATIVE_VALUE_PREPARATION_AUDIT_V1',
      binding, transaction, head, balanceWei, estimatedGas, targetCodeHash })),
  });
}
