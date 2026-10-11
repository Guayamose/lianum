/** Strict, pure pinned EVM vault-delivery codecs and supplied-trace predicates.
 * No RPC, signing, owned capability, owner proof verification or private credit.
 * Only a genuine owned reader can establish where these bytes/states came from.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publicKeccak256 } from '../cohorts/private-cohort-public-native.mjs';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';

export const EVM_VAULT_DELIVERY_PROFILE = 'LIANUM_FLAT_EVM_VAULT_DELIVERY_V1';
export const EVM_VAULT_DELIVERY_TAG = 'LIANUM/PAEG/evm-vault-delivery/1';
export const EVM_VAULT_DELIVERY_METHOD = 'deliver(bytes32,bytes32,(uint128,uint64,uint64,uint64),bytes,bytes32[])';
export const EVM_VAULT_DEPOSIT_METHOD = 'depositBalanceIntent(bytes,bytes32[])';
export const EVM_VAULT_DELIVERY_EVENT = 'PrivateVaultDelivered(bytes32,bytes32,bytes32,bytes32,uint64)';
const selector = method => publicKeccak256(Buffer.from(method, 'ascii')).subarray(0, 4).toString('hex');
export const EVM_VAULT_DELIVERY_SELECTOR = selector(EVM_VAULT_DELIVERY_METHOD);
export const EVM_VAULT_DEPOSIT_SELECTOR = selector(EVM_VAULT_DEPOSIT_METHOD);
export const EVM_VAULT_DELIVERY_TOPIC = publicKeccak256(Buffer.from(EVM_VAULT_DELIVERY_EVENT, 'ascii')).toString('hex');
export const EVM_VAULT_DELIVERY_LIMITS = Object.freeze({ chainId: '31337', adapterVersion: '1', routerVersion: '1',
  assetAmountBits: 128, shareAmountBits: 64, capacity: 64, proofBytes: 65536, effectIndex: '0',
  wireBindingVersion: '1', wireBindingKind: '3', wireBindingPosition: '0', privateDeFiAcceptance: false });

const ZERO = '0'.repeat(64), MAX128 = (1n << 128n) - 1n, MAX64 = (1n << 64n) - 1n;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const detached = value => freeze(structuredClone(value));
function hex(value, length = 32, nonzero = true) {
  assert.ok(typeof value === 'string' && value.length === length * 2
    && new RegExp(`^[0-9a-f]{${length * 2}}$`).test(value), 'EVM_DELIVERY_HEX');
  assert.ok(!nonzero || /[1-9a-f]/.test(value), 'EVM_DELIVERY_NONZERO');
  return Buffer.from(value, 'hex');
}
function uint(value, bits, positive = false) {
  assert.ok(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value), 'EVM_DELIVERY_UINT');
  const n = BigInt(value);
  assert.ok(n < (1n << BigInt(bits)) && (!positive || n > 0n), 'EVM_DELIVERY_UINT_RANGE');
  return n;
}
const numberBytes = (value, width) => Buffer.from(uint(value, width * 8).toString(16).padStart(width * 2, '0'), 'hex');
const word = value => numberBytes(String(value), 32).toString('hex');
function h4(parts) { return Buffer.concat(parts.flatMap(part => [numberBytes(String(part.length), 4), part])); }
function bytes(value, maximum, prefix = false) {
  assert.ok(typeof value === 'string' && value.length >= (prefix ? 4 : 2)
    && value.length <= maximum * 2 + (prefix ? 2 : 0), 'EVM_DELIVERY_BYTES_LENGTH');
  if (prefix) { assert.ok(value.startsWith('0x'), 'EVM_DELIVERY_HEX_PREFIX'); value = value.slice(2); }
  assert.match(value, /^(?:[0-9a-f]{2})+$/, 'EVM_DELIVERY_BYTES');
  return Buffer.from(value, 'hex');
}

export const EVM_VAULT_IDENTITY_FIELDS = freeze([
  ['chainId', 32, 'uint'], ['genesisHash', 32], ['ledgerNamespace', 32], ['adapterVersion', 4, 'uint'],
  ['router', 20], ['routerCodeSHA256', 32], ['routerVersion', 4, 'uint'], ['solver', 20],
  ['asset', 20], ['assetCodeSHA256', 32], ['assetIdentity', 32], ['vault', 20],
  ['vaultCodeSHA256', 32], ['shareIdentity', 32], ['vaultDomain', 32], ['vaultRuntimeId', 32],
  ['targetPool', 20], ['targetPoolCodeSHA256', 32], ['targetDomain', 32], ['targetScope', 32], ['targetPolicy', 32],
]);
const ROUTE_FIELDS = ['assetAmount', 'shareAmount', 'executionFrom', 'executionUntil'];

export function validateEvmVaultDeliveryIdentity(identity) {
  exactRecord(identity, EVM_VAULT_IDENTITY_FIELDS.map(([name]) => name));
  for (const [name, width, kind] of EVM_VAULT_IDENTITY_FIELDS)
    kind === 'uint' ? uint(identity[name], width * 8) : hex(identity[name], width);
  for (const key of ['chainId', 'adapterVersion', 'routerVersion'])
    assert.equal(identity[key], EVM_VAULT_DELIVERY_LIMITS[key], 'EVM_DELIVERY_VERSION_OR_CHAIN');
  assert.equal(new Set(['router', 'solver', 'asset', 'vault', 'targetPool'].map(key => identity[key])).size,
    5, 'EVM_DELIVERY_DISTINCT_ADDRESSES');
  assert.notEqual(identity.assetIdentity, identity.shareIdentity, 'EVM_DELIVERY_DISTINCT_ASSETS');
  return detached(identity);
}

/** Same exact D27 limb framing as the original pool digest decoder. */
export function decodeEvmVaultDepositStatement(publicInputs) {
  fixedArray(publicInputs, 27);
  publicInputs.forEach(value => hex(value, 32, false));
  const digest = offset => publicInputs.slice(offset, offset + 8).map(value => {
    assert.ok(BigInt('0x' + value) <= 0xffffffffn, 'EVM_DELIVERY_D27_U32'); return value.slice(56);
  }).join('');
  const statement = { scope: digest(0), policy: digest(8), validFrom: BigInt('0x' + publicInputs[16]).toString(),
    validUntil: BigInt('0x' + publicInputs[17]).toString(), amount: BigInt('0x' + publicInputs[18]).toString(), output: digest(19) };
  for (const key of ['scope', 'policy', 'output']) hex(statement[key]);
  assert.ok(uint(statement.validFrom, 64) < uint(statement.validUntil, 64), 'EVM_DELIVERY_D27_WINDOW');
  uint(statement.amount, 64, true);
  return detached(statement);
}

