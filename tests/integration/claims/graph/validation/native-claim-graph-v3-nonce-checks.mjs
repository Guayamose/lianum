/** Fixed full-route nonce evidence checks. These pure assertions never confer
 * owned-runtime authority and do not change custody/backing predicates. */
import assert from 'node:assert/strict';
import { auditDualNonceInfrastructure, auditDualNonceInventory } from '../../../../../packages/backend/src/claims/ingress/ingress-v3-host.mjs';
import { ownedCustodyFeeAudit } from '../../../../../packages/backend/src/chains/shared/runtime/owned-native-custody.mjs';
import { validateSolanaNonceBindingTransaction, validateSolanaNonceBootstrapTransaction }
  from '../../../../../packages/backend/src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
export const CLAIM_GRAPH_V3_NATIVE_PROTOCOL = Object.freeze({ ingressWireBindingVersion: '2', ingressAdvanceNoncePosition: '0',
  ingressEffectIndex: '1', ingressMemoPosition: '2', payoutWireBindingVersion: '2', payoutAdvanceNoncePosition: '0',
  payoutEffectIndex: '1', payoutMemoPosition: '2', graphWireBindingVersion: '1', graphEffectIndex: '0', graphMemoPosition: '1' });

export function checkClaimGraphV3Inventory(inventory, native, config, transfers = native.transfers) {
  const excluded = auditDualNonceInfrastructure(inventory.nonceInfrastructureByAuthority, native.roles, native.nonceInfrastructureByAuthority);
  const backing = auditDualNonceInventory(inventory, config, native.roles, native.nonceInfrastructureByAuthority);
  assert.deepEqual(inventory.accounts.map(a => a.role).sort(), ['depositor', 'escrow', 'recipient']);
  assert.deepEqual(ownedCustodyFeeAudit(inventory.feeAudit.transfers), inventory.feeAudit);
  assert.deepEqual(inventory.feeAudit.transfers.map(row => row.nativeId), transfers.map(row => row.nativeId));
  for (const pin of Object.values(native.nonceInfrastructureByAuthority)) {
    assert.ok(!transfers.some(row => row.nativeId === pin.bootstrapNativeId), 'CLAIM_GRAPH_V3_BOOTSTRAP_NOT_ECONOMIC');
    assert.ok(!inventory.feeAudit.transfers.some(row => row.nativeId === pin.bootstrapNativeId));
  }
  assert.equal(backing.nativeTotal, inventory.escrow.total);
  assert.equal(backing.nativePrincipalAvailable, '0');
  assert.equal(BigInt(backing.feeReserveAvailable), BigInt(inventory.syntheticPrefunding.amount)
    - BigInt(inventory.feeAudit.escrowActualFees) - BigInt(inventory.escrow.rentExemptMinimum));
  assert.equal(BigInt(backing.depositorActualFees), BigInt(inventory.feeAudit.actualFees) - BigInt(inventory.feeAudit.escrowActualFees));
  assert.equal(backing.depositorUnresolvedPreparedFees, '0');
  return excluded.infrastructure;
}

export function checkClaimGraphV3Bootstrap(initialInventory, native, config) {
  const infrastructure = checkClaimGraphV3Inventory(initialInventory, native, config, []);
  assert.deepEqual(Object.keys(native.nonceBootstrapByAuthority).sort(), ['depositor', 'escrow']);
  for (const role of ['depositor', 'escrow']) {
    const bootstrap = native.nonceBootstrapByAuthority[role], pin = infrastructure[role];
    const decoded = validateSolanaNonceBootstrapTransaction(bootstrap.nativeWire, bootstrap.intent);
    assert.equal(bootstrap.authorityRole, role); assert.equal(bootstrap.phase, 'OBSERVED_FINALIZED'); assert.equal(bootstrap.broadcastAttempts, 1);
    assert.equal(decoded.signatureHex, bootstrap.nativeId); assert.equal(decoded.transactionSHA256, bootstrap.transactionSHA256);
    assert.equal(pin.bootstrapNativeId, bootstrap.nativeId); assert.equal(pin.bootstrapTransactionSHA256, bootstrap.transactionSHA256);
    assert.equal(bootstrap.intent.authorityPublicKey, native.roles[role].endpoint);
    assert.equal(bootstrap.intent.payerPublicKey, pin.payerPublicKey); assert.equal(bootstrap.intent.nonceAccountPublicKey, pin.nonceAccountPublicKey);
    assert.equal(bootstrap.intent.rentLamports, pin.bootstrapRentLamports);
    const observed = bootstrap.observation; assert.ok(observed);
    assert.equal(observed.nativeId, bootstrap.nativeId); assert.equal(observed.nativeWire, bootstrap.nativeWire);
    assert.equal(observed.transactionSHA256, bootstrap.transactionSHA256); assert.deepEqual(observed.intent, bootstrap.intent);
    assert.equal(observed.genesis, initialInventory.genesis); assert.equal(observed.feeLamports, bootstrap.preparedFee);
    assert.equal(observed.sourceBefore, pin.genesisGrant); assert.equal(observed.sourceAfter, pin.payerBalance);
    assert.equal(observed.recipientBefore, '0'); assert.equal(observed.recipientAfter, pin.bootstrapRentLamports);
    assert.equal(observed.feeLamports, pin.bootstrapFeeLamports);
  }
  assert.equal(initialInventory.feeAudit.actualFees, '0');
  return { profile: 'SYNTHETIC_DUAL_NONCE_INFRASTRUCTURE_NOT_USER_BACKING', bootstrapFinalized: true,
    bootstrapBroadcastOnce: true, independentBootstrapCount: 2, createInstruction: 0, initializeInstruction: 1,
    separatePayers: true, depositorAndEscrowAuthorities: true, claimAccountCount: 3, infrastructureAccountCount: 4,
    rentExcludedFromUserBacking: true, bootstrapFeeExcludedFromClaimFees: true, bootstrapExcludedFromClaimTransfers: true,
    depositorFeesSeparateFromEscrowReserve: true, nonceAdvancedWithObservedIngress: false, nonceAdvancedWithObservedPayout: false };
}

export function checkClaimGraphV3Transfers(initialInventory, finalInventory, native, config) {
  const infrastructure = checkClaimGraphV3Inventory(finalInventory, native, config);
  const transfers = native.transfers;
  assert.deepEqual(transfers.map(row => row.route), ['deposit', 'redeem', 'redeem', 'deposit', 'refund']);
  assert.deepEqual(transfers.map(row => row.intent.lamports), ['3000000', '1800000', '1200000', '2000000', '2000000']);
  assert.equal(new Set(transfers.map(row => row.nativeId)).size, 5);
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
  assert.equal(nonces.depositor.size, 2); assert.equal(nonces.escrow.size, 3);
  // Both deposits and the refund are exact principal movements. Depositor fees
  // never reduce escrow backing or its synthetic payout-fee reserve.
  const account = (inventory, role) => BigInt(inventory.accounts.find(a => a.role === role).total);
  const depositorFees = BigInt(finalInventory.feeAudit.actualFees) - BigInt(finalInventory.feeAudit.escrowActualFees);
  assert.equal(account(finalInventory, 'depositor'), account(initialInventory, 'depositor') - 3000000n - depositorFees);
  assert.equal(account(finalInventory, 'recipient'), account(initialInventory, 'recipient') + 3000000n);
  assert.equal(account(finalInventory, 'escrow'), account(initialInventory, 'escrow') - BigInt(finalInventory.feeAudit.escrowActualFees));
  return { nonceAdvancedWithObservedIngress: true, nonceAdvancedWithObservedPayout: true };
}
