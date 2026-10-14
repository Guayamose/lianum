import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical } from '../../../../engine/src/crypto/privacy.mjs';
import { wipePrivate } from '../../../../proofs/src/execution/proof-worker.mjs';
import { detachGenericProofMetrics } from '../../../../backend/src/execution/native/dispatch/generic-native-execution.mjs';

test('fractional proof timings are metadata and survive erasure of their source package', () => {
  const proof = { proof: Buffer.from('c0ffee', 'hex'), metrics: {
    acceptedResult: true, totalMilliseconds: 114005.817,
    worker: { verified: true, witnessMilliseconds: 324.562, proofMilliseconds: 110721.381 },
    resourceSamples: [{ availableRAM: 3875123200, workerRSS: 2097152000 }],
  } };
  assert.throws(() => canonical(proof.metrics), /Only safe integer numbers/);
  const archived = detachGenericProofMetrics(proof.metrics);
  const original = JSON.stringify(archived);
  wipePrivate(proof);
  assert.equal(JSON.stringify(archived), original);
  assert.equal(archived.acceptedResult, true);
  assert.equal(archived.worker.verified, true);
  assert.equal(archived.worker.proofMilliseconds, 110721.381);
});
