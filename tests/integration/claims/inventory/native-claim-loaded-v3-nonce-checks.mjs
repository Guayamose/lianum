/** Fixed two-effect V3 loaded redemption checks; no source or nonce substitution. */
import assert from 'node:assert/strict';
import { checkClaimGraphV3Inventory } from '../graph/validation/native-claim-graph-v3-nonce-checks.mjs';
import { validateSolanaNonceBindingTransaction } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
export function checkClaimLoadedV3Transfers(initialInventory, finalInventory, native, config) {
  const infrastructure = checkClaimGraphV3Inventory(finalInventory, native, config);
  const transfers = native.transfers;
  assert.deepEqual(transfers.map(row => row.route), ['deposit', 'redeem']);
  assert.deepEqual(transfers.map(row => row.intent.lamports), ['3000000', '3000000']);
  assert.equal(new Set(transfers.map(row => row.nativeId)).size, 2);
  const nonces = { depositor: new Set(), escrow: new Set() };
  for (const row of transfers) {
    const role = row.route === 'deposit' ? 'depositor' : 'escrow', pin = infrastructure[role];
    const decoded = validateSolanaNonceBindingTransaction(row.nativeWire, row.intent);
    assert.equal(decoded.signatureHex, row.nativeId); assert.equal(decoded.transactionSHA256, row.transactionSHA256);
    assert.equal(row.phase, 'OBSERVED_FINALIZED'); assert.equal(row.broadcastAttempts, 1); assert.ok(row.observation);
    assert.equal(row.observation.nativeWire, row.nativeWire); assert.equal(row.observation.nativeId, row.nativeId);
    assert.equal(row.observation.transactionSHA256, row.transactionSHA256); assert.deepEqual(row.observation.intent, row.intent);
    assert.deepEqual([decoded.wireBindingVersion, decoded.effectIndex, decoded.wireBindingPosition], ['2', '1', '2']);
    assert.equal(row.intent.sourcePublicKey, native.roles[role].endpoint);
    assert.equal(row.intent.recipientPublicKey, native.roles[row.route === 'deposit' ? 'escrow' : row.route === 'refund' ? 'depositor' : 'recipient'].endpoint);
    assert.equal(row.intent.nonceAccountPublicKey, pin.nonceAccountPublicKey);
    if (nonces[role].size === 0) assert.equal(row.intent.durableNonce, initialInventory.nonceInfrastructureByAuthority[role].nonceAccount.durableNonce);
    assert.ok(!nonces[role].has(row.intent.durableNonce), 'CLAIM_GRAPH_V3_ORIGINAL_NONCE_REUSE'); nonces[role].add(row.intent.durableNonce);
    assert.notEqual(pin.nonceAccount.durableNonce, row.intent.durableNonce);
    assert.ok(BigInt(finalInventory.nativeHead.slot) >= BigInt(row.observation.transactionSlot));
  }
  assert.equal(nonces.depositor.size, 1); assert.equal(nonces.escrow.size, 1);
  // The deposit and full-source redemption are exact principal movements. Depositor fees
  // never reduce escrow backing or its synthetic payout-fee reserve.
  const account = (inventory, role) => BigInt(inventory.accounts.find(a => a.role === role).total);
  const depositorFees = BigInt(finalInventory.feeAudit.actualFees) - BigInt(finalInventory.feeAudit.escrowActualFees);
  assert.equal(account(finalInventory, 'depositor'), account(initialInventory, 'depositor') - 3000000n - depositorFees);
  assert.equal(account(finalInventory, 'recipient'), account(initialInventory, 'recipient') + 3000000n);
  assert.equal(account(finalInventory, 'escrow'), account(initialInventory, 'escrow') - BigInt(finalInventory.feeAudit.escrowActualFees));
  return { nonceAdvancedWithObservedIngress: true, nonceAdvancedWithObservedPayout: true };
}
