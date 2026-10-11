/** Fixed synthetic local custody topology. Pure helpers grant no runtime,
 * signer, RPC or backing authority. These are opt-in to the custody factories.
 */
import assert from 'node:assert/strict';
import { exactRecord, bytes32 } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";

export const OWNED_CUSTODY_ROUTES = frozenInput({
  deposit: { sourceRole: 'depositor', destinationRole: 'escrow', recipientIndex: 0 },
  refund: { sourceRole: 'escrow', destinationRole: 'depositor', recipientIndex: 0 },
  redeem: { sourceRole: 'escrow', destinationRole: 'recipient', recipientIndex: 1 },
});
export const OWNED_CUSTODY_ROLES = Object.freeze(['depositor', 'escrow', 'recipient']);
export function ownedCustodyRoute(name) {
  assert.ok(typeof name === 'string' && Object.hasOwn(OWNED_CUSTODY_ROUTES, name), 'CUSTODY_FIXED_ROUTE');
  return OWNED_CUSTODY_ROUTES[name];
}
export function assertOwnedCustodyIntent(routeName, roles, family, intent) {
  const route = ownedCustodyRoute(routeName);
  const source = roles[route.sourceRole].endpoint, recipient = roles[route.destinationRole].endpoint;
  assert.notEqual(source, recipient, 'CUSTODY_DISTINCT_ENDPOINTS');
  if (family === '1') {
    assert.equal(intent.sourceScript, source, 'CUSTODY_SOURCE_ROLE');
    assert.equal(intent.recipientScript, recipient, 'CUSTODY_DESTINATION_ROLE');
    assert.equal(intent.changeScript, source, 'CUSTODY_CHANGE_ROLE');
  } else {
    assert.equal(family, '2', 'CUSTODY_FAMILY');
    assert.equal(intent.sourcePublicKey, source, 'CUSTODY_SOURCE_ROLE');
    assert.equal(intent.recipientPublicKey, recipient, 'CUSTODY_DESTINATION_ROLE');
  }
}
/** Arithmetic only; caller must obtain these exact fields through fresh owned
 * reads. No liabilities or synthetic funding are promoted into user backing.
 */
export function summarizeOwnedBitcoinCoins(raw) {
  const coins = cloneInput(raw); assert.ok(Array.isArray(coins), 'CUSTODY_UTXO_ARRAY');
  const seen = new Set(); let total = 0n, spendable = 0n, largest = 0n, unlockedSpendable = 0n;
  for (const coin of coins) {
    exactRecord(coin, ['txid', 'vout', 'script', 'amount', 'confirmations', 'spendable', 'solvable', 'safe', 'locked', 'coinbase']);
    assert.match(coin.txid, /^[0-9a-f]{64}$/); assert.match(coin.script, /^0014[0-9a-f]{40}$/);
    inputUint(coin.vout, 32); const amount = inputUint(coin.amount), confirmations = inputUint(coin.confirmations);
    for (const field of ['spendable', 'solvable', 'safe', 'locked', 'coinbase']) assert.equal(typeof coin[field], 'boolean');
    const outpoint = coin.txid + ':' + coin.vout; assert.ok(!seen.has(outpoint), 'CUSTODY_DUPLICATE_UTXO'); seen.add(outpoint);
    total += amount;
    if (coin.spendable && coin.solvable && coin.safe && confirmations >= 6n
      && (!coin.coinbase || confirmations >= 101n)) { spendable += amount; if (!coin.locked) unlockedSpendable += amount; if (amount > largest) largest = amount; }
  }
  return frozenInput({ total: total.toString(), spendable: spendable.toString(), unlockedSpendable: unlockedSpendable.toString(), largestSpendableUtxo: largest.toString() });
}
export function ownedCustodyFeeAudit(raw) {
  const transfers = cloneInput(raw); assert.ok(Array.isArray(transfers), 'CUSTODY_TRANSFER_ARRAY');
  let actual = 0n, escrowActual = 0n, unresolvedMaximum = 0n;
  for (const transfer of transfers) {
    exactRecord(transfer, ['nativeId', 'route', 'phase', 'amount', 'preparedFee', 'actualFee', 'broadcastAttempts']);
    ownedCustodyRoute(transfer.route); inputUint(transfer.amount); const prepared = inputUint(transfer.preparedFee);
    assert.ok(transfer.broadcastAttempts === 0 || transfer.broadcastAttempts === 1, 'CUSTODY_BROADCAST_COUNT');
    if (transfer.actualFee !== null) {
      const fee = inputUint(transfer.actualFee); assert.equal(fee, prepared, 'CUSTODY_OBSERVED_FEE_CHANGED');
      actual += fee; if (transfer.route !== 'deposit') escrowActual += fee;
    } else if (transfer.route !== 'deposit') unresolvedMaximum += prepared;
  }
  return frozenInput({ actualFees: actual.toString(), escrowActualFees: escrowActual.toString(),
    unresolvedEscrowPreparedFees: unresolvedMaximum.toString(), transfers });
}

