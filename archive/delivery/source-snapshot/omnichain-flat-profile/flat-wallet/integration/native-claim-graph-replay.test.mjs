/** Import-safe host tests. No executable, node, proof worker, network or new
 * private fixture is started. Original stopped-run files are read only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { REAL_REPLAY_DISABLED, REPLAY_LIMITS, loadReplayInputs, validateReplayTranscript, readCappedReplayResponse, replayGenesisObservation }
  from './native-claim-graph-replay.mjs';
import { createReplayLifecycle } from './native-claim-graph-replay-lifecycle.mjs';
import { diagnosticReadCalldata } from './native-claim-graph-replay-read.mjs';

const input = loadReplayInputs();
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

test('entry is disabled and import validates only the fixed 63-transaction retained public transcript', () => {
  assert.equal(REAL_REPLAY_DISABLED, true);
  assert.equal(input.transcript.transactionCount, 63); assert.equal(input.transcript.finalTimestamp, 1900000273);
  assert.ok(REPLAY_LIMITS.totalMilliseconds <= 180000); assert.ok(REPLAY_LIMITS.cleanupMilliseconds <= 10000);
});

test('matching deterministic genesis is only an observation and a fresh child still owns its separate cleanup', async () => {
  const c = lifecycle(); await c.owner.acquireScratch(async () => '/host-only-fresh-replay'); c.spawn();
  const hash = input.evm.metadata.evmGenesis, observed = replayGenesisObservation(hash, hash);
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
    row => { row.receipts.at(-1).request.to = '0x' + '11'.repeat(20); },
    row => { row.transactions[59].prepared.head.timestamp = '0x1'; },
  ]) {
    const changed = structuredClone(input.evm); mutate(changed); assert.throws(() => validateReplayTranscript(changed));
  }
});

test('diagnostic ABI cannot encode a write and preserves compiler nominal library selectors', () => {
  const token = input.claim.contracts['native-claims/NativeClaimToken.sol'].NativeClaimToken;
  assert.throws(() => diagnosticReadCalldata(token, 'transfer(address,uint256)', ['0x' + '11'.repeat(20), '1']), /READ_ONLY_ABI/);
  const math = input.flat.contracts['crypto/Poseidon2Domains.sol'].Poseidon2Domains;
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
