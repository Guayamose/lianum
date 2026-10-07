import test from 'node:test';
import assert from 'node:assert/strict';
import { proofMetricsForTransport } from '../../src/jobs/role-client.mjs';
import { ownerCopy } from '../../../custody/src/signing/flat-owner-custody.mjs';

test('fractional measured durations cross unchanged integer-only owner transport as strings', () => {
  const metrics = { initializationMilliseconds: 36985.618175, jobPreparationMilliseconds: 22.837479000000002,
    witnessMilliseconds: 1384.2186120000042, proofMilliseconds: 123896.52390700001,
    verificationMilliseconds: 20.284783000010066, totalMilliseconds: 162801.040808,
    otherMilliseconds: 491.55785199995444 };
  const encoded = proofMetricsForTransport(metrics);
  assert.deepEqual(ownerCopy({ metrics: encoded }).metrics, encoded);
  for (const name of Object.keys(metrics)) assert.equal(Number(encoded[name]), metrics[name]);
  assert.throws(() => ownerCopy({ circuitValue: 1.5 }), /safe integer/);
  for (const value of [NaN, Infinity, -1, -0, '1.5'])
    assert.throws(() => proofMetricsForTransport({ ...metrics, proofMilliseconds: value }), /MEASURED_DURATION/);
});
