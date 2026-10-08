/** Synthetic host reports only; no proof, node or protocol acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIVATE_METAMORPHO_FLOW_RESULT, assertPrivateMetaMorphoResult } from './private-metamorpho-flow-policy.mjs';
function syntheticReport() {
  return { format: PRIVATE_METAMORPHO_FLOW_RESULT, phase: 'completed', success: true,
    localOnly: true, fakeFundsOnly: true, sourceUnchanged: true, publicNetwork: false,
    keeperLossRecoveryEstablished: false, nativeProcessRestartEstablished: false,
    privatePAEGConversionEstablished: false, fullWalletAcceptance: false,
    cleanup: { closedEvm: true, evm: { stopped: true, scratchRemoved: true } },
    proofs: ['deposit_balance', 'withdraw_balance'].map((relation, index) => ({ relation,
      proofSHA256: String(index + 1).repeat(64), publicInputsSHA256: String(index + 3).repeat(64),
      evidence: { acceptedResult: true, resourceReceiptCompleted: true, telemetrySHA256: 'e'.repeat(64) } })),
    checks: Object.fromEntries(['originalPrivateShareFunding', 'originalNoteRestoredWithoutSend',
      'originalPrivateExitAndBacking', 'completedResponseDeliberatelyDiscarded', 'originalJournalRecoveryWithoutResend',
      'underlyingRestoredAndPrivateLiabilitiesClosed'].map(name => [name, true])),
    accountRequests: ['metamorpho_share_funding', 'metamorpho_original_share_exit'].flatMap(requestId =>
      ['prepare', 'execute'].map(action => ({ requestId, action, via: 'ORIGINAL_FLAT_ACCOUNT_HTTP' }))),
    accepted: { shares: '1000000000000000000', underlying: '1000000', originalPrivateExitBound: true,
      publicRedemption: true, protocol: 'OFFICIAL_METAMORPHO' } };
}
test('exit acceptance rejects unaccepted or absent genuine-note evidence and incomplete cleanup', () => {
  const original = syntheticReport(); assertPrivateMetaMorphoResult(original);
  for (const mutate of [value => value.proofs.pop(), value => value.proofs[1].evidence.acceptedResult = false,
    value => value.checks.originalPrivateExitAndBacking = false, value => value.cleanup.evm.scratchRemoved = false,
    value => value.proofs[1].evidence.resourceReceiptCompleted = false]) {
    const value = structuredClone(original); mutate(value); assert.throws(() => assertPrivateMetaMorphoResult(value));
  }
});
test('exit acceptance cannot imply private conversion, keeper-loss recovery or a complete wallet', () => {
  for (const field of ['privatePAEGConversionEstablished', 'keeperLossRecoveryEstablished',
    'nativeProcessRestartEstablished', 'fullWalletAcceptance', 'publicNetwork']) {
    const value = syntheticReport(); value[field] = true;
    assert.throws(() => assertPrivateMetaMorphoResult(value), /ACCEPTANCE_SCOPE/);
  }
  const value = syntheticReport(); value.accountRequests[3].via = 'BYPASSED_HTTP';
  assert.throws(() => assertPrivateMetaMorphoResult(value), /ACCOUNT_HTTP/);
});