export function validateEvmVaultDeliveryDescriptor(descriptor) {
  exactRecord(descriptor, ['identity', 'route', 'publicInputs']);
  validateEvmVaultDeliveryIdentity(descriptor.identity);
  exactRecord(descriptor.route, ROUTE_FIELDS);
  const { route, identity } = descriptor, statement = decodeEvmVaultDepositStatement(descriptor.publicInputs);
  uint(route.assetAmount, 128, true); uint(route.shareAmount, 64, true);
  assert.equal(route.shareAmount, statement.amount, 'EVM_DELIVERY_D27_AMOUNT');
  assert.equal(identity.targetScope, statement.scope, 'EVM_DELIVERY_D27_SCOPE');
  assert.equal(identity.targetPolicy, statement.policy, 'EVM_DELIVERY_D27_POLICY');
  assert.ok(uint(route.executionFrom, 64) < uint(route.executionUntil, 64)
    && BigInt(statement.validFrom) <= BigInt(route.executionFrom)
    && BigInt(route.executionUntil) <= BigInt(statement.validUntil), 'EVM_DELIVERY_ROUTE_WINDOW');
  return detached(descriptor);
}

export function evmVaultDeliveryFrame(descriptor) {
  validateEvmVaultDeliveryDescriptor(descriptor);
  const { identity, route, publicInputs } = descriptor;
  return h4([Buffer.from(EVM_VAULT_DELIVERY_TAG, 'ascii'),
    ...EVM_VAULT_IDENTITY_FIELDS.map(([name, width, kind]) => kind === 'uint'
      ? numberBytes(identity[name], width) : hex(identity[name], width)),
    hex(EVM_VAULT_DELIVERY_SELECTOR, 4), hex(EVM_VAULT_DEPOSIT_SELECTOR, 4), numberBytes(route.assetAmount, 16),
    numberBytes(route.shareAmount, 8), numberBytes(route.executionFrom, 8), numberBytes(route.executionUntil, 8),
    Buffer.alloc(32), Buffer.concat(publicInputs.map(value => hex(value, 32, false)))]);
}
export const evmVaultDeliveryDescriptorCommitment = descriptor => sha(evmVaultDeliveryFrame(descriptor));

