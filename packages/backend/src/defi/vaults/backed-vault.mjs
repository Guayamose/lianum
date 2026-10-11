/** Bounded local vault codecs. These functions establish byte/accounting
 * consistency only: no RPC, signing, finality, authorization or private credit.
 * Identity and observations must originate at a trusted private bootstrap.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';

const MAX = (1n << 128n) - 1n;
const ZERO_ADDRESS = '0'.repeat(40);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const VAULT_ACTION_TAG = sha('LIANUM_BACKED_VAULT_ACTION_V1');
export const VAULT_LIMITS = Object.freeze({ amount: MAX.toString(), quoteLifetime: '300', chainId: '31337' });
export const VAULT_TOPICS = Object.freeze({
  transfer: 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  deposit: 'dcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7',
  withdraw: 'fbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db',
  action: '3b604ea14d36ab803db0c09e6c6b75e9858773d213fb86a4f9bba71789095080',
});
export const VAULT_EXECUTE_SELECTOR = '2d6039fb';
const IDENTITY = ['chainId', 'genesisHash', 'domain', 'runtimeId', 'asset', 'assetCodeSHA256', 'vault', 'vaultCodeSHA256'];
const SNAPSHOT = ['blockNumber', 'blockHash', 'blockTimestamp', 'totalAssets', 'totalShares'];
const ACTION = ['identity', 'kind', 'sender', 'owner', 'receiver', 'amount', 'previewOutput', 'minimumOutput', 'deadline', 'nonce', 'quote'];
function immutable(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
function hex(value, bytes = 32, nonzero = true) {
  assert.ok(typeof value === 'string' && value.length === bytes * 2
    && new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value), 'VAULT_CANONICAL_HEX');
  assert.ok(!nonzero || /[1-9a-f]/.test(value), 'VAULT_NONZERO');
  return value;
}
function uint(value, bits = 128, positive = false) {
  assert.ok(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value), 'VAULT_CANONICAL_UINT');
  const n = BigInt(value);
  assert.equal(n.toString(), value, 'VAULT_CANONICAL_UINT');
  assert.ok(n < (1n << BigInt(bits)) && (!positive || n > 0n), 'VAULT_UINT_RANGE');
  return n;
}
const word = number => BigInt(number).toString(16).padStart(64, '0');
const addressWord = address => hex(address, 20, false).padStart(64, '0');
function identityWords(identity) {
  exactRecord(identity, IDENTITY);
  assert.equal(identity.chainId, VAULT_LIMITS.chainId, 'VAULT_LOCAL_CHAIN_ONLY');
  for (const name of ['genesisHash', 'domain', 'runtimeId', 'assetCodeSHA256', 'vaultCodeSHA256']) hex(identity[name]);
  hex(identity.asset, 20); hex(identity.vault, 20);
  assert.notEqual(identity.asset, identity.vault, 'VAULT_DISTINCT_ASSET');
  return [word(identity.chainId), identity.genesisHash, identity.domain, identity.runtimeId,
    addressWord(identity.asset), identity.assetCodeSHA256, addressWord(identity.vault), identity.vaultCodeSHA256];
}
export function validateVaultIdentity(identity) {
  identityWords(identity); return immutable(structuredClone(identity));
}
function snapshot(value) {
  exactRecord(value, SNAPSHOT);
  uint(value.blockNumber, 64); hex(value.blockHash); uint(value.blockTimestamp, 64, true);
  return { assets: uint(value.totalAssets), shares: uint(value.totalShares) };
}
function totals(value) {
  exactRecord(value, ['totalAssets', 'totalShares']);
  return { assets: uint(value.totalAssets), shares: uint(value.totalShares) };
}
function preview(kind, amount, state) {
  const n = uint(amount), { assets, shares } = totals(state);
  // One virtual asset/share affects conversion only. Neither is minted or
  // included in the real balances, totalAssets or totalShares.
  const result = kind === 'deposit' ? n * (shares + 1n) / (assets + 1n)
    : n * (assets + 1n) / (shares + 1n);
  assert.ok(result <= MAX, 'VAULT_PREVIEW_RANGE');
  return result.toString();
}
export const previewVaultDeposit = (assets, state) => preview('deposit', assets, state);
export const previewVaultRedeem = (shares, state) => preview('redeem', shares, state);
const totalsOf = state => ({ totalAssets: state.totalAssets, totalShares: state.totalShares });

function actionWords(action) {
  exactRecord(action, ACTION); identityWords(action.identity);
  assert.ok(['deposit', 'redeem'].includes(action.kind), 'VAULT_ACTION_KIND');
  for (const name of ['sender', 'owner', 'receiver']) {
    hex(action[name], 20);
    assert.notEqual(action[name], action.identity.vault, 'VAULT_SELF_RECIPIENT');
    assert.notEqual(action[name], action.identity.asset, 'VAULT_ASSET_RECIPIENT');
  }
  // This adapter's bounded route spends only the transaction sender's assets
  // or shares. The fixture's standard ERC4626 methods remain separate.
  assert.equal(action.sender, action.owner, 'VAULT_OWNER_AUTHORIZATION');
  uint(action.amount, 128, true); uint(action.previewOutput, 128, true);
  const minimum = uint(action.minimumOutput, 128, true), deadline = uint(action.deadline, 64, true);
  hex(action.nonce); const quote = snapshot(action.quote);
  assert.equal(action.previewOutput, preview(action.kind, action.amount, totalsOf(action.quote)), 'VAULT_PREVIEW_MISMATCH');
  assert.ok(minimum <= BigInt(action.previewOutput), 'VAULT_MINIMUM_ABOVE_PREVIEW');
  const timestamp = BigInt(action.quote.blockTimestamp);
  assert.ok(deadline > timestamp && deadline - timestamp <= 300n, 'VAULT_DEADLINE_WINDOW');
  if (action.kind === 'deposit') {
    assert.ok(quote.assets + BigInt(action.amount) <= MAX
      && quote.shares + BigInt(action.previewOutput) <= MAX, 'VAULT_CAPACITY');
  } else assert.ok(BigInt(action.amount) <= quote.shares && BigInt(action.previewOutput) <= quote.assets, 'VAULT_REDEEM_BACKING');
  return [word(action.kind === 'deposit' ? 1 : 2), addressWord(action.sender), addressWord(action.owner),
    addressWord(action.receiver), word(action.amount), word(action.previewOutput), word(action.minimumOutput),
    word(action.deadline), action.nonce, word(action.quote.blockNumber), action.quote.blockHash,
    word(action.quote.blockTimestamp), word(action.quote.totalAssets), word(action.quote.totalShares)];
}
/** ABI-encoded fixed-width action commitment preimage, bare lowercase hex. */
export function encodeVaultAction(action) {
  const body = actionWords(action);
  return [VAULT_ACTION_TAG, ...identityWords(action.identity), ...body].join('');
}
export const vaultActionCommitment = action => sha(Buffer.from(encodeVaultAction(action), 'hex'));
/** Unsigned call data only. This function neither grants approval nor sends. */
export function encodeVaultCall(action) {
  return VAULT_EXECUTE_SELECTOR + actionWords(action).join('') + vaultActionCommitment(action);
}
/** Explicit caller minimumOutput is required; no default slippage or approval. */
export function prepareVaultAction(input) {
  exactRecord(input, ['identity', 'kind', 'sender', 'owner', 'receiver', 'amount', 'minimumOutput', 'deadline', 'nonce', 'quote']);
  snapshot(input.quote);
  assert.ok(['deposit', 'redeem'].includes(input.kind), 'VAULT_ACTION_KIND');
  const action = { ...input, previewOutput: preview(input.kind, input.amount, totalsOf(input.quote)) };
  actionWords(action); return immutable(structuredClone(action));
}