/** Nonce rent and bootstrap costs are separate synthetic infrastructure. This
 * arithmetic cannot establish RPC provenance or make it claim principal. */
export function auditOwnedSolanaNonceInfrastructure(raw) {
  const value = cloneInput(raw);
  exactRecord(value, ['classification', 'genesisGrant', 'payerPublicKey', 'nonceAccountPublicKey',
    'authorityPublicKey', 'bootstrapNativeId', 'bootstrapTransactionSHA256', 'bootstrapRentLamports',
    'bootstrapFeeLamports', 'bootstrapBroadcastAttempts', 'payerBalance', 'nonceAccount', 'nonceRentExemptMinimum']);
  assert.equal(value.classification, 'SYNTHETIC_NONCE_INFRASTRUCTURE_NOT_USER_BACKING', 'CUSTODY_NONCE_CLASSIFICATION');
  for (const field of ['payerPublicKey', 'nonceAccountPublicKey', 'authorityPublicKey', 'bootstrapTransactionSHA256']) bytes32(value[field], true);
  assert.match(value.bootstrapNativeId, /^[0-9a-f]{128}$/); assert.notEqual(value.bootstrapNativeId, '0'.repeat(128));
  assert.equal(new Set([value.payerPublicKey, value.nonceAccountPublicKey, value.authorityPublicKey]).size, 3,
    'CUSTODY_NONCE_DISTINCT_ACCOUNTS');
  assert.equal(value.bootstrapBroadcastAttempts, 1, 'CUSTODY_NONCE_BOOTSTRAP_SEND_COUNT');
  const grant = inputUint(value.genesisGrant), rent = inputUint(value.bootstrapRentLamports), fee = inputUint(value.bootstrapFeeLamports);
  assert.ok(rent > 0n && fee > 0n && grant > rent + fee, 'CUSTODY_NONCE_BOOTSTRAP_FUNDING');
  assert.equal(inputUint(value.payerBalance), grant - rent - fee, 'CUSTODY_NONCE_BOOTSTRAP_BALANCE');
  const account = value.nonceAccount;
  exactRecord(account, ['publicKey', 'owner', 'executable', 'lamports', 'authorityPublicKey', 'durableNonce', 'lamportsPerSignature']);
  assert.equal(account.publicKey, value.nonceAccountPublicKey, 'CUSTODY_NONCE_ACCOUNT');
  assert.equal(account.authorityPublicKey, value.authorityPublicKey, 'CUSTODY_NONCE_AUTHORITY');
  assert.equal(account.owner, '0'.repeat(64)); assert.equal(account.executable, false);
  bytes32(account.durableNonce, true); inputUint(account.lamportsPerSignature);
  assert.equal(inputUint(account.lamports), rent, 'CUSTODY_NONCE_RENT_CHANGED');
  const minimum = inputUint(value.nonceRentExemptMinimum);
  assert.ok(minimum > 0n && rent >= minimum, 'CUSTODY_NONCE_RENT_MINIMUM');
  return frozenInput(value);
}

/** Private runtime bookkeeping for the already-persisted, not-yet-broadcast
 * reservation callback. This helper grants no read/sign/broadcast capability;
 * actual runtimes additionally hold their writer and serial-read guards.
 */
export function createOwnedCustodyReservationReadWindow() {
  let active = false;
  return Object.freeze({
    get active() { return active; },
    allowsObservation(phase) {
      return active && (phase === 'OBSERVED_CONFIRMED' || phase === 'OBSERVED_FINALIZED');
    },
    async run(callback, assertReadsIdle) {
      assert.equal(typeof callback, 'function', 'CUSTODY_RESERVATION_CALLBACK');
      assert.equal(typeof assertReadsIdle, 'function', 'CUSTODY_RESERVATION_READ_GUARD');
      assert.ok(!active, 'CUSTODY_RESERVATION_WINDOW_ALREADY_ACTIVE');
      assertReadsIdle(); active = true;
      try { return await callback(); }
      finally { active = false; assertReadsIdle(); }
    },
  });
}
