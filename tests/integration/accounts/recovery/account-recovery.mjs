/** Affected application path only: HTTP/account journal -> partial native
 * delivery -> owner-independent F -> lost coordinator reply -> reconciliation
 * -> original owner recovery/change exits. The accepted happy path is reused
 * as existing evidence and is not executed again in this run.
 */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenericAccountKeeper } from '@lianum/engine/accounts/keeper';
import { ROOT } from '@lianum/proofs/catalog';
import { hash } from '@lianum/proofs/tooling/tooling';
import { createFlatNativeExecution } from '../../../../packages/backend/src/execution/account/execution/flat-native-execution.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatAccountSession } from '@lianum/backend/accounts/session';
import { startFlatAccountHttp } from '@lianum/backend/accounts/http';
import { accountRecoverySourcePins } from '../../runners/source-pins.mjs';
import { createOwnedFlatFixture, prepareFixtureGraph, freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';

const safeCode = error => /^[A-Z][A-Z0-9_]{2,160}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : 'FLAT_ACCOUNT_RECOVERY_FLOW_FAILED';
const bare = value => value.slice(2);
async function main() {
  assert.equal(process.argv.length, 2); assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.deepEqual(process.execArgv, []); assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2); assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT, 'integration/run-account-recovery.mjs'));
  const lock = JSON.parse(readFileSync(join(ROOT, '.local/account-recovery/active.lock')));
  assert.equal(lock.pid, process.ppid); assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, '.local/account-recovery/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit'), proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 }); mkdirSync(proofDirectory, { mode: 0o700 });
  const began = performance.now();
  const result = { format: 'FLAT_WALLET_ACCOUNT_RECOVERY_RESULT_V1', runId: lock.runId, startedAt: new Date().toISOString(),
    phase: 'starting', success: false, localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, sourcePins: accountRecoverySourcePins(),
    stages: [], proofs: [], transactions: [], httpResults: [], nativeEffects: { bitcoin: 0, solana: 0 },
    fullWalletAcceptance: false, keeperRestart: false, nodeRestart: false, realClockExpiryAcceptance: false,
    systemicPrivacyAcceptance: false, independentOperators: false, performanceTargetAchieved: false,
    disclosure: ['One original keeper and EVM survive the disposable coordinator restart.',
      'Owner and both foreign nodes are stopped before F issuance. Original local EVM time is explicitly advanced to the signed cutoff.',
      'The BTC transfer is irreversible and retained. Full owner refund allocates partial-delivery loss to the consenting provider.',
      'The common-host keeper knows schedule/custody credentials. This is not native mobile custody or independent operator deployment.',
      'Read adapters and vault groundwork are not exercised or credited as full seven-chain/private-DeFi acceptance.'],
    cleanup: { closedEvm: false, closedBitcoin: false, closedSolana: false } };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const stage = async name => { result.phase = name; result.stages.push({ name, at: new Date().toISOString(), elapsedMilliseconds: performance.now() - began });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n'); };
  let fixture, nativeExecution, authority, keeper, session, http, closed = false, interrupted = false;
  let controlledDeliveryStop = false, lostRecoveryReply = false;
  const publicProof = async ({ label, relation, proof }) => {
    const payload = Buffer.isBuffer(proof.proof) ? Buffer.from(proof.proof) : Buffer.from(proof.proof, 'hex');
    const file = `${String(result.proofs.length + 1).padStart(3, '0')}-${label}`;
    const inputs = fixtureJSON(proof.publicInputs);
    writeFileSync(join(proofDirectory, file + '.bin'), payload, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(proofDirectory, file + '.inputs.json'), inputs, { flag: 'wx', mode: 0o600 });
    result.proofs.push({ label, relation, file, proofSHA256: hash(payload), publicInputsSHA256: hash(inputs),
      evidence: proof.evidence ?? proof.metrics }); save();
  };
  const audit = async detail => {
    if (detail) writeFixturePrivate(join(privateDirectory, 'latest-application.json'), detail);
    if (fixture?.runtime) {
      writeFixturePrivate(join(privateDirectory, 'evm.json'), { metadata: fixture.runtime.metadata,
        transactions: fixture.runtime.transactions, receipts: fixture.runtime.receipts });
      result.transactions = fixture.runtime.receipts.map(value => ({ label: value.label, transactionHash: value.receipt.transactionHash,
        blockHash: value.receipt.blockHash, status: value.receipt.status, gasUsed: value.gasUsed }));
      writeFixturePrivate(join(privateDirectory, 'native.json'), { bitcoin: fixture.bitcoin.transfers, solana: fixture.solana.transfers,
        bitcoinMetadata: fixture.bitcoin.metadata, solanaMetadata: fixture.solana.metadata });
      result.nativeEffects = { bitcoin: fixture.bitcoin.transfers.length, solana: fixture.solana.transfers.length };
    }
    save();
  };
  async function cleanup() {
    if (closed) return; closed = true;
    await Promise.allSettled([authority?.abort(), nativeExecution?.abort()].filter(Boolean));
    await http?.close().catch(() => {}); await session?.close().catch(() => {});
    if (!session) await keeper?.close().catch(() => {});
    await authority?.close().catch(() => {}); await nativeExecution?.close().catch(() => {});
    if (fixture) result.cleanup = await fixture.close();
  }
  const stop = () => { if (interrupted) return; interrupted = true; result.success = false;
    result.interruption = { at: new Date().toISOString(), stage: result.phase };
    void audit().catch(() => {}).then(cleanup).finally(() => { result.phase = 'failed';
      result.errorCode = 'FLAT_ACCOUNT_RECOVERY_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN'; save(); process.exit(2); }); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  async function request(action, body = {}) {
    const response = await fetch(http.origin + '/api/flat-account/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: http.origin, 'x-flat-account-token': http.clientAccess.token },
      body: JSON.stringify(body) });
    assert.equal(response.status, 202, 'FLAT_ACCOUNT_HTTP_ADMISSION');
    const admitted = await response.json(); assert.equal(admitted.admitted, true);
    const view = await session.idle(); result.httpResults.push({ action, requestId: body.requestId ?? null,
      admitted: true, lastAdmission: view.admissions.at(-1), phase: view.phase }); save(); return view;
  }
  const row = (view, id) => { const value = view.requests.find(value => value.requestId === id);
    assert.ok(value, 'FLAT_ACCOUNT_HTTP_REQUEST_MISSING'); return value; };
  async function ownerSnapshot() {
    const response = await fetch(http.origin + '/api/flat-account/snapshot', { headers: {
      Origin: http.origin, 'x-flat-owner-token': http.ownerAccess.token } });
    assert.equal(response.status, 200);
    const value = await response.json(), text = JSON.stringify(value);
    for (const forbidden of ['assetId', 'ownerOperationRef', 'commitment', 'nullifier', 'proof', 'scope', 'policy', 'amount', 'balance'])
      assert.equal(text.toLowerCase().includes('"' + forbidden.toLowerCase() + '"'), false, 'FLAT_ACCOUNT_OWNER_HISTORY_EXCESS_DISCLOSURE');
    return value;
  }
  async function ownerView() {
    const response = await fetch(http.origin + '/api/flat-account/owner', { headers: { Origin: http.origin, 'x-flat-owner-token': http.ownerAccess.token } });
    assert.equal(response.status, 200, 'FLAT_ACCOUNT_OWNER_VIEW'); return response.json();
  }
  try {
    save(); fixture = await createOwnedFlatFixture(privateDirectory, { onStage: stage });
    const { runtime, system, bitcoin, solana, quorum, owner, reader } = fixture;
    nativeExecution = await createFlatNativeExecution({ runtime, system, poolIndex: 0, bitcoin, solana, quorum }, {
      onProof: publicProof, onPrivateAudit: audit,
      onStage: async value => {
        await stage(value.stage);
        if (value.stage === 'native-delivered-0' && !controlledDeliveryStop) {
          controlledDeliveryStop = true; result.controlledStop = { at: new Date().toISOString(), stage: value.stage,
            afterActualDelivery: true, beforeAdmission: true }; save();
          throw Error('FLAT_ACCOUNT_CONTROLLED_STOP_AFTER_BTC');
        }
      },
    });
    authority = await createFlatAccountAuthority({ runtime, system, poolIndex: 0, owner, nativeExecution,
      accountId: 'flat_account_recovery', journalId: 'flat_recovery_journal' }, { onProof: publicProof,
      onPrivateAudit: audit, onStage: value => stage('account-' + value.stage) });
    keeper = await createGenericAccountKeeper({ config: authority.config, journal: { path: join(privateDirectory, 'account.vault'),
      password: freshFixtureId() }, authority: authority.authority }, {
      afterHostOperation: async ({ method, request: original, terminateCoordinator }) => {
        if (method === 'recover' && original.kind === 'GRAPH' && !lostRecoveryReply) {
          lostRecoveryReply = true;
          result.coordinatorLoss = { at: new Date().toISOString(), afterActualRecovery: true, beforeJournalAcknowledgement: true };
          save(); terminateCoordinator();
        }
      },
    });
    session = await createFlatAccountSession({ keeper, ownerHandoff: { ownerView: authority.ownerView } });
    http = await startFlatAccountHttp({ session, port: 0 });
    await stage('fund-private-account-through-http');
    const topupRef = freshFixtureId(), topupId = 'top_up_0001';
    await owner.owner.prepareDeposit({ amount: '50000', epoch: String((await runtime.time()) / 600n), exitRecipient: bare(runtime.accounts[3]) });
    await authority.ownerActions.registerTopUp(topupRef);
    const topupRequest = { requestId: topupId, kind: 'TOP_UP', ownerOperationRef: topupRef, assetId: authority.assetId };
    assert.equal(row(await request('prepare', topupRequest), topupId).state, 'PREPARED');
    await request('prepare', topupRequest); // same durable intent, no new funding
    assert.equal(row(await request('execute', { requestId: topupId }), topupId).state, 'CONFIRMED');
    result.fundingConfirmed = true;
    assert.equal((await ownerView()).balances.available, '50000');
    const originalBalance = await runtime.balance(runtime.accounts[3]);

    await stage('owner-prepares-original-private-graph');
    const cutoff = String((await runtime.time()) + 7200n), graphRef = freshFixtureId(), graphId = 'private_graph_0001';
    const graph = await prepareFixtureGraph(fixture, privateDirectory, cutoff, publicProof);
    await authority.ownerActions.registerGraph({ ownerOperationRef: graphRef, ...graph });
    assert.equal(row(await request('prepare', { requestId: graphId, kind: 'GRAPH', ownerOperationRef: graphRef, assetId: authority.assetId }), graphId).state, 'PREPARED');
    const partial = await request('execute', { requestId: graphId });
    assert.equal(controlledDeliveryStop, true, 'FLAT_ACCOUNT_EXPECTED_PARTIAL_STOP');
    assert.equal(row(partial, graphId).state, 'UNKNOWN');
    assert.equal(owner.report().childExited, true); assert.equal(owner.report().available, false);
    const view = await reader.read();
    assert.equal(view.ledger.publicState.liveReservations, 1); assert.equal(view.ledger.publicState.backedAmount, '50000');
    assert.equal(view.state.receiptCount, '0'); assert.equal(view.state.spentTagCount, '0');
    assert.equal(bitcoin.transfers.length, 1); assert.equal(solana.transfers.length, 0);
    result.partialDelivery = { bitcoinDelivered: true, solanaSent: false, ownerExited: true,
      originalPool: view.ledger.publicState, execution: nativeExecution.snapshot(graphRef) }; await audit();
    const exposureTransactions = runtime.transactions.length;
    await request('execute', { requestId: graphId });
    assert.equal(runtime.transactions.length, exposureTransactions, 'FLAT_ACCOUNT_DUPLICATE_EXECUTION_SENT');
    assert.equal(bitcoin.transfers.length, 1); assert.equal(solana.transfers.length, 0);
    await ownerSnapshot();

    await stage('stop-foreign-nodes-and-check-original-cutoff');
    result.foreignStoppedBeforeRecovery = { bitcoin: await bitcoin.close(), solana: await solana.close() };
    const beforeEarlyRecovery = runtime.transactions.length;
    const early = await request('recover', { requestId: graphId });
    assert.notEqual(row(early, graphId).state, 'CONFIRMED');
    assert.equal(runtime.transactions.length, beforeEarlyRecovery, 'FLAT_ACCOUNT_EARLY_RECOVERY_SENT');
    assert.equal(owner.report().childExited, true);
    await runtime.advanceTo(cutoff);
    await stage('recover-with-owner-and-foreign-nodes-absent');
    const lost = await request('recover', { requestId: graphId });
    assert.equal(lostRecoveryReply, true, 'FLAT_ACCOUNT_EXPECTED_LOST_RECOVERY_REPLY');
    assert.notEqual(row(lost, graphId).state, 'CONFIRMED');
    const recovered = await reader.read();
    assert.equal(recovered.ledger.publicState.liveReservations, 0); assert.equal(recovered.ledger.publicState.backedAmount, '50000');
    result.actualRecoveryIncluded = { at: new Date().toISOString(), ownerExited: owner.report().childExited,
      foreignNodesStopped: true, pool: recovered.ledger.publicState, execution: nativeExecution.snapshot(graphRef) }; await audit();
    const includedTransactionCount = runtime.transactions.length, includedProofCount = result.proofs.length;
    await request('restart');
    const reconciled = await request('reconcile', { requestId: graphId });
    assert.equal(row(reconciled, graphId).state, 'CONFIRMED');
    const account = await authority.privateStatus(), original = account.operations.find(value => value.ownerOperationRef === graphRef);
    assert.equal(original.outcome.disposition, 'RECOVERED');
    await request('recover', { requestId: graphId });
    assert.equal(runtime.transactions.length, includedTransactionCount, 'FLAT_ACCOUNT_RECOVERY_RECONCILIATION_SENT');
    assert.equal(result.proofs.length, includedProofCount, 'FLAT_ACCOUNT_RECOVERY_REPROVED');
    result.reconciledOriginalRecoveryOnce = true; result.duplicateRecoveryNoEffect = true;

    await stage('return-owner-credit-original-recovery-and-exit');
    await owner.restart();
    const beforeCredit = await ownerView();
    assert.equal(beforeCredit.balances.available, '30000');
    assert.equal((await owner.ownerView.summary()).notes.recovery.pendingReconciliation, true);
    const credit = await authority.ownerActions.recoveryCreditRequest(graphRef);
    assert.equal((await owner.owner.reconcileRecovery(credit)).stage, 'CONFIRMED');
    assert.equal((await owner.owner.reconcileRecovery(credit)).stage, 'CONFIRMED');
    const credited = await ownerView(); assert.equal(credited.balances.available, '50000');
    assert.equal(credited.balances.recovery, '20000'); result.recoveryCreditedOnce = true;
    for (const role of ['recovery', 'change']) {
      const ref = freshFixtureId(), requestId = 'owner_exit_' + role;
      await owner.owner.prepareWithdrawal({ role, epoch: String((await runtime.time()) / 600n) });
      await authority.ownerActions.registerExit(ref, role);
      await request('prepare', { requestId, kind: 'EXIT', ownerOperationRef: ref, assetId: authority.assetId });
      assert.equal(row(await request('execute', { requestId }), requestId).state, 'CONFIRMED');
      const count = runtime.transactions.length;
      assert.equal(row(await request('execute', { requestId }), requestId).state, 'CONFIRMED');
      assert.equal(runtime.transactions.length, count, 'FLAT_ACCOUNT_DUPLICATE_EXIT_SENT');
    }
    const final = await reader.read(), finalPrivate = await ownerView();
    assert.equal(final.ledger.publicState.backedAmount, '0'); assert.equal(final.ledger.publicState.actualAssetBalance, '0');
    assert.equal(final.ledger.publicState.liveReservations, 0); assert.equal(final.state.spentTagCount, '0');
    assert.equal(finalPrivate.balances.available, '0'); assert.equal(finalPrivate.balances.recovery, '0');
    assert.equal((await runtime.balance(runtime.accounts[3])) - originalBalance, 50000n);
    for (const recipient of fixture.recipients) {
      const status = await recipient.withdrawalStatus();
      assert.ok(!final.ledger.commitments.includes('0x' + status.payoutCommitment), 'FLAT_ACCOUNT_UNFULFILLED_PAYOUT_ISSUED');
    }
    assert.equal(bitcoin.transfers.length, 1); assert.equal(solana.transfers.length, 0);
    result.finalPool = final.ledger.publicState; result.finalOwnerBalances = finalPrivate.balances;
    result.partialDeliveryRecoveryAcceptance = true; result.ownerRecoveryExitAccepted = true;
    result.publicAPI = await ownerSnapshot(); result.success = true; result.phase = 'completed'; await audit();
  } catch (error) {
    result.failedStage = result.phase; result.phase = 'failed'; result.success = false; result.errorCode = safeCode(error);
    writeFixturePrivate(join(privateDirectory, 'error.json'), { message: String(error.message), stack: String(error.stack),
      cause: error.cause ? { message: String(error.cause.message), stack: String(error.cause.stack) } : null });
    if (fixture?.reader) { try { const view = await fixture.reader.read(); result.lastObservedPool = view.ledger.publicState;
      result.lastObservedHub = view.state; } catch (observedError) { result.finalObservationError = safeCode(observedError); } }
    await audit().catch(() => {});
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (Object.values(result.cleanup).some(value => value === false)) { result.success = false; result.phase = 'failed'; }
    try { assert.deepEqual(accountRecoverySourcePins(), result.sourcePins); result.sourceUnchanged = true; }
    catch { result.sourceUnchanged = false; result.success = false; result.phase = 'failed'; }
    result.finishedAt = new Date().toISOString(); result.milliseconds = performance.now() - began; save();
    if (!result.success) process.exitCode = 1;
  }
}
await main();