/** Read observation only; supplied balances are not authenticated chain state. */
export function observeVaultPosition(input) {
  exactRecord(input, ['identity', 'owner', 'shares', 'snapshot']);
  identityWords(input.identity); hex(input.owner, 20);
  const state = snapshot(input.snapshot), shares = uint(input.shares);
  assert.ok(shares <= state.shares, 'VAULT_POSITION_SUPPLY');
  const assets = previewVaultRedeem(input.shares, totalsOf(input.snapshot));
  assert.ok(BigInt(assets) <= state.assets, 'VAULT_POSITION_BACKING');
  return immutable({ ...structuredClone(input), redeemableAssets: assets, rounding: 'down',
    assurance: 'supplied-state-consistency-only', privateSpendable: false });
}

function logRecord(value) {
  exactRecord(value, ['address', 'topics', 'data', 'logIndex', 'removed']);
  hex(value.address, 20); uint(value.logIndex, 64); assert.equal(value.removed, false, 'VAULT_REMOVED_LOG');
  assert.ok(Array.isArray(value.topics) && !types.isProxy(value.topics)
    && value.topics.length >= 1 && value.topics.length <= 4, 'VAULT_LOG_TOPICS');
  fixedArray(value.topics, value.topics.length); value.topics.forEach(topic => hex(topic, 32, false));
  assert.ok(typeof value.data === 'string' && value.data.length <= 7 * 64 && value.data.length % 64 === 0
    && /^(?:[0-9a-f]{64})*$/.test(value.data), 'VAULT_LOG_DATA');
}
function assertLog(log, address, topics, words) {
  assert.equal(log.address, address, 'VAULT_LOG_ADDRESS');
  assert.deepEqual(log.topics, topics, 'VAULT_LOG_TOPICS');
  assert.equal(log.data, words.join(''), 'VAULT_LOG_VALUES');
}
/** Exact fixture transaction/log consistency, not receipt inclusion or finality.
 * A trusted runtime must authenticate the chain/code, transaction, receipt and
 * canonical block. Do not promote the returned observation to private value.
 */
