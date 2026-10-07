/** Pure functional checks and public projection. Native wires and account
 * identifiers stay exclusively in the excluded local private audit. */
import assert from 'node:assert/strict';
import { validateSolanaBindingTransaction, MEMO_PROGRAM } from '../wallet-platform/modules/chain-adapters/native-receipt-binding.mjs';
import { validateSolanaNonceBindingTransaction, validateSolanaNonceBootstrapTransaction } from '../wallet-platform/modules/chain-adapters/owned-solana-nonce-binding.mjs';
import { auditOwnedSolanaNonceInfrastructure } from '../wallet-platform/modules/chain-adapters/owned-native-custody.mjs';

export const ACCEPTANCE_AMOUNTS = Object.freeze({ deposit: '1000000', redeem: '1000000', solver: '250000' });
// This fixed path must match the separately reviewed source-selected candidate
// pin. Byte-identical reproduction may legitimately retain a historical digest;
// the original factory still verifies the exact source-pinned file hash.
export const SOLANA_CANDIDATE_ACCEPTANCE_PATH = 'agave-v2.3.13-loopback-memtable128m-candidate-20261005/solana-test-validator';
export function checkCandidateMetadata(metadata) {
  assert.equal(metadata.officialSourceVersion, '2.3.13');
  assert.equal(metadata.sourceCommit, '5466f4592b1983adb13ba0a5d53f41ea2de69fba');
  assert.equal(metadata.slotTiming.effectiveTicksPerSlot, 64);
  assert.equal(metadata.ledgerRetention.effectiveShreds, 1000000);
  assert.equal(metadata.resourceProfile.aggregateMemtableFlushThresholdBytes, 134217728);
  assert.equal(metadata.resourceProfile.strictProcessMemoryCap, false);
  assert.equal(metadata.resourceProfile.processResourceFloorsChanged, false);
  assert.equal(metadata.freshSyntheticKeys, true); assert.equal(metadata.hostSecurityChanged, false);
  assert.equal(metadata.binding, '127.0.0.1'); assert.deepEqual(metadata.publicEntrypoints, []);
  assert.equal(metadata.faucetGenesisLamports, '0'); assert.equal(metadata.faucetUsed, false);
  assert.equal(metadata.clusterNodes.length, 1);
  assert.equal(metadata.clusterNodes[0].pubkey, metadata.publicKeys.identity);
  assert.deepEqual(metadata.receiptBinding.memoProgram, MEMO_PROGRAM);
  assert.deepEqual(metadata.payoutReceiptBinding.memoProgram, MEMO_PROGRAM);
  const pin = metadata.runtimePins.validator;
  assert.ok(Array.isArray(pin) && pin.length === 2 && /^[0-9a-f]{64}$/.test(pin[1]));
  assert.equal(pin[0], SOLANA_CANDIDATE_ACCEPTANCE_PATH, 'SOLANA_CANDIDATE_REVIEWED_PATH_REQUIRED');
  assert.equal(metadata.periodicSocketAudit.failure, null);
  assert.ok(metadata.periodicSocketAudit.completedChecks > 0, 'SOLANA_CANDIDATE_PERIODIC_AUDIT_REQUIRED');
  assert.ok(metadata.ownedSockets.length > 0);
}
export function checkOriginalRecord(record, kind, expectedWire) {
  const decode = kind === 'bootstrap' ? validateSolanaNonceBootstrapTransaction
    : kind === 'redeem' ? validateSolanaNonceBindingTransaction : validateSolanaBindingTransaction;
  const decoded = decode(record.nativeWire, record.intent), observed = record.observation;
  assert.equal(record.phase, 'OBSERVED_FINALIZED'); assert.equal(record.broadcastAttempts, 1);
  assert.equal(record.nativeWire, expectedWire ?? record.nativeWire);
  assert.equal(record.nativeId, decoded.signatureHex); assert.equal(record.transactionSHA256, decoded.transactionSHA256);
  for (const field of ['nativeId', 'nativeWire', 'transactionSHA256']) assert.equal(observed[field], record[field]);
  assert.deepEqual(observed.intent, record.intent);
  assert.ok(BigInt(observed.feeLamports) > 0n);
  if (record.preparedFee !== undefined) assert.equal(observed.feeLamports, record.preparedFee);
  const amount = BigInt(record.intent[kind === 'bootstrap' ? 'rentLamports' : 'lamports']);
  assert.equal(BigInt(observed.sourceBefore) - BigInt(observed.sourceAfter), amount + BigInt(observed.feeLamports));
  assert.equal(BigInt(observed.recipientAfter) - BigInt(observed.recipientBefore), amount);
  if (kind !== 'bootstrap') {
    assert.equal(record.intent.lamports, ACCEPTANCE_AMOUNTS[kind]);
    assert.deepEqual([decoded.wireBindingVersion, decoded.effectIndex, decoded.wireBindingPosition],
      kind === 'redeem' ? ['2', '1', '2'] : ['1', '0', '1']);
  }
  return decoded;
}
export function inventoryState(inventory) {
  return structuredClone({ accounts: inventory.accounts, feeAudit: inventory.feeAudit,
    syntheticPrefunding: inventory.syntheticPrefunding, nonceInfrastructure: inventory.nonceInfrastructure,
    signingUnresolved: inventory.signingUnresolved });
}
export function checkBootstrap(custody, initial) {
  const bootstrap = custody.nonceBootstrap, infrastructure = auditOwnedSolanaNonceInfrastructure(initial.nonceInfrastructure);
  checkOriginalRecord(bootstrap, 'bootstrap');
  assert.equal(bootstrap.observation.genesis, custody.genesisHex.slice(2));
  assert.equal(bootstrap.nativeId, infrastructure.bootstrapNativeId);
  assert.equal(bootstrap.transactionSHA256, infrastructure.bootstrapTransactionSHA256);
  assert.equal(bootstrap.intent.payerPublicKey, infrastructure.payerPublicKey);
  assert.equal(bootstrap.intent.nonceAccountPublicKey, infrastructure.nonceAccountPublicKey);
  assert.equal(bootstrap.intent.authorityPublicKey, custody.roles.escrow.endpoint);
  assert.equal(bootstrap.observation.sourceAfter, infrastructure.payerBalance);
  assert.equal(bootstrap.observation.recipientBefore, '0');
  assert.equal(bootstrap.observation.recipientAfter, infrastructure.bootstrapRentLamports);
  assert.equal(bootstrap.observation.feeLamports, infrastructure.bootstrapFeeLamports);
  assert.deepEqual(initial.accounts.map(row => row.role).sort(), ['depositor', 'escrow', 'recipient']);
  assert.equal(initial.escrow.total, '10000000'); assert.equal(initial.feeAudit.actualFees, '0');
  assert.equal(initial.feeAudit.escrowActualFees, '0'); assert.deepEqual(initial.feeAudit.transfers, []);
  assert.equal(initial.signingUnresolved, false); assert.deepEqual(custody.transfers, []);
  for (const row of initial.accounts) {
    assert.notEqual(row.endpoint, infrastructure.payerPublicKey);
    assert.notEqual(row.endpoint, infrastructure.nonceAccountPublicKey);
  }
}
const accountTotal = (inventory, role) => BigInt(inventory.accounts.find(row => row.role === role).total);
export function checkCustodyBalances(initial, afterDeposit, afterPayout, records) {
  assert.deepEqual(records.map(row => row.route), ['deposit', 'redeem']);
  const [deposit, payout] = records; checkOriginalRecord(deposit, 'deposit'); checkOriginalRecord(payout, 'redeem');
  assert.equal(accountTotal(initial, 'depositor') - accountTotal(afterDeposit, 'depositor'),
    BigInt(ACCEPTANCE_AMOUNTS.deposit) + BigInt(deposit.observation.feeLamports));
  assert.equal(accountTotal(afterDeposit, 'escrow') - accountTotal(initial, 'escrow'), BigInt(ACCEPTANCE_AMOUNTS.deposit));
  assert.equal(accountTotal(afterPayout, 'recipient') - accountTotal(initial, 'recipient'), BigInt(ACCEPTANCE_AMOUNTS.redeem));
  assert.equal(accountTotal(afterPayout, 'depositor'), accountTotal(afterDeposit, 'depositor'));
  assert.equal(accountTotal(afterPayout, 'escrow'), accountTotal(initial, 'escrow') - BigInt(payout.observation.feeLamports));
  assert.equal(afterPayout.feeAudit.actualFees, String(BigInt(deposit.observation.feeLamports) + BigInt(payout.observation.feeLamports)));
  assert.equal(afterPayout.feeAudit.escrowActualFees, payout.observation.feeLamports);
  assert.equal(afterPayout.feeAudit.unresolvedEscrowPreparedFees, '0'); assert.equal(afterPayout.signingUnresolved, false);
  assert.deepEqual(afterPayout.feeAudit.transfers.map(row => row.nativeId), records.map(row => row.nativeId));
  assert.deepEqual(afterDeposit.nonceInfrastructure, initial.nonceInfrastructure);
  assert.equal(payout.intent.durableNonce, initial.nonceInfrastructure.nonceAccount.durableNonce);
  const afterInfrastructure = auditOwnedSolanaNonceInfrastructure(afterPayout.nonceInfrastructure);
  assert.notEqual(afterInfrastructure.nonceAccount.durableNonce, payout.intent.durableNonce);
  for (const field of ['payerBalance', 'bootstrapNativeId', 'bootstrapFeeLamports', 'bootstrapRentLamports'])
    assert.equal(afterInfrastructure[field], initial.nonceInfrastructure[field]);
  assert.ok(BigInt(afterPayout.nativeHead.slot) >= BigInt(payout.observation.transactionSlot));
}
export function publicAcceptanceReport(state) {
  return { format: 'SOLANA_CANDIDATE_FUNCTIONAL_ACCEPTANCE_V1', scope: 'runtime-functional-only',
    success: state.success === true, phase: state.phase, errorCode: state.errorCode ?? null,
    candidatePin: state.candidatePin ?? null, sourceHashesBefore: state.sourceHashesBefore ?? null,
    sourceHashesAfter: state.sourceHashesAfter ?? null, sourceUnchanged: state.sourceUnchanged === true,
    checks: structuredClone(state.checks ?? {}), fixedLamports: ACCEPTANCE_AMOUNTS,
    observedFees: structuredClone(state.observedFees ?? {}), cleanup: state.cleanup ? { ownedProcessStopped: state.cleanupExitVerified === true ? state.cleanup.ownedProcessStopped === true : null,
      exitVerification: state.cleanupExitVerified === true ? 'verified' : 'unknown',
      syntheticKeysAndLedgerRemoved: state.cleanup.syntheticKeysAndLedgerRemoved === true,
      forced: state.cleanup.forced === true } : null,
    disclosures: ['Fresh synthetic local genesis and fake funds only',
      'Original owned adapter enforces Memo, identity, single-peer and inode-owned TCP/TCP6/UDP/UDP6 loopback audits',
      'Trusted common-host runtime observation; no public consensus or independent operator claim',
      'Not cSOL graph acceptance, self-custody acceptance, privacy acceptance or a performance measurement',
      'No EVM, Bitcoin, claims, circuits or proofs were started',
      'Nonce infrastructure and separate solver liquidity are excluded from custody backing and custody fees'] };
}
