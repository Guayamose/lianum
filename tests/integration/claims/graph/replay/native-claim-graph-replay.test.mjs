/** Import-safe HOST parser/lifecycle tests. Synthetic transcript data never
 * replaces the fixed retained input loader or establishes replay acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { REAL_REPLAY_DISABLED, REPLAY_LIMITS, loadReplayInputs, validateReplayTranscript, readCappedReplayResponse, replayGenesisObservation }
  from './native-claim-graph-replay.mjs';
import { createReplayLifecycle } from './native-claim-graph-replay-lifecycle.mjs';
import { diagnosticReadCalldata } from './native-claim-graph-replay-read.mjs';

const abiData = JSON.parse(readFileSync(new URL('../../../fixtures/claims/replay/replay-read-abi-public-data.json', import.meta.url)));
function hostTranscript() {
  const sender = '0x' + '31'.repeat(20), target = '0x' + '32'.repeat(20);
  const transactions = Array.from({ length: 63 }, (_, i) => {
    const transactionHash = '0x' + (i + 1).toString(16).padStart(64, '0');
    return { label: i === 62 ? 'flat-account-reservation' : 'HOST_ONLY_NOT_RETAINED_TRANSACTION',
      senderNonce: '0x' + i.toString(16), transactionHash,
      request: { from: sender, to: target, data: '0x01' },
      receipt: { from: sender, to: target, transactionHash, status: '0x1', blockNumber: '0x' + (i + 1).toString(16) },
      prepared: { head: { timestamp: '0x' + (1900000210n + BigInt(i)).toString(16) }, transaction: { nonce: String(i) } } };
  });
  return { metadata: { evmGenesis: '0x' + '33'.repeat(32), profile: { chainId: 31337,
    genesisTimestamp: 1900000210, maxGas: 30000000, manualMining: true } }, transactions, receipts: structuredClone(transactions) };
}
const defer = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function lifecycle({ cleanupMilliseconds = 100, closeOnStop = true } = {}) {
  const effects = { spawns: 0, stops: 0, removed: [], killed: [] };
  const child = new EventEmitter(); Object.assign(child, { pid: 987654, exitCode: null, signalCode: null,
    kill(signal) { effects.killed.push(signal); return true; } });
  const handle = { child };
  const owner = createReplayLifecycle({ cleanupMilliseconds,
    async stopProcess(selected) { assert.equal(selected, handle); effects.stops++;
      if (closeOnStop) { child.exitCode = 0; child.emit('close', 0, null); } },
    async removeScratch(path) { effects.removed.push(path); },
  });
  return { owner, effects, child, spawn() { return owner.spawn(() => { effects.spawns++; return handle; }); } };
}

test('real replay stays disabled and the fixed loader fails closed when its retained evidence is unavailable', () => {
  assert.equal(REAL_REPLAY_DISABLED, true);
  try {
    const original = loadReplayInputs();
    assert.equal(original.transcript.transactionCount, 63); assert.equal(original.transcript.finalTimestamp, 1900000273);
  } catch (error) {
    assert.equal(error.code, 'ENOENT');
    assert.match(error.path, /(?:native-claim-graph-flow\/attempt-7e69e0a3-58f6-45dd-899c-01bf32d3703b\/|contracts\/550c0970-646f-4423-abea-2f088e69dcf4\/compiled\.json$)/);
  }
  assert.ok(REPLAY_LIMITS.totalMilliseconds <= 180000); assert.ok(REPLAY_LIMITS.cleanupMilliseconds <= 10000);
});

test('HOST transcript exercises the parser without granting original replay acceptance', () => {
  const result = validateReplayTranscript(hostTranscript());
  assert.equal(result.transactionCount, 63); assert.equal(result.finalTimestamp, 1900000273);
  assert.equal(result.completeOriginalBlockTimestampsRetained, false);
  assert.equal(result.completeOriginalBlockHashesReproduced, false);
});

test('matching deterministic genesis is only an observation and a fresh child still owns its separate cleanup', async () => {
  const c = lifecycle(); await c.owner.acquireScratch(async () => '/host-only-fresh-replay'); c.spawn();
  const hash = hostTranscript().metadata.evmGenesis, observed = replayGenesisObservation(hash, hash);
  assert.equal(observed.replayGenesisMatchesOriginal, true);
  assert.equal(observed.originalGenesisRestored, false); assert.equal(observed.originalRuntimeRestored, false);
  assert.equal(c.effects.spawns, 1); assert.equal(c.owner.report.exitObserved, false);
  await c.owner.cleanup(); assert.equal(c.owner.report.exitObserved, true);
  assert.deepEqual(c.effects.removed, ['/host-only-fresh-replay']);
  assert.equal(replayGenesisObservation(hash, '0x' + '12'.repeat(32)).replayGenesisMatchesOriginal, false);
});

test('replay refuses changed sender, nonce, calldata/receipt target, or retained signed head time', () => {
  for (const mutate of [
    row => { row.transactions[0].request.from = '0x' + '11'.repeat(20); },
    row => { row.transactions.at(-1).senderNonce = '0x0'; },
    row => { row.transactions.at(-1).receipt.to = '0x' + '11'.repeat(20); },
    row => { row.transactions[59].prepared.head.timestamp = '0x1'; },
  ]) {
    const changed = hostTranscript(); mutate(changed);
    // Mutate both copies so the individual causal guard, rather than only the
    // transaction/receipt equality check, rejects each malformed transcript.
    changed.receipts = structuredClone(changed.transactions);
    assert.throws(() => validateReplayTranscript(changed));
  }
});

test('diagnostic ABI cannot encode a write and preserves compiler nominal library selectors', () => {
  assert.equal(abiData.classification, 'PUBLIC_COMPILER_ABI_DATA_ONLY_NOT_REPLAY_OR_ACCEPTANCE');
  const token = abiData.artifacts.token;
  assert.throws(() => diagnosticReadCalldata(token, 'transfer(address,uint256)', ['0x' + '11'.repeat(20), '1']), /READ_ONLY_ABI/);
  const math = abiData.artifacts.math;
  const calldata = diagnosticReadCalldata(math, 'evidenceState(uint256,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256))',
    ['1', { hubDomain: '0x' + '11'.repeat(32), registryCommitment: '0x' + '22'.repeat(32),
      receiptRoot: '2', receiptCount: '0', revokedDigest: '3', revokedCount: '0', revocationSequence: '0' }]);
  assert.equal(calldata.slice(2, 10), math.evm.methodIdentifiers['evidenceState(uint256,Poseidon2Domains.EvidenceState)']);
});

test('abort during scratch acquisition retains removal responsibility and cannot spawn afterward', async () => {
  const c = lifecycle(), pending = defer();
  const allocation = c.owner.acquireScratch(() => pending.promise);
  c.owner.stop('REPLAY_TOTAL_TIMEOUT'); pending.resolve('/host-only-owned-scratch');
  await assert.rejects(allocation, /REPLAY_TOTAL_TIMEOUT/);
  assert.throws(() => c.spawn(), /REPLAY_TOTAL_TIMEOUT/); await c.owner.cleanup();
  assert.equal(c.effects.spawns, 0); assert.deepEqual(c.effects.removed, ['/host-only-owned-scratch']);
});

test('signal during port allocation cannot bypass final cleanup or create a later child', async () => {
  const c = lifecycle(), pending = defer(); await c.owner.acquireScratch(async () => '/host-only-owned-scratch');
  const allocation = c.owner.acquirePort(() => pending.promise);
  c.owner.stop('REPLAY_SIGTERM'); pending.resolve(34567);
  await assert.rejects(allocation, /REPLAY_SIGTERM/);
  assert.throws(() => c.spawn(), /REPLAY_SIGTERM/); await c.owner.cleanup();
  assert.equal(c.effects.spawns, 0); assert.deepEqual(c.effects.removed, ['/host-only-owned-scratch']);
});

test('timeout signals only the original child, waits for close, and coalesces final cleanup', async () => {
  const c = lifecycle(); await c.owner.acquireScratch(async () => '/host-only-owned-scratch'); c.spawn();
  c.owner.stop('REPLAY_TOTAL_TIMEOUT'); assert.deepEqual(c.effects.killed, ['SIGTERM']);
  assert.equal(c.owner.report.exitObserved, false);
  await Promise.all([c.owner.cleanup(), c.owner.cleanup()]);
  assert.equal(c.effects.stops, 1); assert.equal(c.owner.report.exitObserved, true);
  assert.deepEqual(c.effects.removed, ['/host-only-owned-scratch']);
});

test('a stalled close observation is bounded and never reports successful cleanup', async () => {
  const c = lifecycle({ cleanupMilliseconds: 15, closeOnStop: false });
  await c.owner.acquireScratch(async () => '/host-only-owned-scratch'); c.spawn();
  await assert.rejects(c.owner.cleanup(), /REPLAY_CLEANUP_TIMEOUT/);
  assert.equal(c.owner.report.exitObserved, false); assert.equal(c.owner.report.scratchRemoved, false);
  assert.equal(c.effects.stops, 1); assert.deepEqual(c.effects.removed, []);
});

test('spawn error without a PID is distinguished from a running child and still removes its own scratch', async () => {
  const c = lifecycle(); await c.owner.acquireScratch(async () => '/host-only-owned-scratch');
  c.child.pid = undefined; c.spawn(); c.child.emit('error', new Error('ENOENT'));
  await c.owner.cleanup(); assert.equal(c.owner.report.spawnFailedWithoutChild, true);
  assert.equal(c.owner.report.exitObserved, false); assert.equal(c.effects.stops, 0);
  assert.deepEqual(c.effects.removed, ['/host-only-owned-scratch']);
});

test('streamed RPC body limit rejects an unannounced oversized response before buffering the rest', async () => {
  let cancelled = false, reads = 0;
  const response = { headers: new Headers(), body: new ReadableStream({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(4)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }) };
  await assert.rejects(readCappedReplayResponse(response, 6, new AbortController().signal), /REPLAY_RPC_RESPONSE_LIMIT/);
  assert.equal(reads, 2); assert.equal(cancelled, true);
  assert.equal(await readCappedReplayResponse(new Response('{"ok":true}'), 20, new AbortController().signal), '{"ok":true}');
});
