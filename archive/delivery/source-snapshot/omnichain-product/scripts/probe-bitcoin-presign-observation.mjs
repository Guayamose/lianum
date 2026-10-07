/** Focused real regtest regression for re-observing a completed transfer inside
 * a later transfer's final beforeSign callback. No PAEG proof acceptance claim.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOwnedBitcoinRuntime } from '../src/chains/bitcoin-runtime.mjs';
import { PRIVATE_RESOURCE_FLOORS, PRIVATE_RESOURCE_POLICY } from '../src/private-resource-policy.mjs';

assert.deepEqual(process.argv.slice(2), ['--authorized-local-bitcoin-presign-observation'], 'BITCOIN_PROBE_ARGUMENTS');
const root = fileURLToPath(new URL('../', import.meta.url));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(root, 'evidence', 'bitcoin-presign-observation-' + runId + '.json');
const privateDirectory = join(root, '.local/private-bitcoin-presign-observation', runId);
mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
const report = { classification: 'BITCOIN_PRESIGN_OBSERVATION_PROBE_IN_PROGRESS', runId,
  startedAt: new Date().toISOString(), actualProofsGenerated: false, resourcePolicy: PRIVATE_RESOURCE_POLICY,
  resources: [], privateAuditExported: false };
let runtime, terminalError, resourceError, stopping = false;
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
function guard() {
  if (resourceError) throw resourceError;
  const memory = readFileSync('/proc/meminfo', 'utf8'), disk = statfsSync(root);
  const sample = { availableRAM: Number(/MemAvailable:\s+(\d+)/.exec(memory)[1]) * 1024,
    freeDisk: disk.bavail * disk.bsize, at: new Date().toISOString() };
  report.resources.push(sample);
  assert.ok(sample.availableRAM >= PRIVATE_RESOURCE_FLOORS.availableRAM, 'BITCOIN_PROBE_RAM_FLOOR');
  assert.ok(sample.freeDisk >= PRIVATE_RESOURCE_FLOORS.freeDisk, 'BITCOIN_PROBE_DISK_FLOOR');
  save();
}
const stop = async code => {
  if (stopping) return;
  stopping = true; resourceError = new Error(code);
  if (runtime) await runtime.close();
};
const timer = setTimeout(() => void stop('BITCOIN_PROBE_TIMEOUT'), 120000);
const sampler = setInterval(() => {
  try { guard(); } catch (error) { void stop(error.message); }
}, PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds);
const onSignal = () => void stop('BITCOIN_PROBE_INTERRUPTED');
process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
try {
  guard(); runtime = await createOwnedBitcoinRuntime();
  const first = await runtime.transfer('100000', { recipientIndex: 0,
    beforeSign: async () => { guard(); }, onSigned: async () => {} });
  const firstFact = await runtime.confirm(first.txid);
  assert.equal(firstFact.finalized, true);
  assert.ok(firstFact.confirmations >= 6);
  report.firstConfirmed = true;

  let deniedCallbackRead = false;
  await assert.rejects(runtime.transfer('150000', { recipientIndex: 1,
    beforeSign: async () => {
      const fact = await runtime.observe(first.txid);
      assert.equal(fact.txid, first.txid); assert.equal(fact.finalized, true);
      deniedCallbackRead = true;
      throw new Error('BITCOIN_PROBE_EXPLICIT_PRE_SIGN_REFUSAL');
    }, onSigned: async () => assert.fail('BITCOIN_PROBE_REFUSED_INTENT_SIGNED'),
  }), /BITCOIN_PROBE_EXPLICIT_PRE_SIGN_REFUSAL/);
  assert.equal(deniedCallbackRead, true);
  assert.equal(runtime.transfers.length, 1);
  assert.equal(runtime.processStatus().signingUnresolved, false);
  report.freshReadThenRefusalUsedNoSecondSignature = true;

  let freshRead = false, concurrentReadRejected = false, writesStayedBlocked = false, lateReadRejected = false;
  const second = await runtime.transfer('150000', { recipientIndex: 1,
    beforeSign: async () => {
      guard();
      const pendingRead = runtime.observe(first.txid);
      await assert.rejects(runtime.observe(first.txid), /BITCOIN_OBSERVATION_BUSY/);
      concurrentReadRejected = true;
      const observed = await pendingRead;
      assert.equal(observed.txid, first.txid); assert.equal(observed.finalized, true);
      assert.ok(observed.confirmations >= 6);
      freshRead = true;
      await assert.rejects(runtime.confirm(first.txid), /BITCOIN_OPERATION_BUSY/);
      await assert.rejects(runtime.transfer('1', { recipientIndex: 0, beforeSign: async () => {}, onSigned: async () => {} }),
        /BITCOIN_OPERATION_BUSY/);
      writesStayedBlocked = true;
    },
    onSigned: async () => {
      await assert.rejects(runtime.observe(first.txid), /BITCOIN_OPERATION_BUSY/);
      lateReadRejected = true;
    },
  });
  assert.notEqual(second.txid, first.txid);
  const secondFact = await runtime.confirm(second.txid);
  assert.equal(secondFact.finalized, true); assert.ok(secondFact.confirmations >= 6);
  const refreshedFirst = await runtime.observe(first.txid);
  assert.equal(refreshedFirst.finalized, true);
  assert.equal(refreshedFirst.transactionSHA256, firstFact.transactionSHA256);
  assert.equal(runtime.transfers.length, 2);
  assert.ok(runtime.transfers.every(record => record.broadcastAttempts === 1 && record.confirmationMiningAttempts === 1));
  assert.ok(freshRead && concurrentReadRejected && writesStayedBlocked && lateReadRejected);
  report.result = { actualTransfers: 2, sameFirstTransactionFreshlyObservedDuringSecondPreparation: freshRead,
    concurrentObservationRejected: concurrentReadRejected, nestedMiningAndTransferRejected: writesStayedBlocked,
    observationWindowClosedBeforeSigning: lateReadRejected, bothSixConfirmationPoliciesMet: true,
    eachSignedTransactionBroadcastExactlyOnce: true };
  report.classification = 'ACTUAL_OWNED_BITCOIN_PRESIGN_READ_REGRESSION_PASSED';
  guard();
} catch (error) {
  terminalError = error;
  report.classification = 'BITCOIN_PRESIGN_OBSERVATION_PROBE_INCOMPLETE';
  report.error = { name: error.name, message: error.message };
} finally {
  clearTimeout(timer); clearInterval(sampler);
  process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
  if (runtime) {
    writeFileSync(join(privateDirectory, 'native-audit.json'), JSON.stringify({ metadata: runtime.metadata,
      transfers: runtime.transfers, processStatus: runtime.processStatus() }, null, 2) + '\n', { mode: 0o600 });
    try { report.cleanup = await runtime.close(); } catch (error) { terminalError ??= error; report.cleanupError = error.message; }
  }
  if (resourceError) terminalError ??= resourceError;
  if (terminalError) report.classification = 'BITCOIN_PRESIGN_OBSERVATION_PROBE_INCOMPLETE';
  report.completedAt = new Date().toISOString(); save();
}
console.log(JSON.stringify({ report: output, classification: report.classification, result: report.result,
  error: report.error ?? null }));
if (terminalError) process.exitCode = 1;
