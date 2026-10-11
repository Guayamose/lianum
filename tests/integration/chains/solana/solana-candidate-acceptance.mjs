import { createRuntimeOnlyFinalSendChecks } from './host-send-checks.mjs';
/** Reviewed, fixed runtime-only candidate acceptance. No node starts on import
 * or without BOTH source review activation and the exact opt-in.
 * Source/binary review and scope: packages/backend/docs/LOCAL-ACCEPTANCE.md.
 * node integration/solana-candidate-acceptance.mjs --run-reviewed-local-candidate
 * This never runs the claim/graph campaign, proofs, EVM, or Bitcoin. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, lstatSync, openSync, closeSync, writeFileSync,
  fsyncSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSolanaCandidateAcceptanceGate } from './solana-candidate-acceptance-policy.mjs';
import { createCandidateResourceGuard, assertCandidateNoParallelHeavyWork } from './solana-candidate-acceptance-guard.mjs';
import { ACCEPTANCE_AMOUNTS, checkBootstrap, checkCandidateMetadata, checkCustodyBalances,
  checkOriginalRecord, checkCustodyDeposit, inventoryState, publicAcceptanceReport } from './solana-candidate-acceptance-evidence.mjs';
import { validateSolanaBindingTransaction } from '@lianum/engine/native/native-receipt-binding';
import { validateSolanaNonceBindingTransaction } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { SOLANA_PAYOUT_FINAL_SEND_PROFILE } from "../../../../packages/backend/src/chains/solana/runtime/solana-profiles.mjs";
const HERE = fileURLToPath(import.meta.url), ROOT = resolve(dirname(HERE), '..');
const RECOVERY = resolve(ROOT, '../..'), LOCAL = join(ROOT, '.local/solana-candidate-acceptance');
const sha = value => createHash('sha256').update(value).digest('hex');
const ASSET = sha('LIANUM_SOLANA_CANDIDATE_FUNCTIONAL_FAKE_ASSET_V1');
const KEYS = Object.freeze(Object.fromEntries(['deposit', 'redeem', 'solver'].map(kind =>
  [kind, sha('LIANUM_SOLANA_CANDIDATE_FUNCTIONAL_WIRE_BINDING_V1:' + kind)])));
const code = error => typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]{1,110}$/.test(error.message.split('\n')[0])
  ? error.message.split('\n')[0] : 'SOLANA_CANDIDATE_ASSERTION_OR_IO_FAILED';
function writeExclusive(path, value) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(dirname(path), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
}
function ensurePrivateDirectory(path) {
  const parent = dirname(path);
  assert.equal(realpathSync(parent), parent, 'SOLANA_CANDIDATE_PARENT_SYMLINK');
  try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  assert.equal(realpathSync(path), path, 'SOLANA_CANDIDATE_DIRECTORY_SYMLINK');
  assert.ok(lstatSync(path).isDirectory() && (lstatSync(path).mode & 0o077) === 0, 'SOLANA_CANDIDATE_PRIVATE_DIRECTORY');
}
function sourceHashes() {
  const files = new Map();
  function visit(path) {
    if (files.has(path)) return;
    assert.ok(path.startsWith(RECOVERY + sep), 'SOLANA_CANDIDATE_SOURCE_ESCAPE');
    assert.equal(realpathSync(path), path, 'SOLANA_CANDIDATE_SOURCE_SYMLINK');
    const bytes = readFileSync(path); files.set(path, sha(bytes));
    const source = bytes.toString('utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"\n]+)\1/g))
      if (match[2].endsWith('.mjs')) visit(resolve(dirname(path), match[2]));
  }
  visit(HERE); visit(join(ROOT, 'wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs'));
  return Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, hash]) => [relative(RECOVERY, path), hash]));
}

/** Native-only functional guard, never EVM/quorum/claim authorization. Capture
 * the original completed prebroadcast checks, then consume this closure once
 * after the runtime fsyncs its irreversible first-send attempt. */

