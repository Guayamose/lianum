import test from 'node:test';
import assert from 'node:assert/strict';
import { amountCandidates, analyzePrivateCounterexamples, jsonEvidence } from '../../../../scripts/engine/diagnostics/private-analysis.mjs';

test('public amount inversion matches exhaustive small-domain forward evaluation', () => {
  let comparisons = 0;
  for (const [pS, qS, pB, qB] of [[1n, 10n, 4n, 1n], [3n, 2n, 5n, 4n], [1n, 1n, 1n, 3n], [7n, 3n, 2n, 5n]]) {
    const B = 31n, F = 3n;
    for (let K = 0n; K <= 100n; K++) {
      const expected = [];
      for (let S = 1n; S <= 300n; S++) {
        const cost = (S * pS + qS - 1n) / qS;
        const residual = B - F - cost;
        if (residual >= 0n && residual * qB / pB === K) expected.push(S);
      }
      const actual = amountCandidates({ B, F, pS, qS, pB, qB, K });
      assert.deepEqual(actual, expected.length ? {
        min: expected[0], max: expected.at(-1), count: BigInt(expected.length),
      } : null);
      comparisons++;
    }
  }
  assert.equal(comparisons, 404);
});

test('historical public formula leaves exactly forty S quantities including exact endpoints', () => {
  const parameters = { B: 1000000n, F: 25000n, pS: 1n, qS: 10n, pB: 4n, qB: 1n, K: 168750n };
  assert.deepEqual(amountCandidates(parameters), { min: 2999961n, max: 3000000n, count: 40n });
  assert.throws(() => amountCandidates({ ...parameters, qS: 0n }));
  assert.throws(() => amountCandidates({ ...parameters, K: -1n }));
});

test('declared synthetic accounting inputs exercise counterexamples without historical or native acceptance', () => {
  // Required input-schema label belongs to the existing diagnostic parser.
  // All quantities/hash here are independent synthetic DATA, not retained M3.
  const evidence = {classification:'SYNTHETIC_ACCOUNTING_INPUT_ONLY',workflow:{
    classification:'REAL_EVM_LOCK_AND_TWO_EVM_ROLE_OUTPUTS_AND_EVM_CLAIM',
    inputAmount:'1000',selectedA:{amount:'500',fee:'100'},selectedB:{amount:'600',fee:'200'},
    claimReceipt:{transactionHash:'0x'+'11'.repeat(32)}}};
  const report = analyzePrivateCounterexamples(evidence);
  assert.equal(report.publicHashDictionary.recoveredCount, 1);
  assert.equal(report.graphScopedIdentity.distinctTags, true);
  assert.equal(report.callerChosenIdentityKey.distinctTags, true);
  assert.equal(report.keyholderDictionary.recoveredCount, 1);
  assert.equal(report.historicalM3SelectedPair.netBeforeGas, -100n);
  assert.equal(report.historicalM3SelectedPair.selectedOutputGasTotal, 300n);
  assert.equal(report.historicalM3SelectedPair.netAfterSelectedOutputGas, -400n);
  assert.equal(report.noZkVrfLedgerOrNativeExecution, true);
  assert.throws(()=>analyzePrivateCounterexamples({workflow:{...evidence.workflow,classification:'UNEXPECTED_SCHEMA'}}),/EXPECTED_HISTORICAL_M3_NATIVE_FIXTURE/);
  assert.deepEqual(JSON.parse(jsonEvidence(report)).publicAmountRelation.interval,
    { min: '2999961', max: '3000000', count: '40' });
});