export function validateVaultReceipt(receipt, action) {
  actionWords(action);
  exactRecord(receipt, ['identity', 'transactionHash', 'blockNumber', 'blockHash', 'blockTimestamp',
    'status', 'from', 'to', 'input', 'logs']);
  identityWords(receipt.identity); assert.deepEqual(receipt.identity, action.identity, 'VAULT_RECEIPT_IDENTITY');
  hex(receipt.transactionHash); hex(receipt.blockHash);
  assert.equal(receipt.status, '1', 'VAULT_RECEIPT_STATUS');
  assert.equal(receipt.from, action.sender, 'VAULT_RECEIPT_SENDER');
  assert.equal(receipt.to, action.identity.vault, 'VAULT_RECEIPT_TARGET');
  assert.equal(receipt.input, encodeVaultCall(action), 'VAULT_RECEIPT_CALL');
  const height = uint(receipt.blockNumber, 64), timestamp = uint(receipt.blockTimestamp, 64, true);
  assert.ok(height > BigInt(action.quote.blockNumber) && height - BigInt(action.quote.blockNumber) <= 256n, 'VAULT_QUOTE_BLOCK_WINDOW');
  assert.ok(timestamp >= BigInt(action.quote.blockTimestamp) && timestamp <= BigInt(action.deadline), 'VAULT_RECEIPT_DEADLINE');
  fixedArray(receipt.logs, 4); receipt.logs.forEach(logRecord);
  for (let i = 1; i < 4; i++) assert.ok(BigInt(receipt.logs[i].logIndex) === BigInt(receipt.logs[i - 1].logIndex) + 1n, 'VAULT_LOG_ORDER');
  const event = receipt.logs[3];
  assert.equal(event.data.length, 7 * 64, 'VAULT_ACTION_EVENT_LENGTH');
  const [kind, assets, shares, beforeAssets, beforeShares, afterAssets, afterShares] =
    event.data.match(/.{64}/g).map(part => BigInt('0x' + part));
  for (const value of [assets, shares, beforeAssets, beforeShares, afterAssets, afterShares])
    assert.ok(value <= MAX, 'VAULT_EVENT_RANGE');
  assert.ok(assets > 0n && shares > 0n, 'VAULT_EVENT_ZERO');
  const deposit = action.kind === 'deposit';
  assert.equal(kind, deposit ? 1n : 2n, 'VAULT_EVENT_KIND');
  assert.equal((deposit ? assets : shares).toString(), action.amount, 'VAULT_EVENT_AMOUNT');
  assert.ok((deposit ? shares : assets) >= BigInt(action.minimumOutput), 'VAULT_EVENT_SLIPPAGE');
  const state = { totalAssets: beforeAssets.toString(), totalShares: beforeShares.toString() };
  assert.equal((deposit ? shares : assets).toString(), preview(action.kind, action.amount, state), 'VAULT_EVENT_CONVERSION');
  assert.equal(afterAssets, deposit ? beforeAssets + assets : beforeAssets - assets, 'VAULT_ASSET_CONSERVATION');
  assert.equal(afterShares, deposit ? beforeShares + shares : beforeShares - shares, 'VAULT_SHARE_CONSERVATION');
  const id = action.identity, w = addressWord, transfer = VAULT_TOPICS.transfer;
  if (deposit) {
    assertLog(receipt.logs[0], id.asset, [transfer, w(action.sender), w(id.vault)], [word(assets)]);
    assertLog(receipt.logs[1], id.vault, [transfer, w(ZERO_ADDRESS), w(action.receiver)], [word(shares)]);
    assertLog(receipt.logs[2], id.vault, [VAULT_TOPICS.deposit, w(action.sender), w(action.receiver)], [word(assets), word(shares)]);
  } else {
    assertLog(receipt.logs[0], id.vault, [transfer, w(action.owner), w(ZERO_ADDRESS)], [word(shares)]);
    assertLog(receipt.logs[1], id.asset, [transfer, w(id.vault), w(action.receiver)], [word(assets)]);
    assertLog(receipt.logs[2], id.vault, [VAULT_TOPICS.withdraw, w(action.sender), w(action.receiver), w(action.owner)], [word(assets), word(shares)]);
  }
  const commitment = vaultActionCommitment(action);
  assertLog(event, id.vault, [VAULT_TOPICS.action, commitment, action.nonce],
    [kind, assets, shares, beforeAssets, beforeShares, afterAssets, afterShares].map(word));
  return immutable({ actionCommitment: commitment, kind: action.kind, transactionHash: receipt.transactionHash,
    blockHash: receipt.blockHash, blockNumber: receipt.blockNumber, assets: assets.toString(), shares: shares.toString(),
    snapshot: { blockHash: receipt.blockHash, blockNumber: receipt.blockNumber, blockTimestamp: receipt.blockTimestamp,
      totalAssets: afterAssets.toString(), totalShares: afterShares.toString() },
    assurance: 'exact-call-and-receipt-consistency-only', privateSpendable: false });
}