function callRecord(call) {
  exactRecord(call, ['descriptor', 'receiptKeyCommitment', 'proof']);
  validateEvmVaultDeliveryDescriptor(call.descriptor); hex(call.receiptKeyCommitment);
  bytes(call.proof, EVM_VAULT_DELIVERY_LIMITS.proofBytes);
  return call;
}
/** Canonical ABI only. The proof is retained, never an owner witness/key. */
export function encodeEvmVaultDeliveryCall(call) {
  callRecord(call);
  const { descriptor, receiptKeyCommitment, proof } = call, { route, publicInputs } = descriptor;
  const proofLength = proof.length / 2, proofWords = Math.ceil(proofLength / 32), headBytes = 8 * 32;
  return '0x' + EVM_VAULT_DELIVERY_SELECTOR + receiptKeyCommitment + evmVaultDeliveryDescriptorCommitment(descriptor)
    + ROUTE_FIELDS.map(key => word(route[key])).join('') + word(headBytes) + word(headBytes + 32 + proofWords * 32)
    + word(proofLength) + proof.padEnd(proofWords * 64, '0') + word(27) + publicInputs.join('');
}
export function decodeEvmVaultDeliveryCall(calldata, identity) {
  validateEvmVaultDeliveryIdentity(identity);
  const raw = bytes(calldata, EVM_VAULT_DELIVERY_LIMITS.proofBytes + 4096, true);
  assert.equal(raw.subarray(0, 4).toString('hex'), EVM_VAULT_DELIVERY_SELECTOR, 'EVM_DELIVERY_SELECTOR');
  const body = raw.subarray(4);
  const at = offset => { assert.ok(offset >= 0 && offset + 32 <= body.length, 'EVM_DELIVERY_ABI_TRUNCATED');
    return body.subarray(offset, offset + 32).toString('hex'); };
  const scalar = offset => BigInt('0x' + at(offset));
  const bound = value => { assert.ok(value <= BigInt(body.length), 'EVM_DELIVERY_ABI_OFFSET'); return Number(value); };
  const receiptKeyCommitment = at(0), expectedDescriptor = at(32);
  const route = Object.fromEntries(ROUTE_FIELDS.map((key, index) => [key, scalar(64 + index * 32).toString()]));
  const proofOffset = bound(scalar(192)), inputsOffset = bound(scalar(224));
  assert.equal(proofOffset, 256, 'EVM_DELIVERY_ABI_CANONICAL_OFFSET');
  const proofLength = bound(scalar(proofOffset));
  assert.ok(proofLength > 0 && proofLength <= EVM_VAULT_DELIVERY_LIMITS.proofBytes, 'EVM_DELIVERY_PROOF_LENGTH');
  assert.equal(inputsOffset, proofOffset + 32 + Math.ceil(proofLength / 32) * 32, 'EVM_DELIVERY_ABI_CANONICAL_OFFSET');
  assert.equal(scalar(inputsOffset), 27n, 'EVM_DELIVERY_D27_LENGTH');
  assert.equal(body.length, inputsOffset + 32 + 27 * 32, 'EVM_DELIVERY_ABI_TRAILING');
  const proof = body.subarray(proofOffset + 32, proofOffset + 32 + proofLength).toString('hex');
  const publicInputs = Array.from({ length: 27 }, (_, index) => at(inputsOffset + 32 + index * 32));
  const descriptor = { identity, route, publicInputs }, call = { descriptor, receiptKeyCommitment, proof };
  const descriptorCommitment = evmVaultDeliveryDescriptorCommitment(descriptor);
  assert.equal(expectedDescriptor, descriptorCommitment, 'EVM_DELIVERY_DESCRIPTOR');
  assert.equal(encodeEvmVaultDeliveryCall(call), calldata, 'EVM_DELIVERY_ABI_CANONICAL');
  return detached({ ...call, descriptorCommitment });
}

