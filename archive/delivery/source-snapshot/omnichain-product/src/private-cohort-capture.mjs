/** Incremental PRIVATE audit only. This is a trusted module constructor, never
 * an HTTP/IPC configuration surface. COMPLETE means this bounded RPC archive
 * has no known gaps; it is not privacy success, consensus verification, or a
 * claim about later blocks. Start before funding/dispatch, finish before closing
 * any runtime. One capture runs at a time, alongside at most one proof worker.
 *
 * write(label, value) MUST create an exclusive durable file, serialize exactly
 * JSON.stringify(value) + '\n', and return its stable private reference string.
 * Never reuse/overwrite a file. The callback is awaited, including its fsync.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPrivateCohortParticipantBindings, capturePrivateCohortPublicChains, readPrivateCohortPublicCursor, PRIVATE_COHORT_PROFILE, PRIVATE_COHORT_CAPTURE_BOUNDS } from './private-cohort-runtime.mjs';

export const PRIVATE_COHORT_INCREMENTAL_CAPTURE_BOUNDS = Object.freeze({
  periodMs: 60_000, captureTimeoutMs: 45_000, maxChunks: 256,
  maxBytes: 256 * 1024 * 1024, finalManifestReserveBytes: 1024 * 1024,
  evmBlocks: 256, bitcoinBlocks: 128, solanaSlots: 512,
  // Deadline gates drain the current RPC rather than abandon Promise.race work.
  maximumUnderlyingRpcMs: 15_000,
});
const B = PRIVATE_COHORT_INCREMENTAL_CAPTURE_BOUNDS;
const sha = text => createHash('sha256').update(text).digest('hex');
const encoded = value => JSON.stringify(value) + '\n';
const frozen = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); } return value; };
const copy = value => frozen(structuredClone(value));
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const check = (condition, code) => assert.ok(condition, code);
const exact = (value, required, optional = []) => { check(value && Object.getPrototypeOf(value) === Object.prototype, 'PC24_COLLECTOR_ARGUMENTS'); check(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key)), 'PC24_COLLECTOR_ARGUMENTS'); };
const cursorCopy = value => { exact(value, ['evm', 'bitcoin', 'solana']); check(Object.values(value).every(integer), 'PC24_CAPTURE_CURSOR'); return structuredClone(value); };
const hex = value => '0x' + value.toString(16);
const safeCode = error => String(error?.code === 'ERR_ASSERTION' ? error.message?.split('\n')[0] : error?.code ?? error?.message ?? 'PC24_CAPTURE_FAILED').replace(/[^A-Za-z0-9_: -]/g, '_').slice(0, 160);
const READS = { evm: new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_blockNumber', 'eth_getTransactionReceipt', 'eth_getBalance']), btc: new Set(['getblockhash', 'getblockchaininfo', 'getnetworkinfo', 'getblockcount', 'getblock']), sol: new Set(['getGenesisHash', 'getSlot', 'getFirstAvailableBlock', 'minimumLedgerSlot', 'getBlocks', 'getBlock', 'getBalance']) };

async function reviewedSource(solana) {
  check(solana.metadata.sourceCommit === '5466f4592b1983adb13ba0a5d53f41ea2de69fba' && solana.metadata.officialSourceVersion === '2.3.13', 'PC24_CAPTURE_GENESIS_SOURCE');
  const sol = await readFile(new URL('./chains/solana-runtime.mjs', import.meta.url), 'utf8');
  const native = await readFile(new URL('./chains/native-runtime.mjs', import.meta.url), 'utf8');
  check(sol.includes('lamports: 10000000000') && sol.includes("'--account', keys.solver.address, solverAccount") && sol.includes("'--faucet-sol', '0'") && sol.includes("faucetUsed: false"), 'PC24_CAPTURE_GENESIS_SOURCE');
  check(native.includes("'--balance', '10'") && native.includes("btc('generatetoaddress', [101, miningAddress])"), 'PC24_CAPTURE_GENESIS_SOURCE');
  return {
    kind: 'REVIEWED_FIXED_LOCAL_SOURCE_ASSUMPTION_NOT_CONSENSUS_PROOF',
    runtime: { solanaModule: 'src/chains/solana-runtime.mjs', solanaModuleSHA256: sha(sol), nativeModule: 'src/chains/native-runtime.mjs', nativeModuleSHA256: sha(native) },
    agave: { commit: solana.metadata.sourceCommit, version: solana.metadata.officialSourceVersion,
      blockstore: { path: 'ledger/src/blockstore.rs', sha256: '50abba46a6fd3ababc2811af47a39b04997b633a7d7b5f7ddab3e0aa1356c4f9', function: 'create_new_ledger', fact: 'Fresh ledger slot 0 contains only create_ticks linked to genesis_config.hash(); no transactions.' },
      testValidator: { path: 'test-validator/src/lib.rs', sha256: 'c4ef6d57b8f4916272bc67d7ca022d61fe9bb21d103b3996fedae8ae1d4a0a49', fact: 'Configured accounts enter create_genesis_config_with_leader_ex_no_features before create_new_ledger.' } },
  };
}
function anchors(raw) {
  const evmFirst = raw.evm.blocks[0]?.block, evmLast = raw.evm.blocks.at(-1)?.block;
  const btcFirst = raw.bitcoin.blocks[0], btcLast = raw.bitcoin.blocks.at(-1);
  const solFirst = raw.solana.blocks[0], solLast = raw.solana.blocks.at(-1);
  return { start: { evm: { height: raw.from.evm, hash: evmFirst?.hash }, bitcoin: { height: raw.from.bitcoin, hash: btcFirst?.block.hash }, solana: solFirst ? { slot: solFirst.slot, hash: solFirst.block.blockhash } : null }, end: { evm: { height: raw.to.evm, hash: evmLast?.hash }, bitcoin: { height: raw.to.bitcoin, hash: btcLast?.block.hash }, solana: solLast ? { slot: solLast.slot, hash: solLast.block.blockhash } : null } };
}
function skippedRanges(from, to, slots) {
  const ranges = []; let next = from;
  for (const slot of slots) { if (slot > next) ranges.push({ from: next, to: slot - 1 }); next = slot + 1; }
  if (next <= to) ranges.push({ from: next, to });
  return ranges;
}

/** Second argument contains trusted synthetic-test seams; never route data. */
export function createPrivateCohortCapture(options, seams = {}) {
  exact(options, ['runtime', 'solana', 'write', 'guard'], ['now']);
  exact(seams, [], ['capture', 'cursor', 'source', 'timers', 'limits', 'wallNow']);
  const { runtime, solana, write, guard, now = () => performance.now() } = options;
  for (const fn of [write, guard, now]) check(typeof fn === 'function', 'PC24_COLLECTOR_CALLBACK');
  const { capture = capturePrivateCohortPublicChains, cursor = readPrivateCohortPublicCursor, source = reviewedSource, timers = globalThis, wallNow = Date.now } = seams;
  const limits = { ...B, ...(seams.limits ?? {}) };
  if (seams.limits) exact(seams.limits, [], ['maxChunks', 'maxBytes', 'captureTimeoutMs', 'evmBlocks', 'bitcoinBlocks', 'solanaSlots']);
  for (const key of ['maxChunks', 'maxBytes', 'captureTimeoutMs', 'evmBlocks', 'bitcoinBlocks', 'solanaSlots']) check(integer(limits[key]) && limits[key] > 0 && limits[key] <= B[key], 'PC24_COLLECTOR_BOUND');
  for (const key of ['evmBlocks', 'bitcoinBlocks', 'solanaSlots']) check(limits[key] >= 2, 'PC24_COLLECTOR_RANGE_BOUND');
  const began = now(), chunks = [], diagnostics = [];
  let initialMetadata = null, initialCursor = null, capturedThrough = null, endAnchors = null, requestedThrough = null;
  let timer, active = null, starting = null, finishing = null, started = false, finishRequested = false, finalized = false, halted = false;
  let sequence = 0, totalBytes = 0, attemptedChunks = 0, manifestWrites = 0, lastManifestReference = null, finalManifestPersisted = false, guardFailure = null, abortReason = null;
  const references = new Set();
  // Freeze metadata at construction; caller mutations cannot rewrite archived identity.
  const pinnedRuntime = { ...runtime, accounts: copy(runtime.accounts), metadata: copy(runtime.metadata) };
  const pinnedSolana = { ...solana, metadata: copy(solana.metadata) };
  const stopTimer = () => { if (timer !== undefined) timers.clearInterval(timer); timer = undefined; };
  function fault(error, stage) { halted = true; stopTimer(); if (diagnostics.length < 32) diagnostics.push({ stage, code: safeCode(error), elapsedMilliseconds: Math.max(0, Math.floor(now() - began)) }); }
  function summary() {
    return copy({ kind: 'PRIVATE_COHORT_PUBLIC_CAPTURE_MANIFEST', schemaVersion: 1, profile: PRIVATE_COHORT_PROFILE,
      classification: diagnostics.length ? 'INCOMPLETE' : finalized && finalManifestPersisted ? 'COMPLETE' : 'CAPTURING',
      complete: finalized && finalManifestPersisted && diagnostics.length === 0,
      final: finalized, initialMetadata, initialCursor, requestedThrough, capturedThrough, endAnchors,
      chunks, diagnostics, bounds: limits, totalBytes, attemptedChunks, manifestWrites, lastManifestReference, finalManifestPersisted,
      coverage: { genesisPrefixesComplete: initialMetadata?.genesisPrefixesComplete === true, recipientFiltering: false, transactionFiltering: false, trustedLocalRpcNotConsensusProof: true, finalCursorOnly: true, missingDataNeverInferredAsSkipped: true },
      assumptions: ['start() is called after runtime/pool deployment and before any owner funding or native dispatch', 'write() exclusively creates durable private files with JSON.stringify(value) plus newline bytes', 'COMPLETE covers only the recorded final cursor, not future chain activity or privacy success', 'Solana skipped slots come from finalized getBlocks plus parent linkage, never from treating failed getBlock calls as empty', 'Elapsed collector timings are diagnostic; separately labeled public-observer RPC polling intervals support bounded cross-chain chronology'],
      retainedRawChunksInMemory: 0,
    });
  }
  async function persist(label, value, final = false) {
    const bytes = Buffer.byteLength(encoded(value));
    const reserve = Math.min(B.finalManifestReserveBytes, Math.floor(limits.maxBytes / 8));
    check(totalBytes + bytes <= limits.maxBytes - (final ? 0 : reserve), 'PC24_CAPTURE_TOTAL_BYTES');
    totalBytes += bytes; // Include attempted writes: failures may leave durable partial/orphan files.
    const reference = await write(label, copy(value));
    check(typeof reference === 'string' && reference.length > 0 && reference.length <= 2048, 'PC24_CAPTURE_WRITE_REFERENCE');
    check(!references.has(reference), 'PC24_CAPTURE_REUSED_REFERENCE'); references.add(reference);
    return { reference, bytes, sha256: sha(encoded(value)) };
  }
  async function manifest(final = false) {
    const value = summary();
    // Completion is written only by finish after the capture and all writes drain.
    const record = { ...value, classification: diagnostics.length ? 'INCOMPLETE' : final ? 'COMPLETE' : 'CAPTURING', complete: final && diagnostics.length === 0, final, finalManifestPersisted: final, manifestWrites: manifestWrites + 1 };
    const saved = await persist(`cohort-public-manifest-${String(++sequence).padStart(6, '0')}`, record, final);
    manifestWrites++; lastManifestReference = saved.reference; if (final) finalManifestPersisted = true;
  }
  async function bounded(work) {
    const deadline = now() + limits.captureTimeoutMs; let expired = false;
    const timeout = timers.setTimeout(() => { expired = true; }, limits.captureTimeoutMs);
    const gate = () => {
      try { guard(); } catch (error) { guardFailure = error; throw error; }
      check(!abortReason, abortReason ?? 'PC24_CAPTURE_ABORTED');
      check(!expired && now() < deadline, 'PC24_CAPTURE_TIMEOUT');
    };
    const headObservations = {};
    const wall = () => { const value = wallNow(); check(integer(value), 'PC24_CAPTURE_OBSERVER_CLOCK'); return value; };
    const read = (kind, fn) => async (method, params = []) => {
      gate(); check(READS[kind].has(method), 'PC24_CAPTURE_READ_ONLY'); const earliestMs = wall();
      const value = await fn(method, params); gate(); const latestMs = wall();
      check(latestMs >= earliestMs, 'PC24_CAPTURE_OBSERVER_CLOCK_REGRESSION');
      if ({ evm: 'eth_blockNumber', btc: 'getblockcount', sol: 'getSlot' }[kind] === method) headObservations[{ evm: 'evm', btc: 'bitcoin', sol: 'solana' }[kind]] = { height: kind === 'evm' ? Number(BigInt(value)) : value, earliestMs, latestMs, source: 'PUBLIC_OBSERVER_RPC_POLLING', commitment: kind === 'sol' ? 'finalized' : 'current head' };
      return value;
    };
    const readers = { runtime: { ...pinnedRuntime, evm: read('evm', runtime.evm.bind(runtime)), btc: read('btc', runtime.btc.bind(runtime)) }, solana: { ...pinnedSolana, readPublic: read('sol', solana.readPublic.bind(solana)) } };
    try { gate(); return await work(readers, gate, headObservations, wall); } finally { timers.clearTimeout(timeout); }
  }
  async function initialize(readers, gate) {
    const bindings = createPrivateCohortParticipantBindings(readers);
    const sourceEvidence = await source(readers.solana); gate();
    const firstAvailableBlock = await readers.solana.readPublic('getFirstAvailableBlock');
    const minimumLedgerSlot = await readers.solana.readPublic('minimumLedgerSlot');
    check(integer(firstAvailableBlock) && integer(minimumLedgerSlot), 'PC24_CAPTURE_SOLANA_RETENTION');
    const balances = [];
    for (const address of pinnedRuntime.accounts) { const balance = await readers.runtime.evm('eth_getBalance', [address, '0x0']); check(/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(balance), 'PC24_CAPTURE_EVM_INITIAL_BALANCE'); balances.push({ address: address.toLowerCase(), balanceWei: BigInt(balance).toString() }); }
    const initialBalances = [];
    const registeredRecipients = bindings.participants.map(p => p.solana.recipient);
    for (const address of [pinnedSolana.solver, ...registeredRecipients]) {
      const balance = await readers.solana.readPublic('getBalance', [address, { commitment: 'finalized' }]);
      check(integer(balance?.value) && integer(balance?.context?.slot), 'PC24_CAPTURE_SOLANA_INITIAL_BALANCE');
      initialBalances.push({ address, lamports: String(balance.value), contextSlot: balance.context.slot });
    }
    check(initialBalances[0].lamports === '10000000000' && initialBalances.slice(1).every(b => b.lamports === '0'), 'PC24_CAPTURE_STARTED_AFTER_NATIVE_FUNDING');
    check(pinnedSolana.metadata.faucetUsed === false && pinnedSolana.metadata.faucetGenesisLamports === '0', 'PC24_CAPTURE_FAUCET_SOURCE');
    initialCursor = cursorCopy(await cursor(readers)); gate();
    check(firstAvailableBlock <= initialCursor.solana, 'PC24_CAPTURE_SOLANA_START_RANGE');
    initialMetadata = copy({ genesisPrefixesComplete: firstAvailableBlock <= 1,
      evm: { genesis: pinnedRuntime.metadata.evmGenesis, block: 0, balances, source: sourceEvidence.runtime, balanceObservation: 'historical eth_getBalance at block 0; nine configured genesis accounts' },
      bitcoin: { genesis: pinnedRuntime.metadata.bitcoinGenesis, fromHeight: 0, source: sourceEvidence.runtime, funding: 'all blocks from genesis, including the startup 101 generated funding blocks, are captured without filtering' },
      solana: { genesis: pinnedSolana.genesis, solver: pinnedSolana.solver, registeredRecipients, initialBalances, balanceObservation: 'finalized capture-start observations before native dispatch; not historical genesis RPC balances',
        genesisFunding: { solverLamports: '10000000000', faucetUsed: false, transaction: null, source: sourceEvidence, explanation: 'Solver is supplied as a genesis account; there is no funding transaction to invent.' },
        slotZero: { status: firstAvailableBlock === 0 ? 'CAPTURED' : firstAvailableBlock === 1 ? 'GENESIS_ONLY_SOURCE_BOUNDARY' : 'MISSING', source: sourceEvidence.agave }, firstAvailableBlock, minimumLedgerSlot },
    });
    if (firstAvailableBlock > 1) diagnostics.push({ stage: 'INITIAL_PREFIX', code: 'PC24_CAPTURE_SOLANA_GENESIS_PREFIX_MISSING', missingSolanaSlots: { from: 0, to: firstAvailableBlock - 1 } });
    return { evm: 0, bitcoin: 0, solana: firstAvailableBlock };
  }
  function validate(raw, from, to) {
    check(raw?.kind === 'PRIVATE_COHORT_FULL_PUBLIC_CHAIN_CAPTURE' && raw.profile === PRIVATE_COHORT_PROFILE, 'PC24_CAPTURE_CHUNK_KIND');
    assert.deepEqual(raw.from, from, 'PC24_CAPTURE_CHUNK_FROM'); assert.deepEqual(raw.to, to, 'PC24_CAPTURE_CHUNK_TO');
    check(raw.coverage?.complete === true && raw.coverage.recipientFiltering === false && raw.coverage.transactionFiltering === false, 'PC24_CAPTURE_CHUNK_COVERAGE');
    check(raw.contentSHA256 === sha(JSON.stringify({ evm: raw.evm, bitcoin: raw.bitcoin, solana: raw.solana })), 'PC24_CAPTURE_CHUNK_HASH');
    check(raw.evm.genesis === pinnedRuntime.metadata.evmGenesis && raw.bitcoin.genesis === pinnedRuntime.metadata.bitcoinGenesis && raw.solana.genesis === pinnedSolana.genesis, 'PC24_CAPTURE_CHUNK_GENESIS');
    check(raw.evm.blocks.length === to.evm - from.evm + 1 && raw.bitcoin.blocks.length === to.bitcoin - from.bitcoin + 1, 'PC24_CAPTURE_CHUNK_GAP');
    assert.deepEqual(raw.solana.blocks.map(b => b.slot), raw.solana.slots, 'PC24_CAPTURE_SOLANA_SLOT_GAP');
    if (from.solana === 0) check(raw.solana.slots[0] === 0, 'PC24_CAPTURE_SOLANA_SLOT_ZERO_MISSING');
    const a = anchors(raw);
    if (endAnchors) {
      assert.deepEqual(a.start.evm, endAnchors.evm, 'PC24_CAPTURE_EVM_REPEATED_ANCHOR');
      assert.deepEqual(a.start.bitcoin, endAnchors.bitcoin, 'PC24_CAPTURE_BITCOIN_REPEATED_ANCHOR');
      if (endAnchors.solana) assert.deepEqual(a.start.solana, endAnchors.solana, 'PC24_CAPTURE_SOLANA_REPEATED_ANCHOR');
    }
    return a;
  }
  async function run(initial = false) {
    let stage = initial ? 'START' : 'CAPTURE';
    try {
      await bounded(async (readers, gate, headObservations, wall) => {
        let from = initial ? await initialize(readers, gate) : { evm: capturedThrough.evm, bitcoin: capturedThrough.bitcoin, solana: endAnchors.solana?.slot ?? chunks.at(-1).from.solana };
        const target = initial ? initialCursor : cursorCopy(await cursor(readers)); requestedThrough = copy(target); gate();
        const cursorObservedAt = copy(headObservations);
        for (const chain of ['evm', 'bitcoin', 'solana']) check(cursorObservedAt[chain]?.height === target[chain], 'PC24_CAPTURE_CURSOR_OBSERVATION');
        if (capturedThrough) for (const chain of ['evm', 'bitcoin', 'solana']) check(target[chain] >= capturedThrough[chain], 'PC24_CAPTURE_CURSOR_REGRESSION');
        let lastTo = null;
        while (true) {
          check(attemptedChunks < limits.maxChunks, 'PC24_CAPTURE_CHUNK_LIMIT');
          const to = Object.fromEntries([['evm', 'evmBlocks'], ['bitcoin', 'bitcoinBlocks'], ['solana', 'solanaSlots']].map(([chain, bound]) => [chain, Math.min(target[chain], from[chain] + limits[bound] - 1)]));
          if (lastTo) check(Object.keys(to).some(chain => to[chain] > lastTo[chain]), 'PC24_CAPTURE_SOLANA_ANCHOR_SPAN');
          gate(); const captureStart = wall(), raw = await capture({ ...readers, from, to }); gate(); const captureEnd = wall();
          check(captureEnd >= captureStart, 'PC24_CAPTURE_OBSERVER_CLOCK_REGRESSION');
          const a = validate(raw, from, to), bytes = Buffer.byteLength(encoded(raw));
          check(bytes <= PRIVATE_COHORT_CAPTURE_BOUNDS.bytes, 'PC24_CAPTURE_CHUNK_BYTES');
          stage = 'WRITE_CHUNK'; attemptedChunks++;
          const label = `cohort-public-chunk-${String(attemptedChunks).padStart(6, '0')}`, saved = await persist(label, raw); gate();
          const entry = { index: chunks.length, ...saved, cursorObservedAt, capturedAt: { earliestMs: captureStart, latestMs: captureEnd, source: 'PUBLIC_OBSERVER_RPC_POLLING' }, from: structuredClone(from), to: structuredClone(to), startAnchors: a.start, endAnchors: a.end,
            counts: { evmBlocks: raw.evm.blocks.length, bitcoinBlocks: raw.bitcoin.blocks.length, solanaBlocks: raw.solana.blocks.length, transactions: raw.coverage.transactions },
            solanaCoverage: { from: from.solana, to: to.solana, producedSlots: raw.solana.slots.length, skippedSlots: to.solana - from.solana + 1 - raw.solana.slots.length, skippedRanges: skippedRanges(from.solana, to.solana, raw.solana.slots), firstAvailableBlock: raw.solana.firstAvailableBlock, minimumLedgerSlot: raw.solana.minimumLedgerSlot, includesRepeatedAnchor: endAnchors?.solana !== null && endAnchors?.solana !== undefined },
          };
          chunks.push(copy(entry)); capturedThrough = copy(to); endAnchors = copy(a.end);
          if (Object.keys(to).every(chain => to[chain] === target[chain])) break;
          lastTo = to; from = { evm: to.evm, bitcoin: to.bitcoin, solana: a.end.solana?.slot ?? from.solana }; stage = 'CAPTURE';
        }
      });
      stage = 'WRITE_MANIFEST'; await manifest();
    } catch (error) { fault(error, stage); if (error === guardFailure) throw error; }
    return summary();
  }
  function captureNow() {
    if (!started || finishRequested || halted) return Promise.resolve(summary());
    if (active) return active; // Coalesce concurrent requests; no queue growth or overlapping RPCs.
    active = run(false).finally(() => { active = null; }); return active;
  }
  function start() {
    if (starting) return starting;
    check(!finishRequested, 'PC24_CAPTURE_ALREADY_FINISHED'); started = true;
    active = run(true).finally(() => { active = null; });
    starting = active.then(result => { if (!finishRequested && !halted) { timer = timers.setInterval(() => { void captureNow().catch(() => {}); }, B.periodMs); timer?.unref?.(); } return result; });
    return starting;
  }
  function finish(settings = {}) {
    exact(settings, [], ['captureFinal', 'reason']);
    const { captureFinal = true, reason = 'PC24_CAPTURE_ABORTED' } = settings;
    check(typeof captureFinal === 'boolean', 'PC24_CAPTURE_FINISH_ARGUMENTS');
    if (!captureFinal && !abortReason) { abortReason = safeCode(new Error(String(reason))); fault(new Error(abortReason), 'ABORT'); }
    if (finishing) return finishing;
    finishRequested = true; stopTimer();
    finishing = (async () => {
      let hardFault;
      try { if (active) await active; } catch (error) { hardFault = error; }
      if (!started) fault(new Error('PC24_CAPTURE_NOT_STARTED'), 'FINISH');
      else if (!halted) { try { await run(false); } catch (error) { hardFault ??= error; } }
      finalized = true;
      try { await manifest(true); } catch (error) { fault(error, 'WRITE_FINAL_MANIFEST'); finalManifestPersisted = false; }
      if (hardFault) throw hardFault;
      return summary();
    })();
    return finishing;
  }
  return Object.freeze({ start, captureNow, finish, abort: reason => finish({ captureFinal: false, reason: reason ?? 'PC24_CAPTURE_ABORTED' }), summary });
}
