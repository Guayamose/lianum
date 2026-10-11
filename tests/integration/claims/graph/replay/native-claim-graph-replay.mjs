/** Fixed, test-only public-transcript diagnostic. NOT a recovered wallet,
 * attester, current native observer, or graph acceptance. No proof/native node.
 * Kept disabled until the canonical source checkpoint is explicitly saved. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT } from '@lianum/proofs/catalog';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess }
  from '@lianum/engine/chains/shared/runtime-harness';
import { createDiagnosticReadFacade, reconstructPostReservation, inspectRetainedNonemptySolInventory }
  from './native-claim-graph-replay-read.mjs';
import { createReplayLifecycle } from './native-claim-graph-replay-lifecycle.mjs';

export const REAL_REPLAY_DISABLED = true;
export const REPLAY_INPUT_RUN = '7e69e0a3-58f6-45dd-899c-01bf32d3703b';
export const REPLAY_LIMITS = Object.freeze({ totalMilliseconds: 180000, cleanupMilliseconds: 10000,
  maximumRPCs: 6000, requestMilliseconds: 15000, maximumResponseBytes: 4 * 1024 * 1024 });
const ROOT_INPUT = join(ROOT, '.local/native-claim-graph-flow/attempt-' + REPLAY_INPUT_RUN);
const PINS = Object.freeze({
  'attempt.json': '0956c429c92bfb5bd2e6e006d62eee007f574c5321398645b7432b9ad4c1b223',
  'source-pins.json': '76f8cd2e56a2931b9adf0f7445d63e244f605f475d4beddb0b6e10ace54cfca4',
  'result.json': '10039d5c6c7d1d6b82b9725e292efa23331c59d5db8820783fcf6bbe1c4e49cc',
  'resources.json': 'ab527f00ca9c8b8d7d8010bd3bdac0ad8a9d038c5437a96773b44476f5b734ea',
  'private-audit/evm.json': 'b86b2b07200f42c8b4fd47f27139abf989b244295c108ce9950c272a868a7a1d',
  'private-audit/solana.json': 'ff409b11f18a5ee88a18edb48a837d3092ed18e283c7ea877008bb5d83faf569',
  'private-audit/initial-native.json': 'b5ce08ae1ba63d3175e9dc62d3cf436723f9fdc9dba4d9c07a220d47e9a8f9a6',
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const quantity = value => '0x' + BigInt(value).toString(16);
function pinned(path, expected) { const bytes = readFileSync(path); assert.equal(sha(bytes), expected, 'REPLAY_INPUT_HASH'); return JSON.parse(bytes); }

export function replayGenesisObservation(originalGenesis, replayGenesis) {
  for (const value of [originalGenesis, replayGenesis]) assert.match(value, /^0x[0-9a-f]{64}$/);
  return { originalGenesis, replayGenesis, replayGenesisMatchesOriginal: replayGenesis === originalGenesis,
    originalGenesisRestored: false, originalRuntimeRestored: false };
}

export async function readCappedReplayResponse(response, maximum, signal) {
  const claimed = Number(response.headers.get('content-length') ?? '0');
  assert.ok(Number.isSafeInteger(claimed) && claimed >= 0 && claimed <= maximum, 'REPLAY_RPC_RESPONSE_LIMIT');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      signal.throwIfAborted(); const item = await reader.read(); signal.throwIfAborted();
      if (item.done) break;
      bytes += item.value.byteLength; assert.ok(bytes <= maximum, 'REPLAY_RPC_RESPONSE_LIMIT');
      chunks.push(Buffer.from(item.value));
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}

export function validateReplayTranscript(evm) {
  assert.equal(evm.metadata.profile.chainId, 31337); assert.equal(evm.metadata.profile.genesisTimestamp, 1900000210);
  assert.equal(evm.metadata.profile.maxGas, 30000000); assert.equal(evm.metadata.profile.manualMining, true);
  assert.equal(evm.transactions.length, 63); assert.equal(evm.receipts.length, 63);
  assert.deepEqual(evm.transactions, evm.receipts);
  const sender = evm.receipts[0].request.from;
  assert.match(sender, /^0x[0-9a-f]{40}$/);
  for (const [i, row] of evm.receipts.entries()) {
    assert.equal(row.request.from, sender); assert.equal(BigInt(row.senderNonce), BigInt(i));
    assert.equal(row.receipt.from, sender); assert.equal(row.receipt.status, '0x1');
    assert.equal(BigInt(row.receipt.blockNumber), BigInt(i + 1));
    assert.equal(row.receipt.transactionHash, row.transactionHash);
    assert.equal(row.request.to ?? null, row.receipt.to ?? null);
    assert.match(row.request.data, /^0x(?:[0-9a-f]{2})+$/);
    if (row.prepared) {
      assert.equal(row.prepared.head.timestamp, quantity(1900000210n + BigInt(i)));
      assert.equal(row.prepared.transaction.nonce, String(i));
    }
  }
  assert.equal(evm.receipts.at(-1).label, 'flat-account-reservation');
  return { sender, transactionCount: 63, genesisTimestamp: 1900000210, finalTimestamp: 1900000273,
    timestampBasis: 'derived diagnostic one-second mining schedule; only the three retained signed preparation heads are directly cross-checked',
    completeOriginalBlockTimestampsRetained: false, completeOriginalBlockHashesReproduced: false };
}

/** Read-only fixed inputs, safe to import/test. No path or hash override. */
export function loadReplayInputs() {
  const inputs = Object.fromEntries(Object.entries(PINS).map(([name, hash]) => [name, pinned(join(ROOT_INPUT, name), hash)]));
  assert.equal(inputs['attempt.json'].runId, REPLAY_INPUT_RUN);
  assert.equal(inputs['result.json'].success, false); assert.equal(inputs['result.json'].phase, 'failed');
  assert.equal(inputs['resources.json'].sourceClosureUnchanged, true);
  assert.equal(inputs['resources.json'].ownedGroupCleanupConfirmed, true);
  assert.equal(inputs['resources.json'].workerResult.sha256, PINS['result.json']);
  const flat = pinned(join(ROOT, '.local/contracts/550c0970-646f-4423-abea-2f088e69dcf4/compiled.json'),
    '1ca926abfbe8a40218c6891367bbe3acf0f7b02b5990f7d933a47c1f6d61867f');
  const claim = pinned(join(ROOT, '.local/native-claims-contracts/e3e645b6-9466-4f3c-aab1-4dcaa93b7f51/compiled.json'),
    '263757f0d143276829e9bf21548a67ac7b3931f28fcdd42825a31093c486bda9');
  const evm = inputs['private-audit/evm.json'];
  return { evm, transcript: validateReplayTranscript(evm), flat, claim,
    native: inputs['private-audit/solana.json'], initial: inputs['private-audit/initial-native.json'][1] };
}