const LOG_FIELDS = ['address', 'topics', 'data', 'logIndex', 'removed'];
/** receipt.logs must be in receipt-local order; logIndex is RPC block-global. */
export function validateEvmVaultDeliveryReceipt(receipt, call) {
  callRecord(call);
  exactRecord(receipt, ['transactionHash', 'blockNumber', 'blockHash', 'blockTimestamp', 'status',
    'from', 'to', 'value', 'input', 'logs']);
  for (const key of ['transactionHash', 'blockHash']) hex(receipt[key]);
  uint(receipt.blockNumber, 64, true); uint(receipt.blockTimestamp, 64);
  const { descriptor, receiptKeyCommitment } = call, { identity, route } = descriptor;
  const statement = decodeEvmVaultDepositStatement(descriptor.publicInputs);
  const descriptorCommitment = evmVaultDeliveryDescriptorCommitment(descriptor);
  assert.equal(receipt.status, '1', 'EVM_DELIVERY_REVERTED');
  assert.equal(receipt.from, identity.solver, 'EVM_DELIVERY_SENDER');
  assert.equal(receipt.to, identity.router, 'EVM_DELIVERY_TARGET');
  assert.equal(receipt.value, '0', 'EVM_DELIVERY_NATIVE_VALUE');
  assert.equal(receipt.input, encodeEvmVaultDeliveryCall(call), 'EVM_DELIVERY_CALLDATA');
  assert.ok(BigInt(route.executionFrom) <= BigInt(receipt.blockTimestamp)
    && BigInt(receipt.blockTimestamp) < BigInt(route.executionUntil), 'EVM_DELIVERY_EXECUTION_WINDOW');
  assert.ok(Array.isArray(receipt.logs) && receipt.logs.length > 0 && receipt.logs.length <= 64, 'EVM_DELIVERY_LOG_COUNT');
  fixedArray(receipt.logs, receipt.logs.length);
  let previousIndex = -1n;
  for (const log of receipt.logs) {
    exactRecord(log, LOG_FIELDS); hex(log.address, 20);
    assert.ok(Array.isArray(log.topics) && log.topics.length <= 4, 'EVM_DELIVERY_LOG_TOPICS');
    fixedArray(log.topics, log.topics.length); log.topics.forEach(topic => hex(topic, 32, false));
    assert.ok(typeof log.data === 'string' && log.data.length <= 65536 && /^(?:[0-9a-f]{2})*$/.test(log.data), 'EVM_DELIVERY_LOG_DATA');
    assert.equal(log.removed, false, 'EVM_DELIVERY_LOG_REMOVED');
    const logIndex = uint(log.logIndex, 64);
    assert.ok(logIndex > previousIndex, 'EVM_DELIVERY_LOG_ORDER'); previousIndex = logIndex;
  }
  assert.equal(receipt.logs.filter(log => log.address === identity.router).length, 1, 'EVM_DELIVERY_SOLE_ROUTER_EVENT');
  const first = receipt.logs[0];
  assert.equal(first.address, identity.router, 'EVM_DELIVERY_EVENT_POSITION');
  assert.deepEqual(first.topics, [EVM_VAULT_DELIVERY_TOPIC, identity.ledgerNamespace, receiptKeyCommitment, descriptorCommitment],
    'EVM_DELIVERY_EVENT_TOPICS');
  assert.equal(first.data, statement.output + word(route.shareAmount), 'EVM_DELIVERY_EVENT_DATA');
  return detached({ transactionHash: receipt.transactionHash, blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber, blockTimestamp: receipt.blockTimestamp, descriptorCommitment,
    receiptKeyCommitment, outputCommitment: statement.output, assetAmount: route.assetAmount, shareAmount: route.shareAmount,
    effectIndex: '0', wireBindingVersion: '1', wireBindingKind: '3', wireBindingPosition: '0',
    assurance: 'supplied-receipt-consistency-only', privateSpendable: false, privateDeFiAcceptance: false });
}

const BALANCE_KEYS = ['assetSupply', 'solverAssets', 'solverShares', 'routerAssets', 'routerShares', 'routerNative',
  'vaultAssets', 'vaultShares', 'poolAssets', 'poolShares', 'poolNative', 'poolBacked'];