export async function runSolanaCandidateAcceptance() {
  assert.equal(arguments.length, 0, 'SOLANA_CANDIDATE_FIXED_ENTRY');
  assertSolanaCandidateAcceptanceGate(process.argv.slice(2));
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
  ensurePrivateDirectory(LOCAL);
  const lockPath = join(LOCAL, 'active.lock'), lock = openSync(lockPath, 'wx', 0o600);
  writeFileSync(lock, JSON.stringify({ ownerPID: process.pid, runId: randomUUID() })); fsyncSync(lock); closeSync(lock);
  let run, audit, guard, pair, guardFinished = false, state = { success: false, phase: 'preflight', checks: {} }, stageNumber = 0;
  const privateWrite = (name, value) => writeExclusive(join(audit, name), value);
  const stage = name => { guard?.check(); state.phase = name; privateWrite(String(++stageNumber).padStart(2, '0') + '-stage.json', { stage: name }); };
  try {
    run = mkdtempSync(join(LOCAL, 'attempt-')); audit = join(run, 'private-audit'); ensurePrivateDirectory(audit);
    // Every attempt is retained. Public distribution must select report.json;
    // never recursively publish this private run root or its parent .local.
    writeExclusive(join(run, '.gitignore'), '*\n');
    state.sourceHashesBefore = sourceHashes(); privateWrite('sources-before.json', state.sourceHashesBefore);
    assertCandidateNoParallelHeavyWork(); guard = createCandidateResourceGuard();
    stage('create-fixed-combined-runtime');
    const { createOwnedCombinedSolanaRuntime, assertOwnedSolanaRuntime } =
      await import('../../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs');
    pair = await createOwnedCombinedSolanaRuntime(async () => { guard.check(); });
    const { custody, graph } = pair;
    assertOwnedSolanaRuntime(custody); assertOwnedSolanaRuntime(graph);
    guard.verifyRuntimePID(custody.metadata.processId); guard.bindOwnedRuntime(custody);
    assert.equal(custody.close, graph.close); assert.equal(custody.genesis, graph.genesis);
    assert.equal(custody.metadata.processId, graph.metadata.processId);
    checkCandidateMetadata(custody.metadata); state.candidatePin = custody.metadata.runtimePins.validator;
    assert.equal(new Set([...Object.values(custody.roles).map(row => row.address), graph.solver, ...graph.recipients]).size, 6);
    assert.equal(custody.readPublic, undefined); assert.equal(graph.inventory, undefined);
    const adapters = { deposit: custody.adapter({ asset: ASSET, route: 'deposit' }),
      redeem: custody.adapter({ asset: ASSET, route: 'redeem' }), solver: graph.adapter({ asset: ASSET, recipientIndex: 0 }) };
    const initial = await custody.inventory(); checkBootstrap(custody, initial);
    privateWrite('bootstrap.json', custody.nonceBootstrapByAuthority); privateWrite('inventory-initial.json', initial);
    privateWrite('runtime-initial.json', custody.metadata);
    state.checks.bootstrapFinalizedOriginalOnce = true; state.checks.nonceInfrastructureExcluded = true;
    const graphStart = { solver: await graph.balance(graph.solver), recipient: await graph.balance(),
      secondRecipient: await graph.balance(graph.recipients[1]) };
    assert.equal(graphStart.solver, '10000000000'); assert.equal(graphStart.recipient, '2000000');
    assert.equal(graphStart.secondRecipient, '2000000');
    const signed = {};
    async function transfer(kind) {
      stage('send-original-' + kind);
      const runtime = kind === 'solver' ? graph : custody, adapter = adapters[kind];
      let preparedOriginal, preparedCopy, finalSendChecks;
      const callbacks = {
        async beforeSign(prepared) {
          guard.check(); assert.equal(prepared.intent.lamports, ACCEPTANCE_AMOUNTS[kind]);
          assert.equal(prepared.intent.wireKeyCommitment, KEYS[kind]);
          assert.equal(prepared.intent.sourcePublicKey, adapter.binding.sourceEndpoint);
          assert.equal(prepared.intent.recipientPublicKey, adapter.binding.destinationEndpoint);
          if (kind !== 'solver') assert.equal(prepared.intent.durableNonce,
            initial.nonceInfrastructureByAuthority[kind === 'deposit' ? 'depositor' : 'escrow'].nonceAccount.durableNonce);
          await adapter.assertPrepared(prepared); preparedOriginal = prepared; preparedCopy = structuredClone(prepared);
        },
        async onSigned(payload) {
          guard.check();
          const decoded = (kind === 'solver' ? validateSolanaBindingTransaction : validateSolanaNonceBindingTransaction)(payload.nativeWire, preparedCopy.intent);
          signed[kind] = { nativeWire: payload.nativeWire, nativeId: decoded.signatureHex,
            transactionSHA256: decoded.transactionSHA256, prepared: preparedCopy };
          privateWrite(kind + '-signed-before-broadcast.json', signed[kind]);
        },
        ...(kind !== 'solver' ? { async beforeBroadcast(prepared) {
          const started = performance.now();
          guard.check(); assert.equal(prepared, preparedOriginal); assert.deepEqual(prepared, preparedCopy);
          await adapter.assertPrepared(prepared);
          const inventory = await custody.inventory();
          const role = kind === 'deposit' ? 'depositor' : 'escrow';
          assert.equal(inventory.nonceInfrastructureByAuthority[role].nonceAccount.durableNonce, prepared.intent.durableNonce);
          assert.equal(inventory.feeAudit.transfers.length, kind === 'deposit' ? 1 : 2);
          privateWrite(kind + '-first-send-inventory.json', inventory);
          finalSendChecks = createRuntimeOnlyFinalSendChecks({ runtime, guard, route: kind,
            prepared: preparedOriginal, preparedCopy, signed: signed[kind], started }, {
              decode: validateSolanaNonceBindingTransaction, profile: SOLANA_PAYOUT_FINAL_SEND_PROFILE, now: () => performance.now(),
            });
        },
        async beforeSend(prepared) {
          assert.ok(finalSendChecks, 'SOLANA_CANDIDATE_COMPLETED_CHECKS_REQUIRED');
          return finalSendChecks.beforeSend(prepared);
        },
        assertBeforeSend(prepared) {
          assert.ok(finalSendChecks, 'SOLANA_CANDIDATE_COMPLETED_CHECKS_REQUIRED');
          return finalSendChecks.assertBeforeSend(prepared);
        } } : {}),
      };
      let submitted;
      try { submitted = await adapter.transfer({ amount: ACCEPTANCE_AMOUNTS[kind], wireKeyCommitment: KEYS[kind] }, callbacks); }
      catch (error) {
        // An uncertain reply may be reconciled only by the original ID. No
        // resend, new signature or replacement nonce is attempted.
        if (error.message !== 'SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE' || error.nativeId !== signed[kind]?.nativeId) throw error;
        submitted = signed[kind];
      }
      assert.equal(submitted.nativeId, signed[kind].nativeId); assert.equal(submitted.transactionSHA256, signed[kind].transactionSHA256);
      const observation = await runtime.observe(submitted.nativeId, { timeoutMs: 120000 }); guard.check();
      assert.equal(observation.status, 'observed', 'SOLANA_CANDIDATE_ORIGINAL_NOT_FINALIZED');
      const record = runtime.transfers.find(row => row.nativeId === submitted.nativeId);
      checkOriginalRecord(record, kind, signed[kind].nativeWire);
      assert.equal(observation.nativeWire, signed[kind].nativeWire); assert.equal(observation.nativeId, signed[kind].nativeId);
      assert.equal(observation.genesis, custody.genesisHex.slice(2));
      privateWrite(kind + '-finalized.json', record);
      return record;
    }
    const deposit = await transfer('deposit'), afterDeposit = await custody.inventory();
    privateWrite('inventory-after-deposit.json', afterDeposit);
    checkCustodyDeposit(initial, afterDeposit, deposit);
    await assert.rejects(graph.observe(deposit.nativeId, { timeoutMs: 0 }), /SOLANA_UNKNOWN_SIGNED_IDENTITY/);
    // The current payout factory requires a genuine original claim-controller
    // key/send authority. This runtime-only laboratory cannot issue that token.
    // Exercise native ingress and solver isolation without substituting it.
    state.blockers = ['ORIGINAL_PAYOUT_CONTROLLER_AUTHORITY_REQUIRED'];
    state.checks.originalIngressFinalizedOnce = true;
    state.checks.depositorNonceAdvancedBoundToOriginal = true;
    stage('prove-original-namespace-isolation');
    const retained = custody.transfers;
    for (const original of [deposit]) {
      const observation = await custody.observe(original.nativeId, { timeoutMs: 0 });
      assert.equal(observation.status, 'observed'); assert.equal(observation.nativeId, original.nativeId);
      assert.equal(observation.nativeWire, original.nativeWire);
    }
    assert.deepEqual(custody.transfers.map(row => [row.nativeId, row.nativeWire, row.broadcastAttempts]),
      retained.map(row => [row.nativeId, row.nativeWire, row.broadcastAttempts]));
    assert.deepEqual(inventoryState(await custody.inventory()), inventoryState(afterDeposit));
    state.checks.repeatReadOriginalIngressUnchanged = true;
    const solver = await transfer('solver');
    await assert.rejects(custody.observe(solver.nativeId, { timeoutMs: 0 }), /SOLANA_UNKNOWN_SIGNED_IDENTITY/);
    const final = await custody.inventory(); privateWrite('inventory-final.json', final);
    assert.deepEqual(inventoryState(final), inventoryState(afterDeposit));
    assert.equal(graph.transfers.length, 1); assert.equal(custody.transfers.length, 1);
    assert.equal(solver.intent.sourcePublicKey, graph.solverHex.slice(2));
    assert.notEqual(solver.intent.sourcePublicKey, custody.roles.escrow.endpoint);
    assert.equal(BigInt(graphStart.solver) - BigInt(await graph.balance(graph.solver)),
      BigInt(ACCEPTANCE_AMOUNTS.solver) + BigInt(solver.observation.feeLamports));
    assert.equal(BigInt(await graph.balance()) - BigInt(graphStart.recipient), BigInt(ACCEPTANCE_AMOUNTS.solver));
    assert.equal(await graph.balance(graph.recipients[1]), graphStart.secondRecipient);
    state.checks.solverSeparateLiquidityV1Finalized = true; state.checks.solverLeavesCustodyUnchanged = true;
    checkCandidateMetadata(custody.metadata); privateWrite('runtime-final.json', custody.metadata);
    state.checks.originalAdapterAuditsHeld = true;
    state.observedFees = { bootstrap: Object.fromEntries(Object.entries(custody.nonceBootstrapByAuthority)
      .map(([role, record]) => [role, record.observation.feeLamports])),
      deposit: deposit.observation.feeLamports, solver: solver.observation.feeLamports };
    state.phase = 'functional-checks-passed';
  } catch (error) {
    state.errorCode = code(error); state.phase = 'stopped';
    // Constructor failures expose only the unchanged factory's error fields.
    // Preparation failures have no signed bootstrap record; later failures may
    // expose one. Never claim all constructor-time raw records were retained.
    if (audit) privateWrite('stopped.json', { errorCode: state.errorCode,
      diagnostic: String(error.stack ?? error.message ?? '').slice(0, 8000),
      ...(error.nonceBootstrapByAuthority ? { nonceBootstrapByAuthority: error.nonceBootstrapByAuthority } : {}),
      ...(error.nonceBootstrapPreparationByAuthority ? { nonceBootstrapPreparationByAuthority: error.nonceBootstrapPreparationByAuthority } : {}) });
    if (error.cleanup) state.cleanup = error.cleanup;
  } finally {
    // Retain evidence before destroying ephemeral keys/ledger, even on failure.
    if (pair) {
      try { privateWrite('last-retained-records.json', { bootstrap: pair.custody.nonceBootstrapByAuthority,
        custody: pair.custody.transfers, solver: pair.graph.transfers, metadata: pair.custody.metadata }); }
      catch (error) { state.errorCode ??= code(error); }
      // Stop resource sampling before the original close starts. A process in
      // the exit/reap transition may already lack /proc/exe; this is neither a
      // new child identity nor sufficient standalone evidence of cleanup.
      try { if (guard) { guardFinished = true; state.cleanupExitVerified = false;
        const result = await guard.finish(); state.cleanupExitVerified = true;
        state.checks.sampledResourceFloorsHeld = result.sampledResourceFloorsHeld;
        state.checks.ownedChildGone = result.ownedChildGone; } }
      catch (error) { state.errorCode ??= code(error); }
      try {
        assert.equal(pair.custody.close, pair.graph.close);
        // Async facades can return distinct Promise wrappers around the same
        // one-shot close. Drain both and require identical original outcomes.
        const [a, b] = await Promise.all([pair.custody.close(), pair.graph.close()]);
        assert.deepEqual(a, b); state.cleanup = a;
        assert.equal(state.cleanup.ownedProcessStopped, true); assert.equal(state.cleanup.syntheticKeysAndLedgerRemoved, true);
        await assert.rejects(pair.custody.inventory(), /SOLANA_RUNTIME_CLOSED/);
        await assert.rejects(pair.graph.balance(), /SOLANA_RUNTIME_CLOSED/);
        state.checks.sharedOwnedCleanupAndClosedFacades = true;
      } catch (error) { state.errorCode ??= code(error); }
    }
    try { if (guard && !guardFinished) { guardFinished = true; state.cleanupExitVerified = false; const result = await guard.finish(); state.cleanupExitVerified = true; state.checks.sampledResourceFloorsHeld = result.sampledResourceFloorsHeld;
      state.checks.ownedChildGone = result.ownedChildGone; } }
    catch (error) { state.errorCode ??= code(error); }
    try { if (audit) { state.sourceHashesAfter = sourceHashes(); privateWrite('sources-after.json', state.sourceHashesAfter);
      assert.deepEqual(state.sourceHashesAfter, state.sourceHashesBefore, 'SOLANA_CANDIDATE_SOURCE_CHANGED'); state.sourceUnchanged = true; } }
    catch (error) { state.errorCode ??= code(error); }
    state.success = state.phase === 'functional-checks-passed' && !state.errorCode && state.cleanupExitVerified === true
      && state.cleanup?.ownedProcessStopped === true && state.cleanup?.syntheticKeysAndLedgerRemoved === true;
    state.phase = state.success ? 'passed' : 'stopped';
    try { if (run) writeExclusive(join(run, 'report.json'), publicAcceptanceReport(state)); }
    finally { unlinkSync(lockPath); }
  }
  return { report: publicAcceptanceReport(state), reportPath: join(run, 'report.json') };
}
if (process.argv[1] && resolve(process.argv[1]) === HERE) {
  try { const result = await runSolanaCandidateAcceptance(); console.log(JSON.stringify(result)); process.exitCode = result.report.success ? 0 : 1; }
  catch (error) { console.error(code(error)); process.exitCode = 2; }
}
