/** One finite real local history-availability probe, no proof generation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statfsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createOwnedSolanaRuntime } from '../src/chains/solana-runtime.mjs';
import { projectRoot, sleep } from '../src/chains/runtime-harness.mjs';

assert.ok(process.argv.includes('--authorized-retention-probe'), 'PC18_RETENTION_PROBE_REQUIRES_APPROVAL');
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const path = join(projectRoot, 'evidence', `m18-retention-probe-${runId}.json`);
const local = join(projectRoot, '.local', `pc18-retention-${runId}`);
await mkdir(local, { recursive: true, mode: 0o700 });
const report = { classification: 'IN_PROGRESS_FINITE_LOCAL_RETENTION_PROBE', runId, realFunds: false, publicNetwork: false, delayMilliseconds: 900_000, ledgerRetentionShreds: 1_000_000, ticksPerSlot: 64, proofGeneration: false, rawNativeDataPublic: false, resources: [], sources: {} };
for (const file of ['src/chains/solana-runtime.mjs', 'scripts/integration-private-assembly-retention.mjs', 'src/chains/runtime-harness.mjs']) report.sources[file] = createHash('sha256').update(await readFile(join(projectRoot, file))).digest('hex');
const save = () => writeFile(path, JSON.stringify(report, null, 2) + '\n');
const privateSave = (label, data) => writeFile(join(local, label + '.json'), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
function guard() { const fs = statfsSync(projectRoot); const r = { at: new Date().toISOString(), availableRAM: Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1]) * 1024, freeDisk: fs.bavail * fs.bsize, rss: process.memoryUsage().rss }; assert.ok(r.availableRAM >= 3 * 1024 ** 3, 'PC18_AVAILABLE_RAM_FLOOR'); assert.ok(r.freeDisk >= 5 * 1024 ** 3, 'PC18_DISK_FLOOR'); return r; }
let runtime, resourceAbort;
const monitor = setInterval(() => {
  try { const r = guard(); report.minimumAvailableRAM = Math.min(report.minimumAvailableRAM ?? r.availableRAM, r.availableRAM); report.minimumFreeDisk = Math.min(report.minimumFreeDisk ?? r.freeDisk, r.freeDisk); report.maximumControllerRSS = Math.max(report.maximumControllerRSS ?? r.rss, r.rss); report.fullLifetimeResourceChecks = (report.fullLifetimeResourceChecks ?? 0) + 1; }
  catch (error) {
    if (resourceAbort) return;
    resourceAbort = error; report.lifecycleResourceFailure = error.message;
    // Only this runtime's idempotent owned-child cleanup is permitted. During
    // startup the latched failure is checked immediately when creation returns.
    if (runtime) void runtime.close().catch(() => {});
  }
}, 1000);
const requireResources = () => { if (resourceAbort) throw resourceAbort; return guard(); };
try {
  report.resources.push(requireResources()); await save();
  runtime = await createOwnedSolanaRuntime(() => {}, { ledgerRetentionShreds: 1_000_000, ticksPerSlot: 64 });
  requireResources(); await privateSave('runtime', runtime.metadata);
  report.retention = runtime.metadata.ledgerRetention; report.slotTiming = runtime.metadata.slotTiming;
  const before = await runtime.balance();
  const transfer = await runtime.transfer('3000000', { onSigned: r => privateSave('signed', r) });
  requireResources(); const firstStart = performance.now(); const first = await runtime.observe(transfer.signature, { expectedLamports: '3000000' });
  report.initialFreshFinalizationMilliseconds = performance.now() - firstStart; requireResources(); await privateSave('initial-observation', first);
  const balance = await runtime.balance(); assert.equal(BigInt(balance) - BigInt(before), 3_000_000n);
  const start = performance.now(); report.phase = 'waiting-real-wall-clock-history-gap'; await save();
  while (performance.now() - start < report.delayMilliseconds) { await sleep(1000); const r = requireResources(); if (report.resources.length === 1 || performance.now() - start >= (report.resources.length - 1) * 15000) { report.resources.push(r); report.elapsedMilliseconds = performance.now() - start; await save(); } }
  report.phase = 'fresh-current-observation'; await save();
  requireResources(); const laterStart = performance.now(); const later = await runtime.observe(transfer.signature, { expectedLamports: '3000000' });
  report.delayedFreshObservationMilliseconds = performance.now() - laterStart; requireResources(); await privateSave('delayed-fresh-observation', later);
  assert.equal(later.signature, first.signature); assert.equal(later.slot, first.slot); assert.equal(later.blockhash, first.blockhash); assert.equal(later.finalized, true);
  assert.ok(later.currentSlot > first.currentSlot); assert.equal(await runtime.balance(), balance);
  assert.equal(runtime.transfers.length, 1); assert.equal(runtime.transfers[0].broadcastAttempts, 1);
  Object.assign(report, { classification: 'ACTUAL_FRESH_FINALIZED_REOBSERVATION_AFTER_900_SECONDS_NO_RESEND', phase: 'completed', elapsedMilliseconds: performance.now() - start, slotAdvance: later.currentSlot - first.currentSlot, originalEffectUnchanged: true, exactRecipientDeltaLamports: '3000000', extraRecipientCreditLamports: '0', broadcastAttempts: 1 });
} catch (error) {
  report.phase = 'failed'; report.failureCode = /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'PC18_RETENTION_OPERATION_FAILED';
  if (error.observationDiagnostic) await privateSave('timeout-diagnostics', error.observationDiagnostic);
  process.exitCode = 1;
} finally {
  const code = error => /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'PC18_RETENTION_FINALIZATION_FAILED';
  try { if (runtime) report.cleanup = await runtime.close(); }
  catch (error) { report.cleanupFailure = code(error); report.phase = 'failed-cleanup'; process.exitCode = 1; }
  try { report.resources.push(guard()); report.finalResourceFloorMet = true; }
  catch (error) { report.finalResourceFloorMet = false; report.finalResourceFailure = code(error); report.phase = 'failed-resource'; process.exitCode = 1; }
  report.privateAuditExcluded = true;
  try {
    for (const [file, hash] of Object.entries(report.sources)) assert.equal(createHash('sha256').update(await readFile(join(projectRoot,file))).digest('hex'),hash, 'PC18_RETENTION_SOURCE_CHANGED');
    report.sourcesUnchanged = true;
  } catch (error) { report.sourcesUnchanged = false; report.sourceCheckFailure = code(error); report.phase = 'failed-source-check'; process.exitCode = 1; }
  clearInterval(monitor);
  if (resourceAbort) { report.lifecycleResourceFailure = resourceAbort.message; report.phase = 'failed-resource'; process.exitCode = 1; }
  report.observationPassed = report.classification === 'ACTUAL_FRESH_FINALIZED_REOBSERVATION_AFTER_900_SECONDS_NO_RESEND';
  if (report.phase !== 'completed') report.classification = 'FAILED_FINITE_LOCAL_RETENTION_PROBE';
  report.finishedAt = new Date().toISOString();
  await save();
}
console.log(JSON.stringify({ phase: report.phase, evidence: path, classification: report.classification }));