const COUNTER_KEYS = ['leaves', 'spent', 'reservations', 'outputs', 'sequence', 'historyCount',
  'authorizationLeaves', 'authorizationHistoryCount', 'deliveryCount'];
export const EVM_VAULT_DELIVERY_STATE_FIELDS = freeze(['snapshot', ...BALANCE_KEYS, ...COUNTER_KEYS,
  'root', 'spentDigest', 'authorizationRoot', 'commitments', 'consumedReceiptKey', 'insertedOutput',
  'solverAllowance', 'vaultAllowance', 'poolAllowance']);
function treeRoot(commitments) {
  let row = [...commitments];
  while (row.length > 1) {
    const next = [];
    for (let index = 0; index < row.length; index += 2)
      next.push(sha(Buffer.from('01' + row[index] + row[index + 1], 'hex')));
    row = next;
  }
  return row[0];
}
function state(value, output) {
  exactRecord(value, EVM_VAULT_DELIVERY_STATE_FIELDS);
  exactRecord(value.snapshot, ['blockNumber', 'blockHash', 'blockTimestamp']);
  uint(value.snapshot.blockNumber, 64); hex(value.snapshot.blockHash); uint(value.snapshot.blockTimestamp, 64);
  for (const key of BALANCE_KEYS) uint(value[key], ['routerNative', 'poolNative'].includes(key) ? 256 : 128);
  uint(value.assetSupply, 128, true);
  for (const key of COUNTER_KEYS) {
    const n = uint(value[key], key === 'sequence' ? 64 : 32);
    if (key !== 'sequence') assert.ok(n <= (key.endsWith('HistoryCount') || key === 'historyCount' ? 65n : 64n), 'EVM_DELIVERY_COUNTER_BOUND');
  }
  for (const key of ['root', 'spentDigest', 'authorizationRoot']) hex(value[key]);
  fixedArray(value.commitments, 64); value.commitments.forEach(item => hex(item, 32, false));
  const leaves = Number(value.leaves);
  assert.ok(value.commitments.slice(0, leaves).every(item => item !== ZERO)
    && value.commitments.slice(leaves).every(item => item === ZERO), 'EVM_DELIVERY_LEAF_PREFIX');
  assert.equal(new Set(value.commitments.slice(0, leaves)).size, leaves, 'EVM_DELIVERY_UNIQUE_LEAVES');
  assert.equal(treeRoot(value.commitments), value.root, 'EVM_DELIVERY_POOL_ROOT');
  for (const key of ['consumedReceiptKey', 'insertedOutput']) assert.ok(['0', '1'].includes(value[key]), 'EVM_DELIVERY_BOOL');
  assert.equal(value.insertedOutput, value.commitments.includes(output) ? '1' : '0', 'EVM_DELIVERY_INSERTION_SET');
  for (const key of ['solverAllowance', 'vaultAllowance', 'poolAllowance']) uint(value[key], 256);
  assert.ok(BigInt(value.leaves) + 4n * BigInt(value.reservations) <= 64n
    && BigInt(value.spent) + 5n * BigInt(value.reservations) + BigInt(value.outputs) <= 64n
    && BigInt(value.historyCount) <= BigInt(value.leaves) + 1n
    && BigInt(value.authorizationHistoryCount) <= BigInt(value.authorizationLeaves) + 1n, 'EVM_DELIVERY_POOL_HEADROOM');
  assert.ok(BigInt(value.poolBacked) <= 64n * MAX64 && BigInt(value.poolShares) >= BigInt(value.poolBacked), 'EVM_DELIVERY_POOL_BACKING');
  assert.ok(['solverAssets', 'routerAssets', 'vaultAssets', 'poolAssets'].reduce((sum, key) => sum + BigInt(value[key]), 0n)
    <= BigInt(value.assetSupply), 'EVM_DELIVERY_KNOWN_ASSETS');
  assert.ok(['solverShares', 'routerShares', 'poolShares'].reduce((sum, key) => sum + BigInt(value[key]), 0n)
    <= BigInt(value.vaultShares), 'EVM_DELIVERY_KNOWN_SHARES');
}