async function main() {
  assert.equal(REAL_REPLAY_DISABLED, false, 'REPLAY_REQUIRES_SAVED_CANONICAL_CHECKPOINT');
  assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
  const started = Date.now(), lifecycle = createReplayLifecycle({ stopProcess: stopOwnProcess,
    removeScratch: removeOwnScratch, cleanupMilliseconds: REPLAY_LIMITS.cleanupMilliseconds });
  const abort = { signal: lifecycle.signal }, stop = lifecycle.stop;
  let handle, scratch, endpoint;
  const report = { format: 'CLAIM_GRAPH_PUBLIC_REPLAY_DIAGNOSTIC_V1', sourceRun: REPLAY_INPUT_RUN,
    success: false, localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    classification: 'ISOLATED_PUBLIC_EVM_REPLAY_NOT_ORIGINAL_RUNTIME_OR_GRAPH_ACCEPTANCE',
    limits: REPLAY_LIMITS, originalInputHashes: PINS, stages: [], replayedTransactions: 0,
    nativeNodes: 0, newProofJobs: 0, newNativeSignatures: 0, combinedOperatorSignatures: 0,
    originalGenesisRestored: false, originalNativeHistoryRestored: false,
    originalAttesterKeysRestored: false, productionOwnershipBypasses: false,
    testOnlySetup: ['original public sender impersonated on new isolated Anvil',
      'synthetic sender balance initialized to 10 ETH',
      'original transaction nonces with derived diagnostic one-second timestamps, not a complete original header replay'],
    cleanup: lifecycle.report };
  const output = join(ROOT, '.local/native-claim-graph-replay/attempt-' + randomUUID());
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const save = () => writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const cleanup = () => lifecycle.cleanup();
  const interrupted = signal => stop('REPLAY_' + signal);
  const sigint = () => interrupted('SIGINT'), sigterm = () => interrupted('SIGTERM');
  process.once('SIGINT', sigint); process.once('SIGTERM', sigterm);
  const deadline = setTimeout(() => stop('REPLAY_TOTAL_TIMEOUT'), REPLAY_LIMITS.totalMilliseconds);
  let calls = 0, readCalls = 0, counts = {};
  const rpc = async (method, params = []) => {
    abort.signal.throwIfAborted(); handle.assertAlive();
    assert.ok(++calls <= REPLAY_LIMITS.maximumRPCs, 'REPLAY_RPC_LIMIT');
    counts[method] = (counts[method] ?? 0) + 1; if (method === 'eth_call') readCalls++;
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error',
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(REPLAY_LIMITS.requestMilliseconds)]),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: calls, method, params }) });
    assert.ok(response.ok, 'REPLAY_RPC_HTTP');
    const bytes = await readCappedReplayResponse(response, REPLAY_LIMITS.maximumResponseBytes, abort.signal);
    const value = JSON.parse(bytes); abort.signal.throwIfAborted(); handle.assertAlive();
    assert.equal(value.error, undefined, 'REPLAY_RPC_' + method + ':' + JSON.stringify(value.error));
    return value.result;
  };
  async function sample(name, work) {
    const start = performance.now(), before = calls, beforeReads = readCalls, previous = { ...counts };
    const result = await work(); abort.signal.throwIfAborted();
    report.stages.push({ name, guardComponentMilliseconds: performance.now() - start,
      rpcCalls: calls - before, ethCalls: readCalls - beforeReads,
      rpcByMethod: Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, count - (previous[key] ?? 0)]).filter(([, count]) => count)), result });
    save(); return result;
  }
  try {
    const input = loadReplayInputs(); report.transcript = input.transcript;
    const binary = await pinnedBinary('foundry-v1.8.4/anvil', 'be5129d636ea18440d43908536f13ba6578859b695f2ca33f1f09a00aa9dc176');
    abort.signal.throwIfAborted(); scratch = await lifecycle.acquireScratch(() => scratchDirectory('claim-public-replay-'));
    const port = await lifecycle.acquirePort(unusedLoopbackPort); endpoint = 'http://127.0.0.1:' + port;
    handle = lifecycle.spawn(() => startOwnProcess(binary, ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337',
      '--hardfork', 'cancun', '--timestamp', '1900000210', '--accounts', '0', '--no-cors', '--no-mining', '--gas-limit', '30000000'], scratch));
    for (let attempt = 0; ; attempt++) {
      try { assert.equal(await rpc('eth_chainId'), '0x7a69'); break; }
      catch (error) { abort.signal.throwIfAborted(); handle.assertAlive(); if (attempt >= 49) throw error;
        await delay(100, undefined, { signal: abort.signal }); }
    }
    assert.equal(await rpc('eth_blockNumber'), '0x0');
    const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
    // A deterministic local genesis may match across fresh processes. Hash
    // equality alone never restores the original runtime, keys or native state.
    Object.assign(report, replayGenesisObservation(input.evm.metadata.evmGenesis, genesis.hash));
    await rpc('anvil_setBalance', [input.transcript.sender, quantity(10000000000000000000n)]);
    await rpc('anvil_impersonateAccount', [input.transcript.sender]);
    await sample('original-public-transcript-replay', async () => {
      for (const [index, row] of input.evm.receipts.entries()) {
        abort.signal.throwIfAborted();
        assert.equal(BigInt(await rpc('eth_getTransactionCount', [input.transcript.sender, 'pending'])), BigInt(row.senderNonce));
        const tx = { ...row.request, nonce: row.senderNonce };
        // Retained raw wires are already public signed transactions; reusing
        // those three bytestrings requires no original key or new signature.
        const hash = row.signed ? await rpc('eth_sendRawTransaction', [row.signed.nativeWire])
          : await rpc('eth_sendTransaction', [tx]);
        if (row.signed) assert.equal(hash, row.transactionHash);
        await rpc('evm_setNextBlockTimestamp', [1900000210 + index + 1]); await rpc('evm_mine');
        const receipt = await rpc('eth_getTransactionReceipt', [hash]);
        assert.ok(receipt); assert.equal(receipt.status, row.receipt.status); assert.equal(receipt.blockNumber, row.receipt.blockNumber);
        assert.equal(receipt.contractAddress ?? null, row.receipt.contractAddress ?? null);
        assert.deepEqual(receipt.logs.map(({ address, topics, data }) => ({ address, topics, data })),
          row.receipt.logs.map(({ address, topics, data }) => ({ address, topics, data })));
        const actual = await rpc('eth_getTransactionByHash', [hash]);
        for (const field of ['from', 'to']) assert.equal(actual[field] ?? null, row.request[field] ?? null, 'REPLAY_ORIGINAL_' + field);
        assert.equal(actual.input, row.request.data); assert.equal(BigInt(actual.nonce), BigInt(row.senderNonce));
        assert.equal(BigInt(actual.value), BigInt(row.request.value ?? '0x0')); assert.equal(BigInt(actual.gas), BigInt(row.request.gas));
        const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
        assert.equal(BigInt(block.timestamp), 1900000210n + BigInt(index + 1));
        report.replayedTransactions++;
      }
      return { unchangedFromToDataNonce: true, unchangedSuccessfulPublicLogs: true, genuineOriginalVerifierCallsReplayed: true,
        proofBytesRegenerated: false, originalTransactionHashesRequiredOnlyForRetainedRawWires: true };
    });
    const head = await rpc('eth_getBlockByNumber', ['latest', false]); assert.equal(head.number, '0x3f');
    const deployment = label => input.evm.receipts.filter(row => row.label === label).map(row => row.receipt.contractAddress);
    async function facade(source, name, address, compiled) {
      const expectedCode = await rpc('eth_getCode', [address, head.number]); assert.notEqual(expectedCode, '0x');
      return createDiagnosticReadFacade({ source, contractName: name, address, expectedCode,
        codeHash: '0x' + publicKeccak256(Buffer.from(expectedCode.slice(2), 'hex')).toString('hex'),
        artifact: compiled.contracts[source][name], read: (to, data, at) => rpc('eth_call', [{ to, data }, at]) });
    }
    const many = async (label, source, name, compiled) => Promise.all(deployment(label).map(address => facade(source, name, address, compiled)));
    const pools = await many('deploy flat PrivateFlatAssetNotePool.sol:PrivateFlatAssetNotePool', 'PrivateFlatAssetNotePool.sol', 'PrivateFlatAssetNotePool', input.flat);
    const wrappers = await many('deploy native claim NativeClaimToken', 'native-claims/NativeClaimToken.sol', 'NativeClaimToken', input.claim);
    const gateways = await many('deploy native claim NativeClaimGateway', 'native-claims/NativeClaimGateway.sol', 'NativeClaimGateway', input.claim);
    const [authority] = await many('deploy native claim NativeClaimAuthority', 'native-claims/NativeClaimAuthority.sol', 'NativeClaimAuthority', input.claim);
    const [hub] = await many('deploy flat PrivateFlatReceiptHub.sol:PrivateFlatReceiptHub', 'PrivateFlatReceiptHub.sol', 'PrivateFlatReceiptHub', input.flat);
    const [poseidon] = await many('deploy flat crypto/Poseidon2Domains.sol:Poseidon2Domains', 'crypto/Poseidon2Domains.sol', 'Poseidon2Domains', input.flat);
    assert.equal(pools.length, 2); assert.equal(wrappers.length, 2); assert.equal(gateways.length, 2);
    const options = { pools, wrappers, gateways, authority, hub, poseidon, head,
      balance: (address, at) => rpc('eth_getBalance', [address, at]) };
    const cold = await sample('post-S-public-state-cold', () => reconstructPostReservation(options));
    await sample('post-S-public-state-same-head-warm', async () => {
      const warm = await reconstructPostReservation(options); assert.deepEqual(warm, cold); return warm;
    });
    await sample('retained-nonempty-native-arithmetic', async () => inspectRetainedNonemptySolInventory({
      initial: input.initial, native: input.native, config: cold.claims[1].config }));
    assert.equal((await rpc('eth_getBlockByNumber', ['latest', false])).hash, head.hash);
    for (const [name, expected] of Object.entries(PINS)) assert.equal(sha(readFileSync(join(ROOT_INPUT, name))), expected);
    report.guardRelevance = { freshnessLimitMilliseconds: 30000,
      componentOnly: true, fullCombinedGateMeasured: false, fullOperatorFreshnessEstablished: false,
      excluded: ['live native RPC inventory/finality reads', 'original attester keys and registry signing',
        'operator journal writes and fsync', 'complete owned observer code-pin and historical checks', 'cross-operator contention'] };
    report.success = true;
  } catch (error) { report.error = { name: error.name, message: String(error.message), code: error.code ?? null };
    report.success = false; process.exitCode = 1;
  } finally {
    stop('REPLAY_FINISHED');
    try { await cleanup(); } catch (error) { report.cleanup.error = error.message; report.success = false; process.exitCode = 1; }
    clearTimeout(deadline); process.removeListener('SIGINT', sigint); process.removeListener('SIGTERM', sigterm);
    report.rpcCalls = calls; report.rpcByMethod = counts; report.elapsedMilliseconds = Date.now() - started;
    if (handle?.child.pid && (!report.cleanup.exitObserved || !report.cleanup.scratchRemoved)) {
      report.success = false; process.exitCode = 1;
    }
    save(); process.stdout.write(JSON.stringify({ success: report.success, report: join(output, 'result.json'),
      replayedTransactions: report.replayedTransactions, cleanup: report.cleanup, error: report.error ?? null }) + '\n');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
