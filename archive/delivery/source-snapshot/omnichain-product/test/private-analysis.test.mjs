import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { amountCandidates, analyzePrivateCounterexamples, jsonEvidence } from '../scripts/private-analysis.mjs';

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

test('counterexamples and historical exposure derive from retained M3 native facts', async () => {
  const evidence = JSON.parse(await readFile(new URL('../evidence/m3-evm-semantic-local.json', import.meta.url)));
  const report = analyzePrivateCounterexamples(evidence);
  assert.equal(report.publicHashDictionary.recoveredCount, 1);
  assert.equal(report.graphScopedIdentity.distinctTags, true);
  assert.equal(report.callerChosenIdentityKey.distinctTags, true);
  assert.equal(report.keyholderDictionary.recoveredCount, 1);
  assert.equal(report.historicalM3SelectedPair.netBeforeGas, -2656250n);
  assert.equal(report.historicalM3SelectedPair.selectedOutputGasTotal, 50329316456680n);
  assert.equal(report.historicalM3SelectedPair.netAfterSelectedOutputGas, -50329319112930n);
  assert.equal(report.noZkVrfLedgerOrNativeExecution, true);
  assert.deepEqual(JSON.parse(jsonEvidence(report)).publicAmountRelation.interval,
    { min: '2999961', max: '3000000', count: '40' });
});