/** Supply complete historical states from adjacent, one-transaction blocks.
 * This pure function NEVER promotes supplied bytes to owned observations. */
export function inspectEvmVaultDeliveryTransition(trace) {
  exactRecord(trace, ['call', 'receipt', 'before', 'after', 'parentHash']);
  const result = validateEvmVaultDeliveryReceipt(trace.receipt, trace.call);
  const { before, after, receipt } = trace, route = trace.call.descriptor.route;
  state(before, result.outputCommitment); state(after, result.outputCommitment); hex(trace.parentHash);
  assert.equal(BigInt(after.snapshot.blockNumber), BigInt(before.snapshot.blockNumber) + 1n, 'EVM_DELIVERY_ADJACENT_BLOCKS');
  assert.equal(trace.parentHash, before.snapshot.blockHash, 'EVM_DELIVERY_PARENT_BLOCK');
  assert.equal(after.snapshot.blockNumber, receipt.blockNumber, 'EVM_DELIVERY_RECEIPT_BLOCK');
  assert.equal(after.snapshot.blockHash, receipt.blockHash, 'EVM_DELIVERY_RECEIPT_BLOCK');
  assert.equal(after.snapshot.blockTimestamp, receipt.blockTimestamp, 'EVM_DELIVERY_RECEIPT_TIME');
  assert.ok(BigInt(after.snapshot.blockTimestamp) > BigInt(before.snapshot.blockTimestamp), 'EVM_DELIVERY_TIME_ORDER');
  const a = BigInt(route.assetAmount), q = BigInt(route.shareAmount);
  assert.ok(a <= BigInt(before.solverAssets) && BigInt(before.vaultAssets) + a <= MAX128
    && BigInt(before.vaultShares) + q <= MAX128 && BigInt(before.poolBacked) + q <= 64n * MAX64,
  'EVM_DELIVERY_VALUE_HEADROOM');
  assert.equal(a * (BigInt(before.vaultShares) + 1n) / (BigInt(before.vaultAssets) + 1n), q, 'EVM_DELIVERY_EXACT_VAULT_PREVIEW');
  const deltas = { solverAssets: -a, vaultAssets: a, vaultShares: q, poolShares: q, poolBacked: q,
    leaves: 1n, outputs: 1n, sequence: 1n, historyCount: 1n, deliveryCount: 1n };
  for (const key of [...BALANCE_KEYS, ...COUNTER_KEYS])
    assert.equal(BigInt(after[key]), BigInt(before[key]) + (deltas[key] ?? 0n), 'EVM_DELIVERY_EXACT_DELTA_' + key);
  for (const key of ['spentDigest', 'authorizationRoot']) assert.equal(after[key], before[key], 'EVM_DELIVERY_UNCHANGED_' + key);
  assert.notEqual(after.root, before.root, 'EVM_DELIVERY_NEW_ROOT');
  const expectedLeaves = [...before.commitments]; expectedLeaves[Number(before.leaves)] = result.outputCommitment;
  assert.deepEqual(after.commitments, expectedLeaves, 'EVM_DELIVERY_EXACT_INSERTION');
  assert.equal(before.consumedReceiptKey, '0', 'EVM_DELIVERY_K_REPLAY');
  assert.equal(before.insertedOutput, '0', 'EVM_DELIVERY_Q_REPLAY');
  assert.equal(after.consumedReceiptKey, '1', 'EVM_DELIVERY_K_NOT_CONSUMED');
  assert.equal(after.insertedOutput, '1', 'EVM_DELIVERY_Q_NOT_INSERTED');
  assert.equal(before.solverAllowance, route.assetAmount, 'EVM_DELIVERY_EXACT_SOLVER_ALLOWANCE');
  for (const key of ['vaultAllowance', 'poolAllowance']) assert.equal(before[key], '0', 'EVM_DELIVERY_PREEXISTING_ALLOWANCE');
  for (const key of ['solverAllowance', 'vaultAllowance', 'poolAllowance']) assert.equal(after[key], '0', 'EVM_DELIVERY_UNRESOLVED_ALLOWANCE');
  return detached({ ...result, before, after, assurance: 'supplied-historical-state-consistency-only',
    privateSpendable: false, privateDeFiAcceptance: false });
}
